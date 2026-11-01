'use strict';
// Apply fenced, atomic project updates published by the VS Code companion.
const fs=require('node:fs');
const path=require('node:path');
const {codeSessionDirectory,projectUpdateFile,ownerFile}=require('./code-session-workspace');

function syncCodeProjects({userData,store,eligible,onProject=()=>{}}){
 let names;
 try{names=fs.readdirSync(codeSessionDirectory(userData));}
 catch(error){if(error.code==='ENOENT')return 0;throw error;}
 let changes=0;
 for(const name of names){
  const match=/^tab-([1-9]\d*)\.project\.json$/.exec(name);
  if(!match)continue;
  const id=Number(match[1]);
  if(!Number.isSafeInteger(id)||!eligible(id))continue;
  try{
   const file=projectUpdateFile(userData,id);
   if(fs.statSync(file).size>8192)continue;
   const data=JSON.parse(fs.readFileSync(file,'utf8'));
   if(data?.version!==1||typeof data.ownerToken!=='string'||data.ownerToken.length<16)continue;
   const currentOwner=fs.readFileSync(ownerFile(userData,id),'utf8');
   if(data.ownerToken!==currentOwner)continue; // stale detached Code window
   const project=data.projectPath;
   if(typeof project!=='string'||project.length>32767||!path.isAbsolute(project))continue;
   if(!fs.statSync(project).isDirectory())continue;
   if(store.getCodeProject(id)?.project_path===project)continue;
   store.setCodeProject(id,project);
   onProject(id,project);
   changes++;
  }catch(error){
   // A partial or concurrently removed update must not block app startup.
   if(error.code!=='ENOENT')console.warn('[Hexora Code] Ignoring project update for tab '+id+':',error.message);
  }
 }
 return changes;
}
module.exports={syncCodeProjects};