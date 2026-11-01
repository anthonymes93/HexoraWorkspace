'use strict';
const {ipcRenderer}=require('electron');
let widget=null,menu=null,focused=null,entries=[],lastHost='';
const valid=()=>location.protocol==='https:'&&!!document.querySelector('input[type="password"]');
function hide(){if(menu)menu.hidden=true;}
function build(){
 if(widget||!document.body)return;
 widget=document.createElement('div');widget.id='hexora-vault-suggest';widget.style.cssText='position:fixed;z-index:2147483646;display:none;right:24px;bottom:24px;font:12px system-ui,sans-serif;color:#f3eff9';
 const shadow=widget.attachShadow({mode:'closed'});
 shadow.innerHTML='<style>button{font:inherit;cursor:pointer;color:#eee;background:#292432;border:1px solid #5c506b;border-radius:10px;padding:10px 13px;box-shadow:0 12px 35px #0008}button:hover{background:#40344e}.panel{position:absolute;bottom:45px;right:0;width:245px;background:#231f2b;border:1px solid #5b5069;border-radius:12px;padding:10px;box-shadow:0 18px 50px #000a}.panel[hidden]{display:none}.account{display:block;width:100%;text-align:left;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hint{font-size:11px;color:#bcb4c9;padding:8px}</style><div class="panel" hidden><strong>Hexora Password Vault</strong><div class="items"></div></div><button class="trigger" type="button">◇ Logins</button>';
 menu=shadow.querySelector('.panel');const items=shadow.querySelector('.items');
 shadow.querySelector('.trigger').addEventListener('click',async()=>{
  if(!menu.hidden){hide();return;}
  items.replaceChildren();
  try{
   const result=await ipcRenderer.invoke('vault:site-suggestions');
   if(result.locked){const note=document.createElement('div');note.className='hint';note.textContent='Unlock the vault using the Hexora sidebar first.';items.append(note);}
   else if(!result.entries.length){const note=document.createElement('div');note.className='hint';note.textContent='No login saved for this exact website.';items.append(note);}
   else for(const entry of result.entries){
    const b=document.createElement('button');b.className='account';b.textContent=entry.name+' · '+entry.username;
    b.addEventListener('click',async()=>{try{const response=await ipcRenderer.invoke('vault:site-fill',entry.id);if(!response.filled)throw Error(response.reason);hide();}catch(err){items.textContent=err.message;}});items.append(b);
   }
   menu.hidden=false;
  }catch(err){items.textContent=err.message;menu.hidden=false;}
 });
 document.body.append(widget);
}
function check(){
 if(!document.body)return;
 build();
 if(location.protocol!=='https:'){widget.style.display='none';return;}
 const pass=[...document.querySelectorAll('input[type="password"]')].some(el=>el.getClientRects().length>0);
 widget.style.display=pass?'block':'none';
 if(!pass)hide();
}
window.addEventListener('DOMContentLoaded',check);
setInterval(check,1200);
