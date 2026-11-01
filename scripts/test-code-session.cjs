'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {workspaceForTab,sessionFile,clearSession}=require('../code-session-workspace');
const {buildCompanionVsix,BRIDGE_VERSION}=require('../code-session-vsix');

test('editor workspace identities remain independent across VS Code tabs',()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'hexora-vscode-session-test-'));
 try {
  const project=path.join(data,'Test Project');
  fs.mkdirSync(project);
  const first=workspaceForTab(data,10,project);
  const second=workspaceForTab(data,11,project);
  assert.notEqual(first,second);
  assert.equal(fs.existsSync(path.join(project,'.code-workspace')),false,'workspace metadata never goes into a user project');
  for(const file of [first,second]){
   const json=JSON.parse(fs.readFileSync(file,'utf8'));
   assert.deepEqual(json.folders,[{path:project}]);
  }
  assert.equal(workspaceForTab(data,10,project),first);
  const state=sessionFile(data,10);
  fs.writeFileSync(state,JSON.stringify({path:path.join(project,'index.js')}));
  clearSession(data,10);
  assert.equal(fs.existsSync(state),false);
  assert.equal(fs.existsSync(first),true,'keep workspace descriptor safe for detached VS Code window');
  assert.equal(fs.existsSync(second),true);
  assert.throws(()=>workspaceForTab(data,0,project),/Invalid/);
  assert.throws(()=>workspaceForTab(data,14,path.join(data,'missing')),/ENOENT/);
 }finally{fs.rmSync(data,{recursive:true,force:true});}
});
test('companion VSIX archive contains a manifest and executable extension',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hexora-vsix-test-'));
 try {
  const destination=buildCompanionVsix(dir);
  assert.match(path.basename(destination),new RegExp(BRIDGE_VERSION.replace(/\./g,'\\.')));
  const bytes=fs.readFileSync(destination);
  let cursor=0;
  const entries=new Map();
  while(cursor+30<bytes.length&&bytes.readUInt32LE(cursor)===0x04034b50){
   assert.equal(bytes.readUInt16LE(cursor+8),0,'VSIX files should use store compression');
   const length=bytes.readUInt32LE(cursor+18);
   const nameLength=bytes.readUInt16LE(cursor+26),extraLength=bytes.readUInt16LE(cursor+28);
   const name=bytes.subarray(cursor+30,cursor+30+nameLength).toString();
   const offset=cursor+30+nameLength+extraLength;
   entries.set(name,bytes.subarray(offset,offset+length).toString());
   cursor=offset+length;
  }
  assert.equal(entries.size,4);
  assert.match(entries.get('extension.vsixmanifest'),/Microsoft.VisualStudio.Code.Manifest/);
  assert.match(entries.get('extension\/package.json'),/onStartupFinished/);
  assert.match(entries.get('extension\/extension.js'),/onDidChangeActiveTextEditor/);
  assert.ok(bytes.includes(Buffer.from('PK\x05\x06')),'ZIP end record present');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
