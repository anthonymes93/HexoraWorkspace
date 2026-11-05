'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('clientZone',{openClient:(id,name)=>ipcRenderer.invoke('client-zone:open',String(id),String(name))});
