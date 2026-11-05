'use strict';
const {BrowserWindow,WebContentsView,ipcMain,screen,shell}=require('electron');
const path=require('node:path');
const PARTITION='persist:hexora-chatgpt';
const HOME='https://www.youtube.com/';
let windowRef=null,views=new Map(),active=null,serial=0,controlsVisible=true;
function safeVideoUrl(raw){
 try{
  const u=new URL(String(raw||''));
  if(u.protocol!=='https:'||u.username||u.password)return null;
  const host=u.hostname.toLowerCase();
  if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com','youtube-nocookie.com'].includes(host))return null;
  if(host==='youtu.be'){if(!/^\/[a-zA-Z0-9_-]{11}$/.test(u.pathname))return null;}
  else if(!(/^\/watch$/.test(u.pathname)&&/^[a-zA-Z0-9_-]{11}$/.test(u.searchParams.get('v')||''))&&!/^\/(shorts|live|embed)\/[a-zA-Z0-9_-]{11}$/.test(u.pathname))return null;
  return u.href;
 }catch{return null;}
}
function state(){
 const wc=views.get(active)?.webContents;
 return {tabs:[...views].map(([id,v])=>({id,title:v.webContents.isDestroyed()?'Video':v.webContents.getTitle()||'YouTube',url:v.webContents.isDestroyed()?'':v.webContents.getURL()})),active,url:wc&&!wc.isDestroyed()?wc.getURL():'',fullscreen:!!windowRef?.isFullScreen(),maximized:!!windowRef?.isMaximized(),controlsVisible,canBack:!!wc?.navigationHistory?.canGoBack(),canForward:!!wc?.navigationHistory?.canGoForward()};
}
function notify(){if(windowRef&&!windowRef.isDestroyed()&&!windowRef.webContents.isLoadingMainFrame())windowRef.webContents.send('pctv:state',state());}
function layout(){
 if(!windowRef||windowRef.isDestroyed())return;
 const [w,h]=windowRef.getContentSize(),top=30;
 for(const [id,v] of views){v.setBounds({x:0,y:top,width:Math.max(1,w),height:Math.max(1,h-top)});v.setVisible(id===active);}
}
function toggleControls(show){controlsVisible=!!show;notify();}
function createTab(url=HOME){
 if(!windowRef||windowRef.isDestroyed())return;
 const id=++serial;
 const v=new WebContentsView({webPreferences:{partition:PARTITION,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 const wc=v.webContents;
 const ua=wc.getUserAgent().replace(/\s+(?:Electron|hexora-workspace)\/[^\s]+/gi,'').replace(/\s{2,}/g,' ').trim();
 wc.setUserAgent(ua);
 wc.on('before-input-event',(event,input)=>{if(input.type!=='keyDown')return;if(input.key==='F10'){event.preventDefault();toggleControls(!controlsVisible);}else if(input.key==='F11'){event.preventDefault();windowRef.setFullScreen(!windowRef.isFullScreen());}});
 wc.setWindowOpenHandler(({url:target})=>{if(/^https:\/\//i.test(target))shell.openExternal(target);return {action:'deny'};});
 for(const event of ['did-navigate','did-navigate-in-page','page-title-updated','did-finish-load'])wc.on(event,notify);
 views.set(id,v);windowRef.contentView.addChildView(v);active=id;layout();notify();
 wc.loadURL(url).catch(error=>console.warn('[PC TV] Load failed:',error.message));
 return id;
}
function open(){
 if(windowRef&&!windowRef.isDestroyed()){windowRef.show();windowRef.focus();return;}
 controlsVisible=true;
 const primary=screen.getPrimaryDisplay();
 const display=screen.getAllDisplays().find(d=>d.id!==primary.id)||primary;
 const area=display.workArea;
 windowRef=new BrowserWindow({x:area.x+20,y:area.y+20,width:Math.max(700,Math.min(1500,area.width-40)),height:Math.max(450,Math.min(900,area.height-40)),minWidth:700,minHeight:450,backgroundColor:'#080b13',title:'Hexora · PC TV',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'pc-tv-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 windowRef.loadFile(path.join(__dirname,'pc-tv.html'));
 windowRef.on('resize',layout);windowRef.on('enter-full-screen',notify);windowRef.on('leave-full-screen',notify);
 windowRef.on('closed',()=>{for(const v of views.values())if(!v.webContents.isDestroyed())v.webContents.close();views.clear();active=null;windowRef=null;});
 createTab();
}
function sendVideo(url){
 const safe=safeVideoUrl(url);
 if(!safe)throw Error('Not a supported YouTube video link');
 open();
 createTab(safe);
 windowRef.show();windowRef.focus();
 return true;
}
function register(main){
 ipcMain.handle('pctv:open',e=>{if(e.sender!==main.webContents)throw Error('Unauthorized PC TV opener');open();return true;});
 function authorized(e){if(!windowRef||e.sender!==windowRef.webContents)throw Error('Unauthorized PC TV action');}
 ipcMain.handle('pctv:state',e=>{authorized(e);return state();});
 ipcMain.handle('pctv:command',(e,cmd,value)=>{
  authorized(e);const wc=views.get(active)?.webContents;
  if(cmd==='close')windowRef.close();
  else if(cmd==='minimize')windowRef.minimize();
  else if(cmd==='maximize')windowRef.isMaximized()?windowRef.unmaximize():windowRef.maximize();
  else if(cmd==='fullscreen')windowRef.setFullScreen(!windowRef.isFullScreen());
  else if(cmd==='controls')toggleControls(value);
  else if(cmd==='new-tab')createTab();
  else if(cmd==='select-tab'){if(!views.has(Number(value)))throw Error('Tab not found');active=Number(value);layout();}
  else if(cmd==='close-tab'){
   const id=Number(value),v=views.get(id);if(!v)throw Error('Tab not found');
   windowRef.contentView.removeChildView(v);views.delete(id);if(!v.webContents.isDestroyed())v.webContents.close();
   if(active===id)active=[...views.keys()].at(-1)||null;
   if(!active)createTab();else layout();
  }
  else if(cmd==='home')wc?.loadURL(HOME);
  else if(cmd==='reload')wc?.reload();
  else if(cmd==='back'&&wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();
  else if(cmd==='forward'&&wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();
  else if(cmd==='navigate'){
   const url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password)throw Error('Only secure website URLs are allowed');
   wc?.loadURL(url.href);
  }else if(!['back','forward'].includes(cmd))throw Error('Unknown PC TV command');
  notify();return true;
 });
}
module.exports={register,sendVideo,safeVideoUrl};
