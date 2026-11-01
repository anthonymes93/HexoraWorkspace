const $=id=>document.getElementById(id);
const workspaces=[{id:'web',name:'Web Development',emoji:'◈'},{id:'business',name:'Business',emoji:'▤'},{id:'personal',name:'Personal',emoji:'☼'},{id:'ideas',name:'Ideas Lab',emoji:'✦'}];
let activeWorkspace='web',sidebarOpen=true,offset=0,currentPage=null,refreshing=false,refreshPending=false;
let contextTab=null,websiteTarget=null,workspaceEditing=null;
let selectedStackId=null;
let selectedRootTabId=null;
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
 renderStackTree(conversations,p);
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
 renderSecondTabRow(p);
 renderTabRow($('tabs'),p,null);
 $('tabs').classList.toggle('compact-titles', $('tabs').querySelectorAll(':scope > .tab').length>=11);
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

// Render one horizontal row per level along the current nested-stack path.
let openStackPath=[];
let stackRowsDismissed=true;
const expandedStackNodes=new Set();
let lastRowHeight=120;

// Render each tab or container exactly once, in its actual parent row.
async function renameStack(stack){
 const next=prompt('Rename tab stack:',stack.name);
 if(next===null)return;
 const name=next.trim();
 if(!name||name===stack.name)return;
 if(name.length>80){alert('Stack names must be 80 characters or fewer.');return;}
 try{await action('stack-edit',{id:stack.id,operation:'rename',value:name});await refresh();}
 catch(error){alert('Unable to rename stack: '+error.message);}
}
function updateTabFavicon(el,tab){
 const preferred=tab.favicon||tab.faviconFallback;
 let img=el.querySelector('.tab-favicon');
 if(!preferred){img?.remove();return;}
 if(!img){
  img=document.createElement('img');img.className='tab-favicon';
  img.alt='';img.draggable=false;
  el.insertBefore(img,el.querySelector('.name')||el.firstChild);
 }
 // Use the favicon advertised by the page when available; fall back to the
 // site's /favicon.ico when Electron has not fired page-favicon-updated.
 const fallback=tab.faviconFallback;
 const src=img.getAttribute('src');
 if(src!==preferred){
  img.onerror=()=>{
   if(fallback&&img.getAttribute('src')!==fallback){img.src=fallback;return;}
   img.style.visibility='hidden';
  };
  img.onload=()=>{img.style.visibility='visible';};
  img.style.visibility='visible';img.src=preferred;
 }
}
function renderTabRow(host,page,parentId){
 const data=page.stackData||{stacks:[],members:[]};
 const memberOf=new Map(data.members.map(m=>[m.tab_id,m.stack_id]));
 const children=data.stacks.filter(st=>st.parent_id===parentId);
 const items=[];
 for(const tab of page.tabs){
  if((memberOf.get(tab.id)??null)===parentId)items.push({type:'tab',id:tab.id,tab,ordinal:tab.ordinal||0});
 }
 for(const stack of children){
  const anchor=page.tabs.find(t=>t.id===stack.anchor_tab_id);
  items.push({type:'stack',id:stack.id,stack,ordinal:stack.ordinal||anchor?.ordinal||0});
 }
 items.sort((a,b)=>b.ordinal-a.ordinal||a.id-b.id);
 const signature=items.map(item=>(item.type==='stack'?'s':'t')+item.id).join('|');
 // Preserve actual DOM nodes, scroll position, and pointer targets when
 // only the active page/title changes. Rebuild solely for structural changes.
 if(host.dataset.rowSignature===signature){
  for(const el of host.querySelectorAll('.tab')){
   const id=Number(el.dataset.tabId),stackId=Number(el.dataset.stackContainerId);
   const tab=page.tabs.find(t=>t.id===id);
   const stack=data.stacks.find(st=>st.id===stackId);
   el.classList.toggle('active',!!tab&&id===page.activeId);
   el.classList.toggle('stack-path-active',!!stack&&openStackPath.includes(stackId));
   if(tab){
    const label=el.querySelector('.name');
    const title=(tab.pinned?'◆ ':'')+(tab.title||'New Tab');
    if(label&&label.textContent!==title)label.textContent=title;
    updateTabFavicon(el,tab);
    el.title=tab.url||'Open tab';
   }
   if(stack){const title='▤ '+stack.name;if(el.textContent!==title)el.textContent=title;}
  }
  return;
 }
 host.dataset.rowSignature=signature;
 host.replaceChildren();
 for(const item of items){
  const el=document.createElement('button');el.className='tab'+(item.type==='tab'&&item.id===page.activeId?' active':'')+(item.type==='stack'&&openStackPath.includes(item.id)?' stack-path-active':'');
  el.draggable=false;
  if(item.type==='stack'){
   el.dataset.stackContainerId=String(item.id);el.textContent='▤ '+item.stack.name;
   el.title='Open stack: '+item.stack.name+' (right-click to rename)';
   el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();renameStack(item.stack);});
   el.onclick=()=>{selectedStackId=item.id;selectedRootTabId=null;stackRowsDismissed=false;refresh();};
  }else{
   el.dataset.tabId=String(item.id);
   if(parentId!==null)el.dataset.stackId=String(parentId);
   const name=document.createElement('span');name.className='name';name.textContent=(item.tab.pinned?'◆ ':'')+(item.tab.title||'New Tab');
   const close=document.createElement('span');close.className='close';close.textContent='×';
   close.onclick=e=>{e.stopPropagation();action('close',item.id);};
   el.append(name,close);
   updateTabFavicon(el,item.tab);
   el.title=item.tab.url||'Open tab';
   el.onclick=()=>{selectedRootTabId=null;selectedStackId=parentId;stackRowsDismissed=parentId===null;action('activate',item.id);};
   el.addEventListener('contextmenu',e=>{e.preventDefault();showTabMenu(e.clientX,e.clientY,item.tab);});
  }
  el.addEventListener('pointerdown',beginTabPointerDrag);
  host.append(el);
 }
}
function renderSecondTabRow(page){
 const host=$('stack-rows');
 const data=page.stackData||{stacks:[],members:[]};
 const stacks=new Map(data.stacks.map(s=>[s.id,s]));
 const members=new Map(data.members.map(m=>[m.tab_id,m.stack_id]));
 // Rows are an explicit navigation choice, never restored from the last
 // active tab. This prevents old nested stacks filling the screen on launch.
 openStackPath=[];
 if(!stackRowsDismissed){
  let focus=selectedStackId&&stacks.get(selectedStackId);
  if(!focus&&selectedRootTabId!==null){
   focus=data.stacks.find(st=>st.parent_id===null&&st.anchor_tab_id===selectedRootTabId);
   if(!focus)focus=data.stacks.find(st=>st.parent_id===null&&!st.anchor_tab_id&&data.members.find(m=>m.stack_id===st.id)?.tab_id===selectedRootTabId);
  }
  if(focus){
   const seen=new Set();
   while(focus&&!seen.has(focus.id)&&openStackPath.length<12){
    seen.add(focus.id);openStackPath.unshift(focus.id);
    focus=stacks.get(focus.parent_id);
   }
  }
 }
 for(let depth=0;depth<openStackPath.length;depth++){
  const stack=stacks.get(openStackPath[depth]);if(!stack)continue;
  const previous=host.children[depth];
  const row=previous?.dataset.stackId===String(stack.id)?previous:document.createElement('div');
  row.className='stack-tabs-row';row.dataset.stackId=String(stack.id);
  const label=document.createElement('button');label.className='stack-tabs-label';label.textContent='▤ '+stack.name;
  label.title='Show this stack (right-click to rename)';label.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();renameStack(stack);};label.onclick=()=>{selectedStackId=stack.id;stackRowsDismissed=false;refresh();};
  const tabs=row.querySelector('.stack-tabs')||document.createElement('div');tabs.className='stack-tabs';tabs.dataset.stackId=String(stack.id);
  renderTabRow(tabs,page,stack.id);
  const close=document.createElement('button');close.className='stack-row-close';close.textContent='×';close.title='Hide stack rows';
  close.onclick=()=>{selectedStackId=null;stackRowsDismissed=true;openStackPath=[];renderSecondTabRow({...page,activeId:null});};
  if(!row.isConnected){row.append(label,tabs,close);host.append(row);}else{row.querySelector('.stack-tabs-label')?.replaceWith(label);row.querySelector('.stack-row-close')?.replaceWith(close);}
  if(host.children[depth]!==row)host.insertBefore(row,host.children[depth]||null);
 }
 while(host.children.length>openStackPath.length)host.lastElementChild.remove();
 const height=120+34*openStackPath.length;
 document.body.classList.toggle('stack-row-open',openStackPath.length>0);
 document.documentElement.style.setProperty('--hexora-rows-height',height+'px');
 if(height!==lastRowHeight){lastRowHeight=height;action('stack-row-height',height);}
}
// Unlimited-depth tab stacks; only expanded branches are rendered.
function renderStackTree(host,page){
 const data=page.stackData;if(!data?.stacks?.length)return;
 const heading=document.createElement('div');heading.className='eyebrow stack-heading';heading.textContent='Tab Stacks';host.append(heading);
 const stacks=new Map(data.stacks.map(x=>[x.id,x])),members=new Map();
 for(const m of data.members){if(!members.has(m.stack_id))members.set(m.stack_id,[]);members.get(m.stack_id).push(m.tab_id);}
 const tabs=new Map(page.tabs.map(t=>[t.id,t]));
 const children=new Map();
 for(const stack of data.stacks){const parent=stacks.has(stack.parent_id)?stack.parent_id:null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(stack);}
 const renderNode=(stack,depth)=>{
  const row=document.createElement('div');row.className='stack-node';row.style.paddingLeft=(8+Math.min(depth,24)*14)+'px';
  const fold=document.createElement('button');fold.className='stack-fold';fold.textContent=expandedStackNodes.has(stack.id)?'▾':'▸';fold.title='Expand or collapse';
  const toggleNode=()=>{if(expandedStackNodes.has(stack.id))expandedStackNodes.delete(stack.id);else expandedStackNodes.add(stack.id);refresh();};
  fold.onclick=toggleNode;
  const label=document.createElement('button');label.className='stack-label';label.textContent='▤ '+stack.name;label.title='Right-click to rename this stack';
  label.onclick=()=>{selectedStackId=stack.id;selectedRootTabId=null;stackRowsDismissed=false;toggleNode();};
  label.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();renameStack(stack);};
  row.append(fold,label);host.append(row);
  if(!expandedStackNodes.has(stack.id))return;
  for(const child of children.get(stack.id)||[])renderNode(child,depth+1);
  for(const id of members.get(stack.id)||[]){
   const tab=tabs.get(id);const tabRow=document.createElement('button');
   tabRow.className='stack-tab'+(page.activeId===id?' active':'');
   tabRow.style.paddingLeft=(23+Math.min(depth,24)*14)+'px';
   tabRow.textContent='↳ '+(tab?.title||'Tab #'+id);tabRow.title='Open tab';
   tabRow.onclick=()=>action('activate',id);
   tabRow.oncontextmenu=e=>{e.preventDefault();const selected=tab||{id,workspace:activeWorkspace};showTabMenu(e.clientX,e.clientY,selected);};
   host.append(tabRow);
  }
 };
 for(const root of children.get(null)||[])renderNode(root,0);
}
async function chooseTabStack(){
 if(!contextTab)return;
 const tab=contextTab,stacks=currentPage?.stackData?.stacks||[];
 const menu=['0: Create a new stack','-1: Remove from stack',...stacks.map(x=>x.id+': '+x.name)].join('\\n');
 const choice=prompt('Add tab to a stack:\\n'+menu);
 if(choice===null)return;
 try{
  if(choice==='0'){const name=prompt('New stack name:','New Stack');if(!name)return;await action('stack-create',{workspace:tab.workspace||activeWorkspace,name,tabId:tab.id});}
  else if(choice==='-1')await action('stack-assign',{tabId:tab.id,stackId:null});
  else{const id=Number(choice);if(!stacks.some(x=>x.id===id))throw Error('Choose a listed stack');await action('stack-assign',{tabId:tab.id,stackId:id});}
  hideTabMenu();refresh();
 }catch(e){alert(e.message);}
}
$('tab-menu-stack').onclick=chooseTabStack;
// Pointer-based reorder: no native Chromium drag image or dotted cursor rectangle.
const tabStrip=$('tabs');
// Frame-driven horizontal wheel scrolling with accumulated momentum.
// New wheel input updates the destination rather than restarting an animation.
const tabScrollAnimations=new WeakMap();
function stopTabGlide(row){
 const state=tabScrollAnimations.get(row);
 if(!state)return;
 if(state.frame)cancelAnimationFrame(state.frame);
 state.frame=0;
 state.target=row.scrollLeft;
}
// Native scrollbar interaction always takes precedence over wheel momentum.
for(const strip of [tabStrip,$('stack-rows')]){
 strip.addEventListener('pointerdown',e=>{
  const row=e.target.closest('.tabs,.stack-tabs');
  if(row&&strip.contains(row))stopTabGlide(row);
 },true);
}
function glideTabRow(row,amount){
 const maximum=Math.max(0,row.scrollWidth-row.clientWidth);
 if(!maximum)return;
 let state=tabScrollAnimations.get(row);
 if(!state){state={target:row.scrollLeft,frame:0};tabScrollAnimations.set(row,state);}
 state.target=Math.max(0,Math.min(maximum,state.target+amount));
 if(state.frame)return;
 const tick=()=>{
  if(!row.isConnected){state.frame=0;return;}
  const remaining=state.target-row.scrollLeft;
  if(Math.abs(remaining)<.45){row.scrollLeft=state.target;state.frame=0;return;}
  row.scrollLeft+=remaining*.22;
  state.frame=requestAnimationFrame(tick);
 };
 state.frame=requestAnimationFrame(tick);
}
for(const strip of [tabStrip,$('stack-rows')]){
 strip.addEventListener('wheel',e=>{
  const row=e.target.closest('.tabs,.stack-tabs');
  if(!row||!strip.contains(row)||row.scrollWidth<=row.clientWidth+1)return;
  if(e.ctrlKey||e.metaKey)return;
  const raw=Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX;
  if(!raw)return;
  e.preventDefault();
  const multiplier=e.deltaMode===1?16:e.deltaMode===2?row.clientWidth:1;
  glideTabRow(row,raw*multiplier);
 },{passive:false});
}
let tabPointer=null,dropSaving=false,suppressTabClickUntil=0;

