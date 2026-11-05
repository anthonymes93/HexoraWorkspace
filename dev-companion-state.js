'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {app}=require('electron');
let restarting=false;
function markRestarting(){restarting=true;}
function isRestarting(){return restarting;}
const filename=()=>path.join(app.getPath('userData'),'dev-companion-windows.json');
function read(){try{const value=JSON.parse(fs.readFileSync(filename(),'utf8'));return value&&typeof value==='object'?value:{};}catch{return {};}}
function save(name,patch){if(process.env.HEXORA_DEV_WATCH!=='1'||restarting)return;try{const current=read();current[name]={...(current[name]||{}),...patch};fs.writeFileSync(filename(),JSON.stringify(current),{mode:0o600});}catch(error){console.warn('[Hexora] Companion state not saved:',error.message);}}
function boundsOf(window){return window&&!window.isDestroyed()?window.getBounds():null;}
function restoreBounds(window,record){const bounds=record?.bounds;if(!bounds||!['x','y','width','height'].every(k=>Number.isInteger(bounds[k])))return;const {screen}=require('electron');const area=screen.getAllDisplays().some(d=>{const a=d.workArea;return bounds.x<a.x+a.width&&bounds.x+bounds.width>a.x&&bounds.y<a.y+a.height&&bounds.y+bounds.height>a.y;});if(area)window.setBounds(bounds);}
module.exports={read,save,boundsOf,restoreBounds,markRestarting,isRestarting};
