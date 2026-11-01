'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {workspaceLink,tabLink,parseDeepLink}=require('../deep-links');
test('round trips workspace and tab IDs',()=>{
 assert.equal(workspaceLink('ideas'),'hexora://workspace/ideas');
 assert.equal(tabLink('wsabc-123',42),'hexora://workspace/wsabc-123/tab/42');
 assert.deepEqual(parseDeepLink(workspaceLink('web')),{workspace:'web',tabId:null});
 assert.deepEqual(parseDeepLink(tabLink('wsabc-123',42)),{workspace:'wsabc-123',tabId:42});
});
test('rejects malformed or nonlocal navigation links',()=>{
 for(const value of ['https://workspace/web','hexora://evil/web','hexora://workspace/','hexora://workspace/web/tab/0','hexora://workspace/web/tab/-5','hexora://workspace/web/tab/nope','hexora://workspace/web/tab/42/anything','hexora://workspace/web?x=1','hexora://workspace/web#x','hexora://workspace/a%2Fb','hexora://workspace/web/tab/9007199254740992','hexora://workspace/web:123','hexora://user@workspace/web']){
  assert.equal(parseDeepLink(value),null,value);
 }
});
test('rejects invalid IDs when generating links',()=>{
 assert.throws(()=>workspaceLink('../other'));
 assert.throws(()=>tabLink('web',0));
 assert.throws(()=>tabLink('web',Number.MAX_SAFE_INTEGER+1));
});
