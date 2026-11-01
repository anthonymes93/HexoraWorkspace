const $=id=>document.getElementById(id);
const workspaces=[{id:'web',name:'Web Development',emoji:'◈'},{id:'business',name:'Business',emoji:'▤'},{id:'personal',name:'Personal',emoji:'☼'},{id:'ideas',name:'Ideas Lab',emoji:'✦'}];
let activeWorkspace='web',sidebarOpen=true,offset=0,currentPage=null,refreshing=false,refreshPending=false;
let contextTab=null,websiteTarget=null,workspaceEditing=null;
const quickJumpsKey='hexora-quick-jumps';
let quickJumps=[];
try{const items=JSON.parse(localStorage.getItem(quickJumpsKey)||'[]');if(Array.isArray(items))quickJumps=items.filter(x=>Number.isSafeInteger(x.id)&&x.id>0).slice(0,20);}catch{}
function saveQuickJumps(){localStorage.setItem(quickJumpsKey,JSON.stringify(quickJumps));}
let quickJumpTarget=null;
async function showQuickJumpEditor(tab=null){
 quickJumpTarget=tab?.id||null;
 const select=$('quick-jump-tab');select.replaceChildren();
 const items=await Promise.all(workspaces.map(async w=>({w,tabs:await window.hexora.page(w.id,0)})));
 for(const {w,tabs} of items)for(const t of tabs.tabs){
  const option=document.createElement('option');option.value=String(t.id);
  option.textContent=w.name+' — '+(t.title||t.url||'Tab');
  select.append(option);
 }
 if(!select.options.length){alert('No tabs available to add.');return;}
 const preferred=tab?.id||currentPage?.activeId;
 if([...select.options].some(o=>Number(o.value)===preferred))select.value=String(preferred);
 const selected=items.flatMap(x=>x.tabs.tabs).find(t=>t.id===Number(select.value));
 $('quick-jump-icon').value=workspaces.find(w=>w.id===selected?.workspace)?.emoji||'✦';
 $('quick-jump-error').textContent='';
 $('quick-jump-overlay').classList.remove('hidden');action('modal',true);
}
function closeQuickJumpEditor(){$('quick-jump-overlay').classList.add('hidden');quickJumpTarget=null;action('modal',false);}
$('quick-jump-cancel').onclick=closeQuickJumpEditor;
$('quick-jump-close').onclick=closeQuickJumpEditor;
$('quick-jump-overlay').onclick=e=>{if(e.target===$('quick-jump-overlay'))closeQuickJumpEditor();};
$('quick-jump-form').onsubmit=async e=>{
 e.preventDefault();const id=Number($('quick-jump-tab').value);
 const tab=await window.hexora.lookupTab(id);
 if(!tab){$('quick-jump-error').textContent='Tab no longer exists.';return;}
 if(quickJumps.some(x=>x.id===id)){$('quick-jump-error').textContent='This tab already has a shortcut.';return;}
 quickJumps.push({id,icon:$('quick-jump-icon').value.trim().slice(0,8)||'✦',title:tab.title||'Tab'});
 saveQuickJumps();closeQuickJumpEditor();renderQuickJumps();
};
function addQuickJump(tab){showQuickJumpEditor(tab).catch(err=>alert('Quick Jump: '+err.message));}
async function jumpToTab(id){
 try{
  const tab=await window.hexora.lookupTab(id);
  if(!tab){quickJumps=quickJumps.filter(x=>x.id!==id);saveQuickJumps();renderQuickJumps();alert('That tab was closed, so its shortcut was removed.');return;}
  activeWorkspace=tab.workspace;offset=0;save();
  const ok=await action('activate',tab.id);
  if(ok===false)throw new Error('Tab could not be opened.');
  refresh();
 }catch(e){alert('Quick Jump: '+e.message);}
}
function renderQuickJumps(){
 const host=$('quick-jumps');if(!host)return;host.replaceChildren();
 for(const item of quickJumps){
  const button=document.createElement('button');button.className='quick-jump'+(currentPage?.activeId===item.id?' current':'');
  button.textContent=item.icon||'✦';button.title=item.title+' · Click to jump; right-click to edit or remove';
  button.setAttribute('aria-label','Jump to '+item.title);
  button.onclick=()=>jumpToTab(item.id);
  button.oncontextmenu=e=>{
   e.preventDefault();
   const value=window.prompt?.('Shortcut icon (leave blank to remove):',item.icon);
   if(value===null)return;
   if(!value.trim())quickJumps=quickJumps.filter(x=>x.id!==item.id);
   else item.icon=value.trim().slice(0,8);
   saveQuickJumps();renderQuickJumps();
  };
  host.append(button);
 }
 const add=document.createElement('button');add.className='quick-jump add';add.textContent='＋';
 add.title='Pin the active tab to Quick Jump';add.setAttribute('aria-label','Add current tab to Quick Jump');
 add.onclick=()=>showQuickJumpEditor().catch(err=>alert('Quick Jump: '+err.message));
 host.append(add);
}
try{const s=JSON.parse(localStorage.getItem('hexora-workspace-settings')||'{}');if(s.workspaces?.length)workspaces.splice(0,workspaces.length,...s.workspaces);if(s.selected)activeWorkspace=s.selected;if(s.sidebarOpen===false)sidebarOpen=false;}catch{}
const save=()=>localStorage.setItem('hexora-workspace-settings',JSON.stringify({workspaces,selected:activeWorkspace,sidebarOpen}));
if(!workspaces.some(w=>w.id===activeWorkspace))activeWorkspace=workspaces[0].id;
const action=(name,arg)=>window.hexora.action(name,arg);
async function refresh(){
 if(tabPointer?.moving)return;
 if(refreshing){refreshPending=true;return;}refreshing=true;
 try{const p=await window.hexora.page(activeWorkspace,offset);if(!p)return;currentPage=p;render(p);}
 catch(e){console.error('Could not read saved tabs',e);}
 finally{refreshing=false;if(refreshPending){refreshPending=false;refresh();}}
}
function render(p){
 if(p.activeId&&p.activePanelMode){const desired=p.activePanelMode==='wide';if(sidebarOpen!==desired){sidebarOpen=desired;updateSidebar(false);}}
 const workspace=workspaces.find(w=>w.id===activeWorkspace)||workspaces[0];
 $('current-workspace').textContent=workspace.emoji+'  '+workspace.name;
 const container=$('workspaces');container.replaceChildren();
 for(const w of workspaces){
  const el=document.createElement('button');el.className='workspace'+(w.id===activeWorkspace?' selected':'');
  const symbol=document.createElement('span');symbol.className='emoji';symbol.textContent=w.emoji;
  const label=document.createElement('span');label.className='name';label.textContent=w.name;
  const count=document.createElement('span');count.className='count';count.textContent=p.counts.find(x=>x.workspace===w.id)?.count||0;
  const edit=document.createElement('span');edit.className='workspace-edit';edit.title='Edit workspace';edit.textContent='⋯';edit.onclick=e=>{e.stopPropagation();openWorkspaceEditor(w.id);};
  el.append(symbol,label,count,edit);el.onclick=async()=>{activeWorkspace=w.id;offset=0;save();await action('switch-workspace',w.id);refresh();};container.append(el);
 }
 const conversations=$('conversations');conversations.replaceChildren();
 for(const item of p.tabs){
  const el=document.createElement('button');el.className='chat-row'+(item.active?' active':'');
  const symbol=document.createElement('span');symbol.className='symbol';symbol.textContent=item.suspended?'☾':'▤';
  const name=document.createElement('span');name.className='label';name.textContent=item.title||'New tab';
  const mute=document.createElement('span');mute.className='quick-pin';mute.title=item.muted?'Unmute':'Mute';mute.textContent=item.muted?'◉':'♫';mute.onclick=e=>{e.stopPropagation();action('mute',item.id);};
  const detach=document.createElement('span');detach.className='quick-pin';detach.title='Detach into another window';detach.textContent='↗';detach.onclick=e=>{e.stopPropagation();action('detach',item.id);};
  const pin=document.createElement('span');pin.className='quick-pin';pin.title=item.pinned?'Unpin':'Pin';pin.textContent=item.pinned?'◆':'◇';pin.onclick=e=>{e.stopPropagation();action('pin',item.id);};
  el.append(symbol,name,mute,pin,detach);el.onclick=()=>action('activate',item.id);el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();showTabMenu(e.clientX,e.clientY,item);});conversations.append(el);
 }
 const nav=document.createElement('div');nav.className='page-controls';
 const prev=document.createElement('button');prev.textContent='‹ Previous';prev.disabled=offset===0;prev.onclick=()=>{offset=Math.max(0,offset-50);refresh();};
 const next=document.createElement('button');next.textContent='Next ›';next.disabled=p.tabs.length<50;next.onclick=()=>{offset+=50;refresh();};
 const pos=document.createElement('span');pos.textContent=p.tabs.length?(offset+1)+'–'+(offset+p.tabs.length):'No tabs';nav.append(prev,pos,next);conversations.append(nav);
 let shortcuts=$('quick-jumps');if(!shortcuts){shortcuts=document.createElement('div');shortcuts.id='quick-jumps';shortcuts.className='quick-jumps';conversations.append(shortcuts);}
 renderQuickJumps();
 const tabs=$('tabs');tabs.replaceChildren();
 // Tab strip is deliberately bounded: the current page plus the active tab.
 const shown=[...p.tabs.slice(0,16)];
 if(p.active&&!shown.some(x=>x.id===p.active.id))shown.unshift({...p.active,active:true,suspended:false});
 for(const item of shown){
  const el=document.createElement('button');el.dataset.tabId=String(item.id);el.draggable=false;el.className='tab'+(item.id===p.activeId?' active':'');
  if(p.tabs.slice(0,16).some(t=>t.id===item.id))el.addEventListener('pointerdown',beginTabPointerDrag);
  const name=document.createElement('span');name.className='name';name.textContent=(item.pinned?'◆ ':'')+(item.title||'ChatGPT');
  const close=document.createElement('span');close.className='close';close.textContent='×';close.onclick=e=>{e.stopPropagation();action('close',item.id);};
  el.title=item.url;el.onclick=()=>action('activate',item.id);
  el.addEventListener('contextmenu',e=>{e.preventDefault();showTabMenu(e.clientX,e.clientY,item);});
  const pop=document.createElement('span');pop.className='close';pop.title='Detach tab into new window';pop.textContent='↗';pop.onclick=e=>{e.stopPropagation();action('detach',item.id);};
  el.append(name,pop,close);tabs.append(el);
 }
}
function updateSidebar(persist=true){action('sidebar',!sidebarOpen);if(persist&&currentPage?.activeId)action('panel-mode',{id:currentPage.activeId,mode:sidebarOpen?'wide':'thin'});save();}
for(const id of ['new','new-rail','new-sidebar','add-tab'])$(id).onclick=()=>action('new',activeWorkspace);
for(const id of ['back','forward','reload'])$(id).onclick=()=>action(id);
for(const id of ['external','settings-rail'])$(id).onclick=()=>action('open-external');
const toggleSidebar=()=>{sidebarOpen=!sidebarOpen;updateSidebar();};
$('toggle-sidebar').onclick=toggleSidebar;
$('collapse-sidebar').onclick=toggleSidebar;
$('add-workspace').onclick=()=>openWorkspaceEditor(null);
function showSearch(){action('modal',true);$('search-overlay').classList.remove('hidden');$('search-input').value='';filterTabs();$('search-input').focus();}
let searchSeq=0;
async function filterTabs(){const seq=++searchSeq;const items=await window.hexora.search($('search-input').value);if(seq!==searchSeq)return;const el=$('search-results');el.replaceChildren();for(const item of items){const b=document.createElement('button');b.className='result';b.textContent=item.title||item.url;b.onclick=()=>{hideSearch();action('activate',item.id);};el.append(b);}if(!items.length)el.textContent='No matches.';}
function hideSearch(){$('search-overlay').classList.add('hidden');action('modal',false);}
$('search').onclick=showSearch;$('search-rail').onclick=showSearch;$('search-close').onclick=hideSearch;$('search-input').oninput=filterTabs;
$('search-overlay').onclick=e=>{if(e.target===$('search-overlay'))hideSearch();};
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideSearch();if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();showSearch();}if(e.ctrlKey&&e.key.toLowerCase()==='t'){e.preventDefault();action('new',activeWorkspace);}});
window.hexora.onState(()=>{refresh();});updateSidebar();action('switch-workspace',activeWorkspace).then(refresh);

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

