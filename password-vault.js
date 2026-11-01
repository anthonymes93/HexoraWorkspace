'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
class PasswordVault{
 constructor(dir){this.deviceKeyPath=path.join(dir,'password-vault-device-key.bin');this.path=path.join(dir,'password-vault.json');this.key=null;this.data=null;this.salt=null;}
 exists(){return fs.existsSync(this.path);}
 derive(password,salt){return crypto.scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
 encrypt(){const nonce=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',this.key,nonce);const body=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(this.data),'utf8')),cipher.final()]);return{version:1,kdf:'scrypt-32768-8-1',salt:this.salt.toString('base64'),nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:body.toString('base64')};}
 persist(){if(!this.key)throw Error('Vault locked');const tmp=this.path+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.encrypt()),{mode:0o600});fs.renameSync(tmp,this.path);}
 unlock(password){
  if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('Enter a master password of at least 12 characters.');
  if(!this.exists()){
   this.salt=crypto.randomBytes(16);this.key=this.derive(password,this.salt);this.data={entries:[]};this.persist();return{created:true};
  }
  try{
   const record=JSON.parse(fs.readFileSync(this.path,'utf8'));if(record.version!==1)throw Error('Unsupported vault format');
   const salt=Buffer.from(record.salt,'base64'),key=this.derive(password,salt);
   const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.nonce,'base64'));decipher.setAuthTag(Buffer.from(record.tag,'base64'));
   const decrypted=Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]);
   const data=JSON.parse(decrypted.toString('utf8'));
   if(!Array.isArray(data.entries))throw Error('Malformed vault');
   this.key=key;this.salt=salt;this.data=data;return{created:false};
  }catch{this.lock();throw Error('Incorrect master password or vault file is damaged.');}
 }
 unlockWithKey(key){
  if(!this.exists())throw Error('Vault not initialized.');
  const record=JSON.parse(fs.readFileSync(this.path,'utf8'));
  if(record.version!==1||!Buffer.isBuffer(key)||key.length!==32)throw Error('Invalid device key.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.nonce,'base64'));
  decipher.setAuthTag(Buffer.from(record.tag,'base64'));
  const decrypted=Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]);
  const data=JSON.parse(decrypted.toString('utf8'));
  if(!Array.isArray(data.entries))throw Error('Invalid vault data.');
  this.lock();this.key=Buffer.from(key);this.salt=Buffer.from(record.salt,'base64');this.data=data;
 }
 enableDeviceUnlock(safeStorage){
  if(!this.key)throw Error('Unlock vault first.');
  if(!safeStorage.isEncryptionAvailable())throw Error('Windows secure storage is unavailable.');
  const payload=safeStorage.encryptString(this.key.toString('base64'));
  const temp=this.deviceKeyPath+'.tmp';
  fs.writeFileSync(temp,payload,{mode:0o600});fs.renameSync(temp,this.deviceKeyPath);
 }
 restoreDeviceUnlock(safeStorage){
  if(!fs.existsSync(this.deviceKeyPath)||!safeStorage.isEncryptionAvailable())return false;
  try{
   const key=Buffer.from(safeStorage.decryptString(fs.readFileSync(this.deviceKeyPath)),'base64');
   try{this.unlockWithKey(key);return true;}finally{key.fill(0);}
  }catch{return false;}
 }
 forgetDeviceUnlock(){try{fs.unlinkSync(this.deviceKeyPath);}catch(err){if(err.code!=='ENOENT')throw err;}}
 deviceUnlockEnabled(){return fs.existsSync(this.deviceKeyPath);}
 lock(){if(this.key)this.key.fill(0);this.key=null;this.data=null;this.salt=null;}
 status(){return{exists:this.exists(),locked:!this.key,count:this.data?.entries.length||0};}
 list(){if(!this.data)throw Error('Unlock the vault first.');return this.data.entries.map(({id,name,site,username,updatedAt})=>({id,name,site,username,updatedAt}));}
 get(id){if(!this.data)throw Error('Unlock the vault first.');const entry=this.data.entries.find(e=>e.id===id);if(!entry)throw Error('Login not found.');return{...entry};}
 save(value){
  if(!this.data)throw Error('Unlock the vault first.');
  const site=String(value?.site||'').trim().slice(0,2048),name=String(value?.name||'').trim().slice(0,120),username=String(value?.username||'').trim().slice(0,320),password=String(value?.password||'').slice(0,4096);
  let url;try{url=new URL(site);}catch{throw Error('Enter a valid website URL.');}
  if(url.protocol!=='https:'&&url.protocol!=='http:')throw Error('Only web URLs are supported.');
  if(!password)throw Error('Enter a password to save.');
  const id=typeof value?.id==='string'?value.id:null,old=id?this.data.entries.find(e=>e.id===id):null;
  if(id&&!old)throw Error('Login not found.');
  const entry={id:old?.id||crypto.randomUUID(),site:url.origin,name:name||url.hostname,username,password,updatedAt:Date.now()};
  const next=this.data.entries.map(e=>e.id===entry.id?entry:e);
  if(!old)next.unshift(entry);
  const previous=this.data.entries;this.data.entries=next;
  try{this.persist();}catch(err){this.data.entries=previous;throw err;}
  return{id:entry.id};
 }
 remove(id){if(!this.data)throw Error('Unlock the vault first.');const original=this.data.entries;this.data.entries=original.filter(e=>e.id!==id);try{this.persist();}catch(err){this.data.entries=original;throw err;}return true;}
}
module.exports={PasswordVault};
