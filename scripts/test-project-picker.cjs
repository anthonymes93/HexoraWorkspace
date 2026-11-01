'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validateFolder,rememberProject,toggleFavorite,locations,listFolders,readPaths,RECENTS_KEY,FAVORITES_KEY}=require('../code-project-picker');

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
  fs.writeFileSync(path.join(root,'not-a-folder.txt'),'Test file should not show up.');
  assert.equal(validateFolder(a),a);
  assert.throws(()=>validateFolder('relative/path'),/absolute/);
  assert.throws(()=>validateFolder(path.join(root,'not-a-folder.txt')),/not a folder/);
  assert.throws(()=>validateFolder(path.join(root,'missing')),/ENOENT/);
  assert.throws(()=>validateFolder('../'),/absolute/);

  let view=listFolders(root,[]);
  assert.deepEqual(view.rows.map(x=>x.name),['.hidden','Alpha Project','beta']);
  assert.equal(view.total,3);
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
  const data=locations(store);
  assert.deepEqual(data.recent.slice(0,2).map(x=>x.path),[a,b]);
  assert.deepEqual(data.favorites.map(x=>x.path),[a]);
  // Persist to the same backing store and expose only real directories.
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
