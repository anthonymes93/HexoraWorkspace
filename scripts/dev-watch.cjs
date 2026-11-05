'use strict';
// Development-only supervisor: follow the current branch, never switch branches,
// and restart Electron after fast-forward updates. No production updater involved.
const {spawn,execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const ROOT=path.resolve(__dirname,'..');
const RELAY_URL='wss://hexora-update-relay.itsme-bad.workers.dev/connect';
const RECONNECT_MS=10000;
let child=null,stopping=false,busy=false,lastHead='',lastDirty='',restartRequested=false;
let socket=null,reconnectTimer=null,companionSnapshot='';
function git(...args){return execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();}
function log(message){console.log('[Hexora Dev] '+message);}
function branch(){return git('branch','--show-current');}
function dirty(){return git('status','--porcelain','--untracked-files=no');}
function head(){return git('rev-parse','HEAD');}
function launch(){
 if(stopping)return;
 const electron=require('electron');
 child=spawn(electron,['.'],{cwd:ROOT,env:{...process.env,HEXORA_DEV_WATCH:'1',HEXORA_COMPANION_SNAPSHOT:companionSnapshot},stdio:'inherit',windowsHide:false});
 const started=child;
 started.on('error',err=>log('Electron launch failed: '+err.message));
 started.on('exit',(code)=>{
  if(child!==started)return;
  child=null;
  if(!stopping&&!restartRequested)log('Hexora closed (exit '+code+'). Waiting for next code update. Ctrl+C stops the watcher.');
 });
 log('Electron launched on '+branch());
}
async function stopChild(){
 if(!child)return;
 const running=child;
 // Never use taskkill /T: Electron can share a Windows process tree with
 // the npm/Node watcher. Tree termination may terminate this supervisor too.
 await new Promise(resolve=>{
  if(running.exitCode!==null||running.signalCode!==null){resolve();return;}
  let settled=false;
  const done=()=>{if(settled)return;settled=true;clearTimeout(timeout);resolve();};
  running.once('exit',done);
  running.once('error',done);
  const timeout=setTimeout(()=>{
   log('Electron shutdown timed out; continuing with relaunch.');
   done();
  },5000);
  try{running.kill('SIGTERM');}catch{done();}
 });
 if(child===running)child=null;
}
async function restart(reason){
 if(stopping)return;
 restartRequested=true;
 try{companionSnapshot=fs.readFileSync(path.join(process.env.APPDATA||path.join(process.env.HOME||'','AppData','Roaming'),'hexora-workspace','dev-companion-windows.json'),'utf8');}catch{companionSnapshot='';}
 log(reason+' — restarting Hexora');
 await stopChild();
 restartRequested=false;
 launch();
 log('Restart attempted; check for the new Hexora window.');
}
async function poll(){
 if(stopping||busy)return;
 busy=true;
 try{
  const current=branch();
  if(!current||current==='HEAD'){log('Detached HEAD: auto-sync paused');return;}
  const localDirty=dirty();
  if(localDirty){
   if(localDirty!==lastDirty)log('Local tracked edits detected; auto-pull paused to protect your changes.');
   lastDirty=localDirty;
   return;
  }
  lastDirty='';
  const before=head();
  // Fetch only the current branch; never merge main or another developer branch.
  git('fetch','--quiet','origin','+refs/heads/'+current+':refs/remotes/origin/'+current);
  const remote=git('rev-parse','refs/remotes/origin/'+current);
  if(remote!==before){
   const base=git('merge-base',before,remote);
   if(base!==before){log('Remote branch diverged; refusing to overwrite local history.');return;}
   git('merge','--ff-only','--quiet','refs/remotes/origin/'+current);
   log('Pulled '+current+' @ '+head().slice(0,8));
  }
  const latest=head();
  if(latest!==lastHead){lastHead=latest;await restart('Code updated');}
 }catch(err){log('Sync skipped: '+String(err.stderr||err.message).trim().slice(0,220));}
 finally{busy=false;}
}
async function shutdown(){if(stopping)return;stopping=true;clearTimeout(reconnectTimer);if(socket)socket.close();await stopChild();process.exit(0);}
function connect(){
 if(stopping)return;
 if(typeof WebSocket!=='function'){
  log('This Node version lacks WebSocket support. Use Node 22+ for push updates.');return;
 }
 try{
  const ws=new WebSocket(RELAY_URL);socket=ws;
  ws.addEventListener('open',()=>{log('Connected to push relay');poll();});
  ws.addEventListener('message',event=>{
   try{const msg=JSON.parse(event.data);if(msg.type==='update'&&msg.branch===branch())poll();}catch{}
  });
  ws.addEventListener('error',()=>log('Relay connection error; will reconnect'));
  ws.addEventListener('close',()=>{
   if(socket===ws)socket=null;
   if(!stopping)reconnectTimer=setTimeout(connect,RECONNECT_MS);
  });
 }catch(err){log('Relay unavailable: '+err.message);reconnectTimer=setTimeout(connect,RECONNECT_MS);}
}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
lastHead=head();
log('Listening for push updates on '+branch()+'. Your logins and local data stay in the existing Hexora profile.');
launch();
connect();