function showCreateStackDialog(){
 return new Promise(resolve=>{
  const veil=document.createElement('div');veil.className='overlay';veil.style.zIndex='99999';
  veil.innerHTML='<div class="dialog" role="dialog" aria-modal="true" aria-label="Create tab stack"><div class="dialog-header"><b>Create Tab Stack</b></div><form id="hexora-create-stack-form"><label for="hexora-stack-name">Stack name</label><input id="hexora-stack-name" required maxlength="80" autocomplete="off" value="New Stack"><div class="website-actions"><button type="button" class="pill" id="hexora-stack-cancel">Cancel</button><button type="submit" class="pill primary">Create Stack</button></div></form></div>';
  document.body.append(veil);action('modal',true);
  const field=veil.querySelector('#hexora-stack-name');field.focus();field.select();
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;document.removeEventListener('keydown',key);veil.remove();action('modal',false);resolve(value);};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();finish(null);}};
  document.addEventListener('keydown',key);
  veil.querySelector('#hexora-stack-cancel').onclick=()=>finish(null);
  veil.onclick=e=>{if(e.target===veil)finish(null);};
  veil.querySelector('form').onsubmit=e=>{e.preventDefault();finish(field.value.trim()||null);};
 });
}
function beginTabPointerDrag(e){
 if(e.button!==0||!e.isPrimary||e.target.closest('.close'))return;
 const el=e.currentTarget,row=el.parentElement,rect=el.getBoundingClientRect();
 const type=el.dataset.stackContainerId?'stack':'tab';
 tabPointer={el,row,id:Number(type==='stack'?el.dataset.stackContainerId:el.dataset.tabId),type,
  pointerId:e.pointerId,workspace:activeWorkspace,startX:e.clientX,startY:e.clientY,
  offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,moving:false,drop:null};
 try{el.setPointerCapture(e.pointerId);}catch{}
}
function cancelTabPointer(){
 const d=tabPointer;if(!d)return;
 d.el.classList.remove('dragging');d.el.style.removeProperty('--drag-x');
 for(const el of document.querySelectorAll('.stack-drop-target,.tab-insert-before,.tab-insert-after'))el.classList.remove('stack-drop-target','tab-insert-before','tab-insert-after');
 document.body.classList.remove('reordering-tabs');
 try{if(d.el.hasPointerCapture(d.pointerId))d.el.releasePointerCapture(d.pointerId);}catch{}
 tabPointer=null;
}
function findTabDrop(e,d){
 const rows=[$('tabs'),...document.querySelectorAll('.stack-tabs')];
 const row=rows.find(node=>{const r=node.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom;});
 if(!row)return null;
 const parent=row.dataset.stackId?Number(row.dataset.stackId):null;
 const targets=[...row.querySelectorAll('.tab')].filter(el=>el!==d.el);
 const pointerX=e.clientX;
 // Insertion boundaries use the dragged tab's visual centre, not a narrow
 // cursor-only hit area. Halfway between neighboring tabs means insert there.
 const draggedRect=d.el.getBoundingClientRect();
 const draggedCenter=e.clientX-d.offsetX+draggedRect.width/2;
 const slots=targets.map(el=>({el,r:el.getBoundingClientRect()})).sort((a,b)=>a.r.left-b.r.left);
 for(let i=0;i<slots.length-1;i++){
  const left=slots[i],right=slots[i+1];
  const boundary=(left.r.right+right.r.left)/2;
  if(Math.abs(draggedCenter-boundary)<=Math.min(22,draggedRect.width*.22)){
   d.candidateId=null;d.candidateSince=0;
   return {parent,target:right.el,kind:'between',after:false,boundaryX:boundary};
  }
 }
 // Snapshot untransformed coordinates: the dragged tab's transform must not
 // change the destination or cause the tab bar to reorder under the cursor.
 let target=null,rect=null;
 for(const el of targets){const r=el.getBoundingClientRect();if(pointerX>=r.left&&pointerX<=r.right){target=el;rect=r;break;}}
 if(target){
  const within=(pointerX-rect.left)/Math.max(1,rect.width);
  const key=target.dataset.stackContainerId?'stack':'tab';
  const id=Number(target.dataset.stackContainerId||target.dataset.tabId);
  // Intent: a deliberate short hover in the middle stacks; a quick drag
  // reorders. Edges always reorder immediately.
  const inside=within>=.24&&within<=.76;
  const same=d.candidateId===id&&d.candidateParent===parent;
  if(!same){d.candidateId=id;d.candidateParent=parent;d.candidateSince=performance.now();}
  const held=same&&performance.now()-d.candidateSince>=280;
  const kind=inside&&held?'on':'between';
  return {parent,target,kind,id,targetType:key,after:within>.5};
 }
 d.candidateId=null;d.candidateSince=0;
 const first=targets[0]?.getBoundingClientRect();
 const last=targets.at(-1)?.getBoundingClientRect();
 if(first&&pointerX<first.left)return {parent,target:targets[0],kind:'between',after:false};
 if(last&&pointerX>last.right)return {parent,target:targets.at(-1),kind:'between',after:true};
 return {parent,target:null,kind:'end'};
}
window.addEventListener('pointermove',e=>{
 const d=tabPointer;if(!d||e.pointerId!==d.pointerId||!e.isPrimary)return;
 if(!d.el.isConnected||activeWorkspace!==d.workspace){cancelTabPointer();return;}
 if(!d.moving){
  if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<6)return;
  d.moving=true;d.el.classList.add('dragging');document.body.classList.add('reordering-tabs');
 }
 e.preventDefault();
 // Only the dragged element moves during preview. No database or DOM reordering.
 d.el.style.setProperty('--drag-x',(e.clientX-d.startX)+'px');
 d.drop=findTabDrop(e,d);
 for(const el of document.querySelectorAll('.stack-drop-target,.tab-insert-before,.tab-insert-after'))el.classList.remove('stack-drop-target','tab-insert-before','tab-insert-after');
 if(d.drop?.kind==='on'&&d.drop.target)d.drop.target.classList.add('stack-drop-target');
 if(d.drop?.kind==='between'&&d.drop.target)d.drop.target.classList.add(d.drop.after?'tab-insert-after':'tab-insert-before');
});
window.addEventListener('pointerup',async e=>{
 const d=tabPointer;if(!d||e.pointerId!==d.pointerId)return;
 const moving=d.moving,drop=findTabDrop(e,d);
 if(moving)suppressTabClickUntil=Date.now()+400;
 cancelTabPointer();
 if(!moving||!drop||dropSaving)return;
 if(drop.kind==='on'&&drop.id===d.id&&drop.targetType===d.type)return;
 dropSaving=true;
 try{
  if(drop.kind==='on'&&drop.targetType==='tab'&&d.type==='tab'){
   // Do not change tabs until the user actually confirms the name.
   const name=await showCreateStackDialog();
   if(!name)return;
   const id=await action('stack-create-pair',{workspace:d.workspace,name,
    sourceId:d.id,targetId:drop.id,parentId:drop.parent});
   selectedStackId=id;selectedRootTabId=null;stackRowsDismissed=false;
  }else if(drop.kind==='on'&&drop.targetType==='stack'&&d.type==='tab'){
   await action('stack-assign',{tabId:d.id,stackId:drop.id});
   selectedStackId=drop.id;selectedRootTabId=null;stackRowsDismissed=false;
  }else if(drop.kind==='on'&&drop.targetType==='stack'&&d.type==='stack'){
   if(d.id!==drop.id)await action('stack-nest',{id:d.id,parentId:drop.id});
   selectedStackId=drop.id;selectedRootTabId=null;stackRowsDismissed=false;
  }else if(drop.kind==='between'||drop.kind==='end'){
   const originalParent=d.row.dataset.stackId?Number(d.row.dataset.stackId):null;
   if(originalParent!==drop.parent&&d.type==='tab'){
    await action('stack-assign',{tabId:d.id,stackId:drop.parent});
    selectedStackId=drop.parent;stackRowsDismissed=drop.parent===null;
   }else if(originalParent===drop.parent){
    const row=drop.parent===null?$('tabs'):document.querySelector('.stack-tabs[data-stack-id="'+drop.parent+'"]');
    const key=el=>el.dataset.stackContainerId?'s:'+el.dataset.stackContainerId:'t:'+el.dataset.tabId;
    const id=d.type==='stack'?'s:'+d.id:'t:'+d.id;
    const order=[...row.children].map(key).filter(x=>x!==id);
    let index=drop.target?order.indexOf(key(drop.target)):-1;
    if(index<0)index=order.length;else if(drop.after)index++;
    order.splice(index,0,id);
    if(order.join('|')!==[...row.children].map(key).join('|'))
     await action('reorder-row',{workspace:d.workspace,parentId:drop.parent,items:order});
   }
  }
  await refresh();
 }catch(err){console.error('Tab drop failed',err);alert('Could not move tab: '+err.message);await refresh();}
 finally{dropSaving=false;}
});
window.addEventListener('pointercancel',()=>{cancelTabPointer();refresh();});
document.addEventListener('click',e=>{
 if(Date.now()<suppressTabClickUntil&&e.target.closest('.tab')){e.preventDefault();e.stopImmediatePropagation();}
},true);
// Native drag from an external detached window can still be docked here.
tabStrip.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
tabStrip.addEventListener('drop',e=>{
 e.preventDefault();
 const match=/^hexora-tab:(\d+)$/.exec(e.dataTransfer.getData('text/plain')||'');
 if(match)action('dock',Number(match[1]));
});

