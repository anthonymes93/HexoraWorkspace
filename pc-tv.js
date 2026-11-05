'use strict';
const {BrowserWindow,WebContentsView,ipcMain,screen,shell}=require('electron');
const path=require('node:path');
const companion=require('./dev-companion-state');
const PARTITION='persist:hexora-chatgpt';
const HOME='https://www.youtube.com/';
let windowRef=null,views=new Map(),active=null,serial=0,controlsVisible=true,youtubeHeaderHidden=false;
const youtubeHeaderCSS='ytd-masthead, #masthead-container, ytm-mobile-topbar-renderer {display:none !important;} #content.ytd-app, ytd-page-manager, #page-manager {margin-top:0 !important; padding-top:0 !important;}';
const headerStyleKeys=new Map();
async function syncYoutubeTheater(wc){
 if(!wc||wc.isDestroyed())return;
 try{
  const url=new URL(wc.getURL());
  if(!['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)||url.pathname!=='/watch')return;
  // Use YouTube's own theater layout; it retains the title, comments and normal scrolling.
  await wc.executeJavaScript(`(() => {
   const watch=document.querySelector('ytd-watch-flexy');
   const toggle=document.querySelector('.ytp-size-button');
   if(!watch||!toggle)return false;
   const theater=watch.hasAttribute('theater');
   if(!theater){toggle.click();return true;}
   return false;
  })()`,true);
 }catch(error){console.warn('[PC TV] YouTube theater:',error.message);}
}

async function syncYoutubeHeader(wc){
 if(!wc||wc.isDestroyed())return;
 const old=headerStyleKeys.get(wc);if(old){headerStyleKeys.delete(wc);try{await wc.removeInsertedCSS(old);}catch{}}
 if(!youtubeHeaderHidden||wc.isDestroyed())return;
 try{const host=new URL(wc.getURL()).hostname;if(!['youtube.com','www.youtube.com','m.youtube.com'].includes(host))return;
  const key=await wc.insertCSS(youtubeHeaderCSS);if(!wc.isDestroyed())headerStyleKeys.set(wc,key);
  void syncYoutubeTheater(wc);
 }catch(error){console.warn('[PC TV] YouTube header toggle:',error.message);}
}
function toggleYoutubeHeader(){youtubeHeaderHidden=!youtubeHeaderHidden;layout();for(const view of views.values()){void syncYoutubeHeader(view.webContents);}notify();}

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
 return {tabs:[...views].map(([id,v])=>({id,title:v.webContents.isDestroyed()?'Video':v.webContents.getTitle()||'YouTube',url:v.webContents.isDestroyed()?'':v.webContents.getURL()})),active,url:wc&&!wc.isDestroyed()?wc.getURL():'',fullscreen:!!windowRef?.isFullScreen(),maximized:!!windowRef?.isMaximized(),controlsVisible,youtubeHeaderHidden,videoTitle:wc&&!wc.isDestroyed()?wc.getTitle().replace(/ - YouTube$/,''):'',canBack:!!wc?.navigationHistory?.canGoBack(),canForward:!!wc?.navigationHistory?.canGoForward()};
}
function saveState(){if(!windowRef||windowRef.isDestroyed())return;companion.save('pcTv',{open:true,bounds:windowRef.getBounds(),maximized:windowRef.isMaximized(),tabs:[...views.values()].map(v=>v.webContents.getURL()).filter(u=>/^https:\/\//.test(u)).slice(0,30),activeIndex:Math.max(0,[...views.keys()].indexOf(active)),youtubeHeaderHidden});}
function notify(){saveState();if(windowRef&&!windowRef.isDestroyed()&&!windowRef.webContents.isLoadingMainFrame())windowRef.webContents.send('pctv:state',state());}
function layout(){
 if(!windowRef||windowRef.isDestroyed())return;
 const [w,h]=windowRef.getContentSize(),top=30,bottom=0;
 for(const [id,v] of views){v.setBounds({x:0,y:top,width:Math.max(1,w),height:Math.max(1,h-top-bottom)});v.setVisible(id===active);}
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
 wc.on('did-finish-load',()=>{void syncYoutubeHeader(wc);});
 views.set(id,v);windowRef.contentView.addChildView(v);active=id;layout();notify();
 wc.loadURL(url).catch(error=>console.warn('[PC TV] Load failed:',error.message));
 return id;
}
function open(restore=null){
 if(windowRef&&!windowRef.isDestroyed()){windowRef.show();windowRef.focus();return;}
 controlsVisible=true;
 const primary=screen.getPrimaryDisplay();
 const display=screen.getAllDisplays().find(d=>d.id!==primary.id)||primary;
 const area=display.workArea;
 windowRef=new BrowserWindow({x:area.x+20,y:area.y+20,width:Math.max(700,Math.min(1500,area.width-40)),height:Math.max(450,Math.min(900,area.height-40)),minWidth:700,minHeight:450,backgroundColor:'#080b13',title:'Hexora · PC TV',titleBarStyle:'hidden',titleBarOverlay:{color:'#0d1019',symbolColor:'#939aad',height:30},autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'pc-tv-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 companion.manageWindow('pcTv',windowRef);
 companion.restoreBounds(windowRef,restore);
 if(restore?.maximized)windowRef.maximize();
 windowRef.loadFile(path.join(__dirname,'pc-tv.html'));
 windowRef.on('move',saveState);windowRef.on('resize',()=>{layout();saveState();});windowRef.on('enter-full-screen',notify);windowRef.on('leave-full-screen',notify);
 windowRef.on('closed',()=>{companion.save('pcTv',{open:false});for(const v of views.values())if(!v.webContents.isDestroyed())v.webContents.close();views.clear();headerStyleKeys.clear();active=null;windowRef=null;});
 if(Array.isArray(restore?.tabs)&&restore.tabs.length){for(const url of restore.tabs.slice(0,30)){try{const u=new URL(url);if(u.protocol==='https:'&&['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname))createTab(u.href);}catch{}}if(!views.size)createTab();const ids=[...views.keys()];active=ids[Math.min(ids.length-1,Math.max(0,Number(restore.activeIndex)||0))];youtubeHeaderHidden=!!restore.youtubeHeaderHidden;layout();for(const view of views.values())void syncYoutubeHeader(view.webContents);notify();}else createTab();
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
  else if(cmd==='toggle-youtube-header')toggleYoutubeHeader();
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
module.exports={register,sendVideo,safeVideoUrl,restore:open};
