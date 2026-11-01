'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {projectUpdateFile,ownerFile,workspaceForTab}=require('../code-session-workspace');
const {syncCodeProjects}=require('../code-project-sync');

test('auto project sync updates the correct tab and ignores untrusted/stale records',()=>{
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'hexora-project-sync-'));
 try{
  const a=path.join(userData,'Project Alpha'),b=path.join(userData,'Project Beta');
  fs.mkdirSync(a);fs.mkdirSync(b);
  workspaceForTab(userData,7,null);
  workspaceForTab(userData,8,null);
  const projects=new Map();
  const store={getCodeProject:id=>projects.get(id)?{project_path:projects.get(id)}:null,
   setCodeProject:(id,project)=>projects.set(id,project)};
  const events=[];
  const run=()=>syncCodeProjects({userData,store,eligible:id=>id===7||id===8,onProject:(id,p)=>events.push([id,p])});
  const ownerA='a-2ab3b716-3025-4599-a328-859ee4d120cc';
  const ownerB='b-2ab3b716-3025-4599-a328-859ee4d120cc';
  fs.writeFileSync(ownerFile(userData,7),ownerA);
  fs.writeFileSync(projectUpdateFile(userData,7),JSON.stringify({version:1,ownerToken:ownerA,projectPath:a}));
  fs.writeFileSync(ownerFile(userData,8),ownerB);
  fs.writeFileSync(projectUpdateFile(userData,8),JSON.stringify({version:1,ownerToken:ownerB,projectPath:b}));
  assert.equal(run(),2);
  assert.deepEqual(events,[[7,a],[8,b]]);
  assert.equal(run(),0,'unchanged projects should not continuously update SQLite');

  // A detached, superseded editor must never replace its tab's project.
  fs.writeFileSync(ownerFile(userData,7),'new-owner');
  fs.writeFileSync(projectUpdateFile(userData,7),JSON.stringify({version:1,ownerToken:ownerA,projectPath:b}));
  assert.equal(run(),0);
  assert.equal(projects.get(7),a);

  // A valid newly published record must update only its own tab.
  fs.writeFileSync(projectUpdateFile(userData,7),JSON.stringify({version:1,ownerToken:'new-owner',projectPath:b}));
  assert.equal(run(),1);
  assert.equal(projects.get(7),b);
  assert.equal(projects.get(8),b);
  assert.equal(run(),0);

  fs.writeFileSync(projectUpdateFile(userData,8),JSON.stringify({version:1,ownerToken:ownerB,projectPath:'relative/unsafe'}));
  assert.equal(run(),0);
  assert.equal(projects.get(8),b);
  fs.writeFileSync(projectUpdateFile(userData,8),'{partial');
  assert.equal(run(),0,'a partial or corrupt file should not stop another tab');
  assert.equal(projects.get(8),b);

  // Ignore orphan project records from old tab IDs.
  fs.writeFileSync(ownerFile(userData,9),ownerA);
  fs.writeFileSync(projectUpdateFile(userData,9),JSON.stringify({version:1,ownerToken:ownerA,projectPath:a}));
  assert.equal(run(),0);
  assert.equal(projects.has(9),false);

  // Simulate manual project picker while a VS Code host remains open.
  fs.writeFileSync(projectUpdateFile(userData,7),JSON.stringify({version:1,ownerToken:'new-owner',projectPath:a}));
  assert.equal(syncCodeProjects({userData,store,eligible:id=>id===8}),0);
  assert.equal(projects.get(7),b);
 }finally{fs.rmSync(userData,{recursive:true,force:true});}
});