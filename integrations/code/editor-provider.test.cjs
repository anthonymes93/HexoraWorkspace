'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EditorSession,STATES,CAPABILITIES}=require('./editor-provider');
test('provider lifecycle and capability dispatch',async()=>{
 let stopped=false,folder='';
 const session=new EditorSession({id:'test',capabilities:[CAPABILITIES.OPEN_FOLDER],start:async()=>{},stop:async()=>{stopped=true;},openFolder:async value=>{folder=value;}});
 await session.start();assert.equal(session.state,STATES.READY);
 await session.invoke(CAPABILITIES.OPEN_FOLDER,'C:/Projects');assert.equal(folder,'C:/Projects');
 await assert.rejects(()=>session.invoke(CAPABILITIES.EMBEDDED),/Unsupported capability/);
 await session.stop();assert.equal(session.state,STATES.IDLE);assert.equal(stopped,true);
});
test('start failure is explicit',async()=>{
 const session=new EditorSession({id:'broken',capabilities:[],start:async()=>{throw Error('failed');},stop:async()=>{}});
 await assert.rejects(()=>session.start(),/failed/);assert.equal(session.state,STATES.ERROR);
});
test('invalid provider is rejected',()=>assert.throws(()=>new EditorSession({id:'x',capabilities:[]}),/start/));
