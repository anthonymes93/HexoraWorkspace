'use strict';
const version=require('../package.json').version;
module.exports={
 appId:'app.hexora.workspace.installer',
 productName:'Hexora Installer',
 executableName:'Hexora Installer',
 directories:{output:'dist'},
 files:['installer-shell/main.cjs','installer-shell/preload.cjs','installer-shell/index.html','package.json'],
 extraMetadata:{main:'installer-shell/main.cjs'},
 extraResources:[{from:'dist/Hexora-Setup-'+version+'-x64.exe',to:'Hexora-Setup-'+version+'-x64.exe'}],
 win:{target:'portable',artifactName:'Hexora-Install-'+version+'-x64.exe'},
 publish:null
};
