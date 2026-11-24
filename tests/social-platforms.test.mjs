import test,{mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {encrypt} from '../lib/security.mjs';
import {provider,publish,testConnection,removeRemote,credentialAAD} from '../lib/providers.mjs';
import {socialPublish,validateSocialPost,mastodonAccountId,reelTiming} from '../lib/social-platforms.mjs';
import {deliver} from '../lib/actions.mjs';
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

const reel={...post,payload:{video_url:'https://videos.example.com/r.mp4'}};
const fakeGraph=replies=>{const seen=[];return{seen,req:async(_c,path,options={})=>{seen.push({path,options});const next=replies.shift();assert.ok(next,'unexpected Graph call '+path);return{data:next};}};};
test('Instagram reels: a processing video returns pending, the next run publishes the same container',async()=>{
 reelTiming.pollMs=0;const first=fakeGraph([{id:'55'},...Array(reelTiming.polls).fill({status_code:'IN_PROGRESS'})]);
 assert.deepEqual(await socialPublish(target('instagram'),reel,first.req),{pending:'ig-container:55'});
 assert.equal(first.seen[0].path,'123/media');assert.deepEqual(first.seen[0].options.body,{media_type:'REELS',video_url:'https://videos.example.com/r.mp4',caption:'Hello',share_to_feed:true});assert.ok(!first.seen.some(x=>x.path.endsWith('media_publish')));
 const next=fakeGraph([{status_code:'FINISHED'},{id:'77'},{permalink:'https://www.instagram.com/reel/x/'}]);
 assert.deepEqual(await socialPublish(target('instagram'),{...reel,external_id:'ig-container:55'},next.req),{external_id:'77',external_url:'https://www.instagram.com/reel/x/'});
 assert.equal(next.seen[0].path,'55');assert.deepEqual(next.seen[1].options.body,{creation_id:'55'});
});
test('Instagram reels: processing errors fail, an expired container is recreated, checks are bounded',async()=>{
 reelTiming.pollMs=0;
 await assert.rejects(()=>socialPublish(target('instagram'),reel,fakeGraph([{id:'55'},{status_code:'ERROR'}]).req),e=>e.code==='provider_rejected');
 const expired=fakeGraph([{status_code:'EXPIRED'},{id:'56'},{status_code:'FINISHED'},{id:'78'},{}]);
 assert.equal((await socialPublish(target('instagram'),{...reel,external_id:'ig-container:55'},expired.req)).external_id,'78');assert.equal(expired.seen[1].path,'123/media');
 await assert.rejects(()=>socialPublish(target('instagram'),{...reel,attempts:reelTiming.maxChecks,external_id:'ig-container:55'},fakeGraph(Array(reelTiming.polls).fill({status_code:'IN_PROGRESS'})).req),e=>e.code==='provider_rejected');
 assert.doesNotThrow(()=>validateSocialPost(target('instagram'),reel));
 assert.throws(()=>validateSocialPost(target('instagram'),{...reel,payload:{...reel.payload,image_urls:['https://images.example.com/a.jpg']}}));
});
test('the scheduler requeues a processing reel for the next minute, then publishes it',async()=>{
 reelTiming.pollMs=0;process.env.SUPABASE_URL='https://database.example.com';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
 const c={...target('instagram'),id:'conn1'},row={id:'reel1',owner_id:'owner',brand_id:'brand',connection_id:'conn1',content:'Rolka',payload:{video_url:'https://videos.example.com/r.mp4'},status:'processing',lock_token:'lock1',attempts:1,approved_at:'2026-01-01T00:00:00Z'},patches=[];
 mock.method(globalThis,'fetch',async(raw,opts={})=>{const u=new URL(raw),table=u.pathname.split('/').pop();if(table==='connections')return Response.json([c]);if(table==='brands')return Response.json([{id:'brand',owner_id:'owner',publish_policy:'automatic'}]);if(table==='audit_log')return Response.json([]);
  if(table==='posts'&&opts.method==='PATCH'){assert.equal(u.searchParams.get('lock_token'),'eq.'+row.lock_token);const body=JSON.parse(opts.body);patches.push(body);Object.assign(row,body);return Response.json([row]);}throw Error('Unexpected '+u.href);});
 const ctx={ownerId:'owner',scopes:['publish'],brandIds:['brand'],actor:'scheduler'};
 reset([{id:'55'},...Array(reelTiming.polls).fill({status_code:'IN_PROGRESS'})]);
 const queued=await deliver(ctx,{...row});assert.equal(queued.status,'scheduled');assert.equal(queued.external_id,'ig-container:55');assert.match(queued.note,/przetwarza film/);assert.ok(Date.parse(queued.scheduled_at)>Date.now()+30000);assert.equal(queued.lock_token,null);
 Object.assign(row,{status:'processing',lock_token:'lock2',attempts:2});reset([{status_code:'FINISHED'},{id:'77'},{permalink:'https://www.instagram.com/reel/x/'}]);
 const done=await deliver(ctx,{...row});assert.equal(done.status,'published');assert.equal(done.external_id,'77');assert.equal(calls[0].url.pathname,'/v25.0/55');assert.equal(calls.filter(x=>x.url.pathname.endsWith('/media')).length,0);
});

test('Instagram carousel: item containers first, then one CAROUSEL parent with the caption',async()=>{
 const g=fakeGraph([{id:'11'},{status_code:'FINISHED'},{id:'12'},{status_code:'FINISHED'},{id:'20'},{status_code:'FINISHED'},{id:'30'},{permalink:'https://www.instagram.com/p/c/'}]);
 const r=await socialPublish(target('instagram'),{...post,payload:{image_urls:['https://images.example.com/1.jpg','https://images.example.com/2.jpg']}},g.req,async()=>{});
 assert.deepEqual(r,{external_id:'30',external_url:'https://www.instagram.com/p/c/'});
 assert.deepEqual(g.seen[0].options.body,{image_url:'https://images.example.com/1.jpg',is_carousel_item:true});assert.deepEqual(g.seen[2].options.body,{image_url:'https://images.example.com/2.jpg',is_carousel_item:true});
 assert.deepEqual(g.seen[4].options.body,{media_type:'CAROUSEL',children:'11,12',caption:'Hello'});assert.deepEqual(g.seen[6].options.body,{creation_id:'20'});
});
test('Instagram stories: image and video stories carry no caption; reels can carry a cover',async()=>{
 reelTiming.pollMs=0;
 const image=fakeGraph([{id:'40'},{status_code:'FINISHED'},{id:'41'},{}]);await socialPublish(target('instagram'),{...post,payload:{story:true,image_urls:['https://images.example.com/s.jpg']}},image.req,async()=>{});
 assert.deepEqual(image.seen[0].options.body,{media_type:'STORIES',image_url:'https://images.example.com/s.jpg'});
 const video=fakeGraph([{id:'42'},...Array(reelTiming.polls).fill({status_code:'IN_PROGRESS'})]);assert.deepEqual(await socialPublish(target('instagram'),{...post,payload:{story:true,video_url:'https://videos.example.com/s.mp4'}},video.req),{pending:'ig-container:42'});
 assert.deepEqual(video.seen[0].options.body,{media_type:'STORIES',video_url:'https://videos.example.com/s.mp4'});
 const cover=fakeGraph([{id:'43'},{status_code:'FINISHED'},{id:'44'},{}]);await socialPublish(target('instagram'),{...reel,payload:{...reel.payload,cover_url:'https://images.example.com/c.jpg',thumb_offset:1500}},cover.req);
 assert.equal(cover.seen[0].options.body.cover_url,'https://images.example.com/c.jpg');assert.equal(cover.seen[0].options.body.thumb_offset,1500);assert.equal(cover.seen[0].options.body.media_type,'REELS');
});
test('Instagram preflight: story takes one medium and no cover; covers only on reels',()=>{
 const ig=target('instagram'),img='https://images.example.com/a.jpg';
 assert.throws(()=>validateSocialPost(ig,{...post,payload:{story:true,image_urls:[img,img]}}));
 assert.throws(()=>validateSocialPost(ig,{...post,payload:{story:true,video_url:'https://videos.example.com/s.mp4',thumb_offset:0}}));
 assert.throws(()=>validateSocialPost(ig,{...post,payload:{image_urls:[img],cover_url:img}}));
 assert.throws(()=>validateSocialPost(ig,{...post,payload:{image_urls:[img],video_url:'https://videos.example.com/s.mp4'}}));
 assert.doesNotThrow(()=>validateSocialPost(ig,{...post,payload:{image_urls:Array(10).fill(img)}}));
 assert.doesNotThrow(()=>validateSocialPost(ig,{...post,content:'x'.repeat(3000),payload:{story:true,image_urls:[img]}}));
});
