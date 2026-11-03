'use strict';
const {BrowserWindow}=require('electron');

// Experimental: separate windows with a shared session; synchronize only real user scrolling.
function createDualMirror({getActiveId,getTab,getView,isCodeTab}){
 let state=null;
 const prefix='HEXORA_DUAL_SCROLL_'+Math.random().toString(36).slice(2)+':';
 const install=JSON.stringify(prefix);
 const listener=`(()=>{
  if(window.__hexoraDualScrollInstalled)return;
  window.__hexoraDualScrollInstalled=true;
  const prefix=${install};
  const bridge=window.__hexoraDualScroll={muteUntil:0,activeUntil:0,raf:0};
  const user=()=>{bridge.activeUntil=performance.now()+650;};
  addEventListener('wheel',user,{capture:true,passive:true});
  addEventListener('touchstart',user,{capture:true,passive:true});
  addEventListener('touchmove',user,{capture:true,passive:true});
  addEventListener('pointerdown',user,{capture:true,passive:true});
  addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key))user();},true);
  addEventListener('scroll',()=>{
   if(bridge.raf)return;
   bridge.raf=requestAnimationFrame(()=>{
    bridge.raf=0;
    if(performance.now()<bridge.muteUntil||performance.now()>bridge.activeUntil)return;
    const root=document.scrollingElement||document.documentElement;
    const mx=Math.max(0,root.scrollWidth-innerWidth),my=Math.max(0,root.scrollHeight-innerHeight);
    console.info(prefix+JSON.stringify({x:scrollX,y:scrollY,mx,my}));
   });
  },{capture:true,passive:true});
 })()`;
 const apply=(position)=>`(()=>{
  const b=window.__hexoraDualScroll;
  if(b)b.muteUntil=performance.now()+350;
  const root=document.scrollingElement||document.documentElement;
  const mx=Math.max(0,root.scrollWidth-innerWidth),my=Math.max(0,root.scrollHeight-innerHeight);
  const x=${position.mx?Math.round(position.x/position.mx*1000000):0}/1000000*mx;
  const y=${position.my?Math.round(position.y/position.my*1000000):0}/1000000*my;
  const old=root.style.scrollBehavior;
  root.style.scrollBehavior='auto';
  window.scrollTo({left:x,top:y,behavior:'instant'});
  root.style.scrollBehavior=old;
 })()`;
 return function open(){
  const id=getActiveId(),tab=getTab(id);
  if(!tab||tab.workspace!=='dual'||isCodeTab(tab))return false;
  if(state&&!state.popup.isDestroyed()){state.popup.focus();return true;}
  const popup=new BrowserWindow({width:960,height:720,minWidth:420,minHeight:320,title:'Hexora · Dual Workspace (Mirror Test)',backgroundColor:'#111215',autoHideMenuBar:true,webPreferences:{partition:'persist:hexora-chatgpt',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  const target=popup.webContents;
  const current={popup,id:null,url:null,source:null,handlers:[],generation:0};state=current;
  const detach=()=>{
   for(const [wc,event,handler] of current.handlers)if(!wc.isDestroyed())wc.removeListener(event,handler);
   current.handlers=[];
  };
  const on=(wc,event,handler)=>{wc.on(event,handler);current.handlers.push([wc,event,handler]);};
  const listen=(wc,other)=>{
   const onMessage=(_event,...args)=>{
    const message=typeof args[0]==='object'?args[0]?.message:args[1];
    if(typeof message!=='string'||!message.startsWith(prefix)||other.isDestroyed()||other.isLoading())return;
    try{const position=JSON.parse(message.slice(prefix.length));void other.executeJavaScript(apply(position)).catch(()=>{});}catch{}
   };
   on(wc,'console-message',onMessage);
   on(wc,'dom-ready',()=>{void wc.executeJavaScript(listener).catch(()=>{});});
   if(!wc.isLoading())void wc.executeJavaScript(listener).catch(()=>{});
  };
  on(target,'did-fail-load',(_event,code,description,url,isMainFrame)=>{if(isMainFrame)console.error('[Dual Mirror] Load failed:',code,description,url);});
  const tick=async()=>{
   if(popup.isDestroyed())return;
   const active=getActiveId(),row=getTab(active);
   if(!row||row.workspace!=='dual'||isCodeTab(row))return;
   const source=getView(active)?.webContents,url=source?.getURL();
   if(!source||source.isDestroyed()||!/^https?:\/\//.test(url))return;
   if(current.id===active&&current.url===url&&current.source===source)return;
   current.id=active;current.url=url;current.source=source;
   const generation=++current.generation;
   detach();
   listen(source,target);listen(target,source);
   try{await target.loadURL(url);}catch(error){console.error('[Dual Mirror] Navigation failed:',error.message);}
   if(generation!==current.generation)return;
  };
  const timer=setInterval(()=>{void tick().catch(error=>console.warn('[Dual Mirror]',error.message));},300);
  popup.on('closed',()=>{clearInterval(timer);detach();if(state===current)state=null;});
  void tick();return true;
 };
}
module.exports={createDualMirror};
