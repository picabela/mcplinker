// Self-hosted mode against a real PostgreSQL. Runs when TEST_DATABASE_URL is set
// (CI starts a postgres service); the public schema of that database is recreated.
import test,{mock,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import dns from 'node:dns/promises';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
const url=process.env.TEST_DATABASE_URL;
const skip=url?false:'TEST_DATABASE_URL is not set';
process.env.DATABASE_URL=url||'';process.env.APP_URL='https://app.example.com';process.env.APP_OWNER_EMAIL='owner@example.com';
process.env.ENCRYPTION_KEY='a'.repeat(64);process.env.CRON_SECRET='cron';
const {db,rpc}=await import('../lib/db.mjs');
const {sql,closePostgres,ensureSchema}=await import('../lib/pg.mjs');
const {authRequest}=await import('../lib/auth.mjs');
const {storeFile,isHosted,serveMedia}=await import('../lib/media-storage.mjs');
const {runImport,autoImport,importState}=await import('../lib/import-supabase.mjs');
const {handleApi}=await import('../lib/api.mjs');
before(async()=>{if(skip)return;await sql().unsafe('drop schema if exists public cascade; create schema public;').simple();await closePostgres();await ensureSchema();});
after(async()=>{mock.restoreAll();syncBuiltinESMExports();if(!skip)await closePostgres();});
const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+00:00$/;
let owner,brand,connection;

test('PostgREST-style requests map to SQL with the same results',{skip},async()=>{
 [owner]=await db('users',{method:'POST',body:{email:'someone@example.com'}});
 [brand]=await db('brands',{method:'POST',body:{name:'Marka',owner_id:owner.id}});
 assert.match(brand.created_at,iso);assert.equal(brand.publish_policy,'approval');
 const upsert=body=>db('connections',{method:'POST',query:{on_conflict:'owner_id,brand_id,platform,external_id',select:'id,name,scopes'},prefer:'resolution=merge-duplicates,return=representation',body:{owner_id:owner.id,brand_id:brand.id,platform:'instagram',external_id:'17841',credentials:'x',...body}});
 const [a]=await upsert({name:'IG',scopes:['a','b']}),[b]=await upsert({name:'IG 2',scopes:[]});
 assert.deepEqual(a,{id:a.id,name:'IG',scopes:['a','b']});assert.equal(b.id,a.id);assert.equal(b.name,'IG 2');connection=b;
 const [p]=await db('posts',{method:'POST',body:{owner_id:owner.id,brand_id:brand.id,connection_id:connection.id,content:'Hej',payload:{image_urls:['https://x.example/1.jpg'],story:true},dedupe_key:'k1'}});
 assert.deepEqual(p.payload,{image_urls:['https://x.example/1.jpg'],story:true});assert.match(p.updated_at,iso);assert.equal(p.scheduled_at,null);
 // Optimistic checks compare the stored timestamp string, with microseconds, exactly.
 assert.equal((await db('posts',{query:{id:'eq.'+p.id,updated_at:'eq.'+p.updated_at,status:'eq.draft'}})).length,1);
 const [changed]=await db('posts',{method:'PATCH',query:{id:'eq.'+p.id,updated_at:'eq.'+p.updated_at},body:{status:'scheduled',scheduled_at:new Date(Date.now()-1000).toISOString(),updated_at:new Date().toISOString(),payload:{video_url:'https://v.example/1.mp4'}}});
 assert.equal(changed.status,'scheduled');assert.deepEqual(changed.payload,{video_url:'https://v.example/1.mp4'});
 assert.deepEqual(await db('posts',{method:'PATCH',query:{id:'eq.'+p.id,updated_at:'eq.'+p.updated_at},body:{status:'draft'}}),[]);
 assert.equal((await db('brands',{query:{owner_id:'eq.'+owner.id,id:'in.('+brand.id+')'}})).length,1);
 assert.deepEqual(await db('brands',{query:{id:'in.()'}}),[]);
 assert.equal((await db('posts',{query:{lock_token:'is.null',order:'created_at.desc,id.asc',limit:5,offset:0,select:'id,status'}}))[0].status,'scheduled');
 const claimed=await rpc('claim_posts',{batch_size:1});assert.equal(claimed.length,1);assert.equal(claimed[0].status,'processing');assert.equal(claimed[0].attempts,1);
 assert.equal(await rpc('take_rate',{p_key:'k',p_limit:1,p_seconds:60}),true);assert.equal(await rpc('take_rate',{p_key:'k',p_limit:1,p_seconds:60}),false);
 const [client]=await db('oauth_clients',{method:'POST',body:{client_name:'ChatGPT',redirect_uris:['https://chatgpt.com/cb']}});
 const later=new Date(Date.now()+3600e3).toISOString();
 await db('oauth_grants',{method:'POST',body:{owner_id:owner.id,client_id:client.client_id,access_hash:'a',refresh_hash:'r',resource:'x',scopes:['read'],brand_ids:[brand.id],expires_at:later,refresh_expires_at:later}});
 const [grant]=await db('oauth_grants',{query:{owner_id:'eq.'+owner.id,select:'id,brand_ids,all_brands,oauth_clients(client_name)'}});
 assert.deepEqual(grant.oauth_clients,{client_name:'ChatGPT'});assert.deepEqual(grant.brand_ids,[brand.id]);assert.equal(grant.all_brands,false);
 assert.equal((await db('oauth_grants',{query:{access_hash:'eq.a',revoked_at:'is.null',expires_at:'gt.'+new Date().toISOString(),limit:1}})).length,1);
 await assert.rejects(()=>db('brands',{method:'POST',body:{name:'X',owner_id:owner.id,unknown:1}}),e=>e.status===400);
 await assert.rejects(()=>db('users',{method:'POST',body:{email:'SOMEONE@example.com'}}),e=>e.status===409&&e.code==='duplicate');
 await assert.rejects(()=>db('brands',{query:{'id;drop table x':'eq.1'}}),e=>e.status===400);
 const [extra]=await db('connections',{method:'POST',body:{owner_id:owner.id,brand_id:brand.id,platform:'telegram',name:'T',external_id:'1',credentials:'x'}});
 assert.equal((await db('connections',{method:'DELETE',query:{id:'eq.'+extra.id,owner_id:'eq.'+owner.id}})).length,1);
 assert.equal((await db('users',{method:'DELETE',query:{id:'eq.'+owner.id}})).length,1);
 assert.deepEqual(await db('brands',{}),[],'deleting the account removes its data');
});

test('local sign-in: signup, password, session, refresh rotation and logout',{skip},async()=>{
 const s=await authRequest('signup',{email:'Owner@Example.com',password:'correct horse battery'});
 assert.match(s.access_token,/^ml_/);assert.equal(s.expires_in,3600);
 const [stored]=await db('users',{query:{email:'eq.owner@example.com'}});assert.match(stored.password_hash,/^scrypt\$/);
 await assert.rejects(()=>authRequest('signup',{email:'owner@example.com',password:'another password'}),e=>e.status===409);
 await assert.rejects(()=>authRequest('signup',{email:'second@example.com',password:'another password'}),e=>e.status===409,'only the first account can sign up');
 await assert.rejects(()=>authRequest('token?grant_type=password',{email:'owner@example.com',password:'wrong'}),e=>e.status===401);
 const login=await authRequest('token?grant_type=password',{email:'OWNER@example.com',password:'correct horse battery'});
 assert.deepEqual(await authRequest('user',undefined,login.access_token),{id:stored.id,email:'owner@example.com'});
 const next=await authRequest('token?grant_type=refresh_token',{refresh_token:login.refresh_token});
 await assert.rejects(()=>authRequest('token?grant_type=refresh_token',{refresh_token:login.refresh_token}),e=>e.status===401);
 await authRequest('logout',{scope:'local'},next.access_token);
 await assert.rejects(()=>authRequest('user',undefined,next.access_token),e=>e.status===401);
});

test('panel API works end to end with cookies in the self-hosted mode',{skip},async()=>{
 const call=(path,{method='GET',body,cookie}={})=>handleApi(new Request('https://app.example.com'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://app.example.com',...(cookie?{Cookie:cookie}:{})},body:body&&JSON.stringify(body)}));
 const status=await (await call('/api/status')).json();assert.equal(status.configured,true);assert.equal(status.database,'postgres');
 const r=await call('/api/auth/login',{method:'POST',body:{email:'owner@example.com',password:'correct horse battery'}});
 assert.equal(r.status,200);const cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const boot=await (await call('/api/bootstrap',{cookie})).json();
 assert.deepEqual(boot.brand_list,[]);assert.deepEqual(boot.migration,{source:false,state:null});
 const created=await (await call('/api/action/brand_create',{method:'POST',cookie,body:{name:'Panel'}})).json();
 assert.equal(created.name,'Panel');
});

test('media is stored in chunks and served with ranges at a permanent address',{skip},async()=>{
 const bytes=Buffer.alloc(2.5*1024*1024);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const link=await storeFile(bytes,'video/mp4','mp4','video');
 assert.match(link,/^https:\/\/app\.example\.com\/media\/video\/\d{4}-\d{2}\/[0-9a-f-]{36}\.mp4$/);assert.ok(isHosted(link));
 assert.equal(isHosted('https://other.example.com/media/video/2026-11/x.mp4'),false);
 const path=link.slice('https://app.example.com/media/'.length);
 const full=await serveMedia(new Request(link),path);assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'video/mp4');
 assert.ok(Buffer.from(await full.arrayBuffer()).equals(bytes));
 const part=await serveMedia(new Request(link,{headers:{Range:'bytes=1048570-1048585'}}),path);
 assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),`bytes 1048570-1048585/${bytes.length}`);
 assert.ok(Buffer.from(await part.arrayBuffer()).equals(bytes.subarray(1048570,1048586)));
 const tail=await serveMedia(new Request(link,{headers:{Range:'bytes=-10'}}),path);assert.ok(Buffer.from(await tail.arrayBuffer()).equals(bytes.subarray(bytes.length-10)));
 assert.equal((await serveMedia(new Request(link,{headers:{Range:'bytes=99999999-'}}),path)).status,416);
 const head=await serveMedia(new Request(link,{method:'HEAD'}),path);assert.equal(head.headers.get('content-length'),String(bytes.length));
 assert.equal((await serveMedia(new Request(link),'video/2026-11/00000000-0000-0000-0000-000000000000.mp4')).status,404);
 assert.equal((await serveMedia(new Request(link),'../../etc/passwd')).status,404);
});

