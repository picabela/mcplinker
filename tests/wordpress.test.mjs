import test,{mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {randomUUID} from 'node:crypto';
import {execute} from '../lib/actions.mjs';
import {catalog} from '../lib/mcp.mjs';
import {encrypt} from '../lib/security.mjs';
import {credentialAAD} from '../lib/providers.mjs';
import {wpPath,wordpressRequestUrl,wordpressError,wordpressDiscovery} from '../lib/wordpress-rest.mjs';

process.env.SUPABASE_URL='https://database.example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
process.env.ENCRYPTION_KEY='ab'.repeat(32);
const owner=randomUUID(),brand=randomUUID();
const target={id:randomUUID(),owner_id:owner,brand_id:brand,platform:'wordpress',base_url:'https://wordpress.example.com/blog'};
target.credentials=encrypt({username:'test-user',password:'test-password'},credentialAAD(target));
const ctx={ownerId:owner,actor:'api_keys:test',scopes:['admin'],brandIds:[brand]};
const calls=[];
let response={status:200,data:{slug:true,schemas:[]}};
mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);
syncBuiltinESMExports();
mock.method(https,'request',(url,options,callback)=>{
 const req=new EventEmitter();let body='';
 req.write=chunk=>{body+=chunk;};
 req.end=()=>{
  calls.push({url:new URL(url),options,body:body?JSON.parse(body):undefined});
  const res=new EventEmitter();res.statusCode=response.status;res.headers={'content-type':'application/json'};
  queueMicrotask(()=>{callback(res);res.emit('data',Buffer.from(response.raw??JSON.stringify(response.data)));res.emit('end');});
 };
 return req;
});
mock.method(globalThis,'fetch',async(url,options={})=>{
 const u=new URL(url);assert.equal(u.origin,'https://database.example.com');
 const table=u.pathname.split('/').pop();
 if(table==='connections')return new Response(JSON.stringify(u.searchParams.get('owner_id')==='eq.'+owner?[target]:[]));
 if(table==='audit_log')return new Response('[]');
 throw new Error('Unexpected database request');
});
after(()=>{mock.restoreAll();syncBuiltinESMExports();});

test('REST plugin routes, custom content types and template IDs remain in the configured installation',()=>{
 for(const path of ['rankmath/v1/updateMeta','/rankmath/v1/updateMeta','wp-json/rankmath/v1/updateMeta','wp/v2/books/3','wc/v3/products/2','wp/v2/global-styles/1','wp/v2/templates/theme//single']){
  const url=wordpressRequestUrl(target.base_url,path);
  assert.equal(url.origin,'https://wordpress.example.com');assert.ok(url.pathname.startsWith('/blog/wp-json/'));
 }
 assert.equal(wordpressRequestUrl(target.base_url,'/').pathname,'/blog/wp-json/');
 assert.equal(wpPath('/wp-json/rankmath/v1/updateMeta'),'rankmath/v1/updateMeta');
});

test('REST paths reject traversal, encoded separators, foreign hosts and overrides',()=>{
 for(const path of ['https://evil.example/a','//evil.example/a','/\\evil.example/a','wp/v2/posts/../users','wp/v2/./users','wp/v2/posts/%2e%2e/users','wp/v2/%252e%252e/users','wp/v2/posts?x=1','wp/v2/posts#x','wp/v2/posts//15','wp/v2/a%2fb','wp/v2/a\nb'])assert.throws(()=>wordpressRequestUrl(target.base_url,path),path);
 for(const key of ['rest_route','rest_route[]','_method'])assert.throws(()=>wordpressRequestUrl(target.base_url,'wp/v2/posts',{[key]:'/other'}));
 assert.equal(wordpressRequestUrl(target.base_url,'wp/v2/posts',{search:'żółć & #?'}).searchParams.get('search'),'żółć & #?');
});

test('Rank Math action sends native metadata through the real provider transport',async()=>{
 const result=await execute('wordpress_rankmath_update',{connection_id:target.id,object_id:23,focus_keyword:'ogród, działka',seo_title:'Własny tytuł SEO',meta_description:'Własny opis'},ctx);
 const call=calls.at(-1);
 assert.equal(call.url.href,'https://wordpress.example.com/blog/wp-json/rankmath/v1/updateMeta');
 assert.equal(call.options.method,'POST');
 assert.equal(call.options.headers.Authorization,'Basic '+Buffer.from('test-user:test-password').toString('base64'));
 assert.deepEqual(call.body,{objectID:23,objectType:'post',meta:{rank_math_focus_keyword:'ogród, działka',rank_math_title:'Własny tytuł SEO',rank_math_description:'Własny opis'}});
 assert.equal(result.accepted,true);assert.ok(!JSON.stringify(result).includes('test-password'));
});

