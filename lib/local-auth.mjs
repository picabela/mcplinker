import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {AppError,hash} from './security.mjs';
import {db} from './db.mjs';

// Self-hosted sign-in that answers the same calls as Supabase Auth (signup, password and
// refresh-token grants, user, logout), so the panel and cookies work unchanged.
// Passwords use scrypt. Sessions keep only SHA-256 hashes of the random tokens.
const derive=promisify(scrypt),N=16384,r=8,p=1,accessSeconds=3600,refreshDays=30;
const denied=()=>new AppError('Nie udało się uwierzytelnić. Sprawdź dane logowania.',401);
export async function hashPassword(password){const salt=randomBytes(16),key=await derive(password,salt,64,{N,r,p});return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;}
export async function verifyPassword(password,stored){
 const m=/^scrypt\$(\d+)\$(\d+)\$(\d+)\$([^$]+)\$([^$]+)$/.exec(stored||'');if(!m)return false;
 const expected=Buffer.from(m[5],'base64'),key=await derive(password,Buffer.from(m[4],'base64'),expected.length,{N:Number(m[1]),r:Number(m[2]),p:Number(m[3]),maxmem:256*1024*1024});
 return timingSafeEqual(key,expected);
}
const token=()=>'ml_'+randomBytes(32).toString('base64url');
async function issue(user){
 const access=token(),refresh=token(),now=Date.now();
 await db('sessions',{method:'POST',body:{user_id:user.id,access_hash:hash(access),refresh_hash:hash(refresh),expires_at:new Date(now+accessSeconds*1000).toISOString(),refresh_expires_at:new Date(now+refreshDays*864e5).toISOString()}});
 return{access_token:access,refresh_token:refresh,expires_in:accessSeconds,token_type:'bearer',user:{id:user.id,email:user.email}};
}
// Emails are stored in lower case, matching the case-insensitive owner check.
const findUser=async email=>(await db('users',{query:{email:'eq.'+String(email).trim().toLowerCase(),limit:1}}))[0];
// An account copied from Supabase has no local password hash. The first sign-in is checked
// against the source project (SOURCE_SUPABASE_*) and the password is then stored locally.
async function sourcePassword(user,email,password){
 const url=process.env.SOURCE_SUPABASE_URL?.trim().replace(/\/+$/,''),key=(process.env.SOURCE_SUPABASE_PUBLISHABLE_KEY||process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY)?.trim();
 if(!url||!key)return false;
 try{const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok)return false;const d=await r.json();return d?.user?.id===user.id;}catch{return false;}
}
export async function localAuth(path,body,bearer){
 if(path==='signup'){
  // Without e-mail confirmation the first sign-up claims the owner account. When data is
  // copied from Supabase the owner comes from the copy, so sign-up stays closed.
  if(process.env.SOURCE_SUPABASE_URL)throw new AppError('Konto właściciela zostanie skopiowane z poprzedniej instalacji. Zaloguj się dotychczasowym hasłem.',403);
  if(await findUser(body.email)||(await db('users',{query:{select:'id',limit:1}})).length)throw new AppError('Konto właściciela już istnieje. Zaloguj się.',409,'duplicate');
  const [user]=await db('users',{method:'POST',body:{email:body.email.trim().toLowerCase(),password_hash:await hashPassword(body.password)}});
  return issue(user);
 }
 if(path==='token?grant_type=password'){
  const user=await findUser(body.email);if(!user)throw denied();
  if(user.password_hash){if(!await verifyPassword(body.password,user.password_hash))throw denied();}
  else if(await sourcePassword(user,body.email,body.password))await db('users',{method:'PATCH',query:{id:'eq.'+user.id},body:{password_hash:await hashPassword(body.password)}});
  else throw denied();
  return issue(user);
 }
 if(path==='token?grant_type=refresh_token'){
  const [s]=await db('sessions',{method:'PATCH',query:{refresh_hash:'eq.'+hash(String(body.refresh_token||'')),revoked_at:'is.null',refresh_expires_at:'gt.'+new Date().toISOString()},body:{revoked_at:new Date().toISOString()}});
  if(!s)throw denied();
  const [user]=await db('users',{query:{id:'eq.'+s.user_id,limit:1}});if(!user)throw denied();
  return issue(user);
 }
 if(path==='user'){
  const [s]=await db('sessions',{query:{access_hash:'eq.'+hash(String(bearer||'')),revoked_at:'is.null',expires_at:'gt.'+new Date().toISOString(),limit:1}});
  if(!s)throw denied();
  const [user]=await db('users',{query:{id:'eq.'+s.user_id,limit:1}});if(!user)throw denied();
  return{id:user.id,email:user.email};
 }
 if(path==='logout'){await db('sessions',{method:'PATCH',query:{access_hash:'eq.'+hash(String(bearer||''))},body:{revoked_at:new Date().toISOString()}});return{};}
 throw new AppError('Nieznana operacja.',404);
}
