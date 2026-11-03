'use strict';
const {BrowserWindow,WebContentsView}=require('electron');

// Deliberately ephemeral test feature: two webContents with the same session,
// not one view attached to multiple windows.
function createDualMirror({getActiveId,getTab,getView,isCodeTab}){
 let state=null;
 const read='(()=>({x:scrollX,y:scrollY,mx:Math.max(0,document.documentElement.scrollWidth-innerWidth),my:Math.max(0,document.documentElement.scrollHeight-innerHeight)}))()';
 const changed=(a,b)=>!b||Math.abs(a.x-b.x)>1||Math.abs(a.y-b.y)>1;
 const instant=(x,y)=>`(()=>{const root=document.documentElement,previous=root.style.scrollBehavior;root.style.scrollBehavior='auto';window.scrollTo({left:${x},top:${y},behavior:'instant'});root.style.scrollBehavior=previous;})()`;
 return function open(){
  const id=getActiveId(),tab=getTab(id);
  if(!tab||tab.workspace!=='dual'||isCodeTab(tab))return false;
  if(state&&!state.popup.isDestroyed()){state.popup.focus();return true;}
  const popup=new BrowserWindow({width:960,height:720,minWidth:420,minHeight:320,title:'Hexora · Dual Workspace (Mirror Test)',backgroundColor:'#111215',autoHideMenuBar:true});
  const view=new WebContentsView({webPreferences:{partition:'persist:hexora-chatgpt',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  view.setBackgroundColor('#111215');popup.contentView.addChildView(view);
  const layout=()=>{if(!popup.isDestroyed()){const [width,height]=popup.getContentSize();view.setBounds({x:0,y:0,width,height});}};
  popup.on('resize',layout);layout();
  const current={popup,view,id:null,url:null,lastSource:null,lastMirror:null,busy:false,ignoreSourceUntil:0,ignoreMirrorUntil:0};state=current;
  const tick=async()=>{
   if(current.busy||popup.isDestroyed())return;
   current.busy=true;
   try{
    const active=getActiveId(),row=getTab(active);
    if(row?.workspace==='dual'&&!isCodeTab(row)){
     const source=getView(active)?.webContents,url=source?.getURL();
     if(source&&!source.isDestroyed()&&/^https?:\/\//.test(url)&&(current.id!==active||current.url!==url)){
      current.id=active;current.url=url;current.lastSource=null;current.lastMirror=null;current.ignoreSourceUntil=0;current.ignoreMirrorUntil=0;
      await view.webContents.loadURL(url);
     }
    }
    const source=getView(current.id)?.webContents,target=view.webContents;
    if(!source||source.isDestroyed()||target.isDestroyed()||target.isLoading()||source.isLoading())return;
    const [a,b]=await Promise.all([source.executeJavaScript(read),target.executeJavaScript(read)]);
    const now=Date.now();
    const sourceMoved=changed(a,current.lastSource)&&now>=current.ignoreSourceUntil;
    const mirrorMoved=changed(b,current.lastMirror)&&now>=current.ignoreMirrorUntil;
    if(sourceMoved){
     const x=a.mx?Math.round(a.x/a.mx*b.mx):0,y=a.my?Math.round(a.y/a.my*b.my):0;
     current.lastSource=a;current.lastMirror={...b,x,y};
     current.ignoreMirrorUntil=now+110;
     await target.executeJavaScript(instant(x,y));
    }else if(mirrorMoved){
     const x=b.mx?Math.round(b.x/b.mx*a.mx):0,y=b.my?Math.round(b.y/b.my*a.my):0;
     current.lastMirror=b;current.lastSource={...a,x,y};
     current.ignoreSourceUntil=now+110;
     await source.executeJavaScript(instant(x,y));
    }else{
     // Update baselines after programmatic scrolling, without bouncing it back.
     if(now<current.ignoreSourceUntil)current.lastSource=a;
     if(now<current.ignoreMirrorUntil)current.lastMirror=b;
    }
   }catch(error){/* Some sites have inaccessible or non-scrollable contexts. */}
   finally{current.busy=false;}
  };
  const timer=setInterval(tick,33);
  popup.on('closed',()=>{clearInterval(timer);if(state===current)state=null;});
  void tick();return true;
 };
}
module.exports={createDualMirror};
