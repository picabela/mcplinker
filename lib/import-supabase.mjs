import {AppError,cleanError} from './security.mjs';
import {databaseHeaders} from './db.mjs';
import {usePostgres,sql,ensureSchema} from './pg.mjs';
import {readImage} from './facebook-media.mjs';
import {videoType} from './instagram-media.mjs';
import {storeFile} from './media-storage.mjs';

// Copies a Supabase deployment of MCPLinker into the self-hosted PostgreSQL database.
// Source: SOURCE_SUPABASE_URL and SOURCE_SUPABASE_SERVICE_ROLE_KEY (secret key).
// Accounts keep their ids; passwords move on the first sign-in (see local-auth.mjs).
// Files from Supabase Storage are copied and their addresses rewritten.
// mode "copy" (default): the source keeps running, so scheduled and pending posts become
// drafts and automations are switched off here, and nothing is published twice.
// mode "cutover": the source scheduler is being turned off; schedules and automations stay.
// Each run replaces the copied tables. OAuth grants of AI connectors are tied to the old
// address and are not copied: connectors are added again for the new address.
const tables=[['brands','id'],['connections','id'],['provider_apps','owner_id,platform'],['posts','id'],['assets','id'],['automations','id'],['audit_log','id'],['api_keys','id']];
const pending=['scheduled','approval','processing'];
export const importSource=()=>{const url=process.env.SOURCE_SUPABASE_URL?.trim().replace(/\/+$/,''),key=process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY?.trim();return url&&key?{url,key}:null;};
async function get(src,path){
 let r;try{r=await fetch(src.url+path,{headers:databaseHeaders(src.key),signal:AbortSignal.timeout(30000),cache:'no-store'});}catch{throw new AppError('Nie udało się połączyć ze źródłowym Supabase. Sprawdź SOURCE_SUPABASE_URL.',502,'import_failed');}
 if(!r.ok)throw new AppError(`Źródłowy Supabase odrzucił żądanie (HTTP ${r.status}). Sprawdź SOURCE_SUPABASE_URL i SOURCE_SUPABASE_SERVICE_ROLE_KEY.`,502,'import_failed');
 return r.json();
}
async function sourceRows(src,table,key){const out=[];for(let offset=0;;offset+=1000){const page=await get(src,`/rest/v1/${table}?select=*&order=${key.split(',').map(k=>k+'.asc').join(',')}&limit=1000&offset=${offset}`);out.push(...page);if(page.length<1000)return out;}}
async function sourceUsers(src){const out=[];for(let page=1;;page++){const list=(await get(src,`/auth/v1/admin/users?page=${page}&per_page=200`)).users||[];out.push(...list);if(list.length<200)break;}return out.map(u=>({id:u.id,email:String(u.email||`${u.id}@users.invalid`).toLowerCase(),created_at:u.created_at}));}
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp'};
function rehoster(src,warnings){
 const prefix=src.url+'/storage/v1/object/public/',seen=new Map();
 return async url=>{
  if(typeof url!=='string'||!url.startsWith(prefix))return url;
  if(seen.has(url))return seen.get(url);
  const [known]=await sql()`select url from public.media_sources where source_url=${url}`;
  if(known){seen.set(url,known.url);return known.url;}
  try{
   const ext=(url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1]||'').toLowerCase(),video=['mp4','mov'].includes(ext);
   if(!video&&!types[ext])return url;
   const bytes=await readImage({url},{maxBytes:(video?200:8)*1024*1024});
   const [mime,stored]=video?videoType(bytes):[types[ext],ext==='jpeg'?'jpg':ext];
   const hosted=await storeFile(bytes,mime,stored,video?'video':'image');
   await sql()`insert into public.media_sources (source_url,url) values (${url},${hosted}) on conflict (source_url) do nothing`;
   seen.set(url,hosted);return hosted;
  }catch(e){warnings.push('Nie skopiowano pliku: '+cleanError(e));seen.set(url,url);return url;}
 };
}
async function transform(table,row,mode,rehost){
 if(table==='posts'){
  const payload={...(row.payload||{})};
  if(Array.isArray(payload.image_urls)){const urls=[];for(const u of payload.image_urls)urls.push(await rehost(u));payload.image_urls=urls;}
  for(const k of ['video_url','cover_url'])if(payload[k])payload[k]=await rehost(payload[k]);
  const out={...row,payload};
  if(mode==='copy'&&pending.includes(row.status))Object.assign(out,{status:'draft',scheduled_at:null,approved_at:null,approved_by:null,lock_token:null,locked_at:null});
  if(mode==='copy'&&String(row.external_id||'').startsWith('ig-container:'))out.external_id=null;
  return out;
 }
 if(table==='assets')return{...row,url:await rehost(row.url)};
 if(table==='automations'&&mode==='copy')return{...row,enabled:false,lease_token:null,lease_until:null};
 return row;
}
async function setState(value){await sql()`insert into public.app_state (key,value,updated_at) values ('import',${sql().json(value)},now()) on conflict (key) do update set value=excluded.value, updated_at=now()`;}
export async function importState(){if(!usePostgres())return null;await ensureSchema();const [row]=await sql()`select value from public.app_state where key='import'`;return row?.value||null;}
let running=false;
export async function runImport({mode='copy'}={}){
 if(!usePostgres())throw new AppError('Import działa tylko z bazą PostgreSQL (DATABASE_URL).',400);
 const src=importSource();if(!src)throw new AppError('Ustaw SOURCE_SUPABASE_URL i SOURCE_SUPABASE_SERVICE_ROLE_KEY, aby skopiować dane.',400,'setup_required');
 if(!['copy','cutover'].includes(mode))throw new AppError('Nieznany tryb importu.');
 if(running)throw new AppError('Import już trwa.',409);
 running=true;const started_at=new Date().toISOString(),warnings=[];
 try{
  await ensureSchema();await setState({status:'running',mode,started_at});
  const users=await sourceUsers(src),data={};
  for(const [t,key] of tables)data[t]=await sourceRows(src,t,key);
  const rehost=rehoster(src,warnings);
  for(const [t] of tables){const out=[];for(const row of data[t])out.push(await transform(t,row,mode,rehost));data[t]=out;}
  await sql().begin(async tx=>{
   await tx.unsafe('select pg_advisory_xact_lock(724101)');
   // A local account with the same e-mail but another id (created before the import) is
   // replaced by the copied one. Its password is not carried over: the copied account
   // signs in with the password from the source project, and keeps it on later imports.
   await tx.unsafe(`delete from public.users u using json_populate_recordset(null::public.users,$1::text::json) i where lower(u.email)=lower(i.email) and u.id<>i.id`,[JSON.stringify(users)]);
   await tx.unsafe(`insert into public.users (id,email,created_at) select id,email,coalesce(created_at,now()) from json_populate_recordset(null::public.users,$1::text::json) on conflict (id) do update set email=excluded.email`,[JSON.stringify(users)]);
   for(const [t] of [...tables].reverse())await tx.unsafe(`delete from public.${t}`);
   for(const [t] of tables){
    const rows=data[t];if(!rows.length)continue;
    const local=new Set((await tx.unsafe(`select attname from pg_attribute where attrelid=$1::text::regclass and attnum>0 and not attisdropped`,['public.'+t])).map(c=>c.attname));
    const cols=Object.keys(rows[0]).filter(c=>local.has(c)).map(c=>'"'+c+'"').join(',');
    for(let i=0;i<rows.length;i+=500)await tx.unsafe(`insert into public.${t} (${cols}) select ${cols} from json_populate_recordset(null::public.${t},$1::text::json)`,[JSON.stringify(rows.slice(i,i+500))]);
   }
  });
  const result={status:'done',mode,started_at,finished_at:new Date().toISOString(),counts:{users:users.length,...Object.fromEntries(tables.map(([t])=>[t,data[t].length]))},warnings:warnings.slice(0,20)};
  await setState(result);return result;
 }catch(e){
  const result={status:'error',mode,started_at,finished_at:new Date().toISOString(),error:cleanError(e)};
  await setState(result).catch(()=>{});throw e;
 }finally{running=false;}
}
// At first start of an empty self-hosted database, copy the data automatically.
export async function autoImport(){
 if(!usePostgres()||!importSource())return null;
 const state=await importState();if(state)return null;
 const [{n}]=await sql()`select count(*)::int as n from public.brands`;if(n)return null;
 return runImport({mode:process.env.IMPORT_MODE==='cutover'?'cutover':'copy'});
}
