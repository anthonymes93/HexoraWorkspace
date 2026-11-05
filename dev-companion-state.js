'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {app}=require('electron');
let restarting=false;
const managedWindows=new Map();
let restoringOrder=false;
let restoreTimer=null;
function markRestarting(){restarting=true;}
function isRestarting(){return restarting;}
const filename=()=>path.join(app.getPath('userData'),'dev-companion-windows.json');
function read(){try{const value=JSON.parse(fs.readFileSync(filename(),'utf8'));return value&&typeof value==='object'?value:{};}catch{return {};}}
function save(name,patch){if(process.env.HEXORA_DEV_WATCH!=='1'||restarting)return;try{const current=read();current[name]={...(current[name]||{}),...patch};fs.writeFileSync(filename(),JSON.stringify(current),{mode:0o600});}catch(error){console.warn('[Hexora] Companion state not saved:',error.message);}}
function manageWindow(name,window){
 managedWindows.set(name,window);
 window.on('focus',()=>{
  if(restoringOrder||restarting||process.env.HEXORA_DEV_WATCH!=='1')return;
  const records=read();
  const highest=Math.max(0,...Object.values(records).map(record=>Number(record?.focusOrder)||0));
  save(name,{focusOrder:highest+1});
 });
 window.on('closed',()=>{if(managedWindows.get(name)===window)managedWindows.delete(name);});
}
function restoreStacking(snapshot){
 if(process.env.HEXORA_DEV_WATCH!=='1'||!snapshot)return;
 if(restoreTimer)clearTimeout(restoreTimer);
 restoringOrder=true;
 restoreTimer=setTimeout(()=>{
  restoreTimer=null;
  const ordered=[...managedWindows].filter(([name,window])=>window&&!window.isDestroyed()&&(name==='main'||snapshot[name]?.open))
   .sort(([a],[b])=>(Number(snapshot[a]?.focusOrder)||0)-(Number(snapshot[b]?.focusOrder)||0));
  for(const [,window] of ordered){if(window.isMinimized())continue;window.showInactive();}
  // Focus only the previously foreground window; do not make any window always-on-top.
  const foreground=ordered.at(-1)?.[1];
  if(foreground&&!foreground.isDestroyed()&&!foreground.isMinimized())foreground.focus();
  restoringOrder=false;
 },650);
}
function boundsOf(window){return window&&!window.isDestroyed()?window.getBounds():null;}
function restoreBounds(window,record){const bounds=record?.bounds;if(!bounds||!['x','y','width','height'].every(k=>Number.isInteger(bounds[k])))return;const {screen}=require('electron');const area=screen.getAllDisplays().some(d=>{const a=d.workArea;return bounds.x<a.x+a.width&&bounds.x+bounds.width>a.x&&bounds.y<a.y+a.height&&bounds.y+bounds.height>a.y;});if(area)window.setBounds(bounds);}
module.exports={read,save,boundsOf,restoreBounds,markRestarting,isRestarting,manageWindow,restoreStacking};
