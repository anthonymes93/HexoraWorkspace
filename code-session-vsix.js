'use strict';
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'integrations','vscode-session-bridge');
const manifest=require('./integrations/vscode-session-bridge/package.json');
const BRIDGE_VERSION=manifest.version;

// A tiny dependency-free ZIP/VSIX writer. Store-only ZIP is adequate for the
// <25 KB bridge, and avoids runtime network installation/build dependencies.
function crc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes){
  crc^=byte;
  for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function zip(files){
 let offset=0;
 const body=[],central=[];
 for(const [name,value] of files){
  const filename=Buffer.from(name,'utf8'),bytes=Buffer.from(value);
  const crc=crc32(bytes);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);
  local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
  body.push(local,filename,bytes);
  const header=Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50,0);header.writeUInt16LE(20,4);
  header.writeUInt16LE(20,6);header.writeUInt16LE(0x0800,8);
  header.writeUInt32LE(crc,16);header.writeUInt32LE(bytes.length,20);
  header.writeUInt32LE(bytes.length,24);header.writeUInt16LE(filename.length,28);
  header.writeUInt32LE(offset,42);
  central.push(header,filename);
  offset+=local.length+filename.length+bytes.length;
 }
 const center=Buffer.concat(central);
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
 end.writeUInt32LE(center.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...body,center,end]);
}
function buildCompanionVsix(directory){
 fs.mkdirSync(directory,{recursive:true});
 const destination=path.join(directory,'hexora-session-bridge-'+BRIDGE_VERSION+'.vsix');
 const xml='<?xml version="1.0" encoding="utf-8"?>\n'+
  '<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">'+
  '<Metadata><Identity Id="hexora-session-bridge" Version="'+BRIDGE_VERSION+'" Publisher="hexora" Language="en-US"/>'+
  '<DisplayName>Hexora Session Bridge</DisplayName><Description xml:space="preserve">Restore a Hexora VS Code tab\'s active editor.</Description><Categories>Other</Categories></Metadata>'+
  '<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>'+
  '<Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>'+
  '<Asset Type="Microsoft.VisualStudio.Code.Content" Path="extension/extension.js" Addressable="true"/></Assets></PackageManifest>';
 const contentTypes='<?xml version="1.0" encoding="utf-8"?>'+
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
  '<Default Extension="json" ContentType="application/json"/>'+
  '<Default Extension="js" ContentType="application/javascript"/>'+
  '<Default Extension="vsixmanifest" ContentType="text/xml"/></Types>';
 const bytes=zip([
  ['[Content_Types].xml',contentTypes],
  ['extension.vsixmanifest',xml],
  ['extension/package.json',fs.readFileSync(path.join(root,'package.json'))],
  ['extension/extension.js',fs.readFileSync(path.join(root,'extension.js'))]
 ]);
 // Atomic write: a crash cannot leave a truncated .vsix at its final path.
 const tmp=destination+'.tmp-'+process.pid;
 try{fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,destination);}
 finally{try{fs.rmSync(tmp,{force:true});}catch{}}
 return destination;
}
module.exports={buildCompanionVsix,BRIDGE_VERSION};
