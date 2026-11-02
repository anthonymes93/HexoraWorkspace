'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {TabStore}=require('../tab-store');

test('VS Code project folders are isolated by tab ID and survive reopening the database',()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hexora-code-projects-'));
 let store;
 try{
  store=new TabStore(dataDir);
  for(const id of [10,11,12])store.save({id,url:'hexora-native://vscode/'+id,title:'Visual Studio Code',workspace:'web',lastActive:Date.now(),ordinal:id});
  const first=path.resolve(dataDir,'Benals');
  const second=path.resolve(dataDir,'Evropa');
  assert.equal(store.getCodeProject(10),null);
  store.setCodeProject(10,first);
  store.setCodeProject(11,second);
  assert.equal(store.getCodeProject(10).project_path,first);
  assert.equal(store.getCodeProject(11).project_path,second);
  assert.equal(store.getCodeProject(12),null);
  store.close();store=null;

  store=new TabStore(dataDir);
  assert.equal(store.getCodeProject(10).project_path,first);
  assert.equal(store.getCodeProject(11).project_path,second);
  store.setCodeProject(10,second);
  assert.equal(store.getCodeProject(10).project_path,second);
  assert.equal(store.getCodeProject(11).project_path,second);

  store.delete(10);
  assert.equal(store.getCodeProject(10),null,'closing a tab removes its saved project');
  store.clearCodeProject(11);
  assert.equal(store.getCodeProject(11),null);
  assert.equal(store.get(11).id,11,'clearing a project does not close its tab');
  assert.throws(()=>store.setCodeProject(11,'relative/project'),/absolute/);
  assert.throws(()=>store.setCodeProject(999,second),/not found/);
 }finally{
  store?.close();
  fs.rmSync(dataDir,{recursive:true,force:true});
 }
});
