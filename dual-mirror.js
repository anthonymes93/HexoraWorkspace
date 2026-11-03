'use strict';
const {app,BrowserWindow,WebContentsView,session}=require('electron');
const path=require('node:path');
function createDualMirror({getActiveId,getTab,getView,isCodeTab,getMirrorUrl,getChatgptSource}){
 let state=null,opening=null,quitting=false;
 app.once('before-quit',()=>{quitting=true;});
 const pending=new Map();
 const read='(()=>{const e=document.scrollingElement||document.documentElement;return {x:e.scrollLeft,y:e.scrollTop,mx:Math.max(0,e.scrollWidth-e.clientWidth),my:Math.max(0,e.scrollHeight-e.clientHeight)};})()';
 const scroll=p=>'(()=>{const e=document.scrollingElement||document.documentElement;const x='+p.rx+'*Math.max(0,e.scrollWidth-e.clientWidth),y='+p.ry+'*Math.max(0,e.scrollHeight-e.clientHeight);const old=e.style.scrollBehavior;e.style.scrollBehavior="auto";e.scrollTo({left:x,top:y,behavior:"instant"});e.style.scrollBehavior=old;})()';
 const detach=g=>{for(const [wc,name,fn] of g.handlers)if(!wc.isDestroyed())wc.removeListener(name,fn);g.handlers=[];};
 const watch=(g,wc,side)=>{
  const lead=()=>{g.leader=side;g.leaderUntil=Date.now()+900;g.last=null;};
  const mouse=(_e,input)=>{if(['mouseWheel','mouseDown','touchStart','touchMove'].includes(input?.type))lead();};
  const key=(_e,input)=>{if(['keyDown','rawKeyDown'].includes(input?.type)&&['ArrowDown','ArrowUp','PageDown','PageUp','Home','End','Space'].includes(input.key))lead();};
  wc.on('input-event',mouse);wc.on('before-input-event',key);
  g.handlers.push([wc,'input-event',mouse],[wc,'before-input-event',key]);
 };
 const resize=g=>{if(g.window.isDestroyed()||!g.active)return;const [width,height]=g.window.getContentSize();g.active.view.setBounds({x:0,y:0,width,height});};
 const dispose=(g,entry)=>{
  g.entries.delete(entry.id);
  if(g.active===entry){g.active=null;g.source=null;detach(g);}
  try{g.window.contentView.removeChildView(entry.view);}catch{}
  if(!entry.view.webContents.isDestroyed())entry.view.webContents.close();
 };
 const stop=g=>{
  if(g.closed)return;g.closed=true;clearInterval(g.timer);detach(g);
  for(const request of pending.values()){clearTimeout(request.timer);request.resolve(null);}
  pending.clear();
  for(const entry of [...g.entries.values()])dispose(g,entry);
  if(state===g)state=null;
 };
 // Chromium calls createWindow synchronously. Returning WebContentsView's
 // webContents means no second native BrowserWindow is ever created.
 function handlePopup({opener,url,frameName}){
  const request=pending.get(frameName);
  if(!request||request.opener!==opener||request.url!==url||!state||state.closed)return {action:'deny'};
  return {action:'allow',outlivesOpener:true,createWindow:options=>{
   const view=new WebContentsView({webPreferences:{...options.webPreferences,session:opener.session,
    sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}});
   view.setBackgroundColor('#ffffff');
   request.resolve(view);
   return view.webContents;
  }};
 }
 async function authenticatedView(id,url,opener){
  const frameName='hexora-dual-pair-'+id+'-'+Date.now();
  return new Promise(resolve=>{
   let done=false;
   const finish=view=>{
    if(done){if(view&&!view.webContents.isDestroyed())view.webContents.close();return;}
    done=true;clearTimeout(request.timer);pending.delete(frameName);resolve(view);
   };
   const request={opener,url,resolve:finish,timer:setTimeout(()=>finish(null),5000)};
   pending.set(frameName,request);
   void opener.executeJavaScript('window.open('+JSON.stringify(url)+','+JSON.stringify(frameName)+');true',true)
    .catch(error=>{console.warn('[Dual] Popup opener failed:',error.message);finish(null);});
  });
 }
 async function createEntry(g,id,url){
  const opener=getChatgptSource?.();
  let view=null,fromPopup=false;
  // Electron 38 rejects returning WebContentsView.webContents from
  // setWindowOpenHandler.createWindow. Use the existing session-backed
  // fallback below for ChatGPT, just like other Dual Workspace sites.
  // Keep the secondary-window layout and attachment logic unchanged.
  if(g.closed){if(view&&!view.webContents.isDestroyed())view.webContents.close();return null;}
  if(!view){
   view=new WebContentsView({webPreferences:{session:session.fromPartition('persist:hexora-chatgpt'),
    preload:path.join(__dirname,'site-vault-preload.js'),sandbox:true,contextIsolation:true,
    nodeIntegration:false,webSecurity:true,javascript:true,backgroundThrottling:false}});
   view.setBackgroundColor('#ffffff');
   if(opener&&!opener.isDestroyed()&&new URL(url).hostname==='chatgpt.com')
    view.webContents.setUserAgent(opener.getUserAgent());
  }
  const entry={id,url,view};
  g.entries.set(id,entry);
  view.webContents.on('did-fail-load',(_event,code,description,failedUrl,isMainFrame)=>{
   if(isMainFrame)console.error('[Dual] Load failed:',code,description,failedUrl);
  });
  view.webContents.on('render-process-gone',(_event,details)=>console.error('[Dual] Renderer exited:',details.reason));
  if(!fromPopup)void view.webContents.loadURL(url).catch(error=>console.warn('[Dual] Navigation failed:',error.message));
  return entry;
 }
 async function select(g){
  if(g.closed||g.window.isDestroyed())return;
  const id=getActiveId(),tab=getTab(id);
  if(!tab||tab.workspace!=='dual'||isCodeTab(tab))return;
  const source=getView(id)?.webContents;
  if(!source||source.isDestroyed()||!/^https?:\/\//.test(source.getURL()))return;
  const url=getMirrorUrl(id)||source.getURL();
  let entry=g.entries.get(id);
  if(entry&&(entry.url!==url||entry.view.webContents.isDestroyed())){dispose(g,entry);entry=null;}
  if(!entry)entry=await createEntry(g,id,url);
  if(!entry||g.closed||g.window.isDestroyed()||getActiveId()!==id)return;
  if(g.active===entry&&g.source===source)return;
  if(g.active&&g.active!==entry)g.window.contentView.removeChildView(g.active.view);
  if(g.active!==entry)g.window.contentView.addChildView(entry.view);
  g.active=entry;g.source=source;g.leader=null;g.leaderUntil=0;g.last=null;
  detach(g);watch(g,source,'source');watch(g,entry.view.webContents,'target');resize(g);
 }
 async function sync(g){
  if(g.busy||g.closed||g.window.isDestroyed()||!g.window.isVisible())return;g.busy=true;
  try{
   await select(g);
   const source=g.source,target=g.active?.view.webContents;
   if(!source||!target||source.isDestroyed()||target.isDestroyed()||
      source.isLoading()||target.isLoading()||Date.now()>g.leaderUntil)return;
   const leader=g.leader==='source'?source:g.leader==='target'?target:null;
   if(!leader)return;
   const follower=leader===source?target:source;
   const p=await leader.executeJavaScript(read);
   if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
   const rx=p.mx?Math.max(0,Math.min(1,p.x/p.mx)):0;
   const ry=p.my?Math.max(0,Math.min(1,p.y/p.my)):0;
   const last=g.last;
   if(last&&last.leader===g.leader&&Math.abs(last.x-p.x)<1&&Math.abs(last.y-p.y)<1)return;
   g.last={leader:g.leader,x:p.x,y:p.y};
   await follower.executeJavaScript(scroll({rx,ry}));
  }catch(error){console.warn('[Dual] Sync skipped:',error.message);}
  finally{g.busy=false;}
 }
 async function open(){
  const id=getActiveId(),tab=getTab(id);
  if(!tab||tab.workspace!=='dual'||isCodeTab(tab))return false;
  if(state&&!state.closed){
   await select(state);
   if(!state.window.isDestroyed()){if(state.window.isMinimized())state.window.restore();state.window.show();state.window.focus();}
   return true;
  }
  if(opening)return opening;
  const task=(async()=>{
   const window=new BrowserWindow({width:960,height:720,minWidth:420,minHeight:320,
    title:'Hexora · Dual Workspace',backgroundColor:'#111215',autoHideMenuBar:true,
    webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
   const g={window,entries:new Map(),active:null,source:null,handlers:[],
    leader:null,leaderUntil:0,last:null,busy:false,closed:false,timer:null};
   state=g;
   window.on('resize',()=>resize(g));
   // Closing the secondary screen hides it; its authenticated tab views stay alive.
   // A full Hexora quit still destroys the window and releases the cached views.
   window.on('close',event=>{
    if(g.closed||window.isDestroyed())return;
    if(quitting)return;
    event.preventDefault();window.hide();
   });
   window.on('closed',()=>stop(g));
   await select(g);
   if(g.closed)return false;
   g.timer=setInterval(()=>{void sync(g);},33);
   return true;
  })();
  opening=task.finally(()=>{opening=null;});
  return opening;
 }
 open.handlePopup=handlePopup;
 return open;
}
module.exports={createDualMirror};
