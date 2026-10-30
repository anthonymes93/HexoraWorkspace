'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const MAGIC=Buffer.from('HEXORA-BACKUP-1\n');
const KEY_BYTES=32,MAX_BACKUP=1024*1024*1024;
function derive(password,salt){return crypto.scryptSync(password,salt,KEY_BYTES,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
function encrypt(data,password){
 const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',derive(password,salt),iv);
 const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
 return Buffer.concat([MAGIC,salt,iv,cipher.getAuthTag(),encrypted]);
}
function decrypt(data,password){
 if(data.length<MAGIC.length+44||!data.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Invalid Hexora recovery file.');
 let i=MAGIC.length;const salt=data.subarray(i,i+=16),iv=data.subarray(i,i+=12),tag=data.subarray(i,i+=16);
 const decipher=crypto.createDecipheriv('aes-256-gcm',derive(password,salt),iv);decipher.setAuthTag(tag);
 try{return Buffer.concat([decipher.update(data.subarray(i)),decipher.final()]);}catch{throw new Error('Incorrect recovery password or damaged backup.');}
}
function verifyDb(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Backup database integrity check failed.');
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tabs'").get())throw new Error('Not a Hexora tab database.');
  return db.prepare('SELECT COUNT(*) AS n FROM tabs').get().n;
 }finally{db.close();}
}
function snapshot(store,directory,password,settings){
 if(typeof password!=='string'||password.length<12)throw new Error('Use a recovery password of at least 12 characters.');
 fs.mkdirSync(directory,{recursive:true});
 const tmp=path.join(os.tmpdir(),'hexora-snapshot-'+crypto.randomUUID()+'.sqlite');
 try{
  store.db.exec('VACUUM INTO '+"'"+tmp.replace(/'/g,"''")+"'");
  const count=verifyDb(tmp);
  const sqlite=fs.readFileSync(tmp);
  if(sqlite.length>MAX_BACKUP)throw new Error('Backup exceeds 1 GB limit for this version.');
  const settingsBuffer=Buffer.from(JSON.stringify(settings||{}));
  const len=Buffer.alloc(4);len.writeUInt32BE(settingsBuffer.length);
  const payload=encrypt(Buffer.concat([len,settingsBuffer,sqlite]),password);
  const filename='hexora-'+new Date().toISOString().replace(/[:.]/g,'-')+'.hxb';
  const output=path.join(directory,filename);fs.writeFileSync(output+'.tmp',payload,{flag:'wx'});fs.renameSync(output+'.tmp',output);
  // Never remove anything except our generated backup files. Keep 48 recent snapshots.
  const older=fs.readdirSync(directory).filter(x=>/^hexora-\d{4}-.*\.hxb$/.test(x)).sort().reverse().slice(48);
  for(const name of older)try{fs.unlinkSync(path.join(directory,name));}catch{}
  return{file:output,tabs:count,bytes:payload.length};
 }finally{fs.rmSync(tmp,{force:true});}
}
function stageRestore(file,password,dataDir){
 if(typeof password!=='string'||!password)throw new Error('Recovery password required.');
 const info=fs.statSync(file);if(!info.isFile()||info.size>MAX_BACKUP+65536)throw new Error('Backup is too large.');
 const data=decrypt(fs.readFileSync(file),password);if(data.length<4)throw new Error('Invalid backup data.');
 const size=data.readUInt32BE(0);if(size>2*1024*1024||size+4>=data.length)throw new Error('Invalid backup settings.');
 let settings;try{settings=JSON.parse(data.subarray(4,4+size).toString('utf8'));}catch{throw new Error('Invalid backup settings.');}
 const sqlite=data.subarray(4+size),stage=path.join(dataDir,'hexora-restore-pending.sqlite');
 fs.writeFileSync(stage+'.tmp',sqlite);try{verifyDb(stage+'.tmp');fs.renameSync(stage+'.tmp',stage);}catch(e){fs.rmSync(stage+'.tmp',{force:true});throw e;}
 fs.writeFileSync(path.join(dataDir,'hexora-restore-settings.json'),JSON.stringify(settings));
 return{tabs:verifyDb(stage)};
}
function applyPending(dataDir){
 const pending=path.join(dataDir,'hexora-restore-pending.sqlite');if(!fs.existsSync(pending))return false;
 verifyDb(pending);
 const original=path.join(dataDir,'hexora-tabs.sqlite'),archive=path.join(dataDir,'hexora-pre-restore-'+Date.now()+'.sqlite');
 // This runs before opening SQLite, so no live database handles.
 if(fs.existsSync(original))fs.renameSync(original,archive);
 fs.renameSync(pending,original);
 // A separate settings file is left for UI to import once.
 return true;
}
module.exports={snapshot,stageRestore,applyPending};
