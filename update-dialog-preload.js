'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hexoraUpdate',{
 choose:choice=>ipcRenderer.send('hexora-update-choice',choice==='install'?'install':'later')
});
