const $ = id => document.getElementById(id);
const workspaces = [{id:'web',name:'Web Development',emoji:'◈'},{id:'business',name:'Business',emoji:'▤'},{id:'personal',name:'Personal',emoji:'☼'},{id:'ideas',name:'Ideas Lab',emoji:'✦'}];
let activeWorkspace = 'web', activeTabs = [], tabWorkspace = {}, sidebarOpen = true;
try { const saved = JSON.parse(localStorage.getItem('hexora-workspace-settings') || '{}'); if(saved.workspaces?.length) { workspaces.splice(0,workspaces.length,...saved.workspaces); } if(saved.selected && workspaces.some(w=>w.id===saved.selected)) activeWorkspace=saved.selected; if(saved.sidebarOpen===false) sidebarOpen=false; } catch {}
function save() { localStorage.setItem('hexora-workspace-settings',JSON.stringify({workspaces,selected:activeWorkspace,sidebarOpen})); }
function action(name,id) { return window.hexora.action(name,id); }
function updateSidebar() { $('sidebar').classList.toggle('hidden',!sidebarOpen); $('top-main').classList.toggle('expanded',!sidebarOpen); action('sidebar',!sidebarOpen); save(); }
function switchWorkspace(id) { activeWorkspace=id; const first=activeTabs.find(t=>tabWorkspace[t.id]===id); if(first) action('activate',first.id); render();save(); }
function render() {
 const current=workspaces.find(w=>w.id===activeWorkspace)||workspaces[0];
 $('current-workspace').textContent=current.emoji+'  '+current.name;
 const list=$('workspaces'); list.replaceChildren();
 for(const w of workspaces) {
   const el=document.createElement('button'); el.className='workspace'+(w.id===activeWorkspace?' selected':'');
   const icon=document.createElement('span');icon.className='emoji';icon.textContent=w.emoji;
   const name=document.createElement('span');name.className='name';name.textContent=w.name;
   const count=document.createElement('span');count.className='count';count.textContent=activeTabs.filter(t=>tabWorkspace[t.id]===w.id).length;
   el.append(icon,name,count);el.onclick=()=>switchWorkspace(w.id);list.append(el);
 }
 const conversations=$('conversations');conversations.replaceChildren();
 const items=activeTabs.filter(t=>tabWorkspace[t.id]===activeWorkspace);
 if(!items.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No open tabs in this workspace.';conversations.append(empty);}
 for(const item of items) {
   const el=document.createElement('button');el.className='chat-row'+(item.active?' active':'');
   const symbol=document.createElement('span');symbol.className='symbol';symbol.textContent='▤';
   const label=document.createElement('span');label.className='label';label.textContent=item.title||'ChatGPT';
   const pin=document.createElement('span');pin.className='quick-pin';pin.title=item.pinned?'Unpin tab':'Pin tab';pin.textContent=item.pinned?'◆':'◇';pin.onclick=e=>{e.stopPropagation();action('pin',item.id);};const mute=document.createElement('span');mute.className='quick-pin';mute.title=item.muted?'Unmute tab':'Mute tab';mute.textContent=item.muted?'◉':'♫';mute.onclick=e=>{e.stopPropagation();action('mute',item.id);};el.append(symbol,label,mute,pin);el.onclick=()=>action('activate',item.id);conversations.append(el);
 }
 const tabs=$('tabs');tabs.replaceChildren();
 for(const item of activeTabs) {
   const el=document.createElement('button');el.className='tab'+(item.active?' active':'');
   const name=document.createElement('span');name.className='name';name.textContent=(item.loading?'◌  ':'')+(item.title||'ChatGPT');
   el.title=(item.url||'Loading')+(item.suspended?' · suspended':'');const close=document.createElement('span');close.className='close';close.textContent='×';close.title='Close tab';
   close.onclick=e=>{e.stopPropagation();action('close',item.id);};el.onclick=()=>action('activate',item.id);
   if(item.pinned){const mark=document.createElement('span');mark.title='Pinned';mark.textContent='◆';el.append(mark);} if(item.suspended){const mark=document.createElement('span');mark.title='Suspended';mark.textContent='☾';el.append(mark);} el.append(name,close);tabs.append(el);
 }
}
window.hexora.onState(list=>{
 activeTabs=list;
 const ids=new Set(list.map(t=>t.id));
 for(const id of Object.keys(tabWorkspace)) if(!ids.has(Number(id))) delete tabWorkspace[id];
 for(const item of list) tabWorkspace[item.id]=item.workspace||tabWorkspace[item.id]||activeWorkspace;
 const active=list.find(t=>t.active);
 if(active && tabWorkspace[active.id] !== activeWorkspace) activeWorkspace=tabWorkspace[active.id];
 render();
});
for(const id of ['new','new-rail','new-sidebar','add-tab']) $(id).onclick=()=>action('new',activeWorkspace);
for(const id of ['back','forward','reload']) $(id).onclick=()=>action(id);
for(const id of ['external','settings-rail']) $(id).onclick=()=>action('open-external');
$('toggle-sidebar').onclick=()=>{sidebarOpen=!sidebarOpen;updateSidebar();};
$('add-workspace').onclick=()=>{const name=prompt('New workspace name:');if(!name?.trim())return;const id='ws'+Date.now();workspaces.push({id,name:name.trim().slice(0,55),emoji:'◈'});switchWorkspace(id);};
function showSearch(){ $('search-overlay').classList.remove('hidden');$('search-input').value='';filterTabs();$('search-input').focus();}
function filterTabs(){const q=$('search-input').value.toLowerCase();const results=$('search-results');results.replaceChildren();for(const item of activeTabs.filter(t=>(t.title||'').toLowerCase().includes(q))){const row=document.createElement('button');row.className='result';row.textContent=item.title||'ChatGPT';row.onclick=()=>{hideSearch();action('activate',item.id);};results.append(row);}if(!results.children.length)results.textContent='No open tabs match.';}
function hideSearch(){$('search-overlay').classList.add('hidden');}
$('search').onclick=showSearch;$('search-rail').onclick=showSearch;$('search-close').onclick=hideSearch;$('search-input').oninput=filterTabs;
$('search-overlay').onclick=e=>{if(e.target===$('search-overlay'))hideSearch();};
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideSearch();if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();showSearch();}if(e.ctrlKey&&e.key.toLowerCase()==='t'){e.preventDefault();action('new');}if(e.ctrlKey&&e.key==='Tab'){e.preventDefault();const i=activeTabs.findIndex(t=>t.active);const next=activeTabs[(i+(e.shiftKey?-1:1)+activeTabs.length)%activeTabs.length];if(next)action('activate',next.id);}});
updateSidebar();render();