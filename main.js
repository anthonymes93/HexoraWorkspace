'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,shell,dialog}=require('electron');
const path=require('node:path');
const {screen}=require('electron');
const {TabStore}=require('./tab-store');
const fs=require('node:fs');
const {snapshot,stageRestore,applyPending,verifyBackup}=require('./recovery');
// Prevent two Hexora instances from accessing the same Chromium profile.
const hasSingleInstanceLock=app.requestSingleInstanceLock();
if(!hasSingleInstanceLock){
 app.quit();
}else{
 app.on('second-instance',()=>{
  const main=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.getTitle().includes('Hexora Workspace'));
  if(main){if(main.isMinimized())main.restore();main.show();main.focus();}
 });
}
const HOME='https://chatgpt.com/';
const TOP_HEIGHT=120,IDLE_MS=24*60*60*1000,MAX_LIVE=8;
let recoveryWindow=null;
const detached=new Map();
let quitting=false;
let win,store,activeId=null,sidebarWidth=330,live=new Map(),loading=new Map(),stateTimer=null,modalVisible=false,recoveryPassword=null,recoveryDir=null,recoveryTimer=null,recoveryBusy=false,lastBackup=null;
function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:HOME;}catch{return HOME;}}
function wire(t){const view=new WebContentsView({webPreferences:{partition:'persist:hexora-chatgpt',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,javascript:true}});const wc=view.webContents;
 wc.setAudioMuted(!!t.muted);
 view.setBackgroundColor('#111215');
 wc.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{if(isMainFrame)console.error('[Hexora] Page load failed:',code,description,url);});
 const update=(title=false)=>{const row=store.get(t.id);if(!row)return;if(title)row.title=wc.getTitle()?.slice(0,100)||row.title;const url=wc.getURL();if(/^https?:/.test(url))row.url=url;store.save(toModel(row));emit();};
 wc.on('page-title-updated',()=>update(true));
 wc.on('did-navigate',()=>update());
 wc.on('did-navigate-in-page',()=>update());
 wc.on('did-start-loading',()=>{loading.set(t.id,true);emit();});
 wc.on('did-stop-loading',()=>{loading.delete(t.id);emit();});
 wc.on('render-process-gone',()=>{loading.delete(t.id);emit();});
 wc.setWindowOpenHandler(({url})=>/^https:\/\//.test(url)?{action:'allow',overrideBrowserWindowOptions:{width:540,height:750,autoHideMenuBar:true,webPreferences:{partition:'persist:hexora-chatgpt',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}}}:{action:'deny'});
 wc.loadURL(safeUrl(t.url)).catch(err=>console.error('Tab load error',err));
 return view;
}
function toModel(r){return{id:r.id,url:safeUrl(r.url),title:r.title||'ChatGPT',workspace:r.workspace||'web',pinned:!!r.pinned,muted:!!r.muted,lastActive:r.last_active??r.lastActive??Date.now(),ordinal:r.ordinal||r.id};}
function discard(id){const view=live.get(id);if(!view)return;live.delete(id);const pop=detached.get(id);if(pop&&!pop.isDestroyed())pop.contentView.removeChildView(view);else if(win&&!win.isDestroyed())win.contentView.removeChildView(view);loading.delete(id);view.webContents.close();}
function bounds(){if(!win||win.isDestroyed())return;const v=live.get(activeId);if(!v)return;const [w,h]=win.getContentSize();v.setBounds({x:sidebarWidth,y:TOP_HEIGHT,width:Math.max(0,w-sidebarWidth),height:Math.max(0,h-TOP_HEIGHT)});}
function pageRow(r){return{id:r.id,url:r.url,title:r.title,workspace:r.workspace,pinned:!!r.pinned,muted:!!r.muted,lastActive:r.last_active,active:r.id===activeId,detached:detached.has(r.id),loading:!!loading.get(r.id),suspended:!live.has(r.id)};}
function state(workspace='web',offset=0){return{activeId,total:store.total(),counts:store.counts(),tabs:store.page(workspace,offset,50).map(pageRow),active:activeId?store.get(activeId):null,offset};}
function emit(){if(!win||win.isDestroyed())return;clearTimeout(stateTimer);stateTimer=setTimeout(()=>{if(!win||win.isDestroyed())return;win.webContents.send('tabs:changed');},70);}
function activate(id){const raw=store.get(Number(id));if(!raw)return false;
 if(detached.has(raw.id)){const popup=detached.get(raw.id);if(!popup.isDestroyed()){if(popup.isMinimized())popup.restore();popup.focus();return true;}}
 for(const [otherId,view] of live)if(otherId!==id&&!detached.has(otherId))win.contentView.removeChildView(view);
 activeId=raw.id;const t=toModel(raw);t.lastActive=Date.now();store.save(t);store.setMeta('activeId',String(activeId));
 let view=live.get(id);if(!view){view=wire(t);live.set(id,view);}
 if(!modalVisible){win.contentView.addChildView(view);bounds();view.webContents.focus();}evict();emit();return true;
}
function evict(){if(live.size<=MAX_LIVE)return;const candidates=Array.from(live.keys()).filter(id=>id!==activeId&&!detached.has(id)&&!store.get(id)?.pinned);
 candidates.sort((a,b)=>(store.get(a)?.last_active||0)-(store.get(b)?.last_active||0));
 while(live.size>MAX_LIVE&&candidates.length)discard(candidates.shift());}
