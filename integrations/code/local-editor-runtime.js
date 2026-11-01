'use strict';
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http');
class LocalEditorRuntime {
 constructor(){this.child=null;this.url=null;this.starting=null;}
 async start(){
  if(this.child&&this.child.exitCode===null)return this.url;
  if(this.starting)return this.starting;
  this.starting=this.launch().finally(()=>{this.starting=null;});
  return this.starting;
 }
 async launch(){
  let bin;
  try{
   const pkg=require.resolve('code-server/package.json');
   const meta=JSON.parse(fs.readFileSync(pkg,'utf8'));
   const relative=typeof meta.bin==='string'?meta.bin:meta.bin?.['code-server'];
   if(!relative)throw Error('code-server binary not declared');
   bin=path.resolve(path.dirname(pkg),relative);
  }catch(error){throw Error('Bundled code-server runtime is missing. Run npm install: '+error.message);}
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const url='http://127.0.0.1:'+port+'/';
  const child=spawn(process.execPath,[bin,'--bind-addr','127.0.0.1:'+port,'--auth','none','--disable-telemetry','--disable-update-check'],{
   env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'ignore'
  });
  this.child=child;this.url=url;
  try{
   for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('Editor service exited with code '+child.exitCode);
    const ready=await new Promise(resolve=>{
     const req=http.get(url,res=>{res.resume();resolve(res.statusCode<500);});
     req.on('error',()=>resolve(false));req.setTimeout(400,()=>{req.destroy();resolve(false);});
    });
    if(ready)return url;
    await new Promise(resolve=>setTimeout(resolve,150));
   }
   throw Error('Editor service did not become ready within 15 seconds');
  }catch(error){this.stop();throw error;}
 }
 stop(){const child=this.child;this.child=null;this.url=null;if(child&&child.exitCode===null)child.kill();}
}
module.exports={LocalEditorRuntime};
