import {randomUUID} from 'node:crypto';
import {AppError} from './security.mjs';
import {databaseHeaders} from './db.mjs';

// Platforms such as Instagram download the image themselves at publish time, so a
// conversation link that expires in minutes cannot be passed on. Files are copied to a
// public Supabase Storage bucket under random names; the bucket is created on first use.
const bucket='mcplinker-media';
const base=()=>process.env.SUPABASE_URL.trim().replace(/\/+$/,'')+'/storage/v1';
export const isHosted=url=>Boolean(process.env.SUPABASE_URL)&&typeof url==='string'&&url.startsWith(`${base()}/object/public/${bucket}/`);
const storageError=status=>new AppError(`Nie udało się zapisać obrazu w Supabase Storage (HTTP ${status}). Sprawdź, czy Storage działa w projekcie wskazanym przez SUPABASE_URL.`,503,'storage_error');
async function storage(path,init){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key||!process.env.SUPABASE_URL)throw new AppError('Uzupełnij konfigurację Supabase.',503,'setup_required');
 const r=await fetch(base()+path,{...init,headers:{...databaseHeaders(key),...init.headers},signal:AbortSignal.timeout(20000),cache:'no-store'});
 return {r,error:r.ok?null:await r.json().catch(()=>({}))};
}
const said=(e,pattern)=>pattern.test([e?.statusCode,e?.error,e?.message].join(' '));
async function createBucket(){
 const {r,error}=await storage('/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:true,file_size_limit:8*1024*1024,allowed_mime_types:['image/jpeg','image/png','image/gif','image/webp']})});
 if(!r.ok&&!said(error,/409|exists|duplicate/i))throw storageError(r.status);
}
export async function storeImage(bytes,mime,ext){
 const path=`${new Date().toISOString().slice(0,7)}/${randomUUID()}.${ext}`;
 const upload=()=>storage(`/object/${bucket}/${path}`,{method:'POST',headers:{'Content-Type':mime,'Cache-Control':'max-age=31536000','x-upsert':'false'},body:bytes});
 let {r,error}=await upload();
 if(!r.ok&&said(error,/404|bucket not found/i)){await createBucket();({r}=await upload());}
 if(!r.ok)throw storageError(r.status);
 return `${base()}/object/public/${bucket}/${path}`;
}
