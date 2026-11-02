'use strict';
const {app,dialog, BrowserWindow}=require('electron');

// Updates are opt-in at restart, never during active work. No updater in npm start.
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
 autoUpdater.on('update-downloaded',async info=>{
  console.info('[updates] downloaded:',info.version);
  try{
   const window=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed())||undefined;
   const options={
    type:'info',title:'Hexora update ready',
    message:'Hexora '+info.version+' is ready to install',
    detail:'Save any open work before updating. You can install now or keep working and update later.',
    buttons:['Later','Update & Restart'],defaultId:0,cancelId:0,noLink:true
   };
   const result=window?await dialog.showMessageBox(window,options):await dialog.showMessageBox(options);
   if(result.response===1)autoUpdater.quitAndInstall(false,true);
  }catch(error){console.error('[updates] update prompt:',error);}
 });
 const check=()=>autoUpdater.checkForUpdates().catch(error=>console.error('[updates] check:',error));
 const startup=setTimeout(check,15000);startup.unref?.();
 const interval=setInterval(check,6*60*60*1000);interval.unref?.();
}
module.exports={startStableUpdater};
