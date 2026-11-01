'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const host=fs.readFileSync(path.join(__dirname,'..','experiments','vscode-hexora-host.ps1'),'utf8');

test('embedded VS Code uses a separate user-data profile for both launch paths',()=>{
 assert.match(host,/Join-Path \$env:APPDATA 'Hexora\\VSCodeProfile'/);
 assert.match(host,/--user-data-dir "%HEXORA_VSCODE_USER_DATA%"/);
 assert.match(host,/--extensions-dir "%HEXORA_VSCODE_EXTENSIONS%"/);
 assert.match(host,/\.vscode\\extensions/);
 assert.match(host,/\$launch\.EnvironmentVariables\['HEXORA_VSCODE_USER_DATA'\]=\$hexoraCodeProfile/);
 const launchLines=host.split('\n').filter(line=>line.includes('$launch.Arguments='));
 assert.equal(launchLines.length,2);
 for(const line of launchLines)assert.match(line,/--new-window\{1\}/);
 assert.match(host,/\$codeProfileArgs=/);
});
