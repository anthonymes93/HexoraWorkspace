const $=id=>document.getElementById(id);
const workspaces=[{id:'web',name:'Web Development',emoji:'◈'},{id:'business',name:'Business',emoji:'▤'},{id:'personal',name:'Personal',emoji:'☼'},{id:'ideas',name:'Ideas Lab',emoji:'✦'}];
let activeWorkspace='web',sidebarOpen=true,offset=0,currentPage=null,refreshing=false,refreshPending=false;
try{const s=JSON.parse(localStorage.getItem('hexora-workspace-settings')||'{}');if(s.workspaces?.length)workspaces.splice(0,workspaces.length,...s.workspaces);if(s.selected)activeWorkspace=s.selected;if(s.sidebarOpen===false)sidebarOpen=false;}catch{}
const save=()=>localStorage.setItem('hexora-workspace-settings',JSON.stringify({workspaces,selected:activeWorkspace,sidebarOpen}));
const action=(name,arg)=>window.hexora.action(name,arg);
async function refresh(){
 if(refreshing){refreshPending=true;return;}refreshing=true;
 try{const p=await window.hexora.page(activeWorkspace,offset);if(!p)return;currentPage=p;render(p);}
 catch(e){console.error('Could not read saved tabs',e);}
 finally{refreshing=false;if(refreshPending){refreshPending=false;refresh();}}
}
function render(p){
 const workspace=workspaces.find(w=>w.id===activeWorkspace)||workspaces[0];
 $('current-workspace').textContent=workspace.emoji+'  '+workspace.name;
 const container=$('workspaces');container.replaceChildren();
 for(const w of workspaces){
  const el=document.createElement('button');el.className='workspace'+(w.id===activeWorkspace?' selected':'');
  const symbol=document.createElement('span');symbol.className='emoji';symbol.textContent=w.emoji;
  const label=document.createElement('span');label.className='name';label.textContent=w.name;
  const count=document.createElement('span');count.className='count';count.textContent=p.counts.find(x=>x.workspace===w.id)?.count||0;
  el.append(symbol,label,count);el.onclick=()=>{activeWorkspace=w.id;offset=0;save();refresh();};container.append(el);
 }
 const conversations=$('conversations');conversations.replaceChildren();
 for(const item of p.tabs){
  const el=document.createElement('button');el.className='chat-row'+(item.active?' active':'');
  const symbol=document.createElement('span');symbol.className='symbol';symbol.textContent=item.suspended?'☾':'▤';
  const name=document.createElement('span');name.className='label';name.textContent=item.title||'New tab';
  const mute=document.createElement('span');mute.className='quick-pin';mute.title=item.muted?'Unmute':'Mute';mute.textContent=item.muted?'◉':'♫';mute.onclick=e=>{e.stopPropagation();action('mute',item.id);};
  const detach=document.createElement('span');detach.className='quick-pin';detach.title='Detach into another window';detach.textContent='↗';detach.onclick=e=>{e.stopPropagation();action('detach',item.id);};
  const pin=document.createElement('span');pin.className='quick-pin';pin.title=item.pinned?'Unpin':'Pin';pin.textContent=item.pinned?'◆':'◇';pin.onclick=e=>{e.stopPropagation();action('pin',item.id);};
  el.append(symbol,name,mute,pin,detach);el.onclick=()=>action('activate',item.id);conversations.append(el);
 }
 const nav=document.createElement('div');nav.className='page-controls';
 const prev=document.createElement('button');prev.textContent='‹ Previous';prev.disabled=offset===0;prev.onclick=()=>{offset=Math.max(0,offset-50);refresh();};
 const next=document.createElement('button');next.textContent='Next ›';next.disabled=p.tabs.length<50;next.onclick=()=>{offset+=50;refresh();};
 const pos=document.createElement('span');pos.textContent=p.tabs.length?(offset+1)+'–'+(offset+p.tabs.length):'No tabs';nav.append(prev,pos,next);conversations.append(nav);
 const tabs=$('tabs');tabs.replaceChildren();
 // Tab strip is deliberately bounded: the current page plus the active tab.
 const shown=[...p.tabs.slice(0,16)];
 if(p.active&&!shown.some(x=>x.id===p.active.id))shown.unshift({...p.active,active:true,suspended:false});
 for(const item of shown){
  const el=document.createElement('button');el.draggable=true;el.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','hexora-tab:'+item.id);});el.className='tab'+(item.id===p.activeId?' active':'');
  const name=document.createElement('span');name.className='name';name.textContent=(item.pinned?'◆ ':'')+(item.title||'ChatGPT');
  const close=document.createElement('span');close.className='close';close.textContent='×';close.onclick=e=>{e.stopPropagation();action('close',item.id);};
  el.title=item.url;el.onclick=()=>action('activate',item.id);
  const pop=document.createElement('span');pop.className='close';pop.title='Detach tab into new window';pop.textContent='↗';pop.onclick=e=>{e.stopPropagation();action('detach',item.id);};
  el.append(name,pop,close);tabs.append(el);
 }
}
function updateSidebar(){$('sidebar').classList.toggle('hidden',!sidebarOpen);document.querySelector('.top-main').classList.toggle('expanded',!sidebarOpen);action('sidebar',!sidebarOpen);save();}
for(const id of ['new','new-rail','new-sidebar','add-tab'])$(id).onclick=()=>action('new',activeWorkspace);
for(const id of ['back','forward','reload'])$(id).onclick=()=>action(id);
for(const id of ['external','settings-rail'])$(id).onclick=()=>action('open-external');
$('toggle-sidebar').onclick=()=>{sidebarOpen=!sidebarOpen;updateSidebar();};
$('add-workspace').onclick=()=>{const name=prompt('Workspace name:');if(!name?.trim())return;const id='ws'+Date.now();workspaces.push({id,name:name.trim().slice(0,55),emoji:'◈'});activeWorkspace=id;offset=0;save();refresh();};
function showSearch(){action('modal',true);$('search-overlay').classList.remove('hidden');$('search-input').value='';filterTabs();$('search-input').focus();}
let searchSeq=0;
async function filterTabs(){const seq=++searchSeq;const items=await window.hexora.search($('search-input').value);if(seq!==searchSeq)return;const el=$('search-results');el.replaceChildren();for(const item of items){const b=document.createElement('button');b.className='result';b.textContent=item.title||item.url;b.onclick=()=>{hideSearch();action('activate',item.id);};el.append(b);}if(!items.length)el.textContent='No matches.';}
function hideSearch(){$('search-overlay').classList.add('hidden');action('modal',false);}
$('search').onclick=showSearch;$('search-rail').onclick=showSearch;$('search-close').onclick=hideSearch;$('search-input').oninput=filterTabs;
$('search-overlay').onclick=e=>{if(e.target===$('search-overlay'))hideSearch();};
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideSearch();if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();showSearch();}if(e.ctrlKey&&e.key.toLowerCase()==='t'){e.preventDefault();action('new',activeWorkspace);}});
window.hexora.onState(()=>{refresh();});updateSidebar();refresh();

