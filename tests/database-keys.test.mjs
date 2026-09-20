import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../lib/db.mjs';
process.env.SUPABASE_URL='https://database.example.com';
for(const [format,key] of [['modern','sb_secret_test-only'],['legacy','test.legacy.jwt']]){
 test(`PostgREST request uses correct authentication for ${format} server key`,async()=>{
  process.env.SUPABASE_SERVICE_ROLE_KEY=key;
  const original=globalThis.fetch;
  let called=false;
  globalThis.fetch=async(url,options)=>{
   called=true;
   assert.equal(new URL(url).origin,'https://database.example.com');
   assert.equal(options.headers.apikey,key);
   assert.equal(options.headers.Authorization,format==='modern'?undefined:'Bearer '+key);
   return new Response('[]',{status:200});
  };
  try{assert.deepEqual(await db('brands'),[]);assert.equal(called,true);}finally{globalThis.fetch=original;}
 });
}
