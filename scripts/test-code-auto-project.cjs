'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {workspaceForTab,projectUpdateFile,ownerFile}=require('../code-session-workspace');

test('blank Hexora VS Code tab discovers project chosen inside editor, without context menu',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hexora-auto-project-'));
 const modulePath=require.resolve('../integrations/vscode-session-bridge/extension.js');
 const oldLoad=Module._load;
 try {
  const projectA=path.join(dir,'Site A'),projectB=path.join(dir,'Site B');
  fs.mkdirSync(projectA);fs.mkdirSync(projectB);
  const descriptor=workspaceForTab(dir,42,null);
  assert.deepEqual(JSON.parse(fs.readFileSync(descriptor)).folders,[]);
  const events={};const disposables=[];
  const fake={
   workspace:{
    workspaceFile:{scheme:'file',fsPath:descriptor},
    workspaceFolders:[],
    onDidChangeWorkspaceFolders:cb=>{events.onFolders=cb;return{dispose(){}};},
    updateWorkspaceFolders(_start,_deleteCount,folder){
     this.workspaceFolders=[{uri:folder.uri}];
     events.onFolders({added:this.workspaceFolders,removed:[]});
     return true;
    },
    fs:{stat:uri=>fs.promises.stat(uri.fsPath)},
    openTextDocument:async()=>{throw Error('No editor should reopen in blank project');}
   },
   window:{
    activeTextEditor:null,
    onDidChangeActiveTextEditor:cb=>{events.onEditor=cb;return{dispose(){}};},
    onDidChangeTextEditorSelection:cb=>{events.onSelection=cb;return{dispose(){}};},
    createStatusBarItem:()=>({show(){},dispose(){},command:null,text:'',tooltip:''}),
    showOpenDialog:async()=>[{scheme:'file',fsPath:projectA}],
    showErrorMessage:message=>{throw Error(message);}
   },
   commands:{executeCommand:async(name,key,value)=>{events.context={name,key,value};},registerCommand:(name,cb)=>{events[name]=cb;return{dispose(){}};}},
   StatusBarAlignment:{Left:1},
   Uri:{file:p=>({scheme:'file',fsPath:p})},
   Selection:class {},
   TextEditorRevealType:{InCenterIfOutsideViewport:0}
  };
  Module._load=function(request,...args){return request==='vscode'?fake:oldLoad.call(this,request,...args);};
  delete require.cache[modulePath];
  const bridge=require(modulePath);
  await bridge.activate({subscriptions:disposables});
  assert.deepEqual(events.context,{name:'setContext',key:'hexoraSession.active',value:true});
  assert.ok(events['hexoraSession.openProject'],'Open Project command should be available inside VS Code');
  assert.equal(fs.existsSync(projectUpdateFile(dir,42)),false,'blank workspace is not assigned an invented folder');
  await events['hexoraSession.openProject']();
  const saved=JSON.parse(fs.readFileSync(projectUpdateFile(dir,42),'utf8'));
  assert.equal(saved.projectPath,projectA);
  assert.equal(saved.ownerToken,fs.readFileSync(ownerFile(dir,42),'utf8'));
  // File -> Add Folder to Workspace and other native folder events should also sync.
  fake.workspace.workspaceFolders=[{uri:{scheme:'file',fsPath:projectB}}];
  events.onFolders({added:fake.workspace.workspaceFolders,removed:[]});
  assert.equal(JSON.parse(fs.readFileSync(projectUpdateFile(dir,42),'utf8')).projectPath,projectB);
  // Stale detached windows must never overwrite the owner of a new session.
  fs.writeFileSync(ownerFile(dir,42),'different-owner');
  fake.workspace.workspaceFolders=[{uri:{scheme:'file',fsPath:projectA}}];
  events.onFolders({added:fake.workspace.workspaceFolders,removed:[]});
  assert.equal(JSON.parse(fs.readFileSync(projectUpdateFile(dir,42),'utf8')).projectPath,projectB);
  bridge.deactivate();
 }finally {
  Module._load=oldLoad;
  delete require.cache[modulePath];
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
