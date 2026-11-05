'use strict';
const key='hexora:client-work-zone:clients:v1';
const query=document.getElementById('query'),results=document.getElementById('results');
function clients(){try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v.filter(c=>c&&typeof c.name==='string'):[];}catch{return [];}}
// Temporary local demo records. Preserve any clients the user has already entered.
function seedDemoClients(){
 const existing=clients();
 let changed=false;
 for(const name of ['Jim','John','Jake']){
  if(existing.some(client=>client.name.trim().toLowerCase()===name.toLowerCase()))continue;
  existing.push({id:'demo-'+name.toLowerCase(),name,domain:'',contact:'',phone:'',demo:true});
  changed=true;
 }
 if(changed)localStorage.setItem(key,JSON.stringify(existing));
}
seedDemoClients();
function render(){
 const term=query.value.trim().toLowerCase();results.replaceChildren();
 const matches=clients().filter(c=>[c.name,c.domain,c.contact,c.phone].some(v=>String(v||'').toLowerCase().includes(term)));
 for(const c of matches.slice(0,40)){
  const row=document.createElement('button');row.type='button';row.className='result';
  const content=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('small');
  title.textContent=c.name;meta.textContent=[c.contact,c.domain,c.phone].filter(Boolean).join(' · ');
  content.append(title,meta);row.append(content);row.onclick=()=>alert([c.name,c.contact,c.domain,c.phone].filter(Boolean).join('\n'));results.append(row);
 }
 if(!matches.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=term?'No matching clients':'Your client directory is empty. Add your first client to get started.';results.append(empty);}
}
document.getElementById('add').onclick=()=>{
 const name=prompt('Business or client name');if(!name?.trim())return;
 const domain=prompt('Website or domain (optional)')||'';
 const contact=prompt('Contact name (optional)')||'';
 const phone=prompt('Phone (optional)')||'';
 const all=clients();all.push({id:Date.now().toString(36),name:name.trim(),domain:domain.trim(),contact:contact.trim(),phone:phone.trim()});
 localStorage.setItem(key,JSON.stringify(all));query.value='';render();
};
query.addEventListener('input',render);render();