// Pointer-based reorder: no native Chromium drag image or dotted cursor rectangle.
const tabStrip=$('tabs');
let tabPointer=null,dropSaving=false,suppressTabClickUntil=0;
function beginTabPointerDrag(e){
 if(e.button!==0||!e.isPrimary||e.target.closest('.close'))return;
 const tab=e.currentTarget;
 tabPointer={tab,id:Number(tab.dataset.tabId),workspace:activeWorkspace,startX:e.clientX,startY:e.clientY,moving:false,originLeft:tab.getBoundingClientRect().left,visualLeft:tab.getBoundingClientRect().left,grabOffset:e.clientX-tab.getBoundingClientRect().left};
 // Do not capture until the movement threshold is met; a normal click still activates.
}
function animateReflow(before,dragged){
 for(const el of tabStrip.children){
  if(el===dragged)continue;
  const dx=(before.get(el)||0)-el.getBoundingClientRect().left;
  if(Math.abs(dx)>0.5)el.animate([{transform:'translate3d('+dx+'px,0,0)'},{transform:'translate3d(0,0,0)'}],{duration:190,easing:'cubic-bezier(.2,.8,.2,1)'});
 }
}
window.addEventListener('pointermove',e=>{
 const d=tabPointer;if(!d||!e.isPrimary)return;
 if(!d.tab.isConnected||activeWorkspace!==d.workspace){cancelTabPointer();return;}
 if(!d.moving){
  if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<5)return;
  d.moving=true;d.tab.classList.add('dragging');
  document.body.classList.add('reordering-tabs');
 }
 e.preventDefault();
 const rect=tabStrip.getBoundingClientRect();
 if(e.clientX>rect.right-24)tabStrip.scrollLeft+=12;
 else if(e.clientX<rect.left+24)tabStrip.scrollLeft-=12;
 const desiredLeft=e.clientX-d.grabOffset;
 const slotLeft=d.tab.getBoundingClientRect().left-parseFloat(d.tab.style.getPropertyValue('--drag-x')||'0');
 d.tab.style.setProperty('--drag-x',(desiredLeft-slotLeft)+'px');
 d.visualLeft=desiredLeft;
 const center=desiredLeft+d.tab.offsetWidth/2;
 const others=[...tabStrip.children].filter(el=>el!==d.tab);
 const next=others.find(el=>center<el.getBoundingClientRect().left+el.offsetWidth/2)||null;
 if(next!==d.tab.nextElementSibling){
  const before=new Map([...tabStrip.children].map(el=>[el,el.getBoundingClientRect().left]));
  tabStrip.insertBefore(d.tab,next);
  const newSlot=d.tab.getBoundingClientRect().left-parseFloat(d.tab.style.getPropertyValue('--drag-x')||'0');
  d.tab.style.setProperty('--drag-x',(desiredLeft-newSlot)+'px');
  animateReflow(before,d.tab);
 }
});
function cancelTabPointer(){
 if(!tabPointer)return;
 tabPointer.tab.classList.remove('dragging');
 tabPointer.tab.style.removeProperty('--drag-x');
 document.body.classList.remove('reordering-tabs');
 tabPointer=null;
}
window.addEventListener('pointerup',async()=>{
 const d=tabPointer;if(!d)return;
 if(d.moving)suppressTabClickUntil=Date.now()+300;
 const moving=d.moving;
 cancelTabPointer();
 if(!moving||dropSaving)return;
 dropSaving=true;
 const ids=[...tabStrip.querySelectorAll('.tab')].map(el=>Number(el.dataset.tabId)).filter(Number.isSafeInteger);
 try{await action('reorder-tabs',{workspace:d.workspace,ids});}
 catch(error){console.error('Could not reorder tabs',error);refresh();}
 finally{dropSaving=false;}
});
window.addEventListener('pointercancel',()=>{cancelTabPointer();refresh();});
tabStrip.addEventListener('click',e=>{
 if(Date.now()<suppressTabClickUntil){e.preventDefault();e.stopPropagation();}
},true);
// Native drag from an external detached window can still be docked here.
tabStrip.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
tabStrip.addEventListener('drop',e=>{
 e.preventDefault();
 const match=/^hexora-tab:(\d+)$/.exec(e.dataTransfer.getData('text/plain')||'');
 if(match)action('dock',Number(match[1]));
});

