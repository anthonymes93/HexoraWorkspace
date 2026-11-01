'use strict';
/* Project paths are treated as text, never HTML. Filesystem operations go
 * through the restricted code-picker IPC endpoints in Hexora main. */
(()=>{
 const root=document.getElementById('hexora-project-overlay');
 const q=id=>root.querySelector('#'+id);
 const button=(label,cls,tooltip)=>{
  const el=document.createElement('button');el.type='button';el.className=cls;el.textContent=label;
  if(tooltip)el.title=tooltip;
  return el;
 };
 const formatDate=ms=>ms>0?new Date(ms).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'—';
 function folderIcon(){
  const icon=document.createElement('span');icon.className='hpp-folder-icon';
  icon.innerHTML='<svg viewBox="0 0 28 23" width="26" height="22" aria-hidden="true"><path d="M2 5a3 3 0 0 1 3-3h6l3 3h9a3 3 0 0 1 3 3v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" fill="#8869bb"/><path d="M2 9h24l-2 11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" fill="#bc9cf8"/><path d="M4 11h20" stroke="#f3e7ff" stroke-opacity=".43" stroke-width="1"/></svg>';
  return icon;
 }
 const shortPath=path=>String(path||'').split(/[\\/]/).filter(Boolean).slice(-2).join(' / ')||String(path||'');
 let opened=false,finish=null,where=null,mode='recent',rows=[],recent=[],favorites=[],shortcuts=[],drives=[],home='',selected=null;
 let currentCounts={folderCount:0,fileCount:0,truncated:false,total:0},searchTimer=null;
 let history=[],historyIndex=-1,sequence=0,loading=false;

 function error(message){
  const el=q('hpp-error');el.textContent=message||'';el.classList.toggle('hidden',!message);
 }
 function parent(location){
  if(!location)return null;
  const trimmed=location.replace(/[\\/]+$/,'');
  const index=Math.max(trimmed.lastIndexOf('\\'),trimmed.lastIndexOf('/'));
  if(index<0)return null;
  if(/^[A-Za-z]:/.test(trimmed)&&index<3)return trimmed.slice(0,2)+'\\';
  return trimmed.slice(0,index)||'/';
 }
 function setSelected(location){
  selected=location;
  if(location)q('hpp-path').value=location;
  q('hpp-open').disabled=loading||!selected;
  q('hpp-hint').textContent=location?'Selected: '+shortPath(location):'Ctrl-click VS Code to open a blank tab';
  // Do not replace clicked DOM nodes: that breaks double-click to navigate.
  root.querySelectorAll('.hpp-folder-row').forEach(row=>{
   const active=row.dataset.path===selected;
   row.classList.toggle('selected',active);row.setAttribute('aria-selected',String(active));
  });
  root.querySelectorAll('.hpp-recent-card').forEach(card=>card.classList.toggle('selected',card.dataset.path===selected));
 }
 function renderCards(){
  const host=q('hpp-recents');host.replaceChildren();
  if(!recent.length){
   const empty=document.createElement('p');empty.className='hpp-no-recent';
   empty.textContent='Your recently opened projects will appear here.';host.append(empty);
   return;
  }
  recent.slice(0,4).forEach(item=>{
   const card=button('','hpp-recent-card'+(selected===item.path?' selected':''),item.path);
   const icon=folderIcon();
   card.dataset.path=item.path;
   const label=document.createElement('span');label.className='hpp-recent-name';
   const title=document.createElement('strong');title.textContent=item.name;
   const subtitle=document.createElement('small');subtitle.textContent=shortPath(item.path);
   label.append(title,subtitle);card.append(icon,label);
   card.onclick=()=>setSelected(item.path);
   card.ondblclick=()=>{setSelected(item.path);openSelected();};
   host.append(card);
  });
 }
 function renderSidebar(){
  const host=q('hpp-sidebar');host.replaceChildren();
  const links=[
   {id:'recent',name:'Recent',icon:'◷'},
   {id:'computer',name:'This PC',icon:'▣'},
   ...shortcuts.map(s=>({...s,icon:({home:'⌂',projects:'▤',clients:'♧',downloads:'↓',desktop:'▣'})[s.id]||'▤'})),
   {id:'favorites',name:'Favorites',icon:'☆'}
  ];
  links.forEach(s=>{
   const b=button('','hpp-side-item'+((mode===s.id||(mode==='browse'&&s.path===where))?' active':''));
   const icon=document.createElement('span');icon.className='hpp-side-icon';icon.textContent=s.icon;
   const label=document.createElement('span');label.textContent=s.name;
   b.append(icon,label);b.onclick=()=>s.path?navigate(s.path):showCollection(s.id);
   host.append(b);
  });
 }
 function drawBreadcrumbs(){
  const host=q('hpp-breadcrumbs');host.replaceChildren();
  if(mode!=='browse'){
   const text=document.createElement('span');text.className='hpp-current-crumb';
   text.textContent=mode==='favorites'?'Favorites':mode==='computer'?'This PC':'Recent projects';host.append(text);return;
  }
  if(!where)return;
  // Use each progressively longer ancestor path for clickable crumbs.
  const trail=[];let cursor=where;
  while(cursor&&trail.length<64){trail.unshift(cursor);const p=parent(cursor);if(!p||p===cursor)break;cursor=p;}
  trail.forEach((dir,index)=>{
   const name=dir.split(/[\\/]/).filter(Boolean).pop()||dir;
   const b=button(name,'hpp-crumb'+(index===trail.length-1?' active':''),dir);
   b.onclick=()=>navigate(dir);host.append(b);
   if(index<trail.length-1){
    const arrow=document.createElement('span');arrow.className='hpp-chevron';arrow.textContent='›';host.append(arrow);
   }
  });
 }
 function updateNavigation(){
  q('hpp-back').disabled=historyIndex<1;
  q('hpp-forward').disabled=historyIndex>=history.length-1;
  q('hpp-up').disabled=mode!=='browse'||!where||!parent(where);
  drawBreadcrumbs();renderSidebar();
 }
 function renderRows(){
  const host=q('hpp-folders');host.replaceChildren();
  const query=q('hpp-search-input').value.trim().toLocaleLowerCase();
  const list=rows.filter(item=>item.name.toLocaleLowerCase().includes(query));
  q('hpp-count').textContent=list.length+' '+(list.length===1?'folder':'folders');
  if(!list.length){
   const empty=document.createElement('p');empty.className='hpp-empty';
   empty.textContent=loading?'Loading folders…':query?'No matching folders':'No folders to display';
   host.append(empty);return;
  }
  list.forEach(item=>{
   // A div avoids invalid nested button elements around the favorite control.
   const row=document.createElement('div');row.className='hpp-folder-row'+(selected===item.path?' selected':'');
   row.tabIndex=0;row.setAttribute('role','option');row.setAttribute('aria-selected',String(selected===item.path));
   row.title=item.path;row.dataset.path=item.path;
   const name=document.createElement('span');name.className='hpp-row-name';
   const icon=document.createElement('span');icon.className='hpp-folder-icon';icon.textContent='▰';
   const label=document.createElement('span');label.textContent=item.name;
   name.append(icon,label);
   const date=document.createElement('span');date.className='hpp-row-date';date.textContent=formatDate(item.modified);
   const favorite=button(item.favorite?'★':'☆','hpp-favorite'+(item.favorite?' active':''),item.favorite?'Remove favorite':'Add favorite');
   favorite.setAttribute('aria-label',(item.favorite?'Unfavorite ':'Favorite ')+item.name);
   favorite.onclick=async event=>{
    event.stopPropagation();
    try{
     await window.hexora.codePicker.favorite(item.path);
     await loadLocations();
     if(mode==='favorites')rows=favorites;
     else if(mode==='recent')rows=recent;
     else rows=rows.map(row=>row.path===item.path?{...row,favorite:!row.favorite}:row);
     renderRows();
    }catch(e){error(e.message);}
   };
   row.append(name,date,favorite);
   row.onclick=()=>setSelected(item.path);
   row.ondblclick=()=>navigate(item.path);
   row.onkeydown=event=>{
    if(event.key==='Enter'||event.key==='ArrowRight'){event.preventDefault();navigate(item.path);}
   };
   host.append(row);
  });
 }
 async function loadLocations(){
  const data=await window.hexora.codePicker.locations();
  home=data.home;recent=data.recent;favorites=data.favorites;shortcuts=data.shortcuts;drives=data.drives||[];
  renderCards();renderSidebar();
 }
 async function navigate(path,record=true){
  if(!path||!opened)return;
  const ticket=++sequence;loading=true;error('');
  q('hpp-folders').replaceChildren();
  const message=document.createElement('p');message.className='hpp-empty';message.textContent='Loading folders…';
  q('hpp-folders').append(message);q('hpp-open').disabled=true;
  try{
   const data=await window.hexora.codePicker.list(path);
   if(ticket!==sequence||!opened)return;
   mode='browse';where=data.path;rows=data.rows;
   selected=where; // Current path is selectable without having to open a child.
   if(record){history=history.slice(0,historyIndex+1);history.push(where);historyIndex=history.length-1;}
   q('hpp-path-form').classList.add('hidden');
   updateNavigation();renderRows();renderCards();
   q('hpp-hint').textContent='Selected: '+shortPath(where);
   if(data.truncated)error('Showing the first '+data.rows.length+' folders. Enter a narrower path to continue.');
  }catch(e){if(ticket===sequence&&opened)error('Cannot open folder: '+e.message);}
  finally{if(ticket===sequence){loading=false;q('hpp-open').disabled=!selected;}}
 }
 function showCollection(name){
  sequence++;mode=name;where=null;rows=name==='favorites'?favorites:recent;selected=null;loading=false;
  q('hpp-search-input').value='';
  q('hpp-path-form').classList.add('hidden');
  q('hpp-hint').textContent='Ctrl-click VS Code to open a blank tab';
  updateNavigation();renderRows();renderCards();q('hpp-open').disabled=true;error('');
 }
 function goHistory(delta){
  const index=historyIndex+delta;if(index<0||index>=history.length)return;
  historyIndex=index;navigate(history[index],false);
 }
 function close(value){
  if(!opened)return;
  opened=false;sequence++;clearTimeout(searchTimer);
  root.classList.add('hidden');root.removeEventListener('keydown',onKeydown);
  const resolve=finish;finish=null;
  // Complete the native HWND visibility transition before creating a new
  // Code tab; otherwise the first SHOW can be swallowed by modalVisible.
  window.hexora.action('modal',false).catch(()=>{}).finally(()=>{if(resolve)resolve(value);});
 }
 function openSelected(){if(!loading&&selected)close(selected);}
 function onKeydown(event){
  if(event.key==='Escape'){
   event.preventDefault();
   if(!q('hpp-path-form').classList.contains('hidden'))q('hpp-path-form').classList.add('hidden');
   else close(null);
  }
  if(event.altKey&&event.key==='ArrowLeft'){event.preventDefault();goHistory(-1);}
  if(event.altKey&&event.key==='ArrowRight'){event.preventDefault();goHistory(1);}
  if(event.key==='Enter'&&event.target===q('hpp-search-input')){event.preventDefault();openSelected();}
  if(event.key==='Tab'){
   const controls=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')]
    .filter(el=>el.getClientRects().length);
   if(controls.length){
    const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  }
 }
 q('hpp-close').onclick=()=>close(null);
 q('hpp-cancel').onclick=()=>close(null);
 q('hpp-open').onclick=openSelected;
 q('hpp-all-recents').onclick=()=>showCollection('recent');
 q('hpp-back').onclick=()=>goHistory(-1);
 q('hpp-forward').onclick=()=>goHistory(1);
 q('hpp-up').onclick=()=>where?navigate(parent(where)):null;
 q('hpp-edit-path').onclick=()=>{
  const form=q('hpp-path-form');form.classList.toggle('hidden');
  if(!form.classList.contains('hidden')){q('hpp-path').value=where||home;q('hpp-path').focus();q('hpp-path').select();}
 };
 q('hpp-path-form').onsubmit=event=>{event.preventDefault();navigate(q('hpp-path').value);};
 q('hpp-search-input').oninput=renderRows;
 root.addEventListener('pointerdown',event=>{if(event.target===root)close(null);});

 async function open(){
  if(opened)return null;
  opened=true;sequence++;where=null;rows=[];selected=null;mode='recent';history=[];historyIndex=-1;
  error('');root.classList.remove('hidden');root.addEventListener('keydown',onKeydown);
  q('hpp-search-input').value='';q('hpp-path').value='';q('hpp-open').disabled=true;
  const promise=new Promise(resolve=>{finish=resolve;});
  try{
   // Hide attached native VS Code HWND while its toolbar owns the modal.
   await window.hexora.action('modal',true);
   if(!opened)return promise;
   await loadLocations();
   if(!opened)return promise;
   q('hpp-path').value=home;
   if(recent.length)showCollection('recent');
   else await navigate(shortcuts.find(s=>s.id==='projects')?.path||home);
   q('hpp-search-input').focus();
  }catch(e){if(opened)error('Project browser unavailable: '+e.message);}
  return promise;
 }
 window.hexoraProjectPicker={open};
})();
