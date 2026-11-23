import test,{mock,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';import dns from 'node:dns/promises';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
import sharp from 'sharp';
import {instagramJpeg} from '../lib/instagram-media.mjs';
import {storeImage,isHosted} from '../lib/media-storage.mjs';
import {metaError} from '../lib/meta-errors.mjs';
import {execute} from '../lib/actions.mjs';
process.env.SUPABASE_URL='https://database.example.com';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';
const image=(width,height,format='png')=>sharp({create:{width,height,channels:3,background:'#336699'}})[format]().toBuffer();
const size=async bytes=>{const m=await sharp(bytes).metadata();return{format:m.format,ratio:m.width/m.height};};

const owner=randomUUID(),brand=randomUUID(),ig={id:randomUUID(),owner_id:owner,brand_id:brand,platform:'instagram',external_id:'17841'};
const ctx={ownerId:owner,actor:'oauth_grants:agent',brandIds:[brand],scopes:['draft']};
let posts,stored,bucketExists,downloads,source;
beforeEach(()=>{posts=[];stored=[];bucketExists=true;downloads=[];});
mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
mock.method(https,'request',(url,options,cb)=>{const req=new EventEmitter();req.write=()=>{};req.end=()=>{downloads.push(new URL(url).href);const res=new EventEmitter();res.statusCode=200;res.headers={};queueMicrotask(()=>{cb(res);res.emit('data',source);res.emit('end');});};return req;});
mock.method(globalThis,'fetch',async(raw,opts={})=>{const u=new URL(raw);
 if(u.pathname.startsWith('/storage/v1/')){assert.equal(new Headers(opts.headers).get('apikey'),'sb_secret_test');
  if(u.pathname==='/storage/v1/bucket'){bucketExists=true;return Response.json({name:'mcplinker-media'});}
  if(!bucketExists)return Response.json({statusCode:'404',error:'Bucket not found',message:'Bucket not found'},{status:400});
  stored.push({path:u.pathname,type:new Headers(opts.headers).get('content-type'),body:Buffer.from(opts.body)});return Response.json({Key:u.pathname});}
 const table=u.pathname.split('/').pop();
 if(table==='brands')return Response.json([{id:brand,owner_id:owner}]);if(table==='connections')return Response.json([ig]);if(table==='audit_log')return Response.json([]);
 if(table==='posts'){if(opts.method==='POST'){const row={id:randomUUID(),status:'draft',approved_at:null,updated_at:'2026-11-01T00:00:00.000Z',...JSON.parse(opts.body)};posts.push(row);return Response.json([row]);}
  const id=u.searchParams.get('id')?.slice(3),key=u.searchParams.get('dedupe_key')?.slice(3),rows=posts.filter(p=>(!id||p.id===id)&&(!key||p.dedupe_key===key));
  if(opts.method==='PATCH'){rows.forEach(p=>Object.assign(p,JSON.parse(opts.body)));}return Response.json(rows);}
 throw Error('Unexpected request '+u.href);});
after(()=>{mock.restoreAll();syncBuiltinESMExports();});

test('Instagram images become JPEG within 4:5–1.91:1 without cropping; fitting JPEGs stay untouched',async()=>{
 const tall=await instagramJpeg(await image(600,900));assert.equal(tall.adjusted,true);const t=await size(tall.bytes);assert.equal(t.format,'jpeg');assert.ok(t.ratio>=0.8&&t.ratio<0.81);
 const wide=await instagramJpeg(await image(1200,400));assert.ok((await size(wide.bytes)).ratio<=1.91&&(await size(wide.bytes)).ratio>1.9);
 const square=await image(800,800,'jpeg');const kept=await instagramJpeg(square);assert.equal(kept.bytes,square);assert.equal(kept.adjusted,false);
 const png=await instagramJpeg(await image(800,1000));assert.equal((await size(png.bytes)).format,'jpeg');assert.equal(png.adjusted,false);
 await assert.rejects(()=>instagramJpeg(Buffer.from('<html>not an image</html>')),e=>e.status===400);
});
test('storage creates the public bucket on first use and returns a permanent address',async()=>{
 bucketExists=false;const url=await storeImage(Buffer.from('jpeg-bytes'),'image/jpeg','jpg');
 assert.match(url,/^https:\/\/database\.example\.com\/storage\/v1\/object\/public\/mcplinker-media\/\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/);assert.ok(isHosted(url));assert.equal(stored.length,1);assert.equal(stored[0].type,'image/jpeg');
 assert.equal(isHosted('https://sdmntprpolandcentral.oaiusercontent.com/files/x/raw?se=2026'),false);
});
test('instagram_upload_image stores the conversation file and sets it on the draft, resetting approval',async()=>{
 source=await image(600,900);const p={id:randomUUID(),owner_id:owner,brand_id:brand,connection_id:ig.id,content:'Opis',payload:{image_urls:['https://expired.example.com/a.jpg']},status:'failed',approved_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00.000Z',scheduled_at:'2026-11-24T18:00:00Z'};posts.push(p);
 const r=await execute('instagram_upload_image',{connection_id:ig.id,post_id:p.id,image:{download_url:'https://files.example.com/file-1?se=soon',file_id:'file-1'}},ctx);
 assert.equal(downloads[0],'https://files.example.com/file-1?se=soon');assert.ok(isHosted(r.image_url));assert.equal(r.adjusted,true);
 assert.deepEqual(r.post.payload.image_urls,[r.image_url]);assert.equal(r.post.status,'draft');assert.equal(r.post.approved_at,null);assert.equal((await size(stored[0].body)).format,'jpeg');
 await assert.rejects(()=>execute('instagram_upload_image',{connection_id:ig.id},ctx),e=>/w polu image/.test(e.message));
});
test('a conversation link in an Instagram draft is copied at once, and a retried request is not a conflict',async()=>{
 source=await image(1000,1000,'jpeg');const args={brand_id:brand,connection_id:ig.id,content:'Opis',payload:{image_urls:['https://sdmntprpolandcentral.oaiusercontent.com/files/x/raw?se=2026-11-23T22:06:17Z&sig=abc']},dedupe_key:'ig-retry'};
 const first=await execute('post_create',args,ctx);assert.ok(isHosted(first.payload.image_urls[0]));assert.equal(downloads.length,1);
 const again=await execute('post_create',args,ctx);assert.equal(again.id,first.id);assert.equal(downloads.length,1);
 const kept=await execute('post_update',{id:first.id,expected_updated_at:first.updated_at,title:'',content:'Nowy opis',payload:first.payload},ctx);assert.deepEqual(kept.payload.image_urls,first.payload.image_urls);assert.equal(downloads.length,1);
});
test('Instagram download failures explain the expired link instead of a generic Meta message',()=>{
 assert.match(metaError(400,{error:{code:9004,error_subcode:2207052}}).message,/nie mógł pobrać zdjęcia/);
 assert.match(metaError(400,{error:{code:36003,error_subcode:2207009}}).message,/proporcje/);
});

const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom','latin1'),Buffer.alloc(64,1)]);
test('instagram_upload_video stores the conversation video and replaces the draft photo with it',async()=>{
 source=mp4;const p={id:randomUUID(),owner_id:owner,brand_id:brand,connection_id:ig.id,content:'Rolka',payload:{image_urls:['https://example.com/a.jpg'],alt_text:'x'},status:'draft',approved_at:null,updated_at:'2026-11-01T00:00:00.000Z',external_id:'ig-container:9'};posts.push(p);
 const r=await execute('instagram_upload_video',{connection_id:ig.id,post_id:p.id,video:{download_url:'https://files.example.com/video-1?se=soon',file_id:'video-1'}},ctx);
 assert.match(r.video_url,/\/object\/public\/mcplinker-video\/\d{4}-\d{2}\/[0-9a-f-]{36}\.mp4$/);assert.ok(isHosted(r.video_url));assert.equal(stored[0].type,'video/mp4');assert.match(stored[0].path,/\/object\/mcplinker-video\//);
 assert.deepEqual(r.post.payload,{alt_text:'x',video_url:r.video_url});assert.equal(r.post.external_id,null);
 source=Buffer.from('not a video at all, just text');await assert.rejects(()=>execute('instagram_upload_video',{connection_id:ig.id,url:'https://files.example.com/x.mp4'},ctx),e=>/MP4 albo MOV/.test(e.message));
 await assert.rejects(()=>execute('instagram_upload_video',{connection_id:ig.id},ctx),e=>/w polu video/.test(e.message));
});
test('a video link in an Instagram draft is copied at once like photos',async()=>{
 source=mp4;const r=await execute('post_create',{brand_id:brand,connection_id:ig.id,content:'Rolka',payload:{video_url:'https://sdmntprdenmarkeast.oaiusercontent.com/files/v/raw?se=2026&sig=x'},dedupe_key:'reel-copy'},ctx);
 assert.ok(isHosted(r.payload.video_url));assert.equal(downloads.length,1);
});
