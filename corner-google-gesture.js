'use strict';
const {BrowserWindow,screen}=require('electron');

// A deliberate move into the top-left corner opens one Google window on a
// different monitor. Moving away re-arms the gesture; holding there does not
// spawn more windows.
function startCornerGoogleGesture(){
 let armed=false;
 let inside=false;
 let timer=null;
 const otherDisplay=source=>{
  const displays=screen.getAllDisplays().filter(display=>display.id!==source.id);
  if(!displays.length)return null;
  // Prefer the nearest other monitor, regardless of Windows display numbering.
  const center=rect=>({x:rect.x+rect.width/2,y:rect.y+rect.height/2});
  const a=center(source.bounds);
  return displays.sort((left,right)=>{
   const l=center(left.bounds),r=center(right.bounds);
   return ((l.x-a.x)**2+(l.y-a.y)**2)-((r.x-a.x)**2+(r.y-a.y)**2);
  })[0];
 };
 const tick=()=>{
  const point=screen.getCursorScreenPoint();
  const source=screen.getDisplayNearestPoint(point);
  const {x,y}=source.bounds;
  const atCorner=point.x>=x&&point.y>=y&&point.x<=x+3&&point.y<=y+3;
  if(!atCorner){inside=false;armed=true;return;}
  if(inside||!armed)return;
  inside=true;
  const target=otherDisplay(source);
  if(!target)return;
  armed=false;
  const area=target.workArea;
  const window=new BrowserWindow({
   x:area.x,y:area.y,width:area.width,height:area.height,
   minWidth:400,minHeight:300,title:'Google · Hexora',
   autoHideMenuBar:true,backgroundColor:'#ffffff',
   webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}
  });
  void window.loadURL('https://www.google.com/').catch(error=>console.warn('[Corner Google] Load failed:',error.message));
 };
 timer=setInterval(tick,120);
 timer.unref?.();
 return ()=>clearInterval(timer);
}
module.exports={startCornerGoogleGesture};
