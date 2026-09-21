import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {context} from '../lib/auth.mjs';
import {execute} from '../lib/actions.mjs';
import {handleOAuth} from '../lib/oauth.mjs';
import {catalog} from '../lib/mcp.mjs';
import {hash,challenge} from '../lib/security.mjs';

process.env.SUPABASE_URL='https://database.example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
process.env.APP_URL='https://app.example.com';
process.env.APP_OWNER_EMAIL='owner@example.com';
const owner=randomUUID(),otherOwner=randomUUID(),brand=randomUUID(),foreign=randomUUID(),client=randomUUID();
const panel={ownerId:owner,actor:'panel',scopes:['read','admin','manage'],brandIds:null};
const redirect='https://chatgpt.com/connector_platform_oauth_redirect',resource=process.env.APP_URL+'/mcp';
let tables;
beforeEach(()=>{
 tables={brands:[{id:brand,owner_id:owner,name:'First'},{id:foreign,owner_id:otherOwner,name:'Other owner'}],connections:[],oauth_grants:[],oauth_codes:[],api_keys:[],audit_log:[],oauth_clients:[{client_id:client,redirect_uris:[redirect],client_name:'ChatGPT'}]};
});
function matches(row,params){for(const[k,v]of params){if(v.startsWith('eq.')&&String(row[k])!==v.slice(3))return false;if(v==='is.null'&&row[k]!=null)return false;if(v.startsWith('gt.')&&!(row[k]>v.slice(3)))return false;if(v.startsWith('in.')&&!v.slice(4,-1).split(',').includes(row[k]))return false;}return true;}
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url),table=u.pathname.split('/').pop(),args=options.body?JSON.parse(options.body):null;
 let result;
 if(u.pathname==='/auth/v1/user')return Response.json({id:owner,email:process.env.APP_OWNER_EMAIL});
 if(table==='take_rate')return Response.json(true);
 if(table==='consume_oauth_code'){
  result=tables.oauth_codes.filter(c=>c.code_hash===args.p_hash&&c.client_id===args.p_client&&c.redirect_uri===args.p_redirect&&c.challenge===args.p_challenge&&c.resource===args.p_resource&&!c.consumed_at);
  result.forEach(c=>c.consumed_at=new Date().toISOString());
 }else if(table==='rotate_oauth_token'){
  result=tables.oauth_grants.filter(g=>g.refresh_hash===args.p_hash&&g.client_id===args.p_client&&g.resource===args.p_resource&&!g.revoked_at&&Date.parse(g.refresh_expires_at)>Date.now());
  result.forEach(g=>Object.assign(g,{access_hash:args.p_access,refresh_hash:args.p_refresh,expires_at:new Date(Date.now()+3600000).toISOString()}));
 }else{
  assert.ok(tables[table],'Unexpected request '+u.pathname);
  result=tables[table].filter(r=>matches(r,u.searchParams));
  if(options.method==='POST'){const row={id:randomUUID(),...args};tables[table].push(row);result=[row];}
  if(options.method==='PATCH')result.forEach(row=>Object.assign(row,args));
  if(u.searchParams.has('select'))result=result.map(row=>Object.fromEntries(u.searchParams.get('select').split(',').map(k=>[k,row[k]])));
 }
 return Response.json(result);
};
function grant(extra={}){const token=randomUUID(),row={id:randomUUID(),owner_id:owner,client_id:client,access_hash:hash(token),refresh_hash:hash(randomUUID()),resource,scopes:['read','admin'],brand_ids:[brand],expires_at:new Date(Date.now()+3600000).toISOString(),refresh_expires_at:new Date(Date.now()+86400000).toISOString(),revoked_at:null,...extra};tables.oauth_grants.push(row);return{token,row};}
const authenticated=token=>context(new Request(resource,{headers:{Authorization:'Bearer '+token}}),{mcp:true});
const brandsFor=async token=>(await execute('brand_list',{},await authenticated(token))).map(b=>b.id);
const addBrand=()=>{const row={id:randomUUID(),owner_id:owner,name:'New'};tables.brands.push(row);return row.id;};