function recoveryMessage(text){$('recovery-message').textContent=text;}
async function recoveryStatus(){try{const st=await window.hexora.recovery.status();$('recovery-status').textContent='Destination: '+(st.directory||'Not selected')+' | '+(st.enabled?'Unlocked':'Locked')+(st.lastBackup?' | Last backup: '+st.lastBackup.time:'');}catch(e){recoveryMessage(e.message);}}
$('recovery-rail').onclick=async()=>{try{await action('recovery-window');}catch(err){alert('Recovery could not open: '+err.message);console.error(err);}};
$('recovery-close').onclick=()=>{$('recovery-overlay').classList.add('hidden');action('modal',false);$('recovery-password').value='';};
$('recovery-overlay').onclick=e=>{if(e.target===$('recovery-overlay'))$('recovery-close').click();};
async function recoveryAction(name){
 const pass=$('recovery-password').value;
 try{
  recoveryMessage('Working...');
  let result;
  if(name==='backup')result=await window.hexora.recovery.backup();
  else if(name==='configure')result=await window.hexora.recovery.configure(pass);
  else if(name==='unlock')result=await window.hexora.recovery.unlock(pass);
  else if(name==='restore')result=await window.hexora.recovery.restore(pass);
  recoveryMessage(result?.cancelled?'Cancelled.':name==='backup'?'Backup saved: '+result.file+' ('+result.tabs+' tabs).':name==='restore'?'Restore prepared; restarting...':'Recovery folder ready. Run Back up now to create the first copy.');
  if(name!=='restore')$('recovery-password').value='';
  recoveryStatus();
 }catch(e){recoveryMessage('Error: '+e.message);}
}
for(const name of ['backup','configure','unlock','restore'])$('recovery-'+name).onclick=()=>recoveryAction(name);

// Drop a detached conversation back onto the main tab strip.
const tabStrip=$('tabs');
tabStrip.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
tabStrip.addEventListener('drop',e=>{e.preventDefault();const match=/^hexora-tab:(\d+)$/.exec(e.dataTransfer.getData('text/plain')||'');if(match)action('dock',Number(match[1]));});
