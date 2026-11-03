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
    if(details.url===url)finish(popup);
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
 return function open(){
  const id=getActiveId(),tab=getTab(id);
  if(!tab||tab.workspace!=='dual'||isCodeTab(tab))return Promise.resolve(false);
  if(state&&!state.popup.isDestroyed()){state.popup.focus();return Promise.resolve(true);}
  if(opening)return opening;
  const task=(async()=>{
   const firstPair=getMirrorUrl(id)||getView(id)?.webContents.getURL();
   let popup=null,view=null,inheritedUrl=null;
   const chatgptSource=getChatgptSource?.();
   if(chatgptSource&&!chatgptSource.isDestroyed()&&/^https:\/\/chatgpt\.com\//.test(firstPair||'')){
    popup=await openViaChatgpt(chatgptSource,firstPair);
    if(popup){
     inheritedUrl=firstPair;
     console.info('[Dual Mirror] Paired ChatGPT opened from authenticated ChatGPT tab.');
    }else console.warn('[Dual Mirror] Browser popup unavailable; using regular paired web view.');
   }
   if(!popup){
    const sharedSession=session.fromPartition('persist:hexora-chatgpt');
    popup=new BrowserWindow({width:960,height:720,minWidth:420,minHeight:320,title:'Hexora · Dual Workspace (Paired)',backgroundColor:'#111215',autoHideMenuBar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
    view=new WebContentsView({webPreferences:{session:sharedSession,preload:path.join(__dirname,'site-vault-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,javascript:true}});
    view.setBackgroundColor('#111215');
    popup.contentView.addChildView(view);
    const resize=()=>{if(popup.isDestroyed())return;const [width,height]=popup.getContentSize();view.setBounds({x:0,y:0,width,height});};
    popup.on('resize',resize);
    resize();
   }
   popup.setTitle('Hexora · Dual Workspace (Paired)');
   popup.setSize(960,720);
   const target=view?view.webContents:popup.webContents;
  const current={popup,id:null,url:null,source:null,leader:null,leaderUntil:0,last:null,busy:false,loading:false,handlers:[],inheritedUrl};state=current;
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
   // The first page was already navigated by window.open from the real
   // ChatGPT tab, preserving the normal browser opener/sessionStorage semantics.
   if(current.inheritedUrl===pairedUrl){current.inheritedUrl=null;current.loading=false;return;}
   current.inheritedUrl=null;
   const sourceUA=new URL(pairedUrl).hostname==='chatgpt.com'
    ?(getChatgptSource?.()?.getUserAgent()||source.getUserAgent())
    :source.getUserAgent();
   target.setUserAgent(sourceUA);
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
  popup.on('closed',()=>{clearInterval(timer);detach();if(view&&!target.isDestroyed())target.close();if(state===current)state=null;});
  void sync();return true;
  })();
  opening=task.finally(()=>{opening=null;});
  return opening;
 };
}
module.exports={createDualMirror};