test('import copies a Supabase deployment: drafts instead of schedules, files rehosted, passwords on first sign-in',{skip},async()=>{
 const src='https://src.supabase.co',file=src+'/storage/v1/object/public/mcplinker-media/2026-11/a.jpg';
 const sourceOwner='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
 const t='2026-11-20T10:00:00.123456+00:00',future='2026-12-24T10:00:00+00:00';
 const source={brands:[{id:b,owner_id:sourceOwner,name:'Źródło',color:'#c9fa75',website:null,voice:'',timezone:'Europe/Warsaw',publish_policy:'approval',created_at:t}],
  connections:[{id:c,owner_id:sourceOwner,brand_id:b,platform:'instagram',name:'IG',external_id:'1784',base_url:null,credentials:'cipher',scopes:[],status:'connected',expires_at:null,last_checked_at:null,created_at:t}],
  provider_apps:[{owner_id:sourceOwner,platform:'facebook',encrypted_config:'cipher'}],
  posts:[{id:'44444444-4444-4444-8444-444444444444',owner_id:sourceOwner,brand_id:b,connection_id:c,title:'',content:'Zaplanowany',payload:{image_urls:[file]},status:'scheduled',scheduled_at:future,approved_at:t,approved_by:sourceOwner,external_id:null,external_url:null,error:null,attempts:0,lock_token:null,locked_at:null,dedupe_key:'d1',created_at:t,updated_at:t},
   {id:'55555555-5555-4555-8555-555555555555',owner_id:sourceOwner,brand_id:b,connection_id:c,title:'',content:'Opublikowany',payload:{},status:'published',scheduled_at:null,approved_at:null,approved_by:null,external_id:'99',external_url:'https://instagram.com/p/x',error:null,attempts:1,lock_token:null,locked_at:null,dedupe_key:'d2',created_at:t,updated_at:t}],
  assets:[],automations:[{id:'66666666-6666-4666-8666-666666666666',owner_id:sourceOwner,brand_id:b,name:'RSS',kind:'rss_to_draft',config:{source_url:'https://x.example/rss',targets:[c],template:'{title}'},enabled:true,last_run_at:null,next_run_at:t,lease_token:null,lease_until:null,last_error:null,created_at:t}],
  audit_log:[{id:'77777777-7777-4777-8777-777777777777',owner_id:sourceOwner,brand_id:b,actor:'panel',action:'post_create',result:'ok',details:{},created_at:t}],api_keys:[]};
 const requests=[];let downloads=0;
 mock.method(globalThis,'fetch',async(raw,opts={})=>{const u=new URL(raw);requests.push(u.pathname);
  if(u.origin!==src)throw Error('Unexpected '+u.href);
  assert.equal(new Headers(opts.headers).get('apikey'),'sb_secret_source');
  if(u.pathname==='/auth/v1/admin/users')return Response.json({users:[{id:sourceOwner,email:'Owner@example.com',created_at:t}]});
  if(u.pathname==='/auth/v1/token')return JSON.parse(opts.body).password==='old password'?Response.json({access_token:'x',user:{id:sourceOwner}}):Response.json({error:'invalid'},{status:400});
  const table=u.pathname.split('/').pop(),offset=Number(u.searchParams.get('offset'));return Response.json(offset?[]:source[table]);});
 const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3,4]);
 mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
 mock.method(https,'request',(link,options,cb)=>{const req=new EventEmitter();req.write=()=>{};req.end=()=>{assert.equal(new URL(link).href,file);downloads++;const res=new EventEmitter();res.statusCode=200;res.headers={};queueMicrotask(()=>{cb(res);res.emit('data',jpeg);res.emit('end');});};req.destroy=()=>{};return req;});
 process.env.SOURCE_SUPABASE_URL=src;process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY='sb_secret_source';
 try{
  // The owner signed up here before the import; the copied account replaces it, without that password.
  assert.equal(await autoImport(),null,'an instance that already has data is not overwritten automatically');
  await assert.rejects(()=>authRequest('signup',{email:'owner@example.com',password:'attacker password'}),e=>e.status===403);
  const result=await runImport({mode:'copy'});
  assert.equal(result.status,'done');assert.deepEqual(result.counts,{users:1,brands:1,connections:1,provider_apps:1,posts:2,assets:0,automations:1,audit_log:1,api_keys:0});assert.deepEqual(result.warnings,[]);
  const posts=await db('posts',{query:{order:'dedupe_key.asc'}});
  assert.equal(posts[0].status,'draft');assert.equal(posts[0].scheduled_at,null);assert.equal(posts[0].approved_at,null);assert.equal(posts[0].created_at,t);
  assert.ok(isHosted(posts[0].payload.image_urls[0]));assert.equal(posts[1].status,'published');assert.equal(posts[1].external_id,'99');
  assert.equal((await db('automations',{}))[0].enabled,false);
  assert.equal((await db('brands',{})).length,1,'data created only here is replaced by the copy');
  const [user]=await db('users',{query:{id:'eq.'+sourceOwner}});assert.equal(user.email,'owner@example.com');assert.equal(user.password_hash,null);
  await assert.rejects(()=>authRequest('token?grant_type=password',{email:'owner@example.com',password:'correct horse battery'}),e=>e.status===401);
  // A repeated import (cutover) keeps schedules and reuses the copied file.
  const before=requests.length;assert.equal(downloads,1);const again=await runImport({mode:'cutover'});assert.equal(again.mode,'cutover');
  const [kept]=await db('posts',{query:{dedupe_key:'eq.d1'}});assert.equal(kept.status,'scheduled');assert.equal(kept.payload.image_urls[0],posts[0].payload.image_urls[0]);
  assert.equal((await db('automations',{}))[0].enabled,true);assert.equal(requests.length-before,9);assert.equal(downloads,1,'the copied file is not downloaded again');
  assert.equal((await importState()).status,'done');
  // The copied account signs in once against the source; the password is then stored locally and kept by later imports.
  await assert.rejects(()=>authRequest('token?grant_type=password',{email:'owner@example.com',password:'wrong'}),e=>e.status===401);
  assert.equal((await authRequest('token?grant_type=password',{email:'owner@example.com',password:'old password'})).user.id,sourceOwner);
  assert.match((await db('users',{query:{id:'eq.'+sourceOwner}}))[0].password_hash,/^scrypt\$/);
  await runImport({mode:'copy'});assert.match((await db('users',{query:{id:'eq.'+sourceOwner}}))[0].password_hash,/^scrypt\$/);
  assert.equal((await authRequest('token?grant_type=password',{email:'owner@example.com',password:'old password'})).user.id,sourceOwner);
 }finally{delete process.env.SOURCE_SUPABASE_URL;delete process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;}
});
