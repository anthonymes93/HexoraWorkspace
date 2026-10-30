const $=id=>document.getElementById(id);
function show(value){$('message').textContent=value}
async function status(){try{const s=await window.hexora.recovery.status();$('status').textContent='Destination: '+(s.directory||'Not selected')+' | '+(s.enabled?'Unlocked':'Locked')+(s.lastBackup?' | Last backup: '+s.lastBackup.time:'');}catch(e){show('Status error: '+e.message)}}
async function run(name){
 const password=$('password').value;const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{show('Working...');let r;
 if(name==='configure')r=await window.hexora.recovery.configure(password);
 if(name==='unlock')r=await window.hexora.recovery.unlock(password);
 if(name==='backup')r=await window.hexora.recovery.backup();
 if(name==='verify')r=await window.hexora.recovery.verify(password);
 if(name==='restore')r=await window.hexora.recovery.restore(password);
 show(r?.cancelled?'Cancelled.':name==='backup'?'Encrypted backup created: '+r.file+' ('+r.tabs+' tabs)':name==='verify'?'VERIFIED: '+r.tabs+' recoverable tabs; AES-GCM authentication and SQLite integrity check passed. Live workspace unchanged.':name==='restore'?'Preparing to restart Hexora...':'Recovery is ready. Select Back up now to create your first backup.');
 if(name!=='restore')$('password').value='';
 await status();
 }catch(e){show('Error: '+e.message)}finally{buttons.forEach(b=>b.disabled=false)}
}
for(const name of ['configure','unlock','backup','verify','restore'])$(name).addEventListener('click',()=>run(name));
status();