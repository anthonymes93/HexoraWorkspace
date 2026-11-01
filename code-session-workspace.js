'use strict';
const fs=require('node:fs');
const path=require('node:path');

function codeSessionDirectory(userData){return path.join(userData,'hexora-native-code');}
function sessionFile(userData,tabId){return path.join(codeSessionDirectory(userData),'tab-'+validTabId(tabId)+'.editor.json');}
function validTabId(id){
 if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid VS Code tab ID');
 return id;
}
function workspaceForTab(userData,tabId,projectFolder){
 validTabId(tabId);
 if(typeof projectFolder!=='string'||!path.isAbsolute(projectFolder)||!fs.statSync(projectFolder).isDirectory()){
  throw new Error('The saved VS Code project folder is unavailable.');
 }
 const dir=codeSessionDirectory(userData);
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'.hexora-session-marker'),'Hexora native VS Code sessions v1\n','utf8');
 const workspace=path.join(dir,'tab-'+tabId+'.code-workspace');
 const content=JSON.stringify({folders:[{path:projectFolder}]},null,2)+'\n';
 if(!fs.existsSync(workspace)||fs.readFileSync(workspace,'utf8')!==content){
  const tmp=workspace+'.tmp';
  fs.writeFileSync(tmp,content,'utf8');
  fs.renameSync(tmp,workspace);
 }
 return workspace;
}
function clearSession(userData,tabId){
 fs.rmSync(sessionFile(userData,tabId),{force:true});
 fs.rmSync(path.join(codeSessionDirectory(userData),'tab-'+validTabId(tabId)+'.code-workspace'),{force:true});
}
module.exports={workspaceForTab,sessionFile,clearSession,codeSessionDirectory};
