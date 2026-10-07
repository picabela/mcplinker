import test,{mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';import dns from 'node:dns/promises';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
import {automation} from '../lib/worker.mjs';
process.env.SUPABASE_URL='https://database.example.com';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
const owner=randomUUID(),brand=randomUUID(),connection=randomUUID(),posts=[];
const feed='<rss><item><guid>1</guid><title>Insecure</title><link>http://blog.example.com/old</link></item><item><guid>2</guid><title>Fresh</title><link>https://blog.example.com/new</link></item></rss>';
mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
mock.method(https,'request',(url,options,cb)=>{const req=new EventEmitter();req.write=()=>{};req.end=()=>{const res=new EventEmitter();res.statusCode=200;res.headers={};queueMicrotask(()=>{cb(res);res.emit('data',Buffer.from(feed));res.emit('end');});};return req;});
mock.method(globalThis,'fetch',async(raw,opts={})=>{const table=new URL(raw).pathname.split('/').pop();if(table==='brands')return Response.json([{id:brand,owner_id:owner}]);if(table==='connections')return Response.json([{id:connection,owner_id:owner,brand_id:brand,platform:'telegram'}]);if(table==='audit_log')return Response.json([]);if(table==='posts'){if(opts.method==='POST'){const row={id:randomUUID(),...JSON.parse(opts.body)};posts.push(row);return Response.json([row]);}return Response.json([]);}throw Error('Unexpected table '+table);});
after(()=>{mock.restoreAll();syncBuiltinESMExports();});
test('one insecure feed link is skipped instead of stopping the whole rule',async()=>{
 const result=await automation({id:randomUUID(),owner_id:owner,brand_id:brand,kind:'rss_to_draft',config:{source_url:'https://blog.example.com/feed',targets:[connection],template:'{title}\n\n{link}'}});
 assert.equal(result.created,1);assert.equal(posts.length,1);assert.match(posts[0].content,/https:\/\/blog.example.com\/new/);
});
