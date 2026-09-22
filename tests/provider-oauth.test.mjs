import test from 'node:test';
import assert from 'node:assert/strict';
import {providerAuthorizationUrl} from '../lib/provider-oauth.mjs';

test('Facebook Login for Business uses configuration ID instead of a free-form scope list',()=>{
 const url=providerAuthorizationUrl('facebook',{client_id:'123',config_id:'1657429045959713',scopes:['pages_manage_posts']},'https://app.example.com/api/connect/facebook/callback','state-value');
 assert.equal(url.searchParams.get('config_id'),'1657429045959713');
 assert.equal(url.searchParams.get('scope'),null);
 assert.equal(url.searchParams.get('redirect_uri'),'https://app.example.com/api/connect/facebook/callback');
});

test('LinkedIn OAuth keeps its space-delimited scope list',()=>{
 const url=providerAuthorizationUrl('linkedin',{client_id:'123',scopes:['openid','profile','w_member_social']},'https://app.example.com/api/connect/linkedin/callback','state-value');
 assert.equal(url.searchParams.get('scope'),'openid profile w_member_social');
 assert.equal(url.searchParams.get('config_id'),null);
});

test('Business configuration uses minimal login parameters',()=>{const url=providerAuthorizationUrl('facebook',{client_id:'1',config_id:'22',scopes:[]},'https://app.example.com/callback','state');assert.equal(url.searchParams.has('auth_type'),false);assert.equal(url.searchParams.get('config_id'),'22');});
