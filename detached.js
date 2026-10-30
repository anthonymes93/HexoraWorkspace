let owner=Number(new URLSearchParams(location.search).get('tab'));
const root=document.getElementById('drop');
const tabName=document.getElementById('name');
const handle=document.getElementById('handle');
function dragId(e){const val=e.dataTransfer?.getData('text/plain')||'';const match=/^hexora-tab:(\\d+)$/.exec(val);return match?Number(match[1]):null;}
handle.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','hexora-tab:'+owner);});
root.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';root.classList.add('over');});
root.addEventListener('dragleave',()=>root.classList.remove('over'));
root.addEventListener('drop',async e=>{e.preventDefault();root.classList.remove('over');const source=dragId(e);if(source&&source!==owner){try{await window.hexora.action('swap-detached',{source,target:owner});}catch(err){console.error(err);}}});
document.getElementById('dock').onclick=()=>window.hexora.action('dock',owner);
window.hexora.onDetachedOwner(data=>{owner=data.id;tabName.textContent=data.title||'ChatGPT';});
window.hexora.action('detached-info',owner).then(data=>{if(data)tabName.textContent=data.title||'ChatGPT';});
