import test,{mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {encrypt} from '../lib/security.mjs';
import {provider,publish,testConnection,removeRemote,credentialAAD} from '../lib/providers.mjs';
import {socialPublish,validateSocialPost,mastodonAccountId} from '../lib/social-platforms.mjs';
import {metaPages,providerAuthorizationUrl} from '../lib/provider-oauth.mjs';
process.env.ENCRYPTION_KEY='ab'.repeat(32);
const calls=[];let responses=[];
mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
mock.method(https,'request',(url,options,cb)=>{const req=new EventEmitter();let body='';req.write=b=>body+=b;req.end=()=>{calls.push({url:new URL(url),options,body:body?JSON.parse(body):null});const data=responses.shift();assert.ok(data,'unexpected request');const res=new EventEmitter();res.statusCode=data.status||200;res.headers={};queueMicrotask(()=>{cb(res);res.emit('data',Buffer.from(data.raw??JSON.stringify(data.data)));res.emit('end');});};return req;});
after(()=>{mock.restoreAll();syncBuiltinESMExports();});
function target(platform){const c={owner_id:'owner',brand_id:'brand',platform,external_id:platform==='telegram'?'-100123':'123',base_url:'https://mastodon.example.com'};c.credentials=encrypt({access_token:platform==='telegram'?'123:'+('x'.repeat(30)):'secret'},credentialAAD(c));return c;}
const reset=data=>{calls.length=0;responses=data.map(data=>({data}));};
const post={id:'post1',content:'Hello',payload:{}};
test('Telegram sends to fixed chat without paid broadcast and does not leak errors',async()=>{
 reset([{ok:true,result:{message_id:15,chat:{username:'channel'}}}]);const result=await publish(target('telegram'),{...post,payload:{image_urls:['https://images.example.com/a.jpg']}});
 assert.equal(result.external_url,'https://t.me/channel/15');assert.equal(calls[0].body.chat_id,'-100123');assert.equal(calls[0].body.allow_paid_broadcast,false);assert.equal(calls[0].url.hostname,'api.telegram.org');
 await assert.rejects(()=>provider(target('telegram'),'https://evil.example.com'));
 reset([{ok:false,description:'secret_token'}]);await assert.rejects(()=>provider(target('telegram'),'getMe'),e=>e.code==='provider_rejected'&&!e.message.includes('secret_token'));
});
test('Telegram validates bot permission and canonical chat id',async()=>{reset([{ok:true,result:{id:77}},{ok:true,result:{id:-100999,type:'channel',title:'Channel'}},{ok:true,result:{status:'administrator',can_post_messages:true}}]);assert.equal((await testConnection(target('telegram'))).id,'-100999');assert.equal(calls[2].body.chat_id,-100999);});
test('Instagram publishes once after processing and permalink failure does not undo publication',async()=>{reset([{id:'5'},{status_code:'FINISHED'},{id:'6'}]);responses.push({status:500,data:{error:'upstream'}});const result=await publish(target('instagram'),{...post,payload:{image_urls:['https://images.example.com/a.jpg']}});assert.equal(result.external_id,'6');assert.equal(result.external_url,null);assert.equal(calls.filter(c=>c.url.pathname.endsWith('/media_publish')).length,1);});
test('Instagram never sends publish while image is processing',async()=>{const paths=[];await assert.rejects(()=>socialPublish(target('instagram'),{...post,payload:{image_urls:['https://images.example.com/a.jpg']}},async(_c,path)=>{paths.push(path);return{data:path.endsWith('/media')?{id:'5'}:{status_code:'IN_PROGRESS'}};},async()=>{}),e=>e.code==='provider_rejected');assert.ok(!paths.some(p=>p.endsWith('/media_publish')));});
test('Mastodon binds host, deduplicates publication, checks ownership before deletion',async()=>{reset([{id:'15',url:'https://mastodon.example.com/@me/15'}]);await publish(target('mastodon'),post);assert.equal(calls[0].options.headers['Idempotency-Key'],'mcplinker-post1');assert.equal(calls[0].url.origin,'https://mastodon.example.com');reset([{account:{id:'999'}}]);await assert.rejects(()=>removeRemote(target('mastodon'),{external_id:'15'}),e=>e.status===403);assert.equal(calls.length,1);await assert.rejects(()=>provider(target('mastodon'),'https://evil.example.com'));});
test('preflight rejects unsupported attachments and lengths',()=>{assert.throws(()=>validateSocialPost(target('instagram'),post));assert.throws(()=>validateSocialPost(target('mastodon'),{...post,content:'x'.repeat(501)}));assert.throws(()=>validateSocialPost(target('telegram'),{...post,payload:{video_url:'https://images.example.com/a.mp4'}}));});
test('malformed successful transport response is uncertain',async()=>{responses=[{raw:'<html>broken</html>'}];await assert.rejects(()=>provider(target('mastodon'),'api/v1/statuses'),e=>e.code==='uncertain');});
test('Meta pagination stays on Graph host and Instagram uses existing configuration',async()=>{let n=0;const pages=await metaPages({Authorization:'Bearer secret'},true,async url=>{const u=new URL(url);assert.equal(u.hostname,'graph.facebook.com');assert.ok(u.searchParams.get('fields').includes('instagram_business_account'));return n++?{data:[{id:'2'}]}:{data:[{id:'1'}],paging:{next:'https://evil.example.com',cursors:{after:'cursor'}}};});assert.equal(pages.length,2);const url=providerAuthorizationUrl('instagram',{client_id:'1',config_id:'22',scopes:[]},'https://app.example.com/callback','state');assert.equal(url.searchParams.get('config_id'),'22');assert.equal(url.hostname,'www.facebook.com');});

test('Mastodon identities include their server and cannot cross instances',()=>{assert.equal(mastodonAccountId({...target('mastodon'),external_id:'https://mastodon.example.com/accounts/123'}),'123');assert.throws(()=>mastodonAccountId({...target('mastodon'),external_id:'https://other.example.com/accounts/123'}));});
