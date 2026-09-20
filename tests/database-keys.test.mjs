import test from 'node:test';
import assert from 'node:assert/strict';
import {db,databaseHeaders,databaseError} from '../lib/db.mjs';
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

test('server key strips surrounding whitespace and rejects a publishable key',()=>{
 assert.deepEqual(databaseHeaders('  sb_secret_example\n'),{apikey:'sb_secret_example'});
 assert.throws(()=>databaseHeaders('sb_publishable_example'),e=>e.code==='database_credentials');
});
for(const [status,upstream,expected] of [[401,{},'database_credentials'],[403,{},'database_permissions'],[400,{code:'42501'},'database_permissions'],[404,{code:'PGRST202'},'database_schema'],[404,{code:'PGRST205'},'database_schema'],[409,{code:'23505'},'duplicate'],[500,{},'database_error']]){
 test(`database error classifies ${status}/${upstream.code||'gateway'} without exposing upstream content`,()=>{
  const error=databaseError(status,{...upstream,message:'private-secret-test',details:'private-owner-data'});
  assert.equal(error.code,expected);
  assert.equal(error.message.includes('private-'),false);
 });
}
