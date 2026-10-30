const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hexora', {
  action: (name, id) => ipcRenderer.invoke('tabs:action', name, id),
  onState: callback => ipcRenderer.on('tabs:state', (_event, state) => callback(state))
});
