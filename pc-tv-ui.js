'use strict';
const $=id=>document.getElementById(id);
async function command(name,value){try{await window.pcTv.command(name,value);}catch(error){console.error('[PC TV]',error);}}
function paint(s){$('controls').hidden=!s.controlsVisible;$('collapsed').hidden=s.controlsVisible;$('fullscreen').textContent=s.fullscreen?'⛶ Exit fullscreen':'⛶ Fullscreen';document.querySelector('[data-cmd="back"]').disabled=!s.canBack;document.querySelector('[data-cmd="forward"]').disabled=!s.canForward;}
document.querySelectorAll('[data-cmd]').forEach(button=>button.addEventListener('click',()=>command(button.dataset.cmd,button.dataset.cmd==='controls'?button.dataset.value==='true':undefined)));
window.pcTv.onState(paint);window.pcTv.state().then(paint);
document.addEventListener('keydown',event=>{if(event.key==='F10'){event.preventDefault();window.pcTv.state().then(s=>command('controls',!s.controlsVisible));}else if(event.key==='F11'){event.preventDefault();command('fullscreen');}else if(event.key==='Escape'){window.pcTv.state().then(s=>{if(s.fullscreen)command('fullscreen');});}});
