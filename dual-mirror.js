'use strict';
const {BrowserWindow,WebContentsView,session}=require('electron');
const path=require('path');

// One user-input leader at a time: programmatic scrolling cannot echo back.
function createDualMirror({getActiveId,getTab,getView,isCodeTab,getMirrorUrl,getChatgptSource}){
 let opening=null;
 // Use the browser's native opener relationship so the paired page inherits
 // origin-specific sessionStorage without Hexora reading or copying auth data.
 function openViaChatgpt(opener,url){
  return new Promise(resolve=>{
   let finished=false;
   const finish=popup=>{
    if(finished)return;
    finished=true;
    clearTimeout(timer);
    opener.removeListener('did-create-window',onWindow);
    resolve(popup);
   };
   const onWindow=(popup,details)=>{
    if(details.url===url){
     // A paired popup must not appear as a second visible Dual window
     // while the existing active pair is still on screen.
     popup.hide();
     finish(popup);
    }
   };
   opener.on('did-create-window',onWindow);
   const timer=setTimeout(()=>finish(null),5000);
   // Inherited popup settings and session are provided by the existing
   // setWindowOpenHandler on regular Hexora web tabs.
   void opener.executeJavaScript('window.open('+JSON.stringify(url)+',"_blank");true',true).catch(()=>finish(null));
  });
 }
 let state=null;
 const read='(()=>{const e=document.scrollingElement||document.documentElement;return {x:e.scrollLeft,y:e.scrollTop,mx:Math.max(0,e.scrollWidth-e.clientWidth),my:Math.max(0,e.scrollHeight-e.clientHeight)};})()';
 const scroll=position=>`(()=>{const e=document.scrollingElement||document.documentElement;const x=${position.rx}*Math.max(0,e.scrollWidth-e.clientWidth),y=${position.ry}*Math.max(0,e.scrollHeight-e.clientHeight);const previous=e.style.scrollBehavior;e.style.scrollBehavior='auto';e.scrollTo({left:x,top:y,behavior:'instant'});e.style.scrollBehavior=previous;})()`;

 // Keep a distinct browser instance for every paired tab. Navigating one
 // shared WebContents on tab changes destroys ChatGPT UI and scroll state.
 function stopGroup(group){
  if(group.closed)return;
  group.closed=true;
  clearInterval(group.timer);
  detach(group);
  for(const entry of group.entries.values()){
   entry.discarded=true;
   if(!entry.popup.isDestroyed())entry.popup.close();
  }
  group.entries.clear();
  if(state===group)state=null;
 }
 function detach(group){
  for(const [wc,event,handler] of group.handlers)
   if(!wc.isDestroyed())wc.removeListener(event,handler);
  group.handlers=[];
 }
 function watch(group,wc,side){
  const lead=()=>{
   group.leader=side;
   group.leaderUntil=Date.now()+900;
   group.last=null;
  };
  const mouse=(_event,input)=>{if(['mouseWheel','mouseDown','touchStart','touchMove'].includes(input?.type))lead();};
  const keyboard=(_event,input)=>{if(['keyDown','rawKeyDown'].includes(input?.type)&&['ArrowDown','ArrowUp','PageDown','PageUp','Home','End','Space'].includes(input.key))lead();};
  wc.on('input-event',mouse);
  wc.on('before-input-event',keyboard);
  group.handlers.push([wc,'input-event',mouse],[wc,'before-input-event',keyboard]);
 }
 async function createEntry(group,id,pairedUrl){
  let popup=null,view=null;
  const opener=getChatgptSource?.();
  if(opener&&!opener.isDestroyed()&&/^https:\/\/chatgpt\.com\//.test(pairedUrl)){
   popup=await openViaChatgpt(opener,pairedUrl);
   if(popup)console.info('[Dual Mirror] Reusing authenticated browser opener for paired tab',id);
   else console.warn('[Dual Mirror] Authenticated popup unavailable; using regular webview for paired tab',id);
  }
  if(!popup){
   const sharedSession=session.fromPartition('persist:hexora-chatgpt');
   popup=new BrowserWindow({
    width:960,height:720,minWidth:420,minHeight:320,
    title:'Hexora · Dual Workspace (Paired)',
    backgroundColor:'#111215',autoHideMenuBar:true,
    webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}
   });
   view=new WebContentsView({webPreferences:{
    session:sharedSession,preload:path.join(__dirname,'site-vault-preload.js'),
    sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,javascript:true,backgroundThrottling:false
   }});
   view.setBackgroundColor('#111215');
   popup.contentView.addChildView(view);
   const resize=()=>{
    if(popup.isDestroyed())return;
    const [width,height]=popup.getContentSize();
    view.setBounds({x:0,y:0,width,height});
   };
   popup.on('resize',resize);
   resize();
   const wc=view.webContents;
   const currentOpener=getChatgptSource?.();
   if(currentOpener&&!currentOpener.isDestroyed()&&new URL(pairedUrl).hostname==='chatgpt.com')
    wc.setUserAgent(currentOpener.getUserAgent());
   try{await wc.loadURL(pairedUrl);}
   catch(error){console.warn('[Dual Mirror] Paired page navigation failed:',error.message);}
  }
  if(group.closed){if(!popup.isDestroyed())popup.close();return null;}
  // The new pair is parked until select() makes it the sole visible one.
  popup.hide();
  popup.setTitle('Hexora · Dual Workspace (Paired)');
  popup.setMinimumSize(420,320);
  popup.setSize(960,720);
  const target=view?view.webContents:popup.webContents;
  const entry={id,url:pairedUrl,popup,view,target,discarded:false};
  target.on('render-process-gone',(_event,details)=>{
   console.error('[Dual Mirror] Paired renderer exited:',id,details.reason);
  });
  target.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{
   if(isMainFrame)console.error('[Dual Mirror] Load failed:',code,description,url);
  });
  popup.on('closed',()=>{
   if(group.entries.get(id)===entry)group.entries.delete(id);
   if(!entry.discarded)stopGroup(group);
   if(view&&!target.isDestroyed())target.close();
  });
  group.entries.set(id,entry);
  return entry;
 }
 async function select(group){
  if(group.closed)return;
  const id=getActiveId(),row=getTab(id);
  if(!row||row.workspace!=='dual'||isCodeTab(row))return;
  const source=getView(id)?.webContents,url=source?.getURL();
  if(!source||source.isDestroyed()||!/^https?:\/\//.test(url))return;
  const pairedUrl=getMirrorUrl(id)||url;
  let entry=group.entries.get(id);
  if(entry&&(entry.url!==pairedUrl||entry.popup.isDestroyed())){
   group.entries.delete(id);
   entry.discarded=true;
   if(group.active===entry){
    group.bounds=entry.popup.isDestroyed()?group.bounds:entry.popup.getBounds();
    group.active=null;
    detach(group);
   }
   if(!entry.popup.isDestroyed())entry.popup.close();
   entry=null;
  }
  if(!entry){
   entry=await createEntry(group,id,pairedUrl);
   if(!entry||group.closed)return;
  }
  if(group.closed||entry.popup.isDestroyed())return;
  // Ignore stale asynchronous popup completions if a different main tab
  // became active while ChatGPT was opening this one.
  if(getActiveId()!==id){
   // A pending popup can complete after the user switches tabs.
   // Keep it cached, but never expose another Dual window.
   entry.popup.hide();
   return;
  }
  if(group.active===entry&&group.source===source)return;
  const previous=group.active;
  const wasVisible=previous
   ?(!previous.popup.isDestroyed()&&previous.popup.isVisible()&&!previous.popup.isMinimized())
   :true;
  if(previous&&previous!==entry&&!previous.popup.isDestroyed()){
   group.bounds=previous.popup.getBounds();
   group.maximized=previous.popup.isMaximized();
   previous.popup.hide();
  }
  if(group.bounds){
   if(!group.maximized&&entry.popup.isMaximized())entry.popup.unmaximize();
   if(!group.maximized)entry.popup.setBounds(group.bounds);
  }
  if(group.maximized&&!entry.popup.isMaximized())entry.popup.maximize();
  if(previous!==entry&&wasVisible)entry.popup.showInactive();
  group.active=entry;
  group.source=source;
  group.leader=null;
  group.leaderUntil=0;
  group.last=null;
  detach(group);
  watch(group,source,'source');
  watch(group,entry.target,'target');
 }
 async function sync(group){
  if(group.busy||group.closed)return;
  group.busy=true;
  try{
   await select(group);
   const entry=group.active,source=group.source;
   if(!entry||!source||source.isDestroyed()||entry.target.isDestroyed()||
      source.isLoading()||entry.target.isLoading()||Date.now()>group.leaderUntil)return;
   const leader=group.leader==='source'?source:group.leader==='target'?entry.target:null;
   if(!leader)return;
   const follower=leader===source?entry.target:source;
   const p=await leader.executeJavaScript(read);
   if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
   const rx=p.mx?Math.max(0,Math.min(1,p.x/p.mx)):0;
   const ry=p.my?Math.max(0,Math.min(1,p.y/p.my)):0;
   const last=group.last;
   if(last&&last.leader===group.leader&&Math.abs(last.x-p.x)<1&&Math.abs(last.y-p.y)<1)return;
   group.last={leader:group.leader,x:p.x,y:p.y};
   await follower.executeJavaScript(scroll({rx,ry}));
  }catch(error){console.warn('[Dual Mirror] Sync skipped:',error.message);}
  finally{group.busy=false;}
 }
 return async function open(){
  const id=getActiveId(),row=getTab(id);
  if(!row||row.workspace!=='dual'||isCodeTab(row))return false;
  if(state&&!state.closed){
   await select(state);
   if(state.active&&!state.active.popup.isDestroyed()){
    if(state.active.popup.isMinimized())state.active.popup.restore();
    state.active.popup.show();
    state.active.popup.focus();
   }
   return true;
  }
  if(opening)return opening;
  const task=(async()=>{
   const group={
    entries:new Map(),active:null,source:null,handlers:[],
    leader:null,leaderUntil:0,last:null,busy:false,
    closed:false,timer:null,bounds:null,maximized:false
   };
   state=group;
   await select(group);
   if(group.closed)return false;
   group.timer=setInterval(()=>{void sync(group);},33);
   return true;
  })();
  opening=task.finally(()=>{opening=null;});
  return opening;
 };
}
module.exports={createDualMirror};
