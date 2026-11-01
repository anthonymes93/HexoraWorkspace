'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {fileURLToPath}=require('node:url');

const RECENTS_KEY='codePickerRecentV1';
const FAVORITES_KEY='codePickerFavoritesV1';
const MAX_RECENTS=40;
const MAX_FAVORITES=100;

function expandFolderPath(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.length>32767)throw Error('Enter a folder path, such as C:\\Projects.');
 let target=raw.trim();
 if((target.startsWith('"')&&target.endsWith('"'))||(target.startsWith("'")&&target.endsWith("'")))target=target.slice(1,-1);
 if(/^file:\/\//i.test(target)){
  try{target=fileURLToPath(target);}catch{throw Error('Invalid file URL. Paste a local folder path instead.');}
 }
 if(/^https?:\/\//i.test(target))throw Error('A web URL cannot be opened as a VS Code folder. Enter a Windows folder path.');
 if(target==='~'||target.startsWith('~/')||target.startsWith('~\\'))target=path.join(os.homedir(),target.slice(2));
 if(process.platform==='win32')target=target.replace(/%([^%]+)%/g,(whole,key)=>process.env[key]??process.env[Object.keys(process.env).find(name=>name.toLowerCase()===key.toLowerCase())]??whole);
 if(!path.isAbsolute(target))throw Error('Enter a full folder path, such as C:\\Projects.');
 return path.resolve(target);
}
function validateFolder(raw){
 const directory=expandFolderPath(raw);
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
function folderItem(folder,favorites,type='folder'){
 let modified=0;
 try{modified=fs.statSync(folder).mtimeMs;}catch{}
 return {name:path.basename(folder)||folder,path:folder,type,modified,favorite:type==='folder'&&favorites.some(p=>keyOf(p)===keyOf(folder))};
}
function drives(){
 if(process.platform!=='win32')return [];
 const result=[];
 // Probe ordinary volumes only; don't enumerate UNC shares or force mounting
 // disconnected network drives just to render the picker.
 const letters=['C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
 for(const letter of letters){
  const drive=letter+':\\';
  try{if(fs.statSync(drive).isDirectory())result.push({id:'drive-'+letter,name:'Local Disk ('+letter+':)',path:drive});}catch{}
 }
 return result;
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
  home,shortcuts,drives:drives(),
  recent:allRecent.map(p=>folderItem(p,favorites)),
  favorites:favorites.filter(available).map(p=>folderItem(p,favorites))
 };
}
function listFolders(raw,favorites=[],max=1200,filter=''){
 const folder=validateFolder(raw);
 const all=fs.readdirSync(folder,{withFileTypes:true});
 const needle=String(filter||'').toLocaleLowerCase().slice(0,200);
 const dirs=[],files=[];
 let folderCount=0,fileCount=0,matched=0;
 for(const item of all){
  const full=path.join(folder,item.name);
  let type=item.isDirectory()?'folder':item.isFile()?'file':null;
  if(!type&&item.isSymbolicLink()){
   try{type=fs.statSync(full).isDirectory()?'folder':'file';}catch{continue;}
  }
  if(!type)continue;
  if(type==='folder')folderCount++;else fileCount++;
  if(needle&&!item.name.toLocaleLowerCase().includes(needle))continue;
  matched++;
  (type==='folder'?dirs:files).push(full);
 }
 const sort=(a,b)=>path.basename(a).localeCompare(path.basename(b),undefined,{numeric:true,sensitivity:'base'});
 dirs.sort(sort);files.sort(sort);
 const items=dirs.map(p=>({path:p,type:'folder'})).concat(files.map(p=>({path:p,type:'file'})));
 const rows=items.slice(0,Math.max(1,Math.min(max,2000))).map(item=>folderItem(item.path,favorites,item.type));
 return {path:folder,parent:parentOf(folder),rows,total:matched,folderCount,fileCount,truncated:matched>rows.length};
}
module.exports={expandFolderPath,validateFolder,rememberProject,toggleFavorite,locations,listFolders,readPaths,RECENTS_KEY,FAVORITES_KEY};
