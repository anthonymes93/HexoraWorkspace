'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('pcTv',{
 state:()=>ipcRenderer.invoke('pctv:state'),
 command:(name,value)=>ipcRenderer.invoke('pctv:command',name,value),
 onState:callback=>ipcRenderer.on('pctv:state',(_event,state)=>callback(state))
});
