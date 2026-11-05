'use strict';
document.getElementById('left').addEventListener('click',()=>window.dockControls.move(-1));
document.getElementById('right').addEventListener('click',()=>window.dockControls.move(1));
document.getElementById('vertical').addEventListener('click',()=>window.dockControls.toggleVertical());
window.dockControls.onPosition(position=>{
 const button=document.getElementById('vertical');
 const bottom=position==='bottom';
 button.textContent=bottom?'↑':'↓';
 button.title=bottom?'Move docked alerts to top':'Move docked alerts to bottom';
 button.setAttribute('aria-label',button.title);
});
