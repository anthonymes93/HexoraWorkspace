'use strict';
const {app,BrowserWindow,ipcMain,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const version=require('../package.json').version;
let win,installing=false;
function emit(status,detail){if(win&&!win.isDestroyed())win.webContents.send('install:status',{status,detail});}
function installerPath(){return path.join(process.resourcesPath,'Hexora-Setup-'+version+'-x64.exe');}
app.whenReady().then(()=>{
 win=new BrowserWindow({width:670,height:550,minWidth:670,minHeight:550,resizable:false,backgroundColor:'#0d1018',autoHideMenuBar:true,title:'Install Hexora Workspace',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 win.loadFile(path.join(__dirname,'index.html'));
});
ipcMain.handle('install:start',async()=>{
 if(installing)return {ok:false,message:'Installation already in progress'};
 const installer=installerPath();
 if(!fs.existsSync(installer))return {ok:false,message:'Bundled installer not found'};
 installing=true;emit('installing','Installing Hexora Workspace for your Windows account…');
 return await new Promise(resolve=>{
  const child=spawn(installer,['/S'],{windowsHide:true,stdio:'ignore'});
  child.once('error',err=>{installing=false;emit('error',err.message);resolve({ok:false,message:err.message});});
  child.once('exit',code=>{
   installing=false;
   if(code===0){emit('complete','Hexora Workspace has been installed.');resolve({ok:true});}
   else {emit('error','Installer exited with code '+code);resolve({ok:false,message:'Installer exited with code '+code});}
  });
 });
});
ipcMain.handle('install:launch',async()=>{
 const exe=path.join(process.env.LOCALAPPDATA||path.join(app.getPath('home'),'AppData','Local'),'Programs','Hexora Workspace','Hexora Workspace.exe');
 if(!fs.existsSync(exe))return {ok:false,message:'Launch Hexora from the Start menu.'};
 const error=await shell.openPath(exe);
 if(error)return {ok:false,message:error};
 // The app was handed to Windows successfully; the setup shell is no longer needed.
 app.quit();
 return {ok:true};
});
ipcMain.handle('install:close',()=>{if(!installing)app.quit();});
app.on('window-all-closed',()=>app.quit());