test('Partial SEO updates preserve unspecified fields and allow explicit clearing',async()=>{
 await execute('wordpress_rankmath_update',{connection_id:target.id,object_id:24,object_type:'term',seo_title:''},ctx);
 assert.deepEqual(calls.at(-1).body,{objectID:24,objectType:'term',meta:{rank_math_title:''}});
 const before=calls.length;
 await assert.rejects(()=>execute('wordpress_rankmath_update',{connection_id:target.id,object_id:24},ctx),/przynajmniej jedno/);
 await assert.rejects(()=>execute('wordpress_rankmath_update',{connection_id:target.id,object_id:0,seo_title:'X'},ctx));
 assert.equal(calls.length,before);
});

test('Existing wordpress_request accepts plugin routes and OPTIONS without changing its result shape',async()=>{
 const args={connection_id:target.id,path:'/rankmath/v1/updateMeta',method:'POST',body:{objectID:2,objectType:'post',meta:{rank_math_title:'X'}}};
 assert.deepEqual(await execute('wordpress_request',args,ctx),{slug:true,schemas:[]});
 assert.equal(calls.at(-1).url.pathname,'/blog/wp-json/rankmath/v1/updateMeta');
 await execute('wordpress_request',{connection_id:target.id,path:'wp/v2/widgets',method:'OPTIONS'},ctx);
 assert.equal(calls.at(-1).options.method,'OPTIONS');
});

test('Admin scope, brand and ownership are checked before any WordPress request',async()=>{
 const before=calls.length;
 for(const action of ['wordpress_request','wordpress_rankmath_update','wordpress_discover']){
  const args=action==='wordpress_request'?{path:'/rankmath/v1/updateMeta'}:action==='wordpress_rankmath_update'?{object_id:23,seo_title:'X'}:{};
  for(const restricted of [{...ctx,scopes:['read','draft']},{...ctx,brandIds:[randomUUID()]},{...ctx,ownerId:randomUUID()}]){
   await assert.rejects(()=>execute(action,{connection_id:target.id,...args},restricted),e=>[403,404].includes(e.status));
  }
 }
 assert.equal(calls.length,before);
 const limited=catalog({scopes:['read','draft']}).map(x=>x.name);
 assert.ok(!limited.includes('wordpress_rankmath_update'));assert.ok(!limited.includes('wordpress_discover'));
 const discovery=catalog(ctx).find(x=>x.name==='wordpress_discover');assert.equal(discovery.annotations.readOnlyHint,true);
});

test('WordPress errors are actionable without echoing raw HTML, passwords or submitted values',async()=>{
 response={status:403,data:{code:'rest_cannot_edit',message:'secret test-password',data:{params:{objectID:'secret value'}}}};
 await assert.rejects(()=>execute('wordpress_request',{connection_id:target.id,path:'rankmath/v1/updateMeta',method:'POST'},ctx),e=>e.message.includes('rest_cannot_edit')&&e.message.includes('objectID')&&!e.message.includes('secret'));
 response={status:200,raw:'<html>Login required</html>'};
 await assert.rejects(()=>execute('wordpress_request',{connection_id:target.id,path:'rankmath/v1/updateMeta',method:'POST'},ctx),e=>e.code==='uncertain');
 response={status:200,data:{success:false}};
 await assert.rejects(()=>execute('wordpress_rankmath_update',{connection_id:target.id,object_id:23,seo_title:'X'},ctx),e=>e.code==='uncertain');
 response={status:200,data:{slug:true,schemas:[]}};
 assert.match(wordpressError(404,{code:'rest_no_route'}).message,/wordpress_discover/);
});

test('Discovery filters namespaces, paginates routes and includes schemas only when requested',async()=>{
 const index={namespaces:['wp/v2','rankmath/v1'],routes:{'/wp/v2/posts':{namespace:'wp/v2',methods:['GET','POST']},'/rankmath/v1/updateMeta':{namespace:'rankmath/v1',methods:['POST'],endpoints:[{args:{objectID:{required:true,type:'integer'}}}]},'/rankmath/v1/updateSchemas':{namespace:'rankmath/v1',methods:['POST']}}};
 response={status:200,data:index};
 const result=await execute('wordpress_discover',{connection_id:target.id,namespace:'rankmath/v1',limit:1,include_schema:true},ctx);
 assert.equal(calls.at(-1).url.pathname,'/blog/wp-json/');
 assert.equal(result.total,2);assert.equal(result.next_offset,1);assert.equal(result.routes[0].endpoints[0].args.objectID.required,true);
 assert.equal(wordpressDiscovery(index,{search:'updatemeta'}).routes[0].endpoints,undefined);
 assert.equal(wordpressDiscovery(index,{namespace:'missing/v1'}).total,0);
 response={status:200,data:{slug:true,schemas:[]}};
});
