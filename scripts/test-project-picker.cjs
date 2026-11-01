'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {expandFolderPath,validateFolder,rememberProject,toggleFavorite,locations,listFolders,readPaths,RECENTS_KEY,FAVORITES_KEY}=require('../code-project-picker');

test('Hexora project picker navigates real folders and persists recents/favorites',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hexora-picker-'));
 const values=new Map();
 const store={
  getMeta:key=>values.get(key)||null,
  setMeta:(key,value)=>values.set(key,value),
  db:{prepare:()=>({all:()=>[]})}
 };
 try{
  const a=path.join(root,'Alpha Project'),b=path.join(root,'beta'),c=path.join(root,'.hidden');
  for(const folder of [a,b,c])fs.mkdirSync(folder);
  fs.writeFileSync(path.join(root,'not-a-folder.txt'),'Visible test file.');
  assert.equal(validateFolder(a),a);
  assert.equal(validateFolder('"'+a+'"'),a,'pasted quoted folder paths are accepted');
  assert.equal(validateFolder(pathToFileURL(a).href),a,'file:// links can be pasted');
  assert.equal(expandFolderPath(a),a);
  assert.throws(()=>validateFolder('https://example.com'),/web URL/);
  assert.throws(()=>validateFolder(''),/folder path/);
  assert.throws(()=>validateFolder('relative/path'),/full folder path/);
  assert.throws(()=>validateFolder(path.join(root,'not-a-folder.txt')),/not a folder/);
  assert.throws(()=>validateFolder(path.join(root,'missing')),/ENOENT/);
  assert.throws(()=>validateFolder('../'),/full folder path/);

  let view=listFolders(root,[]);
  assert.deepEqual(view.rows.map(x=>x.name),['.hidden','Alpha Project','beta','not-a-folder.txt']);
  assert.deepEqual(view.rows.map(x=>x.type),['folder','folder','folder','file']);
  assert.equal(view.total,4);
  assert.equal(view.folderCount,3);
  assert.equal(view.fileCount,1);
  const searched=listFolders(root,[],100,'NOT-A');
  assert.deepEqual(searched.rows.map(x=>x.name),['not-a-folder.txt']);
  assert.equal(searched.total,1);
  assert.equal(searched.folderCount,3,'counts describe all actual contents');
  assert.equal(listFolders(root,[],100,'Alpha').rows[0].type,'folder');
  assert.equal(view.parent,path.dirname(root));
  assert.equal(listFolders(root,[],1).truncated,true);

  rememberProject(store,a);
  rememberProject(store,b);
  rememberProject(store,a);
  assert.deepEqual(readPaths(store,RECENTS_KEY,40),[a,b]);
  assert.equal(toggleFavorite(store,a),true);
  assert.equal(toggleFavorite(store,b),true);
  assert.equal(toggleFavorite(store,b),false);
  assert.deepEqual(readPaths(store,FAVORITES_KEY,100),[a]);
  view=listFolders(root,readPaths(store,FAVORITES_KEY,100));
  assert.equal(view.rows.find(x=>x.path===a).favorite,true);
  assert.equal(view.rows.find(x=>x.path===b).favorite,false);
  assert.equal(view.rows.find(x=>x.type==='file').favorite,false);
  const data=locations(store);
  assert.deepEqual(data.recent.slice(0,2).map(x=>x.path),[a,b]);
  assert.deepEqual(data.favorites.map(x=>x.path),[a]);
  // Favorites and recent projects always point to real directories, never files.
  fs.rmSync(a,{recursive:true});
  assert.equal(locations(store).favorites.length,0);
  assert.deepEqual(locations(store).recent.map(x=>x.path),[b]);
  // A corrupted metadata record never crashes the selector.
  values.set(RECENTS_KEY,'{bad json');
  assert.equal(locations(store).recent.length,0);
 }finally{
  fs.rmSync(root,{recursive:true,force:true});
 }
});


test('project modal exposes a permanent editable address field and real folder browsing',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','toolbar.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'..','project-picker.js'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 assert.match(html,/<form id="hpp-path-form" class="hpp-path-form">/,'address bar must not start hidden');
 assert.match(html,/id="hpp-path" type="text"/);
 assert.match(js,/codePicker\.validate\(typed\)/,'Open Project validates typed paths');
 assert.match(js,/codePicker\.focus\(\)/,'native editor focus should be reclaimed for typing');
 assert.match(js,/event\.ctrlKey&&event\.key\.toLowerCase\(\)==='l'/,'Ctrl+L opens the address field');
 assert.match(source,/code-picker:focus/);
 assert.match(source,/code-picker:list/);
 assert.match(js,/name==='computer'/,'This PC drive list must be connected');
});
