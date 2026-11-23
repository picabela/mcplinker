import {randomUUID} from 'node:crypto';
import {AppError} from './security.mjs';
import {databaseHeaders} from './db.mjs';

// Platforms such as Instagram download media themselves at publish time, so a
// conversation link that expires in minutes cannot be passed on. Files are copied to
// public Supabase Storage buckets under random names; a bucket is created on first use.
const buckets={
 image:{id:'mcplinker-media',file_size_limit:8*1024*1024,allowed_mime_types:['image/jpeg','image/png','image/gif','image/webp'],timeout:20000},
 // No bucket size limit: the project's global Storage limit applies (50 MB on the Free plan).
 video:{id:'mcplinker-video',allowed_mime_types:['video/mp4','video/quicktime'],timeout:55000}
};
const base=()=>process.env.SUPABASE_URL.trim().replace(/\/+$/,'')+'/storage/v1';
export const isHosted=url=>Boolean(process.env.SUPABASE_URL)&&typeof url==='string'&&Object.values(buckets).some(b=>url.startsWith(`${base()}/object/public/${b.id}/`));
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
 const bucket=buckets[kind],path=`${new Date().toISOString().slice(0,7)}/${randomUUID()}.${ext}`;
 const upload=()=>storage(`/object/${bucket.id}/${path}`,{method:'POST',headers:{'Content-Type':mime,'Cache-Control':'max-age=31536000','x-upsert':'false'},body:bytes},bucket.timeout);
 let {r,error}=await upload();
 if(!r.ok&&said(error,/404|bucket not found/i)){await createBucket(bucket);({r,error}=await upload());}
 if(!r.ok&&(r.status===413||said(error,/413|too large|exceeded the maximum/i)))throw new AppError(`Plik (${Math.round(bytes.length/1048576)} MB) przekracza limit rozmiaru plików w Supabase Storage (na planie Free 50 MB). Skróć lub skompresuj plik albo zwiększ limit w ustawieniach Storage.`,400,'provider_rejected');
 if(!r.ok)throw storageError(r.status);
 return `${base()}/object/public/${bucket.id}/${path}`;
}
export const storeImage=(bytes,mime,ext)=>storeFile(bytes,mime,ext,'image');
