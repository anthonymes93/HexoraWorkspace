'use strict';
// Contract for code-editor integrations. No HWND reparenting or focus simulation.
// A provider owns its own lifecycle; the Hexora shell owns navigation and UI.
const STATES=Object.freeze({IDLE:'idle',STARTING:'starting',READY:'ready',STOPPING:'stopping',ERROR:'error'});
const CAPABILITIES=Object.freeze({OPEN_FOLDER:'openFolder',OPEN_FILE:'openFile',FOCUS:'focus',CLOSE:'close',EMBEDDED:'embedded'});
function validateProvider(provider){
 if(!provider||typeof provider!=='object')throw new TypeError('Editor provider must be an object');
 if(typeof provider.id!=='string'||!provider.id.trim())throw new TypeError('Provider id required');
 if(typeof provider.start!=='function'||typeof provider.stop!=='function')throw new TypeError('Provider must implement start() and stop()');
 if(!Array.isArray(provider.capabilities)||!provider.capabilities.every(c=>Object.values(CAPABILITIES).includes(c)))throw new TypeError('Invalid provider capabilities');
 return provider;
}
class EditorSession{
 constructor(provider){this.provider=validateProvider(provider);this.state=STATES.IDLE;this.error=null;}
 async start(context={}){
  if(this.state===STATES.READY)return;
  if(this.state!==STATES.IDLE)throw new Error('Cannot start editor in state '+this.state);
  this.state=STATES.STARTING;
  try{await this.provider.start(context);this.state=STATES.READY;this.error=null;}
  catch(error){this.error=error;this.state=STATES.ERROR;throw error;}
 }
 async invoke(capability,...args){
  if(this.state!==STATES.READY)throw new Error('Editor is not ready');
  if(!this.provider.capabilities.includes(capability))throw new Error('Unsupported capability: '+capability);
  if(typeof this.provider[capability]!=='function')throw new Error('Missing capability implementation: '+capability);
  return this.provider[capability](...args);
 }
 async stop(){
  if(this.state===STATES.IDLE)return;
  if(this.state===STATES.STOPPING)throw new Error('Editor is already stopping');
  this.state=STATES.STOPPING;
  try{await this.provider.stop();this.state=STATES.IDLE;this.error=null;}
  catch(error){this.error=error;this.state=STATES.ERROR;throw error;}
 }
}
module.exports={STATES,CAPABILITIES,validateProvider,EditorSession};
