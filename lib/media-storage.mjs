import {randomUUID} from 'node:crypto';
import {AppError,origin} from './security.mjs';
import {databaseHeaders} from './db.mjs';
import {usePostgres,sql,ensureSchema} from './pg.mjs';

// Platforms such as Instagram download media themselves at publish time, so a
// conversation link that expires in minutes cannot be passed on. Files are copied to
// public Supabase Storage buckets under random names; a bucket is created on first use.
const buckets={
 image:{id:'mcplinker-media',file_size_limit:8*1024*1024,allowed_mime_types:['image/jpeg','image/png','image/gif','image/webp'],timeout:20000},
 // No bucket size limit: the project's global Storage limit applies (50 MB on the Free plan).
 video:{id:'mcplinker-video',allowed_mime_types:['video/mp4','video/quicktime'],timeout:55000}
};
const base=()=>process.env.SUPABASE_URL.trim().replace(/\/+$/,'')+'/storage/v1';
const mediaPath=/^(image|video)\/(\d{4}-\d{2})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|gif|webp|mp4|mov)$/;
export const isHosted=url=>typeof url==='string'&&(usePostgres()?url.startsWith(origin()+'/media/')&&mediaPath.test(url.slice(origin().length+7)):Boolean(process.env.SUPABASE_URL)&&Object.values(buckets).some(b=>url.startsWith(`${base()}/object/public/${b.id}/`)));
const storageError=status=>new AppError(`Nie udało się zapisać pliku w Supabase Storage (HTTP ${status}). Sprawdź, czy Storage działa w projekcie wskazanym przez SUPABASE_URL.`,503,'storage_error');
async function storage(path,init,timeout=20000){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key||!process.env.SUPABASE_URL)throw new AppError('Uzupełnij konfigurację Supabase.',503,'setup_required');
 const r=await fetch(base()+path,{...init,headers:{...databaseHeaders(key),...init.headers},signal:AbortSignal.timeout(timeout),cache:'no-store'});
 return {r,error:r.ok?null:await r.json().catch(()=>({}))};
}
const said=(e,pattern)=>pattern.test([e?.statusCode,e?.error,e?.message].join(' '));
async function createBucket({id,file_size_limit,allowed_mime_types}){
 const {r,error}=await storage('/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name:id,public:true,allowed_mime_types,...(file_size_limit?{file_size_limit}:{})})});
 if(!r.ok&&!said(error,/409|exists|duplicate/i))throw storageError(r.status);
}
export async function storeFile(bytes,mime,ext,kind='image'){
 if(usePostgres())return storeLocal(bytes,mime,ext,kind);
 const bucket=buckets[kind],path=`${new Date().toISOString().slice(0,7)}/${randomUUID()}.${ext}`;
 const upload=()=>storage(`/object/${bucket.id}/${path}`,{method:'POST',headers:{'Content-Type':mime,'Cache-Control':'max-age=31536000','x-upsert':'false'},body:bytes},bucket.timeout);
 let {r,error}=await upload();
 if(!r.ok&&said(error,/404|bucket not found/i)){await createBucket(bucket);({r,error}=await upload());}
 if(!r.ok&&(r.status===413||said(error,/413|too large|exceeded the maximum/i)))throw new AppError(`Plik (${Math.round(bytes.length/1048576)} MB) przekracza limit rozmiaru plików w Supabase Storage (na planie Free 50 MB). Skróć lub skompresuj plik albo zwiększ limit w ustawieniach Storage.`,400,'provider_rejected');
 if(!r.ok)throw storageError(r.status);
 return `${base()}/object/public/${bucket.id}/${path}`;
}
export const storeImage=(bytes,mime,ext)=>storeFile(bytes,mime,ext,'image');

// Self-hosted mode: files live in PostgreSQL in 1 MB chunks and are served by the app
// itself at APP_URL/media/<kind>/<yyyy-mm>/<uuid>.<ext>, a permanent public address.
const chunk=1024*1024,limits={image:buckets.image.file_size_limit,video:200*1024*1024};
async function storeLocal(bytes,mime,ext,kind){
 if(!limits[kind]||!mediaPath.test(`${kind}/2000-01/00000000-0000-0000-0000-000000000000.${ext}`))throw new AppError('Nieobsługiwany typ pliku.',400,'provider_rejected');
 if(bytes.length>limits[kind])throw new AppError(`Plik (${Math.round(bytes.length/1048576)} MB) przekracza limit ${limits[kind]/1048576} MB.`,400,'provider_rejected');
 await ensureSchema();
 const id=randomUUID();
 try{await sql().begin(async tx=>{
  await tx`insert into public.media (id,kind,mime_type,size) values (${id},${kind},${mime},${bytes.length})`;
  for(let n=0;n*chunk<bytes.length;n++)await tx`insert into public.media_chunks (media_id,n,data) values (${id},${n},${bytes.subarray(n*chunk,(n+1)*chunk)})`;
 });}catch(e){console.error('MCPLinker media store failed',{code:e?.code||'unknown'});throw new AppError('Nie udało się zapisać pliku w bazie danych.',503,'storage_error');}
 return `${origin()}/media/${kind}/${new Date().toISOString().slice(0,7)}/${id}.${ext}`;
}
export async function serveMedia(req,path){
 const m=mediaPath.exec(path);if(!m||!usePostgres())return new Response('Not found',{status:404});
 await ensureSchema();
 const [file]=await sql()`select id,mime_type,size from public.media where id=${m[3]} and kind=${m[1]}`;
 if(!file)return new Response('Not found',{status:404});
 const size=Number(file.size),headers={'Content-Type':file.mime_type,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=31536000, immutable','ETag':`"${file.id}"`,'X-Content-Type-Options':'nosniff'};
 let start=0,end=size-1,status=200;
 const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range')||'');
 if(range&&size){
  if(range[1]===''){start=Math.max(0,size-Number(range[2]));}else{start=Number(range[1]);if(range[2]!=='')end=Math.min(Number(range[2]),size-1);}
  if(start>end||start>=size)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=String(size?end-start+1:0);
 if(req.method==='HEAD')return new Response(null,{status,headers});
 let n=Math.floor(start/chunk);const last=Math.floor(end/chunk);
 const body=new ReadableStream({async pull(controller){
  if(!size||n>last){controller.close();return;}
  const [row]=await sql()`select data from public.media_chunks where media_id=${file.id} and n=${n}`;
  if(!row){controller.error(new Error('Missing media chunk'));return;}
  let data=row.data;const from=n*chunk;
  data=data.subarray(Math.max(0,start-from),Math.min(data.length,end-from+1));
  n++;controller.enqueue(new Uint8Array(data));
 }});
 return new Response(body,{status,headers});
}
