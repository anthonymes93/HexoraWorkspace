'use strict';
const {BrowserWindow,WebContentsView}=require('electron');

// Deliberately ephemeral test feature: two webContents with the same session,
// not one view attached to multiple windows.
function createDualMirror({getActiveId,getTab,getView,isCodeTab}){
 let state=null;
 const read='(()=>({x:scrollX,y:scrollY,mx:Math.max(0,document.documentElement.scrollWidth-innerWidth),my:Math.max(0,document.documentElement.scrollHeight-innerHeight)}))()';
 const changed=(a,b)=>!b||Math.abs(a.x-b.x)>3||Math.abs(a.y-b.y)>3;
 return function open(){
  const id=getActiveId(),tab=getTab(id);
  if(!tab||tab.workspace!=='dual'||isCodeTab(tab))return false;
  if(state&&!state.popup.isDestroyed()){state.popup.focus();return true;}
  const popup=new BrowserWindow({width:960,height:720,minWidth:420,minHeight:320,title:'Hexora · Dual Workspace (Mirror Test)',backgroundColor:'#111215',autoHideMenuBar:true});
  const view=new WebContentsView({webPreferences:{partition:'persist:hexora-chatgpt',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  view.setBackgroundColor('#111215');popup.contentView.addChildView(view);
  const layout=()=>{if(!popup.isDestroyed()){const [width,height]=popup.getContentSize();view.setBounds({x:0,y:0,width,height});}};
  popup.on('resize',layout);layout();
  const current={popup,view,id:null,url:null,lastSource:null,lastMirror:null,busy:false};state=current;
  const tick=async()=>{
   if(current.busy||popup.isDestroyed())return;
   current.busy=true;
   try{
    const active=getActiveId(),row=getTab(active);
    if(row?.workspace==='dual'&&!isCodeTab(row)){
     const source=getView(active)?.webContents,url=source?.getURL();
     if(source&&!source.isDestroyed()&&/^https?:\\/\\//.test(url)&&(current.id!==active||current.url!==url)){
      current.id=active;current.url=url;current.lastSource=null;current.lastMirror=null;
      await view.webContents.loadURL(url);
     }
    }
    const source=getView(current.id)?.webContents,target=view.webContents;
    if(!source||source.isDestroyed()||target.isDestroyed()||target.isLoading()||source.isLoading())return;
    const [a,b]=await Promise.all([source.executeJavaScript(read),target.executeJavaScript(read)]);
    if(changed(a,current.lastSource)){
     const x=a.mx?Math.round(a.x/a.mx*b.mx):0,y=a.my?Math.round(a.y/a.my*b.my):0;
     await target.executeJavaScript('scrollTo('+x+','+y+')');
     current.lastSource=a;current.lastMirror={...b,x,y};
    }else if(changed(b,current.lastMirror)){
     const x=b.mx?Math.round(b.x/b.mx*a.mx):0,y=b.my?Math.round(b.y/b.my*a.my):0;
     await source.executeJavaScript('scrollTo('+x+','+y+')');
     current.lastMirror=b;current.lastSource={...a,x,y};
    }
   }catch(error){/* Some sites have inaccessible or non-scrollable contexts. */}
   finally{current.busy=false;}
  };
  const timer=setInterval(tick,250);
  popup.on('closed',()=>{clearInterval(timer);if(state===current)state=null;});
  void tick();return true;
 };
}
module.exports={createDualMirror};
