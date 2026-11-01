'use strict';
// Local-only Hexora routes: identities are stable IDs, never display names or positions.
const WORKSPACE_ID=/^[A-Za-z0-9_-]{1,80}$/;
function workspaceLink(workspace){
 if(typeof workspace!=='string'||!WORKSPACE_ID.test(workspace))throw Error('Invalid workspace ID.');
 return 'hexora://workspace/'+workspace;
}
function tabLink(workspace,id){
 if(!Number.isSafeInteger(id)||id<1)throw Error('Invalid tab ID.');
 return workspaceLink(workspace)+'/tab/'+id;
}
function parseDeepLink(value){
 if(typeof value!=='string'||value.length>512)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='hexora:'||url.hostname!=='workspace'||url.port||url.username||url.password||url.search||url.hash)return null;
  const segments=url.pathname.split('/').filter(Boolean);
  if((segments.length!==1&&segments.length!==3)||!WORKSPACE_ID.test(segments[0]))return null;
  if(segments.length===1)return{workspace:segments[0],tabId:null};
  if(segments[1]!=='tab'||!/^[1-9][0-9]*$/.test(segments[2]))return null;
  const tabId=Number(segments[2]);
  if(!Number.isSafeInteger(tabId))return null;
  return{workspace:segments[0],tabId};
 }catch{return null;}
}
module.exports={workspaceLink,tabLink,parseDeepLink};
