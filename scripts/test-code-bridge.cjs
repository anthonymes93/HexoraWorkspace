'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {workspaceForTab,sessionFile}=require('../code-session-workspace');

test('companion persists active file/caret and restores them on next activation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hexora-bridge-runtime-'));
 const modulePath=require.resolve('../integrations/vscode-session-bridge/extension.js');
 const originalLoad=Module._load;
 try{
  const root=path.join(dir,'My Project');fs.mkdirSync(root);
  const file=path.join(root,'index.js');fs.writeFileSync(file,Array.from({length:12},(_,i)=>'line '+i).join('\n'));
  const workspaceFile=workspaceForTab(dir,21,root);
  const events={};
  let caret={line:6,character:3},openCount=0;
  const editor={
   document:{uri:{scheme:'file',fsPath:file},lineCount:12,lineAt:line=>({text:'line '+line})},
   selection:{active:caret},
   revealRange(range){this.lastRange=range;}
  };
  const fake={
   workspace:{
    workspaceFile:{scheme:'file',fsPath:workspaceFile},
    workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],
    onDidChangeWorkspaceFolders:cb=>{events.folders=cb;return{dispose(){}};},
    fs:{stat:async uri=>fs.promises.stat(uri.fsPath)},
    openTextDocument:async uri=>{assert.equal(uri.fsPath,file);return editor.document;}
   },
   window:{
    activeTextEditor:editor,
    createStatusBarItem:()=>({show(){},dispose(){},text:'',tooltip:'',command:''}),
    onDidChangeActiveTextEditor:cb=>{events.active=cb;return{dispose(){}};},
    onDidChangeTextEditorSelection:cb=>{events.selection=cb;return{dispose(){}};},
    showTextDocument:async(_document,_opts)=>{openCount++;return editor;}
   },
   commands:{registerCommand:(_name,cb)=>{events.chooseProject=cb;return{dispose(){}};}},
   StatusBarAlignment:{Left:1},
   Uri:{file:p=>({scheme:'file',fsPath:p})},
   Selection:class{constructor(line,character){this.active={line,character};this.anchor={line,character};}},
   TextEditorRevealType:{InCenterIfOutsideViewport:2}
  };
  Module._load=function(request,parent,isMain){if(request==='vscode')return fake;return originalLoad.apply(this,arguments);};
  delete require.cache[modulePath];
  let bridge=require(modulePath);
  await bridge.activate({subscriptions:[]});
  events.selection({textEditor:editor});
  await new Promise(resolve=>setTimeout(resolve,210));
  bridge.deactivate();
  const last=JSON.parse(fs.readFileSync(sessionFile(dir,21),'utf8'));
  assert.equal(last.path,file);
  assert.equal(last.line,6);
  assert.equal(last.character,3);
  assert.equal(last.workspaceRoot,root);

  delete require.cache[modulePath];
  bridge=require(modulePath);
  editor.selection.active={line:0,character:0};
  await bridge.activate({subscriptions:[]});
  assert.equal(openCount,1);
  assert.deepEqual(editor.selection.active,{line:6,character:3});
  bridge.deactivate();
 }finally{
  Module._load=originalLoad;
  delete require.cache[modulePath];
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
