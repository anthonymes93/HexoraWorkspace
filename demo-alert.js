'use strict';
const api=window.hexoraDemoAlert;
for(const id of ['close','later','gotit'])document.getElementById(id).addEventListener('click',event=>{event.stopPropagation();api.close();});
document.getElementById('dock').addEventListener('click',event=>{event.stopPropagation();api.dock();});
document.querySelector('.dialog').addEventListener('click',()=>{if(document.body.classList.contains('docked'))api.expand();});
api.onMode(mode=>document.body.classList.toggle('docked',mode==='docked'));
document.addEventListener('keydown',event=>{if(event.key==='Escape')api.close();});
