'use strict';
const {app,BrowserWindow,WebContentsView,View,session,ipcMain,shell,dialog,clipboard,safeStorage,Menu}=require('electron');
const path=require('node:path');
const {screen}=require('electron');
const {TabStore}=require('./tab-store');
const {PasswordVault}=require('./password-vault');
const fs=require('node:fs');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {workspaceForTab,projectUpdateFile,ownerFile,clearSession,codeSessionDirectory}=require('./code-session-workspace');
const {buildCompanionVsix,BRIDGE_VERSION}=require('./code-session-vsix');
// Each native VS Code tab owns its own PowerShell host and reparented window.
const nativeCodeHosts=new Map();
const nativeCodeLaunchQueue=[];
let nativeCodeLaunchingId=null;
let tabStoreClosing=false;
const VSCODE_URL='hexora-native://vscode';
const isCodeTab=t=>typeof t?.url==='string'&&/^hexora-native:\/\/vscode(?:\/[1-9]\d*)?$/.test(t.url);
const codeTabUrl=id=>VSCODE_URL+'/'+id;
const activeCodeEntry=()=>isCodeTab(store?.get(activeId))?nativeCodeHosts.get(activeId):null;
function nativeCodeCommand(message,tabId=activeId){
 const entry=nativeCodeHosts.get(tabId),proc=entry?.proc;
 if(!proc||entry.stopped||proc.exitCode!==null||proc.killed||proc.stdin?.destroyed||!proc.stdin?.writable)return false;
 try{proc.stdin.write(message+'\n',error=>{if(error&&error.code!=='EPIPE')console.error('[Native VS Code tab '+tabId+'] stdin:',error.message);});return true;}
 catch(error){console.error('[Native VS Code tab '+tabId+'] command failed:',error.message);return false;}
}
function nativeCodeBounds(tabId=activeId){
 if(!win||win.isDestroyed()||!nativeCodeHosts.get(tabId)?.ready)return;
 const [w,h]=win.getContentSize();
 nativeCodeCommand('RECT '+sidebarWidth+' '+TOP_HEIGHT+' '+Math.max(1,w-sidebarWidth)+' '+Math.max(1,h-TOP_HEIGHT),tabId);
}
let nativeCodeLifecycleTimer=null;
function scheduleNativeCodeLifecycle(reason){
 if(nativeCodeLifecycleTimer)clearTimeout(nativeCodeLifecycleTimer);
 nativeCodeLifecycleTimer=setTimeout(()=>{
  nativeCodeLifecycleTimer=null;
  const entry=activeCodeEntry();if(!entry?.ready||!entry.visible||entry.detached||!win||win.isDestroyed()||win.isMinimized())return;
  nativeCodeBounds();
  const display=screen.getDisplayMatching(win.getBounds());
  console.log('[Native VS Code] WINDOW_LIFECYCLE',reason,{displayId:display.id,scaleFactor:display.scaleFactor,windowBounds:win.getBounds(),contentSize:win.getContentSize()});
  nativeCodeCommand('GEOMETRY '+reason);
  nativeCodeCommand('RECOVER_Z');
 },90);
 nativeCodeLifecycleTimer.unref?.();
}