// Right-click any tab to turn it into a website, or open a website in a separate tab.
function hideTabMenu(restore=true){ const wasOpen=!$('tab-context-menu').classList.contains('hidden');$('tab-context-menu').classList.add('hidden');contextTab=null;if(wasOpen&&restore&&!websiteTarget)action('modal',false); }
function showTabMenu(x,y,item){
 contextTab=item;
 action('modal',true);
 $('tab-menu-chrome').textContent=item.chromeMode?'✓ Disable Chrome compatibility':'◉ Enable Chrome compatibility';
 const pref=item.panelPreference||{mode:item.panelMode,source:'default'};
 $('tab-menu-panel-wide').textContent=(pref.tabOverride==='wide'?'✓ ':'')+'This tab: Wide';
 $('tab-menu-panel-thin').textContent=(pref.tabOverride==='thin'?'✓ ':'')+'This tab: Thin';
 $('tab-menu-panel-inherit').textContent=(!pref.tabOverride?'✓ ':'')+'This tab: Use domain setting';
 $('tab-menu-domain-wide').textContent=(pref.domainOverride==='wide'?'✓ ':'')+'This domain: Wide';
 $('tab-menu-domain-thin').textContent=(pref.domainOverride==='thin'?'✓ ':'')+'This domain: Thin';
 $('tab-menu-domain-label').textContent=pref.domain?'Domain: '+pref.domain:'No domain';
 $('tab-menu-domain-wide').disabled=!pref.domain;
 $('tab-menu-domain-thin').disabled=!pref.domain;
 const menu=$('tab-context-menu');menu.classList.remove('hidden');
 menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';
 menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
}
function showWebsiteModal(newTab){
 if(!contextTab)return;
 websiteTarget={id:contextTab.id,newTab,workspace:activeWorkspace};hideTabMenu(false);
 $('website-url').value='';$('website-title').value='';$('website-error').textContent='';
 $('website-dialog-title').textContent=newTab?'Open website in new tab':'Open website in this tab';
 $('website-overlay').classList.remove('hidden');action('modal',true);$('website-url').focus();
}
function hideWebsiteModal(){
 $('website-overlay').classList.add('hidden');websiteTarget=null;action('modal',false);
}
$('tab-menu-replace').onclick=()=>showWebsiteModal(false);
$('tab-menu-new').onclick=()=>showWebsiteModal(true);
for(const mode of ['wide','thin']){
 $('tab-menu-panel-'+mode).onclick=async()=>{if(!contextTab)return;const id=contextTab.id;hideTabMenu();try{await action('panel-mode',{id,mode});refresh();}catch(err){alert(err.message);}};
 $('tab-menu-domain-'+mode).onclick=async()=>{if(!contextTab)return;const id=contextTab.id;hideTabMenu();try{await action('panel-domain-mode',{id,mode});refresh();}catch(err){alert(err.message);}};
}
$('tab-menu-panel-inherit').onclick=async()=>{if(!contextTab)return;const id=contextTab.id;hideTabMenu();try{await action('panel-tab-inherit',id);refresh();}catch(err){alert(err.message);}};
$('tab-menu-move').onclick=async()=>{if(!contextTab)return;const id=contextTab.id;hideTabMenu();const list=workspaces.map((w,i)=>(i+1)+': '+w.name).join('\n');const answer=prompt('Move tab to which workspace?\n'+list);if(answer===null)return;const idx=Number(answer)-1;if(!Number.isInteger(idx)||!workspaces[idx])return alert('Choose a workspace number from the list.');try{await action('move-tab',{id,workspace:workspaces[idx].id});if(id===currentPage?.activeId&&workspaces[idx].id!==activeWorkspace){activeWorkspace=workspaces[idx].id;offset=0;save();}refresh();}catch(err){alert(err.message);}};
$('tab-menu-quick-jump').onclick=()=>{const tab=contextTab;hideTabMenu();if(tab)addQuickJump(tab);};
$('tab-menu-chrome').onclick=async()=>{
 if(!contextTab)return;
 const id=contextTab.id;hideTabMenu();
 try{await action('chrome-mode',id);refresh();}catch(err){alert('Chrome compatibility mode: '+err.message);}
};
$('website-cancel').onclick=hideWebsiteModal;
$('website-close').onclick=hideWebsiteModal;
$('website-overlay').onclick=e=>{if(e.target===$('website-overlay'))hideWebsiteModal();};
$('website-form').onsubmit=async e=>{
 e.preventDefault();if(!websiteTarget)return;
 let url=$('website-url').value.trim();if(!url){$('website-error').textContent='Enter a website address.';return;}
 if(!/^[a-zA-Z][\w+.-]*:\/\//.test(url))url='https://'+url;
 try{
  const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password)throw Error();
  const target=websiteTarget;
  await action('open-website',{...target,url:parsed.href,title:$('website-title').value.trim()});
  hideWebsiteModal();refresh();
 }catch(err){$('website-error').textContent=err.message||'Enter a valid HTTP or HTTPS address.';}
};
document.addEventListener('click',e=>{if(!e.target.closest('#tab-context-menu'))hideTabMenu();});
document.addEventListener('contextmenu',e=>{if(!e.target.closest('.tab, .chat-row'))hideTabMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTabMenu();if(websiteTarget)hideWebsiteModal();}});

