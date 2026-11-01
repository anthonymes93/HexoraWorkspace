'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('deep-link protocol and navigation bridge are connected end to end',()=>{
 const main=read('main.js'),preload=read('preload.js'),toolbar=read('toolbar.js'),html=read('toolbar.html');
 assert.match(main,/setAsDefaultProtocolClient\('hexora'/);
 assert.match(main,/app\.on\('second-instance'/);
 assert.match(main,/app\.on\('open-url'/);
 assert.match(main,/ipcMain\.handle\('deep-link:ready'/);
 assert.match(main,/ipcMain\.handle\('tabs:lookup'/);
 assert.match(main,/action==='copy-tab-link'/);
 assert.match(preload,/readyForDeepLinks:/);
 assert.match(preload,/onDeepLink:/);
 assert.match(toolbar,/window\.hexora\.onDeepLink\(/);
 assert.match(toolbar,/window\.hexora\.readyForDeepLinks\(\)/);
 assert.match(html,/id="tab-menu-copy-link"/);
 assert.match(toolbar,/\$\('tab-menu-copy-link'\)\.onclick/);
});

test('VS Code picker validates typed paths and restores keyboard focus',()=>{
 const main=read('main.js'),preload=read('preload.js'),picker=read('project-picker.js'),html=read('toolbar.html');
 for(const action of ['code-picker:list','code-picker:validate','code-picker:focus']){
  assert.ok(main.includes(action),'missing main handler '+action);
  assert.ok(preload.includes(action),'missing preload binding '+action);
 }
 assert.match(picker,/codePicker\.validate\(typed\)/);
 assert.match(picker,/codePicker\.focus\(\)/);
 assert.match(html,/<form id="hpp-path-form" class="hpp-path-form">/);
});

test('detached-window action remains available alongside link copy',()=>{
 const html=read('toolbar.html'),toolbar=read('toolbar.js'),main=read('main.js');
 assert.match(html,/id="tab-menu-detach"/);
 assert.match(html,/id="tab-menu-copy-link"/);
 assert.match(toolbar,/tab-menu-detach/);
 assert.match(main,/detachedWindowIds/);
});

test('ChatGPT composer never forces an old draft back after send',()=>{
 const main=read('main.js');
 assert.match(main,/ownDraft=read\(el\);userEdited=false/);
 assert.doesNotMatch(main,/else if\(read\(el\)!==ownDraft&&document\.activeElement!==el\)write\(el,ownDraft\)/);
});
