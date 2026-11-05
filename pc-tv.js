'use strict';
const {BrowserWindow,WebContentsView,ipcMain,screen,shell}=require('electron');
const path=require('node:path');
const PARTITION='persist:hexora-chatgpt'; // Same Chromium profile as regular Hexora web tabs.
const HOME='https://www.youtube.com/';
let windowRef=null,view=null,controlsVisible=true;
function state(){const wc=view?.webContents;return {url:wc&&!wc.isDestroyed()?wc.getURL():'',title:wc&&!wc.isDestroyed()?wc.getTitle():'',fullscreen:!!windowRef?.isFullScreen(),maximized:!!windowRef?.isMaximized(),controlsVisible,canBack:!!wc?.navigationHistory?.canGoBack(),canForward:!!wc?.navigationHistory?.canGoForward()};}
function notify(){if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('pctv:state',state());}
function layout(){if(!windowRef||windowRef.isDestroyed()||!view)return;const [w,h]=windowRef.getContentSize(),top=controlsVisible?78:0;view.setBounds({x:0,y:top,width:Math.max(1,w),height:Math.max(1,h-top)});}
function toggleControls(show){controlsVisible=!!show;layout();notify();}
function open(){
 if(windowRef&&!windowRef.isDestroyed()){windowRef.show();windowRef.focus();return;}
 controlsVisible=true;
 const display=screen.getAllDisplays().find(d=>d.bounds.x!==screen.getPrimaryDisplay().bounds.x)||screen.getPrimaryDisplay();
 windowRef=new BrowserWindow({x:display.workArea.x+60,y:display.workArea.y+40,width:Math.min(1500,display.workArea.width-100),height:Math.min(900,display.workArea.height-80),minWidth:700,minHeight:450,backgroundColor:'#080b13',title:'Hexora · PC TV',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'pc-tv-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 windowRef.loadFile(path.join(__dirname,'pc-tv.html'));
 view=new WebContentsView({webPreferences:{partition:PARTITION,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 const wc=view.webContents;
 wc.on('before-input-event',(event,input)=>{
  if(input.type!=='keyDown')return;
  if(input.key==='F10'){event.preventDefault();toggleControls(!controlsVisible);}
  else if(input.key==='F11'){event.preventDefault();windowRef.setFullScreen(!windowRef.isFullScreen());}
 });
 // Match normal Hexora Chrome-compatible website identity.
 const ua=wc.getUserAgent().replace(/\\s+(?:Electron|hexora-workspace)\\/[^\\s]+/gi,'').replace(/\\s{2,}/g,' ').trim();
 wc.setUserAgent(ua);
 wc.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url))shell.openExternal(url);return {action:'deny'};});
 for(const event of ['did-navigate','did-navigate-in-page','page-title-updated','did-finish-load'])wc.on(event,notify);
 windowRef.contentView.addChildView(view);
 windowRef.on('resize',layout);windowRef.on('enter-full-screen',notify);windowRef.on('leave-full-screen',notify);
 windowRef.on('closed',()=>{if(view){windowRef?.contentView.removeChildView(view);if(!view.webContents.isDestroyed())view.webContents.close();}view=null;windowRef=null;});
 layout();wc.loadURL(HOME).catch(error=>console.warn('[PC TV] YouTube load failed:',error.message));
}
function register(main){
 ipcMain.handle('pctv:open',e=>{if(e.sender!==main.webContents)throw Error('Unauthorized PC TV opener');open();return true;});
 function authorized(e){if(!windowRef||e.sender!==windowRef.webContents)throw Error('Unauthorized PC TV action');}
 ipcMain.handle('pctv:state',e=>{authorized(e);return state();});
 ipcMain.handle('pctv:command',(e,cmd,value)=>{
  authorized(e);const wc=view?.webContents;
  if(cmd==='close')windowRef.close();
  else if(cmd==='minimize')windowRef.minimize();
  else if(cmd==='maximize')windowRef.isMaximized()?windowRef.unmaximize():windowRef.maximize();
  else if(cmd==='fullscreen')windowRef.setFullScreen(!windowRef.isFullScreen());
  else if(cmd==='controls')toggleControls(value);
  else if(cmd==='home')wc.loadURL(HOME);
  else if(cmd==='reload')wc.reload();
  else if(cmd==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();
  else if(cmd==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();
  else if(cmd==='navigate'){
   const url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password)throw Error('Only secure website URLs are allowed');
   wc.loadURL(url.href);
  }else if(!['back','forward'].includes(cmd))throw Error('Unknown PC TV command');
  notify();return true;
 });
}
module.exports={register};