// Right-click any tab to turn it into a website, or open a website in a separate tab.
function hideTabMenu(restore=true){ $('tab-workspace-submenu').classList.add('hidden');$('tab-menu-move').setAttribute('aria-expanded','false'); const wasOpen=!$('tab-context-menu').classList.contains('hidden');$('tab-context-menu').classList.add('hidden');contextTab=null;if(wasOpen&&restore&&!websiteTarget)action('modal',false); }
function showTabMenu(x,y,item){
 contextTab=item;
 $('tab-menu-current-title').textContent=item.title||'Untitled tab';
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
 renderWorkspaceSubmenu(item);
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
$('tab-menu-rename').onclick=()=>{
 const tab=contextTab;if(!tab)return;
 hideTabMenu(false);
 const veil=document.createElement('div');
 veil.className='overlay';
 veil.style.zIndex='99999';
 const dialog=document.createElement('div');dialog.className='dialog';
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-label','Rename tab');
 const header=document.createElement('div');header.className='dialog-header';
 const heading=document.createElement('b');heading.textContent='Rename Tab';header.append(heading);
 const form=document.createElement('form');
 const label=document.createElement('label');label.textContent='Tab name';label.htmlFor='hexora-rename-tab-input';
 const input=document.createElement('input');input.id='hexora-rename-tab-input';input.maxLength=100;input.required=true;input.value=tab.title||'New tab';input.autocomplete='off';
 const error=document.createElement('p');error.className='website-error';
 const actions=document.createElement('div');actions.className='website-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='pill';cancel.textContent='Cancel';
 const save=document.createElement('button');save.type='submit';save.className='pill primary';save.textContent='Save name';
 actions.append(cancel,save);form.append(label,input,error,actions);dialog.append(header,form);veil.append(dialog);document.body.append(veil);
 action('modal',true);
 const finish=()=>{veil.remove();document.removeEventListener('keydown',escape);action('modal',false);};
 const escape=e=>{if(e.key==='Escape'){e.preventDefault();finish();}};
 document.addEventListener('keydown',escape);
 cancel.onclick=finish;veil.onclick=e=>{if(e.target===veil)finish();};
 form.onsubmit=async e=>{
  e.preventDefault();const name=input.value.trim();
  if(!name){error.textContent='Enter a tab name.';return;}
  save.disabled=true;
  try{await action('rename-tab',{id:tab.id,name});finish();await refresh();}
  catch(err){error.textContent=err.message;save.disabled=false;}
 };
 requestAnimationFrame(()=>{input.focus();input.select();});
};
$('tab-menu-replace').onclick=()=>showWebsiteModal(false);
$('tab-menu-new').onclick=()=>showWebsiteModal(true);
for(const mode of ['wide','thin']){
 $('tab-menu-panel-'+mode).onclick=async()=>{if(!contextTab)return;const id=contextTab.id;hideTabMenu();try{await action('panel-mode',{id,mode});refresh();}catch(err){alert(err.message);}};
 $('tab-menu-domain-'+mode).onclick=async()=>{if(!contextTab)return;const id=contextTab.id;hideTabMenu();try{await action('panel-domain-mode',{id,mode});refresh();}catch(err){alert(err.message);}};
}
$('tab-menu-panel-inherit').onclick=async()=>{if(!contextTab)return;const id=contextTab.id;hideTabMenu();try{await action('panel-tab-inherit',id);refresh();}catch(err){alert(err.message);}};
function renderWorkspaceSubmenu(tab){
 const host=$('tab-workspace-submenu');host.replaceChildren();
 for(const workspace of workspaces){
  const button=document.createElement('button');button.type='button';button.className='workspace-target';
  button.setAttribute('role','menuitem');
  button.textContent=workspace.emoji+'  '+workspace.name+(tab.workspace===workspace.id?'  ✓':'');
  button.disabled=tab.workspace===workspace.id;
  button.onclick=async e=>{
   e.stopPropagation();const id=tab.id,destination=workspace.id;
   hideTabMenu();
   try{
    await action('move-tab',{id,workspace:destination});
    if(id===currentPage?.activeId){activeWorkspace=destination;offset=0;save();}
    await refresh();
   }catch(error){alert('Could not move tab: '+error.message);}
  };
  host.append(button);
 }
}
function showWorkspaceSubmenu(){
 if(!contextTab)return;
 const submenu=$('tab-workspace-submenu'),open=submenu.classList.contains('hidden');
 submenu.classList.toggle('hidden',!open);
 $('tab-menu-move').setAttribute('aria-expanded',String(open));
}
$('tab-menu-move').onclick=e=>{e.stopPropagation();showWorkspaceSubmenu();};
$('tab-menu-move-wrap').addEventListener('mouseenter',()=>{
 if(contextTab&&$('tab-workspace-submenu').classList.contains('hidden'))showWorkspaceSubmenu();
});

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
