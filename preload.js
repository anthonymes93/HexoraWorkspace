const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hexora',{
 action:(name,arg)=>ipcRenderer.invoke('tabs:action',name,arg),
 page:(workspace,offset=0)=>ipcRenderer.invoke('tabs:page',{workspace,offset}),
 search:term=>ipcRenderer.invoke('tabs:search',term),
 statistics:()=>ipcRenderer.invoke('statistics:snapshot'),
 extensions:{list:()=>ipcRenderer.invoke('extensions:list'),install:()=>ipcRenderer.invoke('extensions:install'),toggle:path=>ipcRenderer.invoke('extensions:toggle',path),remove:path=>ipcRenderer.invoke('extensions:remove',path),open:path=>ipcRenderer.invoke('extensions:open',path)},
 recovery:{status:()=>ipcRenderer.invoke('recovery:status'),configure:password=>ipcRenderer.invoke('recovery:configure',password),unlock:password=>ipcRenderer.invoke('recovery:unlock',password),backup:()=>ipcRenderer.invoke('recovery:backup'),restore:password=>ipcRenderer.invoke('recovery:restore',password),verify:password=>ipcRenderer.invoke('recovery:verify',password)},
 onState:callback=>ipcRenderer.on('tabs:changed',()=>callback()),
 onSidebarFrame:callback=>ipcRenderer.on('sidebar:frame',(_event,width)=>callback(width))
});
