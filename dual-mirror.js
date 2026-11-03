'use strict';
const {BrowserWindow,WebContentsView,session}=require('electron');
const path=require('path');

// One user-input leader at a time: programmatic scrolling cannot echo back.
function createDualMirror({getActiveId,getTab,getView,isCodeTab,getMirrorUrl}){
 let state=null;
 const read='(()=>{const e=document.scrollingElement||document.documentElement;return {x:e.scrollLeft,y:e.scrollTop,mx:Math.max(0,e.scrollWidth-e.clientWidth),my:Math.max(0,e.scrollHeight-e.clientHeight)};})()';
 const scroll=position=>`(()=>{const e=document.scrollingElement||document.documentElement;const x=${position.rx}*Math.max(0,e.scrollWidth-e.clientWidth),y=${position.ry}*Math.max(0,e.scrollHeight-e.clientHeight);const previous=e.style.scrollBehavior;e.style.scrollBehavior='auto';e.scrollTo({left:x,top:y,behavior:'instant'});e.style.scrollBehavior=previous;})()`;
 return function open(){
  const id=getActiveId(),tab=getTab(id);
  if(!tab||tab.workspace!=='dual'||isCodeTab(tab))return false;
  if(state&&!state.popup.isDestroyed()){state.popup.focus();return true;}
  const sharedSession=session.fromPartition('persist:hexora-chatgpt');
  // A paired page is a native WebContentsView, exactly like Hexora's
  // authenticated regular tabs. BrowserWindow's own webContents is only a shell.
  const popup=new BrowserWindow({width:960,height:720,minWidth:420,minHeight:320,title:'Hexora · Dual Workspace (Paired)',backgroundColor:'#111215',autoHideMenuBar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  const view=new WebContentsView({webPreferences:{session:sharedSession,preload:path.join(__dirname,'site-vault-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,javascript:true}});
  view.setBackgroundColor('#111215');
  popup.contentView.addChildView(view);
  const resize=()=>{const [width,height]=popup.getContentSize();view.setBounds({x:0,y:0,width,height});};
  popup.on('resize',resize);
  resize();
  const target=view.webContents;
  const current={popup,id:null,url:null,source:null,leader:null,leaderUntil:0,last:null,busy:false,loading:false,handlers:[]};state=current;
  const detach=()=>{for(const [wc,event,handler] of current.handlers)if(!wc.isDestroyed())wc.removeListener(event,handler);current.handlers=[];};
  const on=(wc,event,handler)=>{wc.on(event,handler);current.handlers.push([wc,event,handler]);};
  const watch=(wc,side)=>{
   const lead=()=>{current.leader=side;current.leaderUntil=Date.now()+900;current.last=null;};
   on(wc,'input-event',(_event,input)=>{if(['mouseWheel','mouseDown','touchStart','touchMove'].includes(input?.type))lead();});
   on(wc,'before-input-event',(_event,input)=>{if(['keyDown','rawKeyDown'].includes(input?.type)&&['ArrowDown','ArrowUp','PageDown','PageUp','Home','End','Space'].includes(input.key))lead();});
  };
  on(target,'did-fail-load',(_event,code,description,url,isMainFrame)=>{if(isMainFrame)console.error('[Dual Mirror] Load failed:',code,description,url);});
  const select=async()=>{
   const active=getActiveId(),row=getTab(active);
   if(!row||row.workspace!=='dual'||isCodeTab(row))return;
   const source=getView(active)?.webContents,url=source?.getURL();
   if(!source||source.isDestroyed()||!/^https?:\/\//.test(url))return;
   const pairedUrl=getMirrorUrl(active)||url;
   if(current.id===active&&current.url===pairedUrl&&current.source===source)return;
   current.id=active;current.url=pairedUrl;current.source=source;current.leader=null;current.last=null;
   detach();watch(source,'source');watch(target,'target');
   current.loading=true;
   // Match the regular Hexora WebContentsView identity; avoid spoofing a
   // different UA from the page that owns the logged-in browser session.
   target.setUserAgent(source.getUserAgent());
   console.info('[Dual Pair]',{sameSession:source.session===target.session,sourceUrl:url,pairedHost:new URL(pairedUrl).hostname});
   try{await target.loadURL(pairedUrl);}catch(error){console.warn('[Dual Mirror] Navigation failed:',error.message);}finally{current.loading=false;}
  };
  const sync=async()=>{
   if(current.busy||popup.isDestroyed())return;
   current.busy=true;
   try{
    await select();
    const source=current.source;
    if(!source||source.isDestroyed()||target.isDestroyed()||current.loading||source.isLoading()||target.isLoading()||Date.now()>current.leaderUntil)return;
    const leader=current.leader==='source'?source:current.leader==='target'?target:null;
    if(!leader)return;
    const follower=leader===source?target:source;
    const p=await leader.executeJavaScript(read);
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
    const rx=p.mx?Math.max(0,Math.min(1,p.x/p.mx)):0,ry=p.my?Math.max(0,Math.min(1,p.y/p.my)):0;
    const last=current.last;
    if(last&&last.leader===current.leader&&Math.abs(last.x-p.x)<1&&Math.abs(last.y-p.y)<1)return;
    current.last={leader:current.leader,x:p.x,y:p.y};
    await follower.executeJavaScript(scroll({rx,ry}));
   }catch(error){console.warn('[Dual Mirror] Sync skipped:',error.message);}finally{current.busy=false;}
  };
  const timer=setInterval(()=>{void sync();},33);
  popup.on('closed',()=>{clearInterval(timer);detach();if(!target.isDestroyed())target.close();if(state===current)state=null;});
  void sync();return true;
 };
}
module.exports={createDualMirror};
