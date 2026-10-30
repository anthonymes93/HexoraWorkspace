const {app,BrowserWindow,WebContentsView,ipcMain,shell} = require('electron');
const path=require('node:path');
const fs=require('node:fs');
const HOME='https://chatgpt.com/';
const TOP_HEIGHT=120, INACTIVE_MS=24*60*60*1000;
let sidebarWidth=330,win,tabs=[],activeId=null,nextId=1,saveTimer=null;
const statePath=()=>path.join(app.getPath('userData'),'hexora-tabs.json');
function validUrl(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:HOME;}catch{return HOME;}}
function saveNow(){
  if(!win||win.isDestroyed())return;
  const state={version:1,activeId,tabs:tabs.map(t=>({id:t.id,url:validUrl(t.url),title:t.title,workspace:t.workspace,pinned:t.pinned,lastActive:t.lastActive,muted:t.muted,suspended:t.suspended}))};
  try{const file=statePath();fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);}catch(err){console.error('Failed to save tabs',err);}
}
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,350);}
function snapshot(){return tabs.map(t=>({id:t.id,title:t.title,url:t.url,workspace:t.workspace,active:t.id===activeId,loading:t.loading,pinned:t.pinned,muted:t.muted,suspended:t.suspended,lastActive:t.lastActive}));}
function publish(){if(win&&!win.isDestroyed())win.webContents.send('tabs:state',snapshot());saveSoon();}
function current(){return tabs.find(t=>t.id===activeId);}
function bounds(){if(!win||win.isDestroyed())return;const [width,height]=win.getContentSize();const tab=current();if(tab?.view)tab.view.setBounds({x:sidebarWidth,y:TOP_HEIGHT,width:Math.max(0,width-sidebarWidth),height:Math.max(0,height-TOP_HEIGHT)});}
function createView(t){
 const view=new WebContentsView({webPreferences:{partition:'persist:hexora-chatgpt',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,javascript:true}});
 t.view=view;t.suspended=false;t.loading=true;
 const wc=view.webContents;
 wc.setAudioMuted(t.muted);
 wc.on('page-title-updated',(_e,title)=>{if(t.view!==view)return;t.title=(title||'ChatGPT').slice(0,100);publish();});
 wc.on('did-start-loading',()=>{if(t.view!==view)return;t.loading=true;publish();});
 wc.on('did-stop-loading',()=>{if(t.view!==view)return;t.loading=false;publish();});
 const updateUrl=()=>{if(t.view!==view)return;const url=wc.getURL();if(url.startsWith('http'))t.url=url;publish();};
 wc.on('did-navigate',updateUrl);wc.on('did-navigate-in-page',updateUrl);
 wc.on('render-process-gone',()=>{if(t.view!==view)return;t.title='Page crashed — reload';publish();});
 wc.setWindowOpenHandler(({url})=>{if(!url.startsWith('https://'))return{action:'deny'};return{action:'allow',overrideBrowserWindowOptions:{width:540,height:750,autoHideMenuBar:true,webPreferences:{partition:'persist:hexora-chatgpt',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}}};});
 wc.loadURL(validUrl(t.url)).catch(err=>{if(t.view!==view)return;t.title='Load failed: '+err.message;publish();});
}
function activate(id){
 const t=tabs.find(t=>t.id===id);if(!t||!win)return;
 const prior=current();if(prior&&prior.id!==t.id)prior.lastActive=Date.now();
 for(const other of tabs)if(other.id!==id&&other.view)win.contentView.removeChildView(other.view);
 activeId=id;t.lastActive=Date.now();
 if(!t.view)createView(t);
 win.contentView.addChildView(t.view);bounds();t.view.webContents.focus();publish();
}
function addTab(url=HOME,workspace='web'){
 const t={id:nextId++,url:validUrl(url),title:'ChatGPT',workspace:typeof workspace==='string'?workspace:'web',pinned:false,muted:false,lastActive:Date.now(),suspended:false,loading:false,view:null};
 tabs.push(t);activate(t.id);return t.id;
}
function closeTab(id){
 const index=tabs.findIndex(t=>t.id===id);if(index<0)return;
 const t=tabs[index];if(t.view){win.contentView.removeChildView(t.view);t.view.webContents.close();t.view=null;}
 tabs.splice(index,1);
 if(activeId===id){activeId=null;if(tabs.length)activate(tabs[Math.min(index,tabs.length-1)].id);else addTab();}
 else publish();
}
function suspend(t){
 if(t.id===activeId||t.pinned||!t.view)return false;
 const wc=t.view.webContents;
 if(wc.isCurrentlyAudible?.()||wc.isLoading())return false;
 t.url=validUrl(wc.getURL()||t.url);
 win.contentView.removeChildView(t.view);t.view=null;t.suspended=true;t.loading=false;wc.close();return true;
}
function sweep(){const now=Date.now();let changed=false;for(const t of tabs){if(t.id!==activeId&&!t.pinned&&now-t.lastActive>=INACTIVE_MS)changed=suspend(t)||changed;}if(changed)publish();}
function restore(){
 let saved;try{saved=JSON.parse(fs.readFileSync(statePath(),'utf8'));}catch{}
 if(!saved||!Array.isArray(saved.tabs)||saved.version!==1||!saved.tabs.length){addTab();return;}
 const unique=new Set();
 for(const s of saved.tabs.slice(0,250)){
  if(!Number.isSafeInteger(s.id)||unique.has(s.id))continue;unique.add(s.id);
  tabs.push({id:s.id,url:validUrl(s.url),title:typeof s.title==='string'?s.title.slice(0,100):'ChatGPT',workspace:typeof s.workspace==='string'?s.workspace:'web',pinned:!!s.pinned,muted:!!s.muted,lastActive:Number.isFinite(s.lastActive)?s.lastActive:Date.now(),suspended:true,loading:false,view:null});
  nextId=Math.max(nextId,s.id+1);
 }
 if(!tabs.length){addTab();return;}
 activate(tabs.some(t=>t.id===saved.activeId)?saved.activeId:tabs[0].id);
}
app.whenReady().then(()=>{
 win=new BrowserWindow({width:1360,height:900,minWidth:700,minHeight:400,title:'Hexora Workspace',autoHideMenuBar:true,backgroundColor:'#111215',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 win.loadFile('toolbar.html');win.on('resize',bounds);
 win.webContents.on('did-finish-load',publish);
 restore();setInterval(sweep,60*1000).unref();
 ipcMain.handle('tabs:action',(_event,action,id)=>{
   const t=current();
   if(action==='new')addTab(HOME,typeof id==='string'?id:'web');
   else if(action==='activate')activate(id);
   else if(action==='close')closeTab(id);
   else if(action==='reload'&&t){if(!t.view)activate(t.id);else t.view.webContents.reload();}
   else if(action==='back'&&t?.view?.webContents.navigationHistory.canGoBack())t.view.webContents.navigationHistory.goBack();
   else if(action==='forward'&&t?.view?.webContents.navigationHistory.canGoForward())t.view.webContents.navigationHistory.goForward();
   else if(action==='open-external')shell.openExternal(t?.url||HOME);
   else if(action==='sidebar'){sidebarWidth=id?64:330;bounds();}
   else if(action==='pin'){const target=tabs.find(x=>x.id===id);if(target)target.pinned=!target.pinned;}
   else if(action==='mute'){const target=tabs.find(x=>x.id===id);if(target){target.muted=!target.muted;target.view?.webContents.setAudioMuted(target.muted);}}
   else if(action==='workspace'&&id&&typeof id.id==='number'&&typeof id.workspace==='string'){const target=tabs.find(x=>x.id===id.id);if(target)target.workspace=id.workspace;}
   else if(action==='suspend'){const target=tabs.find(x=>x.id===id);if(target)suspend(target);}
   publish();
 });
 win.on('close',()=>{saveNow();});
 win.on('closed',()=>{clearTimeout(saveTimer);win=null;tabs=[];activeId=null;});
});
app.on('before-quit',()=>{clearTimeout(saveTimer);saveNow();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
