import postgres from 'postgres';
import {AppError} from './security.mjs';
import {migrations} from './pg-schema.mjs';

// Self-hosted mode: when DATABASE_URL is set, MCPLinker talks to PostgreSQL directly.
// pgRequest() accepts the same PostgREST-style requests as the Supabase mode
// (filters such as eq./gt./is./in., order, limit, offset, select with one-level
// embedding, upsert and rpc/<function>), so the rest of the code is unchanged.
// Results are built as JSON by PostgreSQL, exactly like PostgREST, so timestamps keep
// the "2026-11-24T14:26:54.397177+00:00" format the optimistic checks compare.
export const usePostgres=()=>Boolean(process.env.DATABASE_URL);
let client=null,ready=null;
const tables=new Map(),functions=new Map();
export function sql(){
 if(!client)client=postgres(process.env.DATABASE_URL.trim(),{max:Number(process.env.DATABASE_POOL_SIZE)||5,idle_timeout:60,connect_timeout:10,onnotice:()=>{},connection:{TimeZone:'UTC',application_name:'mcplinker'}});
 return client;
}
export async function closePostgres(){const c=client;client=null;ready=null;tables.clear();functions.clear();if(c)await c.end({timeout:5});}
// Creates or updates the schema once per process. A transaction-level advisory lock keeps
// two starting containers from applying the same migration.
export function ensureSchema(){
 ready??=sql().begin(async tx=>{
  await tx.unsafe('select pg_advisory_xact_lock(724100)');
  await tx.unsafe('create table if not exists public.schema_migrations(version text primary key, applied_at timestamptz not null default now())');
  const done=new Set((await tx.unsafe('select version from public.schema_migrations')).map(r=>r.version));
  for(const m of migrations)if(!done.has(m.version)){await tx.unsafe(m.sql).simple();await tx.unsafe('insert into public.schema_migrations(version) values($1)',[m.version]);}
 }).catch(e=>{ready=null;throw failure(e);});
 return ready;
}
const q=name=>'"'+String(name).replace(/"/g,'""')+'"';
const bad=message=>new AppError(message,400,'database_request');
function failure(e){
 if(e instanceof AppError)return e;
 const code=typeof e?.code==='string'?e.code:'';
 console.error('MCPLinker database request failed',{code:/^[A-Z0-9]{5}$/.test(code)?code:'connection'});
 if(code==='23505')return new AppError('Ten element już istnieje.',409,'duplicate');
 if(['42P01','42883','42703'].includes(code))return new AppError('W bazie brakuje wymaganej tabeli lub funkcji. Sprawdź DATABASE_URL i uruchom aplikację ponownie, aby wykonać migracje.',503,'database_schema');
 if(!/^[0-9A-Z]{5}$/.test(code))return new AppError('Baza danych jest niedostępna. Sprawdź DATABASE_URL i stan bazy PostgreSQL.',503,'database_unavailable');
 return new AppError('Błąd operacji bazy danych. Sprawdź logi serwera: MCPLinker database request failed.',503,'database_error');
}
async function table(name){
 if(tables.has(name))return tables.get(name);
 if(!/^[a-z_][a-z0-9_]*$/.test(name))throw bad('Nieprawidłowa tabela.');
 const rel=`to_regclass('public.'||quote_ident($1))`;
 const columns=await sql().unsafe(`select a.attname as name, format_type(a.atttypid,a.atttypmod) as type from pg_attribute a where a.attrelid=${rel} and a.attnum>0 and not a.attisdropped order by a.attnum`,[name]);
 if(!columns.length)throw new AppError('W bazie brakuje wymaganej tabeli lub funkcji. Sprawdź DATABASE_URL i uruchom aplikację ponownie, aby wykonać migracje.',503,'database_schema');
 const pk=await sql().unsafe(`select a.attname as name from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=${rel} and i.indisprimary order by array_position(i.indkey::int2[],a.attnum)`,[name]);
 const t={name,columns:new Map(columns.map(c=>[c.name,c.type])),pk:pk.map(c=>c.name)};
 tables.set(name,t);return t;
}
function column(t,name){const type=t.columns.get(name);if(!type)throw bad(`Nieznana kolumna ${name} w tabeli ${t.name}.`);return type;}
// Splits on top-level commas: "a,b,rel(c,d)" -> ["a","b","rel(c,d)"].
function split(text){const out=[];let depth=0,cur='';for(const ch of text){if(ch==='(')depth++;if(ch===')')depth--;if(ch===','&&!depth){out.push(cur.trim());cur='';}else cur+=ch;}if(cur.trim())out.push(cur.trim());return out;}
function list(value){const m=/^\(([\s\S]*)\)$/.exec(value);if(!m)throw bad('Nieprawidłowa lista in.');return m[1]===''?[]:m[1].split(',').map(v=>v.trim().replace(/^"([\s\S]*)"$/,'$1'));}
const ops={eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='};
function condition(t,col,expr,p){
 const type=column(t,col),m=/^(not\.)?(eq|neq|gt|gte|lt|lte|is|in)\.([\s\S]*)$/.exec(expr);
 if(!m)throw bad(`Nieobsługiwany filtr dla ${col}.`);
 const [,not,op,value]=m;let s;
 if(op==='is'){const v={null:'null',true:'true',false:'false'}[value.toLowerCase()];if(!v)throw bad('Nieprawidłowy filtr is.');s=`t.${q(col)} is ${v}`;}
 else if(op==='in')s=`t.${q(col)} in (select v::${type} from json_array_elements_text(${p(JSON.stringify(list(value)))}::json) as x(v))`;
 else s=`t.${q(col)} ${ops[op]} ${p(value)}::${type}`;
 return not?`not (${s})`:s;
}
async function embed(t,item){
 const m=/^([a-z_][a-z0-9_]*)\(([^()]*)\)$/.exec(item);if(!m)return null;
 const other=await table(m[1]);
 const [fk]=await sql().unsafe(`select a.attname as col, af.attname as ref from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] join pg_attribute af on af.attrelid=c.confrelid and af.attnum=c.confkey[1] where c.contype='f' and c.conrelid=to_regclass('public.'||quote_ident($1)) and c.confrelid=to_regclass('public.'||quote_ident($2)) and cardinality(c.conkey)=1 limit 1`,[t.name,other.name]);
 if(!fk)throw bad(`Brak relacji ${t.name} → ${other.name}.`);
 const cols=m[2].trim()==='*'||!m[2].trim()?null:split(m[2]);
 cols?.forEach(c=>column(other,c));
 const value=cols?`json_build_object(${cols.map(c=>`'${c}', e.${q(c)}`).join(', ')})`:'row_to_json(e)';
 return `(select ${value} from public.${q(other.name)} e where e.${q(fk.ref)} = t.${q(fk.col)} limit 1) as ${q(other.name)}`;
}
async function selection(t,select,{mutation=false}={}){
 if(!select||select==='*')return 't.*';
 const parts=[];
 for(const item of split(select)){
  if(item==='*'){parts.push('t.*');continue;}
  if(item.includes('(')){if(mutation)throw bad('Zagnieżdżenia nie są obsługiwane przy zapisie.');parts.push(await embed(t,item));continue;}
  column(t,item);parts.push(`t.${q(item)}`);
 }
 return parts.join(', ');
}
function ordering(t,order){
 if(!order)return '';
 return ' order by '+String(order).split(',').map(part=>{const [col,...mods]=part.trim().split('.');column(t,col);const dir=mods.includes('desc')?'desc':'asc',nulls=mods.includes('nullsfirst')?' nulls first':mods.includes('nullslast')?' nulls last':'';return `t.${q(col)} ${dir}${nulls}`;}).join(', ');
}
const count=(v,name)=>{const n=Number(v);if(!Number.isInteger(n)||n<0)throw bad(`Nieprawidłowy parametr ${name}.`);return n;};
// Parameters are always sent as text and cast by PostgreSQL. A typed parameter would be
// serialized by the driver (timestamps through Date lose microseconds; json is stringified twice).
const wrap=(statement,sel)=>`with r as (${statement} returning ${sel}) select coalesce(json_agg(r),'[]'::json) as body from r`;
export async function pgRequest(name,{method='GET',query={},body,prefer='return=representation'}={}){
 try{
  await ensureSchema();
  if(name.startsWith('rpc/'))return await callFunction(name.slice(4),body);
  const t=await table(name),params=[],p=v=>{params.push(v);return '$'+params.length+'::text';};
  const {select,order,limit,offset,on_conflict,...filters}=query;
  const where=Object.entries(filters).map(([col,expr])=>condition(t,col,String(expr),p));
  const whereSql=where.length?' where '+where.join(' and '):'';
  let text;
  if(method==='GET'){
   text=`select coalesce(json_agg(r),'[]'::json) as body from (select ${await selection(t,select)} from public.${q(t.name)} t${whereSql}${ordering(t,order)}${limit!==undefined?' limit '+count(limit,'limit'):''}${offset!==undefined?' offset '+count(offset,'offset'):''}) r`;
  }else if(method==='POST'){
   const rows=JSON.parse(JSON.stringify(Array.isArray(body)?body:[body]));
   if(!rows.length)return [];
   const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];cols.forEach(c=>column(t,c));
   let statement=`insert into public.${q(t.name)} as t (${cols.map(q).join(', ')}) select ${cols.map(q).join(', ')} from json_populate_recordset(null::public.${q(t.name)}, ${p(JSON.stringify(rows))}::json)`;
   if(/resolution=(merge|ignore)-duplicates/.test(prefer)){
    const target=on_conflict?String(on_conflict).split(',').map(c=>c.trim()):t.pk;target.forEach(c=>column(t,c));
    const update=cols.filter(c=>!target.includes(c));
    statement+=` on conflict (${target.map(q).join(', ')}) do `+(prefer.includes('ignore-duplicates')?'nothing':`update set ${(update.length?update:[target[0]]).map(c=>`${q(c)} = excluded.${q(c)}`).join(', ')}`);
   }
   text=wrap(statement,await selection(t,select,{mutation:true}));
  }else if(method==='PATCH'){
   const values=JSON.parse(JSON.stringify(body||{})),cols=Object.keys(values);
   if(!cols.length)throw bad('Brak pól do zmiany.');cols.forEach(c=>column(t,c));
   text=wrap(`update public.${q(t.name)} as t set ${cols.map(c=>`${q(c)} = j.${q(c)}`).join(', ')} from json_populate_record(null::public.${q(t.name)}, ${p(JSON.stringify(values))}::json) as j${whereSql}`,await selection(t,select,{mutation:true}));
  }else if(method==='DELETE'){
   text=wrap(`delete from public.${q(t.name)} as t${whereSql}`,await selection(t,select,{mutation:true}));
  }else throw bad('Nieobsługiwana metoda.');
  const [row]=await sql().unsafe(text,params);
  return prefer.includes('return=minimal')?null:row.body;
 }catch(e){throw failure(e);}
}
async function fn(name){
 if(functions.has(name))return functions.get(name);
 if(!/^[a-z_][a-z0-9_]*$/.test(name))throw bad('Nieprawidłowa funkcja.');
 const [f]=await sql().unsafe(`select p.proargnames as names, array(select format_type(x,null) from unnest(p.proargtypes::oid[]) with ordinality u(x,i) order by i) as types, p.proretset as set from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1 limit 1`,[name]);
 if(!f)throw new AppError('W bazie brakuje wymaganej tabeli lub funkcji. Sprawdź DATABASE_URL i uruchom aplikację ponownie, aby wykonać migracje.',503,'database_schema');
 const value={args:new Map((f.names||[]).map((n,i)=>[n,f.types[i]])),rows:f.set};
 functions.set(name,value);return value;
}
async function callFunction(name,body={}){
 const f=await fn(name),params=[],p=v=>{params.push(v);return '$'+params.length+'::text';};
 const args=Object.entries(JSON.parse(JSON.stringify(body||{}))).map(([k,v])=>{const type=f.args.get(k);if(!type)throw bad(`Nieznany argument ${k} funkcji ${name}.`);return `${q(k)} => ${p(v===null?null:typeof v==='object'?JSON.stringify(v):String(v))}::${type}`;});
 const call=`public.${q(name)}(${args.join(', ')})`;
 const [row]=await sql().unsafe(f.rows?`select coalesce(json_agg(r),'[]'::json) as body from ${call} r`:`select to_json(${call}) as body`,params);
 return row.body;
}
