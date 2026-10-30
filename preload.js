const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hexora',{
 action:(name,arg)=>ipcRenderer.invoke('tabs:action',name,arg),
 page:(workspace,offset=0)=>ipcRenderer.invoke('tabs:page',{workspace,offset}),
 search:term=>ipcRenderer.invoke('tabs:search',term),
 onState:callback=>ipcRenderer.on('tabs:changed',()=>callback())
});