// The main process owns one animation timeline for both the native browser view and the toolbar layout.
window.hexora.onSidebarFrame(width=>{const value=Math.max(64,Math.min(330,width));document.documentElement.style.setProperty('--hexora-panel-width',(value-64)+'px');document.documentElement.style.setProperty('--hexora-content-left',value+'px');document.body.classList.toggle('panel-collapsed',value<=65);});

function openWorkspaceEditor(id){
 const workspace=id?workspaces.find(w=>w.id===id):null;workspaceEditing=id||null;
 $('workspace-editor-title').textContent=workspace?'Edit workspace':'New workspace';
 $('workspace-name').value=workspace?.name||'';
 $('workspace-icon').value=workspace?.emoji||'◈';
 $('workspace-delete').classList.toggle('hidden',!workspace||workspace.id==='web');
 $('workspace-error').textContent='';
 $('workspace-overlay').classList.remove('hidden');action('modal',true);$('workspace-name').focus();
}
function closeWorkspaceEditor(){$('workspace-overlay').classList.add('hidden');workspaceEditing=null;action('modal',false);}
$('workspace-cancel').onclick=closeWorkspaceEditor;
$('workspace-close').onclick=closeWorkspaceEditor;
$('workspace-overlay').onclick=e=>{if(e.target===$('workspace-overlay'))closeWorkspaceEditor();};
$('workspace-form').onsubmit=async e=>{
 e.preventDefault();
 const name=$('workspace-name').value.trim().slice(0,55),emoji=$('workspace-icon').value.trim().slice(0,8);
 if(!name){$('workspace-error').textContent='Enter a workspace name.';return;}
 if(workspaces.some(w=>w.id!==workspaceEditing&&w.name.toLowerCase()===name.toLowerCase())){$('workspace-error').textContent='A workspace with this name already exists.';return;}
 if(workspaceEditing){const w=workspaces.find(w=>w.id===workspaceEditing);if(!w)return;w.name=name;w.emoji=emoji||'◈';}
 else{const id='ws'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);workspaces.push({id,name,emoji:emoji||'◈'});activeWorkspace=id;offset=0;}
 save();closeWorkspaceEditor();await action('switch-workspace',activeWorkspace);refresh();
};
$('workspace-delete').onclick=async()=>{
 if(!workspaceEditing||workspaceEditing==='web')return;
 const w=workspaces.find(x=>x.id===workspaceEditing);if(!w)return;
 if(!confirm('Delete '+w.name+'? All its tabs will be moved to Web Development. No tabs will be deleted.'))return;
 await action('delete-workspace',{id:w.id,destination:'web'});
 workspaces.splice(workspaces.indexOf(w),1);if(activeWorkspace===w.id){activeWorkspace='web';offset=0;}
 save();closeWorkspaceEditor();await action('switch-workspace',activeWorkspace);refresh();
};