test('existing selected-brand grants do not silently include future or foreign brands',async()=>{
 const g=grant();addBrand();assert.deepEqual(await brandsFor(g.token),[brand]);
 const empty=grant({brand_ids:[]});assert.deepEqual(await brandsFor(empty.token),[]);
 const missing=grant({brand_ids:null});assert.deepEqual(await brandsFor(missing.token),[]);
});
test('all-brand consent discovers new brands and connections with the same token, restricted to the owner',async()=>{
 const g=grant({all_brands:true,brand_ids:[]});assert.deepEqual(await brandsFor(g.token),[brand]);
 const added=addBrand();assert.deepEqual(await brandsFor(g.token),[brand,added]);
 tables.connections.push({id:randomUUID(),owner_id:owner,brand_id:added},{id:randomUUID(),owner_id:otherOwner,brand_id:foreign});
 assert.equal((await execute('connection_list',{},await authenticated(g.token))).length,1);
 const ctx=await authenticated(g.token);
 await assert.rejects(()=>execute('connection_test',{id:tables.connections[1].id},ctx),e=>e.status===404);
 await assert.rejects(()=>execute('brand_create',{name:'Denied'},ctx),e=>e.status===403);
});
test('panel expands and restricts an existing grant immediately without changing tokens or scopes',async()=>{
 const g=grant(),added=addBrand(),hashBefore=g.row.access_hash;
 await execute('grant_update_brands',{id:g.row.id,all_brands:true},panel);
 assert.deepEqual(await brandsFor(g.token),[brand,added]);
 await execute('grant_update_brands',{id:g.row.id,all_brands:false,brand_ids:[added]},panel);
 assert.deepEqual(await brandsFor(g.token),[added]);
 assert.equal(g.row.access_hash,hashBefore);assert.deepEqual(g.row.scopes,['read','admin']);
 assert.ok(tables.audit_log.some(x=>x.action==='grant_brand_access'&&x.details.all_brands===true));
 assert.ok(!catalog(await authenticated(g.token)).some(t=>t.name==='grant_update_brands'));
});
test('agents, foreign owners, foreign brands, revoked grants and expired grants cannot change access',async()=>{
 const g=grant();
 await assert.rejects(()=>execute('grant_update_brands',{id:g.row.id,all_brands:true},{...panel,actor:'oauth_grants:'+g.row.id}),e=>e.status===403);
 await assert.rejects(()=>execute('grant_update_brands',{id:g.row.id,all_brands:true},{...panel,ownerId:otherOwner}),e=>e.status===404);
 await assert.rejects(()=>execute('grant_update_brands',{id:g.row.id,brand_ids:[foreign]},panel),e=>e.status===404);
 await assert.rejects(()=>execute('grant_update_brands',{id:g.row.id,brand_ids:[]},panel),e=>e.status===400);
 await assert.rejects(()=>execute('grant_update_brands',{id:g.row.id,all_brands:'true'},panel),e=>e.status===400);
 g.row.revoked_at=new Date().toISOString();
 await assert.rejects(()=>execute('grant_update_brands',{id:g.row.id,all_brands:true},panel),e=>e.status===409);
 g.row.revoked_at=null;g.row.refresh_expires_at='2000-01-01T00:00:00Z';
 await assert.rejects(()=>execute('grant_update_brands',{id:g.row.id,all_brands:true},panel),e=>e.status===409);
 assert.notEqual(g.row.all_brands,true);
});
test('all-brand mode does not apply to API keys or add operation scopes',async()=>{
 const token='sp_'+randomUUID();tables.api_keys.push({id:randomUUID(),owner_id:owner,token_hash:hash(token),brand_ids:[brand],all_brands:true,scopes:['read'],expires_at:new Date(Date.now()+60000).toISOString()});
 addBrand();assert.deepEqual(await brandsFor(token),[brand]);
 const g=grant({all_brands:true,scopes:['read']});
 const ctx=await authenticated(g.token);
 await assert.rejects(()=>execute('wordpress_request',{connection_id:randomUUID(),path:'wp/v2/posts'},ctx),e=>e.status===403);
});
function approval(input){const query=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',code_challenge_method:'S256',code_challenge:challenge('v'.repeat(50)),resource,state:'s'.repeat(32),scope:'read'}).toString();return handleOAuth(new Request(process.env.APP_URL+'/oauth/approve',{method:'POST',headers:{'Content-Type':'application/json',Origin:process.env.APP_URL,Cookie:'sp_access=test-session'},body:JSON.stringify({query,...input})}));}
function tokenRequest(input){return handleOAuth(new Request(process.env.APP_URL+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,resource,...input})}));}
test('explicit OAuth consent survives code exchange and refresh; changing access survives refresh too',async()=>{
 tables.brands=[];
 const approve=await approval({all_brands:true,brand_ids:[]});assert.equal(approve.status,200);
 const code=new URL((await approve.json()).redirect).searchParams.get('code');
 const exchange=await tokenRequest({grant_type:'authorization_code',code,code_verifier:'v'.repeat(50),redirect_uri:redirect});assert.equal(exchange.status,200);
 const tokens=await exchange.json();assert.deepEqual(await brandsFor(tokens.access_token),[]);
 const added=addBrand();assert.deepEqual(await brandsFor(tokens.access_token),[added]);
 const refreshed=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh_token});assert.equal(refreshed.status,200);
 const next=await refreshed.json();assert.deepEqual(await brandsFor(next.access_token),[added]);
 await execute('grant_update_brands',{id:tables.oauth_grants[0].id,brand_ids:[added]},panel);
 const after=addBrand(),again=await tokenRequest({grant_type:'refresh_token',refresh_token:next.refresh_token});
 assert.deepEqual(await brandsFor((await again.json()).access_token),[added]);assert.notEqual(after,added);
});
test('OAuth consent defaults to selected brands and rejects empty or foreign selections',async()=>{
 assert.equal((await approval({brand_ids:[]})).status,400);
 assert.equal((await approval({brand_ids:[foreign]})).status,404);
 assert.equal((await approval({all_brands:'true',brand_ids:[]})).status,400);
 assert.equal((await approval({brand_ids:[brand]})).status,200);
 assert.equal(tables.oauth_codes.at(-1).all_brands,false);
 assert.deepEqual(tables.oauth_codes.at(-1).brand_ids,[brand]);
});
