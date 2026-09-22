import test from 'node:test';
import assert from 'node:assert/strict';
import {metaError} from '../lib/meta-errors.mjs';
test('Meta errors expose safe actionable codes, not upstream secrets',()=>{
 const e=metaError(400,{error:{code:190,error_subcode:463,message:'secret-token private content'}});assert.match(e.message,/wygasł/);assert.match(e.message,/190; podkod 463/);assert.ok(!e.message.includes('secret'));assert.equal(e.code,'provider_rejected');
 assert.match(metaError(400,{error:{code:200}}).message,/uprawnień/);
 assert.match(metaError(400,{error:{code:190,message:'Application has been disabled secret'}}).message,/wyłączyła aplikację/);
 assert.equal(metaError(503,{}).code,'uncertain');assert.equal(metaError(400,{error:{is_transient:true}}).code,'uncertain');
 assert.ok(!metaError(400,{error:{code:'unsafe',error_subcode:'secret'}}).message.includes('secret'));
});
