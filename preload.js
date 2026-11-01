const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hexora',{
 nativeCode:{toggle:()=>ipcRenderer.invoke('native-code:toggle'),onStopped:callback=>ipcRenderer.on('native-code:stopped',callback)},
 action:(name,arg)=>ipcRenderer.invoke('tabs:action',name,arg),
 page:(workspace,offset=0)=>ipcRenderer.invoke('tabs:page',{workspace,offset}),
 search:term=>ipcRenderer.invoke('tabs:search',term),
 lookupTab:id=>ipcRenderer.invoke('tabs:lookup',id),
 workspaceMenu:data=>ipcRenderer.invoke('workspace:context-menu',data),
 workspaceTooltip:{show:data=>ipcRenderer.invoke('workspace:tooltip-show',data),hide:()=>ipcRenderer.invoke('workspace:tooltip-hide')},
 onWorkspaceMenuAction:callback=>ipcRenderer.on('workspace:menu-action',(_event,data)=>callback(data)),
 statistics:()=>ipcRenderer.invoke('statistics:snapshot'),
 vault:{status:()=>ipcRenderer.invoke('vault:status'),unlock:(password,remember=false)=>ipcRenderer.invoke('vault:unlock',{password,remember}),lock:()=>ipcRenderer.invoke('vault:lock'),list:()=>ipcRenderer.invoke('vault:list'),get:id=>ipcRenderer.invoke('vault:get',id),save:entry=>ipcRenderer.invoke('vault:save',entry),delete:id=>ipcRenderer.invoke('vault:delete',id),copy:(id,field)=>ipcRenderer.invoke('vault:copy',{id,field}),autofill:id=>ipcRenderer.invoke('vault:autofill',id)},
 extensions:{list:()=>ipcRenderer.invoke('extensions:list'),install:()=>ipcRenderer.invoke('extensions:install'),toggle:path=>ipcRenderer.invoke('extensions:toggle',path),remove:path=>ipcRenderer.invoke('extensions:remove',path),open:path=>ipcRenderer.invoke('extensions:open',path),diagnostics:path=>ipcRenderer.invoke('extensions:diagnostics',path),probeWorker:path=>ipcRenderer.invoke('extensions:probe-worker',path),clearDiagnostics:path=>ipcRenderer.invoke('extensions:clear-diagnostics',path)},
 recovery:{status:()=>ipcRenderer.invoke('recovery:status'),configure:password=>ipcRenderer.invoke('recovery:configure',password),unlock:password=>ipcRenderer.invoke('recovery:unlock',password),backup:()=>ipcRenderer.invoke('recovery:backup'),restore:password=>ipcRenderer.invoke('recovery:restore',password),verify:password=>ipcRenderer.invoke('recovery:verify',password)},
 onState:callback=>ipcRenderer.on('tabs:changed',()=>callback()),
 onSidebarFrame:callback=>ipcRenderer.on('sidebar:frame',(_event,width,transitioning,target)=>callback(width,transitioning,target))
});
