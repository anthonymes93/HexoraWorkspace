'use strict';
const $=id=>document.getElementById(id);
async function command(name,value){try{await window.pcTv.command(name,value);}catch(error){console.error('[PC TV]',error);}}
function paint(s){
 const tabs=$('tv-tabs');tabs.replaceChildren();
 for(const tab of s.tabs||[]){
  const select=document.createElement('button');select.textContent=tab.title||'YouTube';select.title=tab.url||'YouTube';select.classList.toggle('active',tab.id===s.active);
  select.onclick=()=>command('select-tab',tab.id);tabs.append(select);
  const close=document.createElement('button');close.className='close-tab';close.textContent='×';close.title='Close tab';close.onclick=()=>command('close-tab',tab.id);tabs.append(close);
 }
 const toggle=document.createElement('button');toggle.className='youtube-header-toggle';toggle.type='button';toggle.textContent=s.youtubeHeaderHidden?'Show YT bar':'Hide YT bar';toggle.title=s.youtubeHeaderHidden?'Show YouTube top bar':'Hide YouTube top bar';toggle.setAttribute('aria-pressed',String(!!s.youtubeHeaderHidden));toggle.onclick=()=>command('toggle-youtube-header');tabs.append(toggle);
 const add=document.createElement('button');add.className='new-tab';add.textContent='+';add.title='New YouTube tab';add.onclick=()=>command('new-tab');tabs.append(add);
}

window.pcTv.onState(paint);window.pcTv.state().then(paint);
document.addEventListener('keydown',event=>{if(event.key==='F11'){event.preventDefault();command('fullscreen');}else if(event.key==='Escape'){window.pcTv.state().then(s=>{if(s.fullscreen)command('fullscreen');});}});