function newTab(workspace='web',url=HOME){const id=store.nextId(),t={id,title:'New tab',url:safeUrl(url),workspace:typeof workspace==='string'?workspace:'web',pinned:false,muted:false,lastActive:Date.now(),ordinal:id};store.save(t);activate(id);return id;}
function closeTab(id){id=Number(id);if(!store.get(id))return;
 if(detached.has(id)){const popup=detached.get(id);detached.delete(id);if(!popup.isDestroyed())popup.close();}
 discard(id);store.delete(id);if(activeId===id){activeId=null;const target=store.lastActiveId();if(target)activate(target);else newTab();}emit();}
function sweep(){const now=Date.now();for(const id of Array.from(live.keys())){if(id===activeId)continue;const t=store.get(id),v=live.get(id);if(!t){discard(id);continue;}if(detached.has(id)||t.pinned||now-t.last_active<IDLE_MS||v.webContents.isLoading()||v.webContents.isCurrentlyAudible?.())continue;discard(id);}emit();}
function detachTab(id){
 id=Number(id);const row=store.get(id);
 if(!row||!win||win.isDestroyed())return false;
 const existing=detached.get(id);
 if(existing&&!existing.isDestroyed()){existing.focus();return true;}
 let view=live.get(id);
 if(!view){view=wire(toModel(row));live.set(id,view);}
 win.contentView.removeChildView(view);
 const saved=store.getMeta('windowBounds:'+id);
 let rectangle;
 try{rectangle=JSON.parse(saved);}catch{}
 const valid=rectangle&&Number.isFinite(rectangle.x)&&Number.isFinite(rectangle.y)&&Number.isFinite(rectangle.width)&&Number.isFinite(rectangle.height);
 const display=valid?screen.getDisplayMatching(rectangle):screen.getPrimaryDisplay();
 const area=display.workArea;
 const w=Math.max(500,Math.min(1400,valid?rectangle.width:1000));
 const h=Math.max(400,Math.min(1100,valid?rectangle.height:800));
 const x=valid?Math.max(area.x,Math.min(rectangle.x,area.x+area.width-200)):area.x+60;
 const y=valid?Math.max(area.y,Math.min(rectangle.y,area.y+area.height-100)):area.y+60;
 const popup=new BrowserWindow({x,y,width:w,height:h,minWidth:400,minHeight:300,title:'Hexora · '+(row.title||'ChatGPT'),backgroundColor:'#111215',autoHideMenuBar:true});
 detached.set(id,popup);
 popup.contentView.addChildView(view);
 const layout=()=>{if(!popup.isDestroyed()){const [cw,ch]=popup.getContentSize();view.setBounds({x:0,y:0,width:cw,height:ch});}};
 const saveWindow=()=>{if(!popup.isDestroyed())store.setMeta('windowBounds:'+id,JSON.stringify(popup.getBounds()));};
 popup.on('resize',()=>{layout();saveWindow();});
 popup.on('move',saveWindow);
 popup.on('closed',()=>{
  detached.delete(id);
  if(!quitting&&win&&!win.isDestroyed()&&store.get(id)){
   const active=store.get(activeId);
   if(activeId===id){win.contentView.addChildView(view);bounds();win.focus();}
   else {win.contentView.removeChildView(view);}
   emit();
  }
 });
 layout();
 if(activeId===id){
  const other=store.lastActiveId();
  const candidate=store.page(row.workspace,0,50).find(r=>r.id!==id);
  activeId=null;
  if(candidate)activate(candidate.id);
  else if(other&&other!==id)activate(other);
  else newTab(row.workspace);
 }
 popup.focus();emit();return true;
}
function openRecoveryWindow(){
 if(recoveryWindow&&!recoveryWindow.isDestroyed()){recoveryWindow.focus();return;}
 recoveryWindow=new BrowserWindow({parent:win,modal:false,show:true,width:590,height:600,minWidth:480,minHeight:500,title:'Hexora Recovery',backgroundColor:'#17181c',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 recoveryWindow.focus();
 recoveryWindow.webContents.on('did-fail-load',(_event,code,reason,url,isMainFrame)=>{if(isMainFrame){console.error('Recovery page failed:',code,reason,url);dialog.showErrorBox('Hexora Recovery failed to load',reason+' ('+code+')');}});
 recoveryWindow.loadFile('recovery-window.html').catch(err=>{console.error('Recovery window failed',err);dialog.showErrorBox('Hexora Recovery',err.message);});
 recoveryWindow.on('closed',()=>{recoveryWindow=null;});
}
function sendPage(payload){const w=typeof payload?.workspace==='string'?payload.workspace:'web';const offset=Number.isSafeInteger(payload?.offset)?payload.offset:0;return state(w,offset);}
if(hasSingleInstanceLock)app.whenReady().then(()=>{
 const dataDir=app.getPath('userData');
 try{applyPending(dataDir);}catch(err){dialog.showErrorBox('Hexora restore could not be applied',err.message);}
 try{const prefs=JSON.parse(fs.readFileSync(path.join(dataDir,'hexora-recovery-config.json'),'utf8'));if(prefs.directory)recoveryDir=prefs.directory;}catch{}
 store=new TabStore(dataDir);
 store.importLegacy(path.join(app.getPath('userData'),'hexora-tabs.json'));
 win=new BrowserWindow({width:1360,height:900,minWidth:700,minHeight:400,title:'Hexora Workspace',autoHideMenuBar:true,backgroundColor:'#111215',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 win.loadFile('toolbar.html');win.on('resize',bounds);win.webContents.on('did-finish-load',emit);
 const last=Number(store.getMeta('activeId'));if(!last||!activate(last)){const backup=store.lastActiveId();if(!backup||!activate(backup))newTab();}
 ipcMain.handle('recovery:status',()=>({directory:recoveryDir,enabled:!!(recoveryDir&&recoveryPassword),lastBackup}));
 ipcMain.handle('recovery:configure',async(_e,password)=>{
  if(typeof password!=='string'||password.length<12)throw new Error('Enter a recovery password of at least 12 characters.');
  const selection=await dialog.showOpenDialog(win,{title:'Choose an external drive or cloud-synced backup folder',properties:['openDirectory','createDirectory']});
  if(selection.canceled||!selection.filePaths[0])return{cancelled:true};
  recoveryDir=selection.filePaths[0];recoveryPassword=password;
  fs.writeFileSync(path.join(dataDir,'hexora-recovery-config.json'),JSON.stringify({directory:recoveryDir}));
  return{directory:recoveryDir};
 });
 async function backupNow(){
  if(!recoveryDir||!recoveryPassword)throw new Error('Choose a backup folder and unlock recovery first.');
  if(recoveryBusy)throw new Error('A recovery backup is already running.');
  recoveryBusy=true;
  try{
   // Synchronous SQLite snapshot is fast for small workspaces; large databases may pause the UI.
   const result=snapshot(store,recoveryDir,recoveryPassword,{});
   lastBackup={time:new Date().toISOString(),...result};
   return lastBackup;
  }finally{recoveryBusy=false;}
 }
 ipcMain.handle('recovery:backup',()=>backupNow());
 ipcMain.handle('recovery:unlock',(_e,password)=>{if(!recoveryDir)throw new Error('Choose a backup folder first.');if(typeof password!=='string'||password.length<12)throw new Error('Recovery password must be at least 12 characters.');recoveryPassword=password;return{enabled:true,directory:recoveryDir};});
 ipcMain.handle('recovery:verify',async(_e,password)=>{
  const selection=await dialog.showOpenDialog(recoveryWindow||win,{title:'Verify encrypted Hexora backup',properties:['openFile'],filters:[{name:'Hexora encrypted backups',extensions:['hxb']}]});
  if(selection.canceled||!selection.filePaths[0])return{cancelled:true};
  return verifyBackup(selection.filePaths[0],password);
 });
 ipcMain.handle('recovery:restore',async(_e,password)=>{
  const file=await dialog.showOpenDialog(win,{title:'Select an encrypted Hexora backup',properties:['openFile'],filters:[{name:'Hexora encrypted backups',extensions:['hxb']}]});
  if(file.canceled||!file.filePaths[0])return{cancelled:true};
  const result=stageRestore(file.filePaths[0],password,dataDir);
  const confirmation=await dialog.showMessageBox(win,{type:'warning',buttons:['Cancel','Restart and restore'],defaultId:0,cancelId:0,title:'Replace workspace data?',message:'Restore '+result.tabs+' saved tabs?',detail:'The current database will be archived locally. The restored backup will replace it on restart. Browser login cookies are not included.'});
  if(confirmation.response!==1){fs.rmSync(path.join(dataDir,'hexora-restore-pending.sqlite'),{force:true});fs.rmSync(path.join(dataDir,'hexora-restore-settings.json'),{force:true});return{cancelled:true};}
  app.relaunch();app.quit();return{restarting:true};
 });
 recoveryTimer=setInterval(()=>{if(recoveryPassword&&recoveryDir&&!recoveryBusy){try{backupNow();}catch(err){console.error('Hexora scheduled backup failed:',err);}}},60*60*1000);
 ipcMain.handle('tabs:page',(_e,arg)=>sendPage(arg));
 ipcMain.handle('tabs:search',(_e,term)=>store.search(term,50).map(pageRow));
 ipcMain.handle('tabs:action',(_e,action,arg)=>{
  const current=store.get(activeId);const wc=live.get(activeId)?.webContents;
  if(action==='new')newTab(typeof arg==='string'?arg:'web');
  else if(action==='activate')activate(Number(arg));
  else if(action==='close')closeTab(arg);
  else if(action==='reload'){
   if(wc){const view=live.get(activeId);win.contentView.removeChildView(view);win.contentView.addChildView(view);bounds();wc.reloadIgnoringCache();}
  }
  else if(action==='back'&&wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();
  else if(action==='forward'&&wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();
  else if(action==='open-external')shell.openExternal(current?.url||HOME);
  else if(action==='sidebar'){sidebarWidth=arg?64:330;bounds();}
  else if(action==='recovery-window'){openRecoveryWindow();}
  else if(action==='detach'){detachTab(arg||activeId);}
  else if(action==='modal'){
   modalVisible=!!arg;
   const view=live.get(activeId);
   if(view){
    if(modalVisible){win.contentView.removeChildView(view);win.webContents.focus();}
    else {win.contentView.addChildView(view);bounds();view.webContents.focus();}
   }
  }
  else if(['pin','mute','workspace'].includes(action)){
   const id=Number(action==='workspace'?arg?.id:arg),raw=store.get(id);
   if(raw){const t=toModel(raw);if(action==='pin')t.pinned=!t.pinned;if(action==='mute'){t.muted=!t.muted;live.get(id)?.webContents.setAudioMuted(t.muted);}if(action==='workspace'&&typeof arg.workspace==='string')t.workspace=arg.workspace;store.save(t);emit();}
  }
  else if(action==='suspend'){const id=Number(arg);if(id!==activeId&&!store.get(id)?.pinned)discard(id);}
  emit();return true;
 });
 setInterval(sweep,60*1000).unref();
 win.on('closed',()=>{quitting=true;for(const popup of detached.values())if(!popup.isDestroyed())popup.close();detached.clear();clearInterval(recoveryTimer);recoveryPassword=null;clearTimeout(stateTimer);win=null;for(const id of Array.from(live.keys()))discard(id);store.close();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
