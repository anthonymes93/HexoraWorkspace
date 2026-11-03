'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hexoraInstall',{
 start:()=>ipcRenderer.invoke('install:start'),
 launch:()=>ipcRenderer.invoke('install:launch'),
 close:()=>ipcRenderer.invoke('install:close'),
 onStatus:callback=>ipcRenderer.on('install:status',(_event,data)=>callback(data))
});
