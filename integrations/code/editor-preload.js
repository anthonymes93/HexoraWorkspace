'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hexoraEditor',{open:()=>ipcRenderer.invoke('editor:file-open'),save:data=>ipcRenderer.invoke('editor:file-save',data)});
