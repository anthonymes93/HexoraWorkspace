'use strict';
// Runs only in a .code-workspace file created by Hexora for a native Code tab.
// It never touches project files, passwords, or clipboard contents.
const vscode=require('vscode');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

let timer=null;
let snapshotPath=null;
let ownerFile=null;
let ownerToken=null;
let restoring=false;
let userChangedDuringRestore=false;
let savedEditor=null;
const disposables=[];

function getSessionFile(){
 const workspace=vscode.workspace.workspaceFile;
 if(!workspace||workspace.scheme!=='file')return null;
 const file=workspace.fsPath;
 const match=/^tab-([1-9]\d*)\.code-workspace$/.exec(path.basename(file));
 if(!match||path.basename(path.dirname(file))!=='hexora-native-code')return null;
 const dir=path.dirname(file);
 if(!fs.existsSync(path.join(dir,'.hexora-session-marker')))return null;
 return path.join(dir,'tab-'+match[1]+'.editor.json');
}
function readSaved(file){
 try{
  const item=JSON.parse(fs.readFileSync(file,'utf8'));
  if(item?.version!==1||typeof item.path!=='string'||!path.isAbsolute(item.path)||item.path.length>32767)return null;
  if(!Number.isSafeInteger(item.line)||!Number.isSafeInteger(item.character)||item.line<0||item.character<0)return null;
  return item;
 }catch{return null;}
}
function getEditorState(editor){
 if(!editor||editor.document.uri.scheme!=='file')return null;
 const position=editor.selection.active;
 return {version:1,path:editor.document.uri.fsPath,workspaceRoot:vscode.workspace.workspaceFolders?.[0]?.uri.fsPath||'',line:position.line,character:position.character,updatedAt:Date.now()};
}
function ownsSession(){
 if(!ownerFile||!ownerToken)return false;
 try{return fs.readFileSync(ownerFile,'utf8')===ownerToken;}catch{return false;}
}
function commitSnapshot(){
 timer=null;
 if(!snapshotPath||restoring||!ownsSession())return;
 const state=getEditorState(vscode.window.activeTextEditor);
 if(!state)return; // Keep last real editor when terminal, Settings, or Welcome is active.
 const tmp=snapshotPath+'.tmp-'+process.pid;
 try{
  fs.writeFileSync(tmp,JSON.stringify(state),'utf8');
  fs.renameSync(tmp,snapshotPath);
 }catch(error){
  try{fs.rmSync(tmp,{force:true});}catch{}
  console.warn('[Hexora Session Bridge] Could not write editor state:',error.message);
 }
}
function queueSnapshot(){
 if(restoring){userChangedDuringRestore=true;return;}
 clearTimeout(timer);
 timer=setTimeout(commitSnapshot,130);
}
async function restoreEditor(){
 const state=savedEditor;
 if(!state)return;
 const currentRoot=vscode.workspace.workspaceFolders?.[0]?.uri.fsPath||'';
 if(!currentRoot||!state.workspaceRoot||path.normalize(currentRoot).toLowerCase()!==path.normalize(state.workspaceRoot).toLowerCase())return;
 try{
  const uri=vscode.Uri.file(state.path);
  await vscode.workspace.fs.stat(uri);
  if(userChangedDuringRestore)return;
  const document=await vscode.workspace.openTextDocument(uri);
  if(userChangedDuringRestore)return;
  const editor=await vscode.window.showTextDocument(document,{preview:false,preserveFocus:false});
  const lastLine=Math.max(0,document.lineCount-1);
  const line=Math.min(state.line,lastLine);
  const character=Math.min(state.character,document.lineAt(line).text.length);
  const selection=new vscode.Selection(line,character,line,character);
  editor.selection=selection;
  editor.revealRange(selection,vscode.TextEditorRevealType.InCenterIfOutsideViewport);
 }catch(error){
  console.warn('[Hexora Session Bridge] Last editor could not be restored:',error.message);
 }
}
async function activate(context){
 snapshotPath=getSessionFile();
 if(!snapshotPath)return;
 savedEditor=readSaved(snapshotPath);
 // A previously detached VS Code process can still be alive after Hexora
 // restarts. Only the most recently activated native session may write state.
 ownerFile=snapshotPath.replace(/\.editor\.json$/,'.owner');
 ownerToken=randomUUID();
 fs.writeFileSync(ownerFile,ownerToken,'utf8');
 restoring=true;
 // Save any manual interactions before an automatic restore: don't steal focus
 // from someone who already selected a different file during startup.
 const onEditor=vscode.window.onDidChangeActiveTextEditor(()=>{
  if(restoring){userChangedDuringRestore=true;return;}
  queueSnapshot();
 });
 const onSelection=vscode.window.onDidChangeTextEditorSelection(event=>{
  if(event.textEditor!==vscode.window.activeTextEditor)return;
  if(restoring)return;
  queueSnapshot();
 });
 context.subscriptions.push(onEditor,onSelection);
 try{
  if(savedEditor)await restoreEditor();
 }finally{
  restoring=false;
  queueSnapshot();
 }
}
function deactivate(){
 clearTimeout(timer);
 // Persist synchronously if VS Code unloads while the debounce is pending.
 commitSnapshot();
}
module.exports={activate,deactivate};
