'use strict';
const {ipcRenderer}=require('electron');
const source=document.getElementById('source'),lines=document.getElementById('lines'),status=document.getElementById('status'),name=document.getElementById('filename'),dirty=document.getElementById('dirty');
let file=null,changed=false;
function refresh(){const count=source.value.split('\n').length;lines.textContent=Array.from({length:count},(_,i)=>i+1).join('\n');dirty.textContent=changed?'● Unsaved':'';}
function setFile(result){if(!result)return;file=result.path;source.value=result.text;changed=false;name.textContent=file.split(/[\\/]/).pop();name.title=file;refresh();status.textContent='Opened';}
async function open(){if(changed&&!confirm('Discard unsaved changes?'))return;try{setFile(await ipcRenderer.invoke('editor:file-open'));}catch(e){status.textContent=e.message;}}
async function save(as=false){try{const result=await ipcRenderer.invoke('editor:file-save',{path:as?null:file,text:source.value});if(result){file=result.path;changed=false;name.textContent=file.split(/[\\/]/).pop();name.title=file;refresh();status.textContent='Saved';}}catch(e){status.textContent=e.message;}}
document.getElementById('open').onclick=open;document.getElementById('save').onclick=()=>save();document.getElementById('saveas').onclick=()=>save(true);
source.addEventListener('input',()=>{changed=true;refresh();});source.addEventListener('scroll',()=>{lines.scrollTop=source.scrollTop;});
source.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();source.setRangeText('    ',source.selectionStart,source.selectionEnd,'end');changed=true;refresh();}});
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if(e.ctrlKey&&e.key.toLowerCase()==='o'){e.preventDefault();open();}});
refresh();
