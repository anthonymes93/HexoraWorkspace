'use strict';
const path=require('node:path');
const {app,BrowserWindow,ipcMain}=require('electron');

function showUpdateDialog(version,onInstall){
 return new Promise(resolve=>{
  const window=new BrowserWindow({
   width:480,height:330,minWidth:480,minHeight:330,resizable:false,
   minimizable:false,maximizable:false,autoHideMenuBar:true,
   title:'Hexora · Update ready',backgroundColor:'#11151d',
   webPreferences:{
    preload:path.join(__dirname,'update-dialog-preload.js'),
    nodeIntegration:false,contextIsolation:true,sandbox:false
   }
  });
  let decided=false;
  const finish=choice=>{
   if(decided)return;
   decided=true;
   ipcMain.removeListener('hexora-update-choice',receive);
   if(!window.isDestroyed())window.close();
   resolve(choice);
  };
  const receive=(event,choice)=>{
   if(event.sender!==window.webContents)return;
   finish(choice==='install'?'install':'later');
  };
  ipcMain.on('hexora-update-choice',receive);
  window.on('closed',()=>finish('later'));
  window.loadFile(path.join(__dirname,'update-dialog.html'),{query:{version:String(version)}})
   .catch(error=>{console.error('[updates] dialog load:',error);finish('later');});
 }).then(choice=>{if(choice==='install')onInstall();});
}

function startStableUpdater(){
 if(!app.isPackaged||process.platform!=='win32'||process.windowsStore)return;
 let autoUpdater;
 try{({autoUpdater}=require('electron-updater'));}catch(error){
  console.error('[updates] updater unavailable:',error);return;
 }
 autoUpdater.autoDownload=true;
 autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.allowPrerelease=false;
 autoUpdater.on('error',error=>console.error('[updates] error:',error));
 autoUpdater.on('update-available',info=>console.info('[updates] available:',info.version));
 autoUpdater.on('update-downloaded',info=>{
  console.info('[updates] downloaded:',info.version);
  showUpdateDialog(info.version,()=>autoUpdater.quitAndInstall(false,true))
   .catch(error=>console.error('[updates] update prompt:',error));
 });
 const check=()=>autoUpdater.checkForUpdates().catch(error=>console.error('[updates] check:',error));
 const startup=setTimeout(check,15000);startup.unref?.();
 const interval=setInterval(check,6*60*60*1000);interval.unref?.();
}
module.exports={startStableUpdater};