let statisticsTimer=null,statisticsBusy=false;
const statsFormatBytes=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(1)+' MB';
function statisticsClose(){
 $('statistics-overlay').classList.add('hidden');clearInterval(statisticsTimer);statisticsTimer=null;action('modal',false);
}
async function statisticsRefresh(){
 if(statisticsBusy||$('statistics-overlay').classList.contains('hidden'))return;
 statisticsBusy=true;
 try{
  const data=await window.hexora.statistics();
  const total=data.processes.reduce((n,p)=>n+p.memoryBytes,0);
  const cpu=data.processes.reduce((n,p)=>n+p.cpu,0);
  const summary=$('statistics-summary');summary.replaceChildren();
  for(const [label,value] of [['Hexora RAM',statsFormatBytes(total)],['Hexora CPU',cpu.toFixed(1)+'%'],['System RAM used',statsFormatBytes(data.system.totalMemory-data.system.freeMemory)+' / '+statsFormatBytes(data.system.totalMemory)],['Tabs',data.liveTabs+' live / '+data.savedTabs+' saved']]){
   const card=document.createElement('div');card.className='stats-metric';
   const k=document.createElement('small');k.textContent=label;const v=document.createElement('strong');v.textContent=value;card.append(k,v);summary.append(card);
  }
  const tbody=$('statistics-rows');tbody.replaceChildren();
  const tabsByPid=new Map();
  for(const tab of data.tabs){if(!tabsByPid.has(tab.pid))tabsByPid.set(tab.pid,[]);tabsByPid.get(tab.pid).push(tab);}
  const sorted=[...data.processes].sort((a,b)=>b.memoryBytes-a.memoryBytes);
  for(const process of sorted){
   const tr=document.createElement('tr'),names=tabsByPid.get(process.pid)||[];
   const title=document.createElement('td');title.textContent=(names.length?names.map(x=>x.title).join(', '):process.type)+(names.length?' ('+process.type+')':'');
   title.title=names.length?names.map(x=>x.title).join(' • '):process.type;
   for(const value of [process.pid,process.cpu.toFixed(1)+'%',statsFormatBytes(process.memoryBytes)]){
    const td=document.createElement('td');td.textContent=String(value);tr.append(td);
   }
   tr.prepend(title);tbody.append(tr);
  }
  $('statistics-message').textContent='Process CPU figures are provided by Electron; multiple tabs sharing a process cannot be measured independently. Last updated '+new Date(data.time).toLocaleTimeString();
 }catch(err){$('statistics-message').textContent='Could not load statistics: '+err.message;}
 finally{statisticsBusy=false;}
}
$('statistics-rail').onclick=()=>{
 $('statistics-overlay').classList.remove('hidden');action('modal',true);
 clearInterval(statisticsTimer);statisticsTimer=setInterval(statisticsRefresh,2000);statisticsRefresh();
};
$('statistics-close').onclick=statisticsClose;
$('statistics-refresh').onclick=statisticsRefresh;
$('statistics-overlay').onclick=e=>{if(e.target===$('statistics-overlay'))statisticsClose();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('statistics-overlay').classList.contains('hidden'))statisticsClose();});

