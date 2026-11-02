'use strict';
const {app,dialog}=require('electron');

// Stable GitHub Releases only. Store packages are updated by Microsoft Store.
function startStableUpdater(){
  if(!app.isPackaged||process.platform!=='win32'||process.windowsStore)return;
  let autoUpdater;
  try{({autoUpdater}=require('electron-updater'));}catch(error){
    console.error('[updates] electron-updater unavailable:',error.message);
    return;
  }
  autoUpdater.autoDownload=true;
  autoUpdater.autoInstallOnAppQuit=true;
  autoUpdater.allowPrerelease=false;
  autoUpdater.on('error',error=>console.error('[updates]',error));
  autoUpdater.on('update-available',info=>console.info('[updates] New stable version:',info.version));
  autoUpdater.on('update-downloaded',info=>{
    console.info('[updates] Downloaded:',info.version);
    dialog.showMessageBox({
      type:'info',title:'Hexora update ready',
      message:`Hexora ${info.version} is ready`,
      detail:'The update will install when you close Hexora. Your open work will not be interrupted.',
      buttons:['OK'],noLink:true
    }).catch(error=>console.error('[updates] notification:',error));
  });
  const check=()=>autoUpdater.checkForUpdates().catch(error=>console.error('[updates] check:',error));
  setTimeout(check,15_000).unref?.();
  setInterval(check,6*60*60*1000).unref?.();
}
module.exports={startStableUpdater};
