'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

const RECENTS_KEY='codePickerRecentV1';
const FAVORITES_KEY='codePickerFavoritesV1';
const MAX_RECENTS=40;
const MAX_FAVORITES=100;

function validateFolder(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.length>32767||!path.isAbsolute(raw))throw Error('Choose an absolute folder path.');
 const directory=path.resolve(raw);
 if(!fs.statSync(directory).isDirectory())throw Error('This location is not a folder.');
 return directory;
}
function keyOf(p){return process.platform==='win32'?p.toLowerCase():p;}
function readPaths(store,metaKey,max){
 let values;
 try{values=JSON.parse(store.getMeta(metaKey)||'[]');}catch{return [];}
 if(!Array.isArray(values))return [];
 const seen=new Set();
 return values.filter(p=>{
  if(typeof p!=='string'||!path.isAbsolute(p)||p.length>32767)return false;
  const key=keyOf(p);
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).slice(0,max);
}
function writePaths(store,metaKey,paths,max){store.setMeta(metaKey,JSON.stringify(paths.slice(0,max)));}
function rememberProject(store,raw){
 const folder=validateFolder(raw);
 const recent=readPaths(store,RECENTS_KEY,MAX_RECENTS).filter(p=>keyOf(p)!==keyOf(folder));
 writePaths(store,RECENTS_KEY,[folder,...recent],MAX_RECENTS);
 return folder;
}
function toggleFavorite(store,raw){
 const folder=validateFolder(raw);
 const favorites=readPaths(store,FAVORITES_KEY,MAX_FAVORITES);
 const already=favorites.some(p=>keyOf(p)===keyOf(folder));
 writePaths(store,FAVORITES_KEY,already?favorites.filter(p=>keyOf(p)!==keyOf(folder)):[folder,...favorites],MAX_FAVORITES);
 return !already;
}
function parentOf(directory){const up=path.dirname(directory);return up===directory?null:up;}
function folderItem(folder,favorites){
 let modified=0;
 try{modified=fs.statSync(folder).mtimeMs;}catch{}
 return {name:path.basename(folder)||folder,path:folder,modified,favorite:favorites.some(p=>keyOf(p)===keyOf(folder))};
}
function available(folder){try{return fs.statSync(folder).isDirectory();}catch{return false;}}
function locations(store){
 const home=os.homedir();
 const suggestions=[
  {id:'home',name:'Home',path:home},
  {id:'projects',name:'Projects',path:available('C:\\Projects')?'C:\\Projects':path.join(home,'Projects')},
  {id:'clients',name:'Clients',path:available('C:\\Projects\\Clients')?'C:\\Projects\\Clients':path.join(home,'Clients')},
  {id:'downloads',name:'Downloads',path:path.join(home,'Downloads')},
  {id:'desktop',name:'Desktop',path:path.join(home,'Desktop')},
 ];
 const shortcuts=suggestions.filter(item=>available(item.path));
 const favorites=readPaths(store,FAVORITES_KEY,MAX_FAVORITES);
 const recent=readPaths(store,RECENTS_KEY,MAX_RECENTS);
 // Include pre-existing saved VS Code project paths from before the picker.
 let saved=[];
 try{saved=store.db.prepare('SELECT project_path AS path FROM native_code_projects GROUP BY project_path ORDER BY MAX(updated_at) DESC LIMIT 30').all().map(x=>x.path);}
 catch{}
 const allRecent=[...recent,...saved].filter((p,i,a)=>a.findIndex(q=>keyOf(q)===keyOf(p))===i).filter(available).slice(0,MAX_RECENTS);
 return {
  home,shortcuts,
  recent:allRecent.map(p=>folderItem(p,favorites)),
  favorites:favorites.filter(available).map(p=>folderItem(p,favorites))
 };
}
function listFolders(raw,favorites=[],max=300){
 const folder=validateFolder(raw);
 const items=[];
 let total=0;
 for(const item of fs.readdirSync(folder,{withFileTypes:true})){
  if(!item.isDirectory()){
   if(!item.isSymbolicLink())continue;
   try{if(!fs.statSync(path.join(folder,item.name)).isDirectory())continue;}catch{continue;}
  }
  total++;
  items.push(path.join(folder,item.name));
 }
 items.sort((a,b)=>path.basename(a).localeCompare(path.basename(b),undefined,{numeric:true,sensitivity:'base'}));
 const rows=items.slice(0,Math.min(max,500)).map(p=>folderItem(p,favorites));
 return {path:folder,parent:parentOf(folder),rows,total,truncated:total>rows.length};
}
module.exports={validateFolder,rememberProject,toggleFavorite,locations,listFolders,readPaths,RECENTS_KEY,FAVORITES_KEY};