// Focus recovery is event-driven; avoid repeatedly stealing keyboard focus from VS Code.
function restoreNativeWebView(){if(win&&!win.isDestroyed()&&mainViewport&&!isCodeTab(store?.get(activeId))){const view=live.get(activeId);if(view&&!modalVisible){mainViewport.addChildView(view);bounds();}}}
function stopNativeCode(tabId){
 const entry=nativeCodeHosts.get(tabId);if(!entry)return;
 // QUIT restores the real VS Code window to the desktop, preserving unsaved files.
 nativeCodeCommand('QUIT',tabId);
 entry.stopped=true;entry.visible=false;nativeCodeHosts.delete(tabId);
 if(entry.proc){const proc=entry.proc;setTimeout(()=>{if(proc.exitCode===null&&!proc.killed)proc.kill();},2500).unref?.();}
 // Keep the launch lock until the terminated host actually exits, preventing HWND races.
}
function stopAllNativeCode(){for(const id of [...nativeCodeHosts.keys()])stopNativeCode(id);nativeCodeLaunchQueue.length=0;}

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
const DETACHED_HEADER=44;
let TOP_HEIGHT=120;const IDLE_MS=24*60*60*1000,MAX_LIVE=8;
let recoveryWindow=null,vault=null;
const detached=new Map();
let quitting=false;
const LAYOUT_KEY='detachedWindowIds';
function savedDetachedIds(){try{const values=JSON.parse(store.getMeta(LAYOUT_KEY)||'[]');return Array.isArray(values)?values.filter(x=>Number.isSafeInteger(x)&&x>0).slice(0,32):[];}catch{return [];}}
function setDetachedSaved(id,present){const ids=new Set(savedDetachedIds());if(present)ids.add(id);else ids.delete(id);store.setMeta(LAYOUT_KEY,JSON.stringify([...ids]));}
let mainViewport=null,win,store,activeId=null,sidebarWidth=330,live=new Map(),favicons=new Map(),loading=new Map(),stateTimer=null,modalVisible=false,recoveryPassword=null,recoveryDir=null,recoveryTimer=null,recoveryBusy=false,lastBackup=null;
const extensionPartition='persist:hexora-chatgpt';
let extensionRecords=[],extensionLoaded=new Map(),extensionSession=null,extensionConfigFile=null;
const extensionPopups=new Map();
const extensionRegistrations=new Map();
const workerRegistrationByScope=new Map();
const extensionLifecycle=new Map();
function extensionLifecycleEvent(kind,ext){
 if(!ext?.id)return;
 extensionLifecycle.set(ext.id,{...(extensionLifecycle.get(ext.id)||{}),[kind]:Date.now()});
 for(const [folder,loaded] of extensionLoaded)if(loaded.id===ext.id)diagnostic(folder,'lifecycle','Extension '+kind);
}
const extensionDiagnostics=new Map();
function diagnostic(folder,kind,message){
 const records=extensionDiagnostics.get(folder)||[];
 records.push({time:Date.now(),kind,message:String(message).slice(0,500)});
 if(records.length>40)records.shift();
 extensionDiagnostics.set(folder,records);
}
function extensionWorkerManifest(folder){
 try{const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
  return {manifestVersion:manifest.manifest_version,script:manifest.background?.service_worker||null,type:manifest.background?.type||'classic'};
 }catch(err){return {error:err.message};}
}
function extensionRegistrationInfo(folder){
 const ext=extensionLoaded.get(folder);
 const scope=ext?'chrome-extension://'+ext.id+'/':null;
 const found=scope?workerRegistrationByScope.get(scope):null;
 return {scope,observed:!!found,time:found?.time||null};
}
function extensionWorkerStatus(folder){
 const ext=extensionLoaded.get(folder);
 if(!ext||!extensionSession)return {status:'not loaded',workers:[]};
 try{
  const workers=Object.entries(extensionSession.serviceWorkers.getAllRunning()).filter(([,info])=>String(info.scope||info.scriptUrl||'').includes(ext.id));
  return {status:workers.length?'running':'not currently running',workers:workers.map(([version,info])=>({version,scope:info.scope||'',scriptUrl:info.scriptUrl||''}))};
 }catch(err){return {status:'unavailable',workers:[],error:err.message};}
}
function getExtensionDiagnostics(folder){
 const record=extensionRecords.find(x=>x.path===folder);
 if(!record)throw new Error('Extension not found.');
 return {name:record.name,events:extensionDiagnostics.get(folder)||[],popupOpen:!!extensionPopups.get(folder)&&!extensionPopups.get(folder).isDestroyed(),worker:extensionWorkerStatus(folder),manifest:extensionWorkerManifest(folder),registrations:extensionRegistrations.get(folder)||[],registrationInfo:extensionRegistrationInfo(folder),lifecycle:extensionLifecycle.get(extensionLoaded.get(folder)?.id)||null};
}
function extensionPopupPath(folder){
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 const value=manifest.action?.default_popup||manifest.browser_action?.default_popup||manifest.page_action?.default_popup;
 if(typeof value!=='string'||!value.trim())return null;
 const relative=value.replace(/^\/+/,''),absolute=path.resolve(folder,relative);
 if(!absolute.startsWith(path.resolve(folder)+path.sep)||!fs.statSync(absolute).isFile())throw new Error('Extension popup file is unavailable.');
 return relative.split(/[\\/]/).map(encodeURIComponent).join('/');
}
function closeExtensionPopup(folder){const popup=extensionPopups.get(folder);if(popup&&!popup.isDestroyed())popup.close();extensionPopups.delete(folder);}
function openExtensionPopup(folder){
 const record=extensionRecords.find(r=>r.path===folder&&r.enabled),ext=extensionLoaded.get(folder);
 if(!record||!ext)throw new Error('Extension is not enabled or loaded.');
 const previous=extensionPopups.get(folder);if(previous&&!previous.isDestroyed()){previous.focus();return true;}
 const relative=extensionPopupPath(folder);if(!relative)throw new Error('This extension does not define a popup.');
 const popup=new BrowserWindow({parent:win,width:410,height:590,minWidth:320,minHeight:350,
  title:record.name+' · Hexora',backgroundColor:'#18191e',autoHideMenuBar:true,
  webPreferences:{partition:extensionPartition,contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
 extensionPopups.set(folder,popup);
 popup.on('closed',()=>{extensionPopups.delete(folder);diagnostic(folder,'info','Popup closed');});
 const wc=popup.webContents;
 wc.on('console-message',(_event,detailsOrLevel,message)=>{
  const details=typeof detailsOrLevel==='object'?detailsOrLevel:{level:detailsOrLevel,message};
  if(['error','warning'].includes(details.level)||details.level===2||details.level===3)diagnostic(folder,'console',details.message||message||'Console warning or error');
 });
 wc.on('did-fail-load',(_e,code,description,_url,isMainFrame)=>{
  if(isMainFrame)diagnostic(folder,'load-error',description+' ('+code+')');
 });
 wc.on('render-process-gone',(_e,details)=>diagnostic(folder,'crash','Renderer terminated: '+details.reason));
 wc.on('did-finish-load',async()=>{
  diagnostic(folder,'info','Popup document loaded');
  try{
   const result=await wc.executeJavaScript("({ready:document.readyState,bodyTextLength:document.body?.innerText?.length||0,elementCount:document.body?.querySelectorAll('*').length||0})",true);
   diagnostic(folder,'dom','DOM state: '+result.ready+'; visible text characters: '+result.bodyTextLength+'; elements: '+result.elementCount);
   if(result.bodyTextLength===0)diagnostic(folder,'warning','Popup loaded with no visible text. Extension may be stalled or incompatible.');
  }catch(err){diagnostic(folder,'inspect-error',err.message);}
 });
 diagnostic(folder,'info','Opening extension popup');
 popup.webContents.setWindowOpenHandler(({url})=>/^https:\/\//.test(url)?{action:'allow'}:{action:'deny'});
 popup.loadURL('chrome-extension://'+ext.id+'/'+relative).catch(err=>{diagnostic(folder,'load-error',err.message);console.error('Extension popup load failed:',err);});
 return true;
}
function extensionList(){return extensionRecords.map(r=>{const manifest=extensionWorkerManifest(r.path);const worker=manifest.manifestVersion===3&&!!manifest.script;return {name:r.name,version:r.version,path:r.path,enabled:r.enabled,id:extensionLoaded.get(r.path)?.id||null,error:r.error||null,popup:(()=>{try{return !!extensionPopupPath(r.path);}catch{return false;}})(),compatibilityNote:worker?'Uses a Manifest V3 service worker. Electron may load it without supporting its functionality.':'Extension functionality has not been verified.'};});}
function persistExtensions(){if(extensionConfigFile)fs.writeFileSync(extensionConfigFile,JSON.stringify(extensionRecords.map(({path,name,version,enabled})=>({path,name,version,enabled})),null,2));}
async function loadUnpacked(record){
 const ext=await extensionSession.extensions.loadExtension(record.path,{allowFileAccess:false});
 extensionLoaded.set(record.path,ext);record.name=ext.name;record.version=ext.version;record.error=null;
 diagnostic(record.path,'extension','Extension loaded; checking background worker manifest');
 const lifecycle=extensionLifecycle.get(ext.id);
 if(lifecycle)diagnostic(record.path,'lifecycle','Observed extension lifecycle: '+Object.keys(lifecycle).join(', '));
 else diagnostic(record.path,'lifecycle','Extension readiness not yet observed');
 const scope='chrome-extension://'+ext.id+'/';
 const registration=workerRegistrationByScope.get(scope);
 if(registration){
  extensionRegistrations.set(record.path,[registration]);
  diagnostic(record.path,'registration','Registration observed during extension loading');
 }else diagnostic(record.path,'registration-info','No registration-completed event observed so far (event may be delayed or not emitted).');
 return ext;
}
async function restoreExtensions(){
 try{const data=JSON.parse(fs.readFileSync(extensionConfigFile,'utf8'));extensionRecords=Array.isArray(data)?data.filter(r=>typeof r.path==='string'&&path.isAbsolute(r.path)).map(r=>({...r,enabled:!!r.enabled})):[];}catch{extensionRecords=[];}
 for(const r of extensionRecords)if(r.enabled){try{await loadUnpacked(r);}catch(err){r.error=err.message;console.error('Extension restore failed',r.path,err);}}
}
function userWebsiteUrl(value){
 if(typeof value!=='string'||!value.trim()||value.length>2048)throw new Error('Enter a valid website URL.');
 const candidate=value.trim();const url=new URL(/^[a-zA-Z][\w+.-]*:\/\//.test(candidate)?candidate:'https://'+candidate);
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('Only standard HTTP or HTTPS website addresses are allowed.');
 return url.href;
}
function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:HOME;}catch{return HOME;}}
function tabDomain(row){try{const u=new URL(row.url);return ['https:','http:'].includes(u.protocol)?u.hostname.toLowerCase():null;}catch{return null;}}
function panelPreference(id){const row=store.get(id);if(!row)return {mode:'wide',source:'default',domain:null,tabOverride:null,domainOverride:null};const domain=tabDomain(row);
 const tab=store.getMeta('panelMode:'+id),domainSetting=domain?store.getMeta('panelDomain:'+domain):null;
 const tabOverride=['wide','thin'].includes(tab)?tab:null,domainOverride=['wide','thin'].includes(domainSetting)?domainSetting:null;
 return {mode:tabOverride||domainOverride||'wide',source:tabOverride?'tab':domainOverride?'domain':'default',domain,tabOverride,domainOverride};}
function panelMode(id){return panelPreference(id).mode;}
function chromeMode(id){return store.getMeta('chromeMode:'+id)==='true';}
function chromeUserAgent(wc){const ua=wc.getUserAgent();return ua.replace(/\s+(?:Electron|hexora-workspace)\/[^\s]+/gi,'').replace(/\s{2,}/g,' ').trim();}
// ChatGPT can restore an unsent composer draft from origin-wide storage.
// Keep the visible editor associated with this WebContents, not other tabs.
// The user's actual cookies and login session remain shared.
const CHATGPT_DRAFT_GUARD=`(()=>{
 if(window.__hexoraDraftGuard)return;
 window.__hexoraDraftGuard=true;
 let ownDraft=__HEXORA_SAVED_DRAFT__,userEdited=false,writing=false,currentEditor=null;
 window.__hexoraReadDraft=()=>ownDraft;
 const selector='#prompt-textarea,[data-testid="composer-input"],textarea[placeholder*="Message"],[contenteditable="true"][role="textbox"]';
 const read=el=>el?.isContentEditable?(el.innerText||''):(el?.value||'');
 const write=(el,value)=>{
  if(!el||read(el)===value)return;
  writing=true;
  if(el.isContentEditable){
   el.textContent=value;
   el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  }else{
   const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
   if(setter)setter.call(el,value);else el.value=value;
   el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  writing=false;
 };
 const find=()=>document.querySelector(selector);
 document.addEventListener('input',e=>{
  if(writing||!e.isTrusted)return;
  const el=e.target;
  if(el?.matches?.(selector)||el?.closest?.('#prompt-textarea,[data-testid="composer-input"]')){
   ownDraft=read(el);userEdited=true;
  }
 },true);
 document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&e.target?.closest?.('#prompt-textarea,[data-testid="composer-input"]')){
   ownDraft='';userEdited=false;
  }
 },true);
 document.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send message"]')){
   ownDraft='';userEdited=false;
  }
 },true);
 const timer=setInterval(()=>{
  if(!location.hostname.endsWith('chatgpt.com')){clearInterval(timer);return;}
  const el=find();if(!el||!el.isConnected)return;
  if(el!==currentEditor){currentEditor=el;write(el,ownDraft);}
  else if(read(el)!==ownDraft&&document.activeElement!==el)write(el,ownDraft);
 },400);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();`;
function originOf(url){try{return new URL(url).origin;}catch{return null;}}
function rememberFavicon(tabId,pageUrl,iconUrl){
 if(tabStoreClosing||quitting||!store)return;
 const origin=originOf(pageUrl);
 if(!origin||!/^https?:\/\//.test(origin)||!/^https?:\/\//.test(iconUrl))return;
 favicons.set(tabId,{url:iconUrl,origin});
 store.setMeta('favicon:'+origin,iconUrl);
 emit();
}

function wire(t){const view=new WebContentsView({webPreferences:{partition:'persist:hexora-chatgpt',preload:path.join(__dirname,'site-vault-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,javascript:true}});const wc=view.webContents;
 wc.setAudioMuted(!!t.muted);
 if(chromeMode(t.id))wc.setUserAgent(chromeUserAgent(wc));
 view.setBackgroundColor('#111215');
 wc.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{if(isMainFrame)console.error('[Hexora] Page load failed:',code,description,url);});
 const update=(title=false)=>{if(tabStoreClosing||quitting)return;const row=store.get(t.id);if(!row)return;if(title)row.title=wc.getTitle()?.slice(0,100)||row.title;const url=wc.getURL();if(/^https?:/.test(url))row.url=url;store.save(toModel(row));emit();};
 wc.on('page-favicon-updated',(_event,icons)=>{
  const url=icons.find(candidate=>{try{const u=new URL(candidate);return ['https:','http:','data:'].includes(u.protocol);}catch{return false;}});
  if(url)rememberFavicon(t.id,wc.getURL(),url);
 });
 wc.on('page-title-updated',()=>{if(tabStoreClosing||quitting)return;update(true);store.recordVisit(wc.getURL(),wc.getTitle(),t.id);});
 wc.on('did-navigate',()=>{if(tabStoreClosing||quitting)return;if(favicons.get(t.id)?.origin!==originOf(wc.getURL()))favicons.delete(t.id);update();store.recordVisit(wc.getURL(),wc.getTitle(),t.id);});
 wc.on('did-navigate-in-page',()=>{if(tabStoreClosing||quitting)return;update();store.recordVisit(wc.getURL(),wc.getTitle(),t.id);});
 wc.on('did-start-loading',()=>{loading.set(t.id,true);emit();});
 wc.on('did-stop-loading',()=>{loading.delete(t.id);emit();});
 const draftKey='chatgptDraft:'+t.id;
 let draftBusy=false;
 const draftTimer=setInterval(async()=>{
  if(draftBusy||wc.isDestroyed()||!wc.getURL().startsWith('https://chatgpt.com/'))return;
  draftBusy=true;
  try{
   const value=await wc.executeJavaScript('window.__hexoraReadDraft?.()');
   if(typeof value==='string'&&value!==(store.getMeta(draftKey)||''))store.setMeta(draftKey,value);
  }catch{}finally{draftBusy=false;}
 },250);
 wc.once('destroyed',()=>clearInterval(draftTimer));
 wc.on('dom-ready',()=>{
  if(!wc.getURL().startsWith('https://chatgpt.com/'))return;
  const initial=JSON.stringify(store.getMeta(draftKey)||'');
  wc.executeJavaScript(CHATGPT_DRAFT_GUARD.replace('__HEXORA_SAVED_DRAFT__',initial)).catch(err=>console.warn('Draft restore unavailable:',err.message));
 });
 wc.on('render-process-gone',()=>{loading.delete(t.id);emit();});
 wc.setWindowOpenHandler(({url})=>/^https:\/\//.test(url)?{action:'allow',overrideBrowserWindowOptions:{width:540,height:750,autoHideMenuBar:true,webPreferences:{partition:'persist:hexora-chatgpt',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}}}:{action:'deny'});
 wc.loadURL(safeUrl(t.url)).catch(err=>console.error('Tab load error',err));
 return view;
}
function toModel(r){return{id:r.id,url:isCodeTab(r)?r.url:safeUrl(r.url),title:r.title||'ChatGPT',workspace:r.workspace||'web',pinned:!!r.pinned,muted:!!r.muted,lastActive:r.last_active??r.lastActive??Date.now(),ordinal:r.ordinal||r.id};}
function discard(id){const view=live.get(id);if(!view)return;live.delete(id);const pop=detached.get(id);if(pop&&!pop.isDestroyed())pop.contentView.removeChildView(view);else if(mainViewport)mainViewport.removeChildView(view);loading.delete(id);view.webContents.close();}
// Clip the native web view to the available viewport while keeping its internal layout stable.
// The right edge stays anchored to the window; the left portion is revealed/hidden by the panel.
function bounds(){
 if(!win||win.isDestroyed()||!mainViewport)return;
 const [w,h]=win.getContentSize();
 const visibleWidth=Math.max(0,w-sidebarWidth),visibleHeight=Math.max(0,h-TOP_HEIGHT);
 mainViewport.setBounds({x:sidebarWidth,y:TOP_HEIGHT,width:visibleWidth,height:visibleHeight});
 const view=live.get(activeId);
 if(view){
  // Fill the visible viewport exactly: no negative offsets, clipped gray gaps,
  // or late correction when the workspace panel finishes moving.
  view.setBounds({x:0,y:0,width:visibleWidth,height:visibleHeight});
 }
 nativeCodeBounds();
 win.webContents.send('sidebar:frame',sidebarWidth,sidebarTransitioning,sidebarTransitionTarget);
}
let sidebarAnimation=null,sidebarTransitioning=false,sidebarTransitionTarget=null;
function setSidebarWidth(collapsed){
 const saved=Math.max(220,Math.min(560,Number(store?.getMeta('sidebarLastExpandedWidth'))||Number(store?.getMeta('sidebarCustomWidth'))||330));
 const start=sidebarWidth,target=collapsed?64:saved;
 if(sidebarAnimation){clearInterval(sidebarAnimation);sidebarAnimation=null;}
 sidebarTransitioning=start!==target;
 sidebarTransitionTarget=sidebarTransitioning?target:null;
 if(start===target){bounds();return;}
 // Resize the embedded browser together with the panel on every frame.
 // Geometry is contiguous: viewport and web content always share the same edges.
 bounds();
 const began=performance.now(),duration=792;
 const ease=t=>t*t*(3-2*t);
 function frame(){
  const progress=Math.min(1,(performance.now()-began)/duration);
  const next=progress===1?target:Math.round(start+(target-start)*ease(progress));
  if(next!==sidebarWidth){sidebarWidth=next;}
  bounds();
  if(progress===1){clearInterval(sidebarAnimation);sidebarAnimation=null;sidebarWidth=target;sidebarTransitioning=false;sidebarTransitionTarget=null;bounds();}
 }
 sidebarAnimation=setInterval(frame,16);
 frame();
}

function pageRow(r){const codeProject=isCodeTab(r)?store.getCodeProject(r.id)?.project_path||null:null;
 return{id:r.id,url:r.url,nativeCode:isCodeTab(r),nativeCodeProject:codeProject,nativeCodeProjectMissing:!!codeProject&&!fs.existsSync(codeProject),title:store.getMeta('tabCustomTitle:'+r.id)||r.title,workspace:r.workspace,pinned:!!r.pinned,muted:!!r.muted,lastActive:r.last_active,ordinal:r.ordinal,favicon:(favicons.get(r.id)?.origin===originOf(r.url)?favicons.get(r.id)?.url:null)||store.getMeta('favicon:'+originOf(r.url))||null,faviconFallback:(()=>{try{const u=new URL(r.url);return ['http:','https:'].includes(u.protocol)?u.origin+'/favicon.ico':null;}catch{return null;}})(),active:r.id===activeId,detached:detached.has(r.id),loading:!!loading.get(r.id),suspended:isCodeTab(r)?false:!live.has(r.id),chromeMode:chromeMode(r.id),panelMode:panelMode(r.id),panelPreference:panelPreference(r.id)};}
function state(workspace='web',offset=0){const active=activeId?store.get(activeId):null;return{activeId,total:store.total(),counts:store.counts(),tabs:store.page(workspace,offset,50).map(pageRow),active:active?.workspace===workspace?active:null,activePanelMode:activeId?panelMode(activeId):'wide',stackData:store.stacks(workspace),offset};}
function emit(){if(!win||win.isDestroyed())return;clearTimeout(stateTimer);stateTimer=setTimeout(()=>{if(!win||win.isDestroyed())return;win.webContents.send('tabs:changed');},70);}
function activate(id){
 const row=store.get(Number(id));if(!row)return false;
 if(detached.has(row.id)){const popup=detached.get(row.id);if(!popup.isDestroyed()){if(popup.isMinimized())popup.restore();popup.focus();return true;}}
 if(isCodeTab(store.get(activeId))&&activeId!==row.id)hideNativeCode(activeId);
 if(!isCodeTab(row))store.setMeta('nativeCodeLastWebId',String(row.id));
 for(const [otherId,view] of live)if(otherId!==row.id&&!detached.has(otherId))mainViewport.removeChildView(view);
 activeId=row.id;store.setMeta('workspaceActive:'+row.workspace,String(row.id));const t=toModel(row);t.lastActive=Date.now();store.save(t);store.setMeta('activeId',String(row.id));
 if(isCodeTab(row)){if(!modalVisible)showNativeCode();else hideNativeCode();evict();emit();return true;}
 let view=live.get(row.id);if(!view){view=wire(t);live.set(row.id,view);}
 if(!modalVisible){mainViewport.addChildView(view);bounds();view.webContents.focus();}
 evict();emit();return true;
}

function openCodeTab(workspace='web'){
 if(process.platform!=='win32')throw Error('Native VS Code requires Windows.');
 const id=store.nextId();
 const count=store.search(VSCODE_URL,100).filter(isCodeTab).length+1;
 const row={id,url:codeTabUrl(id),title:count===1?'Visual Studio Code':'Visual Studio Code '+count,workspace:typeof workspace==='string'&&workspace.length<=80?workspace:'web',pinned:false,muted:false,lastActive:Date.now(),ordinal:id};
 store.save(row);activate(id);
 return {id,workspace:row.workspace,active:true};
}
function activateWebFallback(excludedId){
 const previous=store.get(Number(store.getMeta('nativeCodeLastWebId'))),workspace=store.get(excludedId)?.workspace||'web';
 const candidate=(previous&&!isCodeTab(previous)?previous:null)||store.page(workspace,0,50).find(t=>!isCodeTab(t))||store.page('web',0,50).find(t=>!isCodeTab(t));
 if(candidate)activate(candidate.id);else newTab(workspace);
}
function hideNativeCode(tabId=activeId){
 const entry=nativeCodeHosts.get(tabId);if(!entry)return;
 entry.visible=false;if(entry.ready&&!entry.detached)nativeCodeCommand('HIDE',tabId);
}
function showNativeCode(tabId=activeId){
 if(!isCodeTab(store?.get(tabId))||activeId!==tabId||modalVisible)return;
 let entry=nativeCodeHosts.get(tabId);
 if(!entry){queueNativeCodeLaunch(tabId);return;}
 if(!entry.ready)return;
 if(entry.detached){entry.detached=false;nativeCodeCommand('ATTACH',tabId);}
 entry.visible=true;nativeCodeBounds(tabId);
 nativeCodeCommand('SHOW',tabId);nativeCodeCommand('RECOVER_Z',tabId);
 const current=entry;
 const timer=setTimeout(()=>{if(nativeCodeHosts.get(tabId)===current&&current.visible&&!current.detached&&activeId===tabId)nativeCodeCommand('FOCUS',tabId);},180);
 timer.unref?.();
}
function queueNativeCodeLaunch(tabId){
 if(nativeCodeHosts.has(tabId)||!isCodeTab(store?.get(tabId)))return;
 nativeCodeHosts.set(tabId,{tabId,proc:null,ready:false,visible:false,detached:false,stopped:false});
 nativeCodeLaunchQueue.push(tabId);pumpNativeCodeLaunchQueue();
}
function pumpNativeCodeLaunchQueue(){
 if(nativeCodeLaunchingId!==null||quitting||!win||win.isDestroyed())return;
 while(nativeCodeLaunchQueue.length){
  const tabId=nativeCodeLaunchQueue.shift(),entry=nativeCodeHosts.get(tabId);
  if(!entry||entry.stopped||!isCodeTab(store?.get(tabId)))continue;
  nativeCodeLaunchingId=tabId;startNativeCodeHost(tabId,entry);return;
 }
}
// Read project updates written by the VS Code companion. Syncing on an
// interval (including at startup) also covers quick Hexora shutdowns: a
// project captured just before exit must not be missed.
function syncNativeCodeProjects(){
 if(!store||tabStoreClosing||quitting)return;
 let filenames;
 const directory=codeSessionDirectory(app.getPath('userData'));
 try{filenames=fs.readdirSync(directory).filter(name=>/^tab-[1-9]\\d*\\.project\\.json$/.test(name));}
 catch(error){if(error.code!=='ENOENT')console.warn('[Native VS Code] Project scan:',error.message);return;}
 for(const filename of filenames){
  const tabId=Number(filename.match(/^tab-(\\d+)/)?.[1]);
  if(!Number.isSafeInteger(tabId)||tabId<1||!isCodeTab(store.get(tabId)))continue;
  const entry=nativeCodeHosts.get(tabId);
  if(entry?.ignoreProjectSync)continue;
  try{
   const file=projectUpdateFile(app.getPath('userData'),tabId);
   if(fs.statSync(file).size>8192)continue;
   const data=JSON.parse(fs.readFileSync(file,'utf8'));
   if(data?.version!==1||typeof data.ownerToken!=='string'||data.ownerToken.length<16||
    data.ownerToken!==fs.readFileSync(ownerFile(app.getPath('userData'),tabId),'utf8'))continue;
   const project=data.projectPath;
   if(typeof project!=='string'||project.length>32767||!path.isAbsolute(project))continue;
   if(!fs.statSync(project).isDirectory())continue;
   if(store.getCodeProject(tabId)?.project_path===project)continue;
   store.setCodeProject(tabId,project);
   if(!store.getMeta('tabCustomTitle:'+tabId)){
    const row=toModel(store.get(tabId));
    row.title=('VS Code · '+path.basename(project)).slice(0,100);
    store.save(row);
   }
   emit();
   console.log('[Native VS Code tab '+tabId+'] Project automatically saved:',project);
  }catch(error){
   if(error.code!=='ENOENT')console.warn('[Native VS Code tab '+tabId+'] Ignoring invalid project update:',error.message);
  }
 }
}
function startNativeCodeHost(tabId,entry){
 const script=path.join(__dirname,'experiments','vscode-hexora-host.ps1');
 const hwnd=win.getNativeWindowHandle().readBigUInt64LE(0).toString();
 // Each tab uses its own saved project path. Passing an argument vector to
 // PowerShell (rather than interpolating into a command) avoids shell injection.
 const configured=store.getCodeProject(tabId)?.project_path;
 let projectPath=null;
 try{
  const projectFolder=configured&&fs.existsSync(configured)&&fs.statSync(configured).isDirectory()?configured:null;
  // Always launch a stable .code-workspace, even when a user hasn't chosen
  // any folder yet. The companion can then capture a later folder selection.
  projectPath=workspaceForTab(app.getPath('userData'),tabId,projectFolder);
 }catch(error){console.warn('[Native VS Code tab '+tabId+'] Could not prepare session workspace:',error.message);}
 let companionVsix=null;
 if(projectPath&&store.getMeta('nativeCodeBridgeInstalledVersion')!==BRIDGE_VERSION){
  try{companionVsix=buildCompanionVsix(codeSessionDirectory(app.getPath('userData')));}
  catch(error){console.warn('[Native VS Code] Session companion packaging failed:',error.message);}
 }
 let proc;
 try{proc=spawn('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',script,'-ParentHwnd',hwnd,...(projectPath?['-ProjectPath',projectPath]:[]),...(companionVsix?['-CompanionVsix',companionVsix]:[])],{stdio:['pipe','pipe','pipe'],windowsHide:true});}
 catch(error){console.error('[Native VS Code tab '+tabId+'] spawn:',error.message);nativeCodeHosts.delete(tabId);nativeCodeLaunchingId=null;setImmediate(pumpNativeCodeLaunchQueue);return;}
 entry.proc=proc;
 let stdoutBuffer='',finished=false;
 const release=()=>{if(nativeCodeLaunchingId===tabId){nativeCodeLaunchingId=null;setImmediate(pumpNativeCodeLaunchQueue);}};
 const failed=()=>{
  if(finished)return;finished=true;
  if(nativeCodeHosts.get(tabId)===entry){nativeCodeHosts.delete(tabId);entry.stopped=true;if(!quitting)emit();}
  release();
  if(win&&!win.isDestroyed()&&activeId===tabId)win.webContents.send('native-code:stopped',{tabId});
 };
 proc.stdin.on('error',error=>console.error('[Native VS Code tab '+tabId+'] stdin pipe:',error.message));
 proc.stdout.on('data',chunk=>{
  stdoutBuffer+=String(chunk);if(stdoutBuffer.length>65536)stdoutBuffer=stdoutBuffer.slice(-32768);
  let idx;
  while((idx=stdoutBuffer.indexOf('\n'))!==-1){
   const line=stdoutBuffer.slice(0,idx).trim();stdoutBuffer=stdoutBuffer.slice(idx+1);
   if(!line)continue;
   console.log('[Native VS Code tab '+tabId+']',line);
   if(line==='COMPANION_INSTALLED'&&!tabStoreClosing)store.setMeta('nativeCodeBridgeInstalledVersion',BRIDGE_VERSION);
   if(line==='READY'&&!entry.ready&&nativeCodeHosts.get(tabId)===entry){
    entry.ready=true;release();
    if(activeId===tabId&&!modalVisible&&!entry.detached)showNativeCode(tabId);
    else nativeCodeCommand('HIDE',tabId);
    emit();
   }
  }
 });
 proc.stderr.on('data',data=>console.error('[Native VS Code tab '+tabId+']',String(data).trim()));
 proc.on('error',error=>{console.error('[Native VS Code tab '+tabId+'] host error:',error.message);failed();});
 proc.on('exit',(exitCode,signal)=>{
  console.error('[Native VS Code tab '+tabId+'] host exited:',{code:exitCode,signal});
  if(stdoutBuffer.trim())console.log('[Native VS Code tab '+tabId+']',stdoutBuffer.trim());
  failed();
 });
}
function evict(){if(live.size<=MAX_LIVE)return;const candidates=Array.from(live.keys()).filter(id=>id!==activeId&&!detached.has(id)&&!store.get(id)?.pinned);
 candidates.sort((a,b)=>(store.get(a)?.last_active||0)-(store.get(b)?.last_active||0));
 while(live.size>MAX_LIVE&&candidates.length)discard(candidates.shift());}
function newTab(workspace='web',url=HOME,afterId=null){const id=store.nextId(),t={id,title:'New tab',url:safeUrl(url),workspace:typeof workspace==='string'?workspace:'web',pinned:false,muted:false,lastActive:Date.now(),ordinal:id};if(afterId&&store.get(afterId)?.workspace===t.workspace)store.insertAfter(t,afterId);else store.save(t);activate(id);return id;}
function closeTab(id){id=Number(id);favicons.delete(id);const closing=store.get(id);if(!closing)return;
 if(isCodeTab(closing)){
  stopNativeCode(id);
  try{clearSession(app.getPath('userData'),id);}catch(error){console.warn('Could not clear VS Code session',id,error.message);}
 }
 if(detached.has(id)){const popup=detached.get(id);setDetachedSaved(id,false);detached.delete(id);if(!popup.isDestroyed())popup.close();}
 discard(id);store.delete(id);if(activeId===id){activeId=null;const sameWorkspace=store.page(closing.workspace,0,50).find(t=>!detached.has(t.id));const target=sameWorkspace?.id||store.lastActiveId();if(target)activate(target);else newTab(closing.workspace);}emit();}
function sweep(){const now=Date.now();for(const id of Array.from(live.keys())){if(id===activeId)continue;const t=store.get(id),v=live.get(id);if(!t){discard(id);continue;}if(detached.has(id)||t.pinned||now-t.last_active<IDLE_MS||v.webContents.isLoading()||v.webContents.isCurrentlyAudible?.())continue;discard(id);}emit();}
function detachTab(id){
 id=Number(id);const row=store.get(id);
 if(!row||!win||win.isDestroyed())return false;
 if(isCodeTab(row)){const entry=nativeCodeHosts.get(id);if(!entry?.ready)return false;if(!entry.detached){entry.detached=true;entry.visible=false;nativeCodeCommand('DETACH',id);}if(activeId===id)activateWebFallback(id);return true;}
 const existing=detached.get(id);
 if(existing&&!existing.isDestroyed()){existing.focus();return true;}
 let view=live.get(id);
 if(!view){view=wire(toModel(row));live.set(id,view);}
 mainViewport.removeChildView(view);
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
 const popup=new BrowserWindow({x,y,width:w,height:h,minWidth:400,minHeight:300,title:'Hexora · '+(row.title||'ChatGPT'),backgroundColor:'#111215',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 popup.hexoraTabId=id;
 popup.loadFile('detached.html',{query:{tab:String(id)}});
 popup.webContents.on('did-finish-load',()=>popup.webContents.send('detached:owner',{id:popup.hexoraTabId,title:store.get(popup.hexoraTabId)?.title||'ChatGPT'}));
 detached.set(id,popup);
 setDetachedSaved(id,true);
 popup.contentView.addChildView(view);
 const layout=()=>{if(!popup.isDestroyed()){const [cw,ch]=popup.getContentSize();view.setBounds({x:0,y:DETACHED_HEADER,width:cw,height:Math.max(0,ch-DETACHED_HEADER)});}};
 const saveWindow=()=>{if(!popup.isDestroyed())store.setMeta('windowBounds:'+popup.hexoraTabId,JSON.stringify(popup.getBounds()));};
 popup.on('resize',()=>{layout();saveWindow();});
 popup.on('move',saveWindow);
 popup.on('close',()=>{
  saveWindow();
  const current=live.get(popup.hexoraTabId);if(current)popup.contentView.removeChildView(current);
 });
 popup.on('closed',()=>{
  const currentId=popup.hexoraTabId;detached.delete(currentId);
  if(!quitting)setDetachedSaved(currentId,false);
  if(!quitting&&win&&!win.isDestroyed()&&store.get(currentId)){
   if(activeId===currentId){const current=live.get(currentId);if(current)mainViewport.addChildView(current);bounds();win.focus();}
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

function dockTab(id){
 id=Number(id);const popup=detached.get(id);if(!popup||popup.isDestroyed())return false;
 const view=live.get(id);if(view)popup.contentView.removeChildView(view);
 popup.close();
 activate(id);return true;
}
function swapDetached(source,target){
 source=Number(source);target=Number(target);
 if(!Number.isSafeInteger(source)||!Number.isSafeInteger(target)||source===target||!store.get(source)||!store.get(target))return false;
 const dest=detached.get(target);if(!dest||dest.isDestroyed())return false;
 const other=detached.get(source);
 const destView=live.get(target);if(!destView)return false;
 let sourceView=live.get(source);
 if(!sourceView){sourceView=wire(toModel(store.get(source)));live.set(source,sourceView);}
 dest.contentView.removeChildView(destView);
 if(other&&!other.isDestroyed()){
  other.contentView.removeChildView(sourceView);
  other.contentView.addChildView(destView);
  other.hexoraTabId=target;
  detached.set(target,other);
  other.webContents.send('detached:owner',{id:target,title:store.get(target).title});
  other.setTitle('Hexora · '+store.get(target).title);
  const [ow,oh]=other.getContentSize();destView.setBounds({x:0,y:DETACHED_HEADER,width:ow,height:Math.max(0,oh-DETACHED_HEADER)});
 }else{
  detached.delete(target);setDetachedSaved(target,false);
 }
 dest.contentView.addChildView(sourceView);
 dest.hexoraTabId=source;
 detached.set(source,dest);setDetachedSaved(source,true);
 dest.webContents.send('detached:owner',{id:source,title:store.get(source).title});
 dest.setTitle('Hexora · '+store.get(source).title);
 const [dw,dh]=dest.getContentSize();sourceView.setBounds({x:0,y:DETACHED_HEADER,width:dw,height:Math.max(0,dh-DETACHED_HEADER)});
 if(!other||other.isDestroyed()){
  // The replaced tab returns to the main workspace; avoid destroying its live browser view.
  if(activeId===source){activeId=null;const candidate=store.page(store.get(source).workspace,0,50).find(r=>r.id!==source&&!detached.has(r.id));if(candidate)activate(candidate.id);else newTab(store.get(source).workspace);}
  activate(target);
 }else{
  setDetachedSaved(target,true);
  if(activeId===source){activeId=null;const candidate=store.page('web',0,50).find(r=>!detached.has(r.id));if(candidate)activate(candidate.id);else newTab();}
 }
 emit();return true;
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
 vault=new PasswordVault(dataDir);
 vault.restoreDeviceUnlock(safeStorage);
 try{applyPending(dataDir);}catch(err){dialog.showErrorBox('Hexora restore could not be applied',err.message);}
 try{const prefs=JSON.parse(fs.readFileSync(path.join(dataDir,'hexora-recovery-config.json'),'utf8'));if(prefs.directory)recoveryDir=prefs.directory;}catch{}
 extensionConfigFile=path.join(dataDir,'hexora-extensions.json');
 extensionSession=session.fromPartition(extensionPartition);
 extensionSession.extensions.on('extension-loaded',(_e,ext)=>extensionLifecycleEvent('loaded',ext));
 extensionSession.extensions.on('extension-ready',(_e,ext)=>extensionLifecycleEvent('ready',ext));
 extensionSession.extensions.on('extension-unloaded',(_e,ext)=>extensionLifecycleEvent('unloaded',ext));
 extensionSession.serviceWorkers.on('registration-completed',(_event,details)=>{
  const scope=String(details.scope||'');
  if(scope)workerRegistrationByScope.set(scope,{scope,time:Date.now()});
  for(const [folder,ext] of extensionLoaded){
   if(scope.includes(ext.id)){
    const entries=extensionRegistrations.get(folder)||[];
    entries.push({time:Date.now(),scope});extensionRegistrations.set(folder,entries.slice(-10));
    diagnostic(folder,'registration','Service worker registered');
   }
  }
 });
 extensionSession.serviceWorkers.on('console-message',(_event,details)=>{
  let info;try{info=extensionSession.serviceWorkers.getInfoFromVersionID(details.versionId);}catch{return;}
  const url=String(info?.scope||info?.scriptUrl||details.sourceUrl||'');
  for(const [folder,ext] of extensionLoaded){if(url.includes(ext.id)&&details.level>=2)diagnostic(folder,'worker',details.message||'Worker warning or error');}
 });
 extensionSession.serviceWorkers.on('running-status-changed',details=>{
  let info;try{info=extensionSession.serviceWorkers.getInfoFromVersionID(details.versionId);}catch{return;}
  for(const [folder,ext] of extensionLoaded)if(String(info?.scope||info?.scriptUrl||'').includes(ext.id))diagnostic(folder,'worker-status',details.runningStatus);
 });
 restoreExtensions().catch(err=>console.error('Extension initialization failed:',err));
 store=new TabStore(dataDir);
 store.importLegacy(path.join(app.getPath('userData'),'hexora-tabs.json'));
 // Apply any project saved by VS Code immediately before the prior shutdown,
 // before activating its native tab and regenerating its workspace file.
 syncNativeCodeProjects();
 sidebarWidth=Math.max(64,Math.min(560,Number(store.getMeta('sidebarCustomWidth'))||330));
 win=new BrowserWindow({width:1360,height:900,minWidth:700,minHeight:400,title:'Hexora Workspace',autoHideMenuBar:true,backgroundColor:'#111215',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 mainViewport=new View();win.contentView.addChildView(mainViewport);
 win.on('focus',()=>{const entry=activeCodeEntry();if(entry?.ready&&entry.visible&&!entry.detached){nativeCodeCommand('TRACE HEXORA_FOCUS_BEFORE');nativeCodeCommand('RESTORE');nativeCodeCommand('RECOVER_Z');nativeCodeCommand('WATCH_MOUSE');}});win.on('blur',()=>{const entry=activeCodeEntry();if(entry?.ready&&entry.visible&&!entry.detached)nativeCodeCommand('DIAG HEXORA_BLUR');});win.on('resize',bounds);
 for(const lifecycleEvent of ['restore','maximize','unmaximize','moved','resized']){
  win.on(lifecycleEvent,()=>scheduleNativeCodeLifecycle(lifecycleEvent));
 }
 win.webContents.on('did-finish-load',emit);
 const last=Number(store.getMeta('activeId'));if(!last||!activate(last)){const backup=store.lastActiveId();if(!backup||!activate(backup))newTab();}
 // Reopen each detached tab at its saved screen position after the primary workspace starts.
 // Missing/deleted tab IDs are cleaned up, and one bad window cannot prevent startup.
 for(const id of savedDetachedIds()){
  if(!store.get(id)){setDetachedSaved(id,false);continue;}
  try{detachTab(id);}catch(err){console.error('Could not restore detached window',id,err);}
 }
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
 ipcMain.handle('extensions:list',()=>extensionList());
 ipcMain.handle('extensions:diagnostics',(_e,folder)=>getExtensionDiagnostics(folder));
 ipcMain.handle('extensions:probe-worker',async(_e,folder)=>{
  const ext=extensionLoaded.get(folder),record=extensionRecords.find(r=>r.path===folder);
  if(!record||!ext)throw new Error('Enable extension first.');
  const manifest=extensionWorkerManifest(folder);
  if(!manifest.script){diagnostic(folder,'probe','No background service worker declared in manifest');return getExtensionDiagnostics(folder);}
  const scope='chrome-extension://'+ext.id+'/';
  const known=workerRegistrationByScope.has(scope);
  diagnostic(folder,'probe','Extension scope: '+scope+'; registration event observed: '+known);
  const lifecycle=extensionLifecycle.get(ext.id);
  diagnostic(folder,'probe','Electron lifecycle: '+(lifecycle?Object.keys(lifecycle).join(', '):'not observed'));
  if(!known)diagnostic(folder,'compatibility','No worker registration event observed. Electron does not guarantee support for arbitrary Manifest V3 extensions; startup may fail because no registered worker exists.');
  diagnostic(folder,'probe','Requesting worker startup (may fail if unregistered)');
  try{
   if(typeof extensionSession.serviceWorkers.startWorkerForScope!=='function')throw new Error('This Electron version has no startWorkerForScope API.');
   await extensionSession.serviceWorkers.startWorkerForScope(scope);
   diagnostic(folder,'probe','Worker startup request succeeded');
  }catch(err){diagnostic(folder,'probe-error',String(err.stack||err.message||err).slice(0,500));}
  diagnostic(folder,'probe-status',JSON.stringify(extensionWorkerStatus(folder)));
  return getExtensionDiagnostics(folder);
 });
 ipcMain.handle('extensions:clear-diagnostics',(_e,folder)=>{extensionDiagnostics.delete(folder);return true;});
 ipcMain.handle('extensions:open',(_e,folder)=>openExtensionPopup(folder));
 ipcMain.handle('extensions:install',async()=>{
  const pick=await dialog.showOpenDialog(win,{title:'Select unpacked Chrome extension folder',properties:['openDirectory']});
  if(pick.canceled||!pick.filePaths[0])return {cancelled:true};
  const folder=path.resolve(pick.filePaths[0]),manifestPath=path.join(folder,'manifest.json');
  let manifest;
  try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}catch{throw new Error('Choose a folder containing a valid manifest.json file.');}
  if(!manifest.name||![2,3].includes(manifest.manifest_version))throw new Error('This folder is not a supported unpacked Chrome extension.');
  if(extensionRecords.some(x=>x.path===folder))throw new Error('This extension folder has already been added.');
  const record={path:folder,name:String(manifest.name).slice(0,150),version:String(manifest.version||''),enabled:true};
  await loadUnpacked(record);extensionRecords.push(record);persistExtensions();return extensionList();
 });
 ipcMain.handle('extensions:toggle',async(_e,folder)=>{
  const record=extensionRecords.find(x=>x.path===folder);if(!record)throw new Error('Extension not found.');
  if(record.enabled){closeExtensionPopup(folder);const loaded=extensionLoaded.get(folder);if(loaded)extensionSession.extensions.removeExtension(loaded.id);extensionLoaded.delete(folder);record.enabled=false;record.error=null;}
  else{await loadUnpacked(record);record.enabled=true;}
  persistExtensions();return extensionList();
 });
 ipcMain.handle('extensions:remove',(_e,folder)=>{
  const index=extensionRecords.findIndex(x=>x.path===folder);if(index<0)throw new Error('Extension not found.');
  closeExtensionPopup(folder);const loaded=extensionLoaded.get(folder);if(loaded)extensionSession.extensions.removeExtension(loaded.id);
  extensionLoaded.delete(folder);extensionRecords.splice(index,1);persistExtensions();return extensionList();
 });
 ipcMain.handle('statistics:snapshot',()=>{
  const processes=app.getAppMetrics().map(item=>({
   pid:item.pid,type:item.type,cpu:Number(item.cpu?.percentCPUUsage)||0,
   memoryBytes:Math.max(0,(Number(item.memory?.workingSetSize)||0)*1024),
   privateBytes:Math.max(0,(Number(item.memory?.privateBytes)||0)*1024)
  }));
  const byPid=new Map(processes.map(item=>[item.pid,item]));
  const tabs=Array.from(live.entries()).map(([id,view])=>{
   const row=store.get(id),pid=view.webContents.getOSProcessId();
   return {id,title:row?.title||'Tab',workspace:row?.workspace||'web',
    pid,process:byPid.get(pid)||null,detached:detached.has(id)};
  });
  return {time:Date.now(),system:{totalMemory:os.totalmem(),freeMemory:os.freemem(),logicalCores:os.cpus().length},
   processes,tabs,liveTabs:live.size,savedTabs:store.total()};
 });

 function verifiedSite(sender){
  const match=[...live.values()].some(view=>view.webContents===sender);
  if(!match)throw Error('Autofill is available only in Hexora website tabs.');
  const url=new URL(sender.getURL());
  if(url.protocol!=='https:')throw Error('Autofill requires HTTPS.');
  return url;
 }
 ipcMain.handle('vault:site-suggestions',event=>{
  const site=verifiedSite(event.sender);
  if(vault.status().locked)return{locked:true,entries:[]};
  const entries=vault.list().filter(item=>{
   try{const saved=new URL(item.site);return saved.protocol==='https:'&&saved.hostname===site.hostname;}catch{return false;}
  });
  return{locked:false,entries};
 });
 ipcMain.handle('vault:site-fill',async(event,id)=>{
  const sender=event.sender,site=verifiedSite(sender);
  if(vault.status().locked)throw Error('Unlock the vault first.');
  const entry=vault.get(id),saved=new URL(entry.site);
  if(saved.protocol!=='https:'||saved.hostname!==site.hostname)throw Error('The login belongs to a different website.');
  const values=JSON.stringify({username:entry.username,password:entry.password});
  const fill='(()=>{const c='+values+';const visible=e=>e.getClientRects().length&&!e.disabled&&!e.readOnly;const all=[...document.querySelectorAll("input")].filter(visible);const pass=all.find(e=>e.type==="password");if(!pass)return{filled:false,reason:"No visible password field."};const user=all.find(e=>e!==pass&&["email","text","tel"].includes(e.type)&&/user|email|login|account/i.test([e.name,e.id,e.placeholder,e.autocomplete].join(" ")))||all.find(e=>e!==pass&&["email","text"].includes(e.type));const set=(el,value)=>{if(!el)return;const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");descriptor.set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};set(user,c.username);set(pass,c.password);return{filled:true,username:!!user};})()';
  return sender.executeJavaScriptInIsolatedWorld(1001,[{code:fill}],true);
 });
 ipcMain.handle('vault:status',()=>({...vault.status(),deviceUnlockEnabled:vault.deviceUnlockEnabled(),deviceUnlockAvailable:safeStorage.isEncryptionAvailable()}));
 ipcMain.handle('vault:unlock',(_e,args)=>{const password=typeof args==='string'?args:args?.password;const result=vault.unlock(password);if(args?.remember===true)vault.enableDeviceUnlock(safeStorage);return result;});
 ipcMain.handle('vault:lock',()=>{vault.forgetDeviceUnlock();vault.lock();return true;});
 ipcMain.handle('vault:list',()=>vault.list());
 ipcMain.handle('vault:get',(_e,id)=>vault.get(id));
 ipcMain.handle('vault:save',(_e,entry)=>vault.save(entry));
 ipcMain.handle('vault:delete',(_e,id)=>vault.remove(id));
 ipcMain.handle('vault:autofill',async(_e,id)=>{
  if(vault.status().locked)throw Error('Unlock the vault first.');
  const entry=vault.get(id),tab=store.get(activeId),view=live.get(activeId);
  if(!tab||!view||view.webContents.isDestroyed())throw Error('No active website is loaded.');
  const target=new URL(view.webContents.getURL()),saved=new URL(entry.site);
  if(target.protocol!=='https:'||saved.protocol!=='https:'||target.hostname!==saved.hostname)throw Error('Saved login domain does not match the current HTTPS website.');
  const credentials={username:entry.username,password:entry.password};
  const script='(()=>{const c='+JSON.stringify(credentials)+';const visible=e=>e&&e.getClientRects().length&&!e.disabled&&!e.readOnly;const fields=[...document.querySelectorAll("input")].filter(visible);const pass=fields.find(e=>e.type==="password");if(!pass)return{filled:false,reason:"No visible password field found."};const user=fields.filter(e=>e!==pass&&["text","email","tel"].includes(e.type)).find(e=>/user|email|login|account|identifier/i.test([e.name,e.id,e.autocomplete,e.placeholder].join(" ")))||fields.filter(e=>e!==pass&&["text","email"].includes(e.type)).find(e=>{const a=e.compareDocumentPosition(pass);return !!(a&Node.DOCUMENT_POSITION_FOLLOWING);});const set=(el,value)=>{if(!el)return;const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");descriptor.set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};set(user,c.username);set(pass,c.password);return{filled:true,username:!!user};})()';
  return view.webContents.executeJavaScript(script,true);
 });
 ipcMain.handle('vault:copy',(_e,args)=>{
  if(vault.status().locked)throw Error('Vault locked');
  const entry=vault.get(args?.id);
  const field=args?.field;
  if(field!=='username'&&field!=='password')throw Error('Invalid field');
  const value=entry[field]||'';
  clipboard.writeText(value);
  setTimeout(()=>{if(clipboard.readText()===value)clipboard.clear();},30000).unref?.();
  return true;
 });

 let workspaceTooltipWindow=null,workspaceTooltipRequest=0;
 const tooltipHtml=`<!doctype html><html><head><meta charset="utf-8"><style>
 html,body{margin:0;background:transparent;overflow:hidden;font-family:Inter,system-ui,sans-serif}
 .tip{box-sizing:border-box;width:240px;height:66px;display:flex;align-items:center;gap:11px;padding:11px 13px;background:linear-gradient(135deg,#302a3b,#1e1d27);border:1px solid #665777;border-radius:12px;color:#eeeaf5;box-shadow:0 7px 20px #0008}
 .glyph{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:9px;background:#ad95ff24;color:#ad95ff;font-size:20px}
 .details{min-width:0;display:flex;flex-direction:column;gap:5px}
 strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 small{font-size:10px;color:#ada6bb}
 </style></head><body><div class="tip"><span class="glyph" id="glyph"></span><span class="details"><strong id="name"></strong><small id="count"></small></span></div></body></html>`;
 function ensureWorkspaceTooltip(){
  if(workspaceTooltipWindow&&!workspaceTooltipWindow.isDestroyed())return workspaceTooltipWindow;
  workspaceTooltipWindow=new BrowserWindow({parent:win,width:240,height:66,frame:false,transparent:true,show:false,focusable:false,skipTaskbar:true,resizable:false,movable:false,hasShadow:false,backgroundColor:'#00000000',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  workspaceTooltipWindow.setIgnoreMouseEvents(true);
  workspaceTooltipWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(tooltipHtml));
  return workspaceTooltipWindow;
 }
 ipcMain.handle('workspace:tooltip-show',async(event,data)=>{
  if(event.sender!==win.webContents)return;
  const request=++workspaceTooltipRequest;
  const popup=ensureWorkspaceTooltip();
  const bounds=win.getContentBounds();
  const x=Math.max(bounds.x,Math.min(bounds.x+bounds.width-240,bounds.x+Math.round(Number(data?.x)||0)));
  const y=Math.max(bounds.y,Math.min(bounds.y+bounds.height-66,bounds.y+Math.round(Number(data?.y)||0)));
  const label=String(data?.name||'Workspace').slice(0,120),glyph=String(data?.icon||'◇').slice(0,8);
  const count=Math.max(0,Math.floor(Number(data?.count)||0));
  if(popup.webContents.isLoadingMainFrame())await new Promise(resolve=>popup.webContents.once('did-finish-load',resolve));
  if(popup.isDestroyed()||request!==workspaceTooltipRequest)return;
  await popup.webContents.executeJavaScript('document.getElementById("glyph").textContent='+JSON.stringify(glyph)+';document.getElementById("name").textContent='+JSON.stringify(label)+';document.getElementById("count").textContent='+JSON.stringify(count+' saved '+(count===1?'tab':'tabs'))+';');
  if(request!==workspaceTooltipRequest||popup.isDestroyed())return;
  popup.setBounds({x,y,width:240,height:66});
  popup.showInactive();
 });
 ipcMain.handle('workspace:tooltip-hide',event=>{
  if(event.sender!==win.webContents)return;
  workspaceTooltipRequest++;
  if(workspaceTooltipWindow&&!workspaceTooltipWindow.isDestroyed())workspaceTooltipWindow.hide();
 });
 ipcMain.handle('workspace:context-menu',(event,data)=>{
  if(event.sender!==win.webContents)throw Error('Invalid menu caller');
  const id=String(data?.id||'');
  const name=String(data?.name||'Workspace').slice(0,120);
  const count=Math.max(0,Number(data?.count)||0);
  const menu=Menu.buildFromTemplate([
   {label:name,enabled:false},
   {label:count+' saved '+(count===1?'tab':'tabs'),enabled:false},
   {type:'separator'},
   {label:'Open workspace',click:()=>win.webContents.send('workspace:menu-action',{id,action:'open'})},
   {label:'Rename / customize',click:()=>win.webContents.send('workspace:menu-action',{id,action:'rename'})}
  ]);
  menu.popup({window:win,x:Math.round(Math.max(0,Number(data?.x)||0)),y:Math.round(Math.max(0,Number(data?.y)||0))});
  return true;
 });
 ipcMain.handle('native-code:choose-project',async(event,id)=>{
  if(event.sender!==win.webContents)throw new Error('Invalid caller');
  const tabId=Number(id),row=store.get(tabId);
  if(!Number.isSafeInteger(tabId)||!row||!isCodeTab(row))throw new Error('VS Code tab no longer exists.');
  const previous=store.getCodeProject(tabId)?.project_path;
  const selected=await dialog.showOpenDialog(win,{
   title:'Choose project folder for this VS Code tab',
   defaultPath:previous&&fs.existsSync(previous)?previous:app.getPath('home'),
   properties:['openDirectory']
  });
  if(selected.canceled||!selected.filePaths[0])return {cancelled:true};
  // A user-picked directory, not arbitrary renderer-provided filesystem input.
  const selectedPath=path.resolve(selected.filePaths[0]);
  if(!fs.statSync(selectedPath).isDirectory())throw new Error('Selected project is not a folder.');
  // The tab may have been closed while the native directory picker was open.
  if(!isCodeTab(store.get(tabId)))throw new Error('VS Code tab was closed.');
  if(previous&&path.normalize(previous).toLowerCase()!==path.normalize(selectedPath).toLowerCase()){
   try{clearSession(app.getPath('userData'),tabId);}catch(error){console.warn('Could not clear previous VS Code editor state:',error.message);}
  }
  if(nativeCodeHosts.has(tabId))nativeCodeHosts.get(tabId).ignoreProjectSync=true;
  store.setCodeProject(tabId,selectedPath);
  if(!store.getMeta('tabCustomTitle:'+tabId)){
   const updated=toModel(store.get(tabId));
   updated.title=('VS Code · '+path.basename(selectedPath)).slice(0,100);
   store.save(updated);
  }
  emit();
  return {cancelled:false,projectPath:selectedPath,appliesOnNextLaunch:nativeCodeHosts.has(tabId)};
 });
 ipcMain.handle('native-code:clear-project',async(event,id)=>{
  if(event.sender!==win.webContents)throw new Error('Invalid caller');
  const tabId=Number(id),row=store.get(tabId);
  if(!Number.isSafeInteger(tabId)||!isCodeTab(row))throw new Error('VS Code tab no longer exists.');
  if(nativeCodeHosts.has(tabId))nativeCodeHosts.get(tabId).ignoreProjectSync=true;
  store.clearCodeProject(tabId);
  try{clearSession(app.getPath('userData'),tabId);}catch(error){console.warn('Could not clear VS Code editor state:',error.message);}
  if(!store.getMeta('tabCustomTitle:'+tabId)){const updated=toModel(row);updated.title='Visual Studio Code';store.save(updated);}
  emit();return {cleared:true,appliesOnNextLaunch:nativeCodeHosts.has(tabId)};
 });
 ipcMain.handle('native-code:repair',async event=>{
  if(event.sender!==win.webContents)throw Error('Invalid caller');
  const tabId=activeId,entry=activeCodeEntry();
  if(!entry?.ready||!entry.visible||entry.detached)return {repaired:false};
  nativeCodeCommand('TRACE BEFORE_REPAIR',tabId);nativeCodeCommand('DIAG BEFORE_REPAIR',tabId);nativeCodeCommand('DETACH',tabId);
  await new Promise(resolve=>setTimeout(resolve,300));
  if(nativeCodeHosts.get(tabId)!==entry||activeId!==tabId||!entry.visible)return {repaired:false};
  nativeCodeCommand('ATTACH',tabId);nativeCodeBounds(tabId);nativeCodeCommand('RECOVER_Z',tabId);
  return {repaired:true};
 });
 ipcMain.handle('native-code:detach',async event=>{if(event.sender!==win.webContents)throw Error('Invalid caller');if(!isCodeTab(store.get(activeId)))return {detached:false};const entry=activeCodeEntry();if(!entry?.ready)return {detached:false};nativeCodeCommand('TRACE BEFORE_DETACH');nativeCodeCommand('DIAG BEFORE_DETACH');return {detached:detachTab(activeId)};});
 ipcMain.handle('native-code:toggle',async event=>{if(event.sender!==win.webContents)throw Error('Invalid caller');return openCodeTab(store.get(activeId)?.workspace||'web');});
 ipcMain.handle('tabs:page',(_e,arg)=>sendPage(arg));
 ipcMain.handle('tabs:search',(_e,term)=>store.search(term,50).map(pageRow));
 ipcMain.handle('tabs:lookup',(_e,id)=>{const row=store.get(Number(id));return row?pageRow(row):null;});
 ipcMain.handle('tabs:action',(_e,action,arg)=>{
  const current=store.get(activeId);const wc=live.get(activeId)?.webContents;
  if(action==='history-list')return store.historySearch(arg?.query||'',arg?.limit||250);
  if(action==='history-delete'){store.removeHistory(Number(arg));return true;}
  if(action==='history-clear'){store.clearHistory();return true;}
  if(action==='history-open'){
   const url=userWebsiteUrl(arg?.url);
   newTab(typeof arg?.workspace==='string'?arg.workspace:'web',url);
   return true;
  }
  if(action==='open-native-code')return openCodeTab(typeof arg==='string'?arg:'web');
  if(action==='new'){const workspace=typeof arg==='string'?arg:'web';const anchor=store.get(activeId);newTab(workspace,HOME,anchor?.workspace===workspace?activeId:null);}
  else if(action==='activate')activate(Number(arg));
  else if(action==='switch-workspace'){
   const workspace=typeof arg==='string'?arg:'web';
   const selected=Number(store.getMeta('workspaceActive:'+workspace));
   const candidate=(selected&&store.get(selected)?.workspace===workspace?selected:null)||store.page(workspace,0,1)[0]?.id;
   if(candidate)activate(candidate);else newTab(workspace);
   return true;
  }
  else if(action==='stack-row-height'){TOP_HEIGHT=Number.isFinite(arg)?Math.max(120,Math.min(120+34*100,Math.round(arg))):120;bounds();return true;}
  else if(action==='stack-create-pair'){const id=store.createStackPair(arg?.workspace,arg?.name,Number(arg?.sourceId),Number(arg?.targetId),arg?.parentId??null);emit();return id;}
  else if(action==='stack-create'){const id=store.createStack(arg?.workspace,arg?.name,arg?.tabId??null,arg?.parentId??null);emit();return id;}
  else if(action==='stack-assign'){store.putTabInStack(Number(arg?.tabId),arg?.stackId===null?null:Number(arg?.stackId));emit();return true;}
  else if(action==='stack-nest'){store.moveStack(Number(arg?.id),arg?.parentId===null?null:Number(arg?.parentId));emit();return true;}
  else if(action==='stack-edit'){store.stackAction(Number(arg?.id),arg?.operation,arg?.value);emit();return true;}
  else if(action==='reorder-stack'){store.reorderStack(Number(arg?.stackId),arg?.ids);emit();return true;}
  else if(action==='reorder-row'){store.reorderRow(arg?.workspace,arg?.parentId??null,arg?.items);emit();return true;}
  else if(action==='reorder-sidebar-tabs'){store.reorderSidebarTabs(arg?.workspace,arg?.ids);emit();return true;}
  else if(action==='reorder-tabs'){store.reorderVisible(arg?.workspace,arg?.ids);emit();return true;}
  else if(action==='move-tab'){
   const id=Number(arg?.id),workspace=arg?.workspace,raw=store.get(id);
   if(!raw||typeof workspace!=='string'||workspace.length>80)throw new Error('Invalid tab or workspace');
   const tab=toModel(raw);tab.workspace=workspace;store.save(tab);
   if(id===activeId)store.setMeta('workspaceActive:'+workspace,String(id));
   emit();return true;
  }
  else if(action==='delete-workspace'){
   const workspace=arg?.id,destination=arg?.destination||'web';
   if(typeof workspace!=='string'||workspace==='web'||workspace===destination)throw new Error('Cannot delete this workspace.');
   // Preserve all tabs by moving them into the main workspace.
   store.moveWorkspace(workspace,destination);
   if(store.get(activeId)?.workspace===destination)store.setMeta('workspaceActive:'+destination,String(activeId));
   emit();return true;
  }
  else if(action==='open-website'){
   const url=userWebsiteUrl(arg?.url);
   const title=typeof arg?.title==='string'&&arg.title.trim()?arg.title.trim().slice(0,100):new URL(url).hostname;
   const id=arg?.newTab?newTab(typeof arg.workspace==='string'?arg.workspace:'web',url):Number(arg?.id);
   const row=store.get(id);if(!row)throw new Error('Tab no longer exists.');
   if(isCodeTab(row)){
    stopNativeCode(id);store.clearCodeProject(id);
    try{clearSession(app.getPath('userData'),id);}catch(error){console.warn('Could not clear old VS Code session:',error.message);}
   }
   const t=toModel(row);t.url=url;t.title=title;store.save(t);
   const view=live.get(id);
   if(view){view.webContents.loadURL(url).catch(err=>console.error('Could not open website',err));}
   if(!arg?.newTab)activate(id);
   emit();return id;
  }
  else if(action==='rename-tab'){
   const id=Number(arg?.id),name=typeof arg?.name==='string'?arg.name.trim():'';
   if(!Number.isSafeInteger(id)||!store.get(id)||!name||name.length>100)throw new Error('Enter a tab name of 1–100 characters.');
   store.setMeta('tabCustomTitle:'+id,name);emit();return true;
  }
  else if(action==='panel-mode'){
   const id=Number(arg?.id);if(!Number.isSafeInteger(id)||!store.get(id)||!['wide','thin'].includes(arg?.mode))throw new Error('Invalid tab or panel mode.');
   store.setMeta('panelMode:'+id,arg.mode);emit();return arg.mode;
  }
  else if(action==='panel-domain-mode'){
   const id=Number(arg?.id),row=store.get(id);if(!Number.isSafeInteger(id)||!row||!['wide','thin'].includes(arg?.mode))throw new Error('Invalid tab or panel mode.');
   const domain=tabDomain(row);if(!domain)throw new Error('This tab has no website domain.');
   store.setMeta('panelDomain:'+domain,arg.mode);emit();return domain;
  }
  else if(action==='panel-tab-inherit'){
   const id=Number(arg);if(!Number.isSafeInteger(id)||!store.get(id))throw new Error('Tab no longer exists.');
   store.setMeta('panelMode:'+id,'inherit');emit();return true;
  }
  else if(action==='chrome-mode'){
   const id=Number(arg);if(!Number.isSafeInteger(id)||!store.get(id))throw new Error('Tab no longer exists.');
   const enabled=!chromeMode(id);store.setMeta('chromeMode:'+id,String(enabled));
   const view=live.get(id);if(view){view.webContents.setUserAgent(enabled?chromeUserAgent(view.webContents):app.userAgentFallback);view.webContents.reload();}
   emit();return enabled;
  }
  else if(action==='close-many'){
   const ids=[...new Set(Array.isArray(arg)?arg:[])].filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,100);
   for(const id of ids)if(store.get(id))closeTab(id);
   return ids.length;
  }
  else if(action==='close')closeTab(arg);
  else if(action==='reload'){
   if(isCodeTab(current)){if(!nativeCodeHosts.has(activeId))queueNativeCodeLaunch(activeId);else{nativeCodeCommand('RECOVER_Z');nativeCodeCommand('FOCUS');}}
   else if(wc){const view=live.get(activeId);mainViewport.removeChildView(view);mainViewport.addChildView(view);bounds();wc.reloadIgnoringCache();}
  }
  else if(action==='back'&&wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();
  else if(action==='forward'&&wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();
  else if(action==='open-external'){if(!isCodeTab(current))shell.openExternal(current?.url||HOME);}
  else if(action==='sidebar-resize'){
   if(sidebarAnimation){clearInterval(sidebarAnimation);sidebarAnimation=null;}
   sidebarTransitioning=false;sidebarTransitionTarget=null;
   const max=Math.min(560,Math.max(64,win.getContentSize()[0]-420));
   sidebarWidth=Math.round(Math.max(64,Math.min(max,Number(arg?.width)??330)));
   bounds();return sidebarWidth;
  }
  else if(action==='sidebar-resize-save'){
   store.setMeta('sidebarCustomWidth',String(sidebarWidth));
   if(sidebarWidth>=220)store.setMeta('sidebarLastExpandedWidth',String(sidebarWidth));
   return sidebarWidth;
  }
  else if(action==='sidebar'){setSidebarWidth(!!arg);}
  else if(action==='recovery-window'){openRecoveryWindow();}
  else if(action==='detach'){detachTab(arg||activeId);}
  else if(action==='dock'){dockTab(arg);}
  else if(action==='swap-detached'){swapDetached(arg?.source,arg?.target);}
  else if(action==='detached-info'){return {title:store.get(Number(arg))?.title||'ChatGPT'};}
  else if(action==='modal'){
   modalVisible=!!arg;
   if(isCodeTab(store.get(activeId))){if(modalVisible){hideNativeCode();win.webContents.focus();}else showNativeCode();return true;}
   const view=live.get(activeId);
   if(view){
    if(modalVisible){mainViewport.removeChildView(view);win.webContents.focus();}
    else {mainViewport.addChildView(view);bounds();view.webContents.focus();}
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
 syncNativeCodeProjects();
 setInterval(syncNativeCodeProjects,1000).unref();
 win.on('closed',()=>{if(nativeCodeLifecycleTimer){clearTimeout(nativeCodeLifecycleTimer);nativeCodeLifecycleTimer=null;}quitting=true;stopAllNativeCode();for(const folder of [...extensionPopups.keys()])closeExtensionPopup(folder);if(sidebarAnimation)clearInterval(sidebarAnimation);for(const popup of detached.values())if(!popup.isDestroyed())popup.close();detached.clear();clearInterval(recoveryTimer);recoveryPassword=null;clearTimeout(stateTimer);win=null;for(const id of Array.from(live.keys()))discard(id);vault?.lock();tabStoreClosing=true;store.close();});
 // Register every IPC handler before the renderer can issue actions.
 win.loadFile('toolbar.html').catch(err=>console.error('[Hexora] Toolbar load failed:',err));
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
