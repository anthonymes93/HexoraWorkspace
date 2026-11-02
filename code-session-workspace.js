'use strict';
const fs=require('node:fs');
const path=require('node:path');

function codeSessionDirectory(userData){return path.join(userData,'hexora-native-code');}
function sessionFile(userData,tabId){return path.join(codeSessionDirectory(userData),'tab-'+validTabId(tabId)+'.editor.json');}
function validTabId(id){
 if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid VS Code tab ID');
 return id;
}
function projectUpdateFile(userData,tabId){return path.join(codeSessionDirectory(userData),'tab-'+validTabId(tabId)+'.project.json');}
function ownerFile(userData,tabId){return path.join(codeSessionDirectory(userData),'tab-'+validTabId(tabId)+'.owner');}
function workspaceForTab(userData,tabId,projectFolder){
 validTabId(tabId);
 if(projectFolder!==null&&projectFolder!==undefined&&
  (typeof projectFolder!=='string'||!path.isAbsolute(projectFolder)||!fs.statSync(projectFolder).isDirectory())){
  throw new Error('The saved VS Code project folder is unavailable.');
 }
 const dir=codeSessionDirectory(userData);
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'.hexora-session-marker'),'Hexora native VS Code sessions v1\n','utf8');
 const workspace=path.join(dir,'tab-'+tabId+'.code-workspace');
 // Empty descriptors are intentional: new tabs can launch into their own
 // identifiable VS Code workspace before any project is chosen.
 const content=JSON.stringify({folders:projectFolder?[{path:projectFolder}]:[]},null,2)+'\n';
 if(!fs.existsSync(workspace)||fs.readFileSync(workspace,'utf8')!==content){
  const tmp=workspace+'.tmp';
  fs.writeFileSync(tmp,content,'utf8');
  fs.renameSync(tmp,workspace);
 }
 return workspace;
}
function managedWorkspaceOrBlank(userData,tabId,projectFolder){
 validTabId(tabId);
 // Preserve VS Code's native fast blank startup instead of booting a synthetic
 // empty .code-workspace (which can interfere with its Open Folder workflow).
 if(!projectFolder)return null;
 return workspaceForTab(userData,tabId,projectFolder);
}
function clearSession(userData,tabId){
 // Leave the workspace descriptor intact: when Hexora closes a tab it
 // deliberately detaches (rather than kills) a VS Code window that may
 // still be using this file. A future launch rewrites it to the new project.
 fs.rmSync(sessionFile(userData,tabId),{force:true});
 fs.rmSync(projectUpdateFile(userData,tabId),{force:true});
 // Fence off stale detached VS Code windows when an old tab is closed or reset.
 fs.rmSync(ownerFile(userData,tabId),{force:true});
}
module.exports={workspaceForTab,managedWorkspaceOrBlank,sessionFile,projectUpdateFile,ownerFile,clearSession,codeSessionDirectory};