function closeExtensions(){$('extensions-overlay').classList.add('hidden');action('modal',false);}
async function refreshExtensions(){
 try{
  const extensions=await window.hexora.extensions.list(),list=$('extensions-list');list.replaceChildren();
  refreshExtensionActions();
  if(!extensions.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No extensions installed yet.';list.append(empty);}
  for(const ext of extensions){
   const row=document.createElement('div');row.className='extension-row';
   const details=document.createElement('div');details.className='extension-details';
   const title=document.createElement('strong');title.textContent=ext.name||'Extension';
   const info=document.createElement('small');info.textContent='Version '+(ext.version||'?')+' · '+(ext.enabled?'Enabled':'Disabled');
   const folder=document.createElement('small');folder.textContent=ext.path;folder.title=ext.path;
   details.append(title,info,folder);const compatibility=document.createElement('small');compatibility.className='extension-compatibility';compatibility.textContent=ext.compatibilityNote||'Compatibility unverified';details.append(compatibility);
   if(ext.error){const err=document.createElement('small');err.className='website-error';err.textContent=ext.error;details.append(err);}
   const toggle=document.createElement('button');toggle.className='pill';toggle.textContent=ext.enabled?'Disable':'Enable';
   toggle.onclick=async()=>{try{await window.hexora.extensions.toggle(ext.path);await refreshExtensions();}catch(e){$('extensions-error').textContent=e.message;}};
   const remove=document.createElement('button');remove.className='pill';remove.textContent='Remove';
   remove.onclick=async()=>{if(!confirm('Remove '+ext.name+' from Hexora? The source folder will not be deleted.'))return;try{await window.hexora.extensions.remove(ext.path);await refreshExtensions();}catch(e){$('extensions-error').textContent=e.message;}};
   const diagnose=document.createElement('button');diagnose.className='pill';diagnose.textContent='Diagnostics';
   diagnose.onclick=()=>showExtensionDiagnostics(ext.path,ext.name);
   row.append(details,diagnose,toggle,remove);list.append(row);
  }
 }catch(e){$('extensions-error').textContent=e.message;}
}
$('extensions-rail').onclick=()=>{$('extensions-error').textContent='';$('extensions-overlay').classList.remove('hidden');action('modal',true);refreshExtensions();};
$('extensions-close').onclick=closeExtensions;
$('extensions-overlay').onclick=e=>{if(e.target===$('extensions-overlay'))closeExtensions();};
$('extensions-install').onclick=async()=>{try{$('extensions-error').textContent='';await window.hexora.extensions.install();await refreshExtensions();}catch(e){$('extensions-error').textContent=e.message;}};

async function refreshExtensionActions(){
 try{
  const list=await window.hexora.extensions.list(),host=$('extension-actions');host.replaceChildren();
  for(const ext of list.filter(x=>x.enabled&&x.popup)){
   const button=document.createElement('button');button.className='extension-action';
   button.title='Open '+ext.name;button.textContent=/proton pass/i.test(ext.name)?'🔐':'🧩';
   button.onclick=async()=>{try{await window.hexora.extensions.open(ext.path);}catch(e){alert('Extension popup: '+e.message);}};
   host.append(button);
  }
 }catch(e){console.error('Cannot show extension toolbar',e);}
}
refreshExtensionActions();

let diagnosticFolder=null,diagnosticTimer=null;
async function renderExtensionDiagnostics(){
 if(!diagnosticFolder)return;
 try{
  const data=await window.hexora.extensions.diagnostics(diagnosticFolder);
  const host=$('extension-diagnostic-events');host.replaceChildren();
  const status=document.createElement('div');status.className='diagnostic-event';
  const heading=document.createElement('strong');heading.textContent='Background worker: '+data.worker.status;
  const detail=document.createElement('span');detail.textContent=data.worker.workers.length?data.worker.workers.map(w=>w.scope||w.scriptUrl||w.version).join(', '):(data.worker.error||'No currently running extension worker detected; idle workers may stop normally.');
  status.append(heading,detail);host.append(status);
  const manifest=document.createElement('div');manifest.className='diagnostic-event';
  const manifestHeading=document.createElement('strong');manifestHeading.textContent='Manifest worker configuration';
  const manifestText=document.createElement('span');manifestText.textContent=data.manifest?.script?('MV'+data.manifest.manifestVersion+' · '+data.manifest.script+' · '+data.manifest.type):'No background worker declared';
  const registration=document.createElement('span');registration.textContent='Registrations observed: '+data.registrations.length;
  manifest.append(manifestHeading,manifestText,registration);host.append(manifest);
  if(!data.events.length){const p=document.createElement('p');p.className='hint';p.textContent='No diagnostic events yet. Open the extension popup to capture its startup.';host.append(p);}
  for(const event of [...data.events].reverse()){
   const line=document.createElement('div');line.className='diagnostic-event';
   const tag=document.createElement('strong');tag.textContent='['+new Date(event.time).toLocaleTimeString()+'] '+event.kind;
   const msg=document.createElement('span');msg.textContent=event.message;
   line.append(tag,msg);host.append(line);
  }
 }catch(e){$('extension-diagnostic-events').textContent=e.message;}
}
function closeExtensionDiagnostics(){
 clearInterval(diagnosticTimer);diagnosticTimer=null;diagnosticFolder=null;
 $('extension-diagnostics-overlay').classList.add('hidden');action('modal',false);
}
function showExtensionDiagnostics(folder,name){
 diagnosticFolder=folder;$('extension-diagnostic-name').textContent=name+' diagnostics';
 $('extensions-overlay').classList.add('hidden');
 $('extension-diagnostics-overlay').classList.remove('hidden');action('modal',true);
 clearInterval(diagnosticTimer);diagnosticTimer=setInterval(renderExtensionDiagnostics,1500);renderExtensionDiagnostics();
}
$('extension-diagnostics-close').onclick=closeExtensionDiagnostics;
$('extension-diagnostics-clear').onclick=async()=>{if(diagnosticFolder){await window.hexora.extensions.clearDiagnostics(diagnosticFolder);renderExtensionDiagnostics();}};
$('extension-diagnostics-probe').onclick=async()=>{if(diagnosticFolder)try{await window.hexora.extensions.probeWorker(diagnosticFolder);renderExtensionDiagnostics();}catch(e){$('extension-diagnostic-events').textContent=e.message;}};
$('extension-diagnostics-popup').onclick=async()=>{if(diagnosticFolder)try{await window.hexora.extensions.open(diagnosticFolder);renderExtensionDiagnostics();}catch(e){$('extension-diagnostic-events').textContent=e.message;}};
$('extension-diagnostics-overlay').onclick=e=>{if(e.target===$('extension-diagnostics-overlay'))closeExtensionDiagnostics();};
