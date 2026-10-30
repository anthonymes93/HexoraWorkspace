'use strict';
// Run: npm run benchmark:tabs
// Uses a disposable temporary SQLite database and synthetic URLs; never reads the user's Hexora profile.
const {TabStore}=require('../tab-store');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{performance}=require('node:perf_hooks');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hexora-benchmark-'));
const store=new TabStore(dir);
const sizes=[10000,100000,1000000];let inserted=0;
try{
 for(const size of sizes){
  const begin=performance.now();
  store.db.exec('BEGIN');
  try{
   for(let id=inserted+1;id<=size;id++)store.save({id,url:'https://example.com/page/'+id,title:'Synthetic tab '+id,workspace:['web','business','personal','ideas'][id%4],pinned:false,muted:false,lastActive:Date.now()-id,ordinal:id});
   store.db.exec('COMMIT');
  }catch(e){store.db.exec('ROLLBACK');throw e;}
  inserted=size;
  const insertion=performance.now()-begin,read=performance.now();
  const page=store.page('web',0,50),count=store.total();
  const elapsed=performance.now()-read;
  const query=performance.now();
  const found=store.search('Synthetic tab '+size,10);
  const searchMs=performance.now()-query;
  const bytes=fs.statSync(store.file).size;
  console.log(JSON.stringify({tabs:count,insertMs:Math.round(insertion),pageMs:+elapsed.toFixed(2),searchMs:+searchMs.toFixed(2),pageSize:page.length,searchMatches:found.length,dbMiB:+(bytes/1048576).toFixed(1)}));
 }
}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
