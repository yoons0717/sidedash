const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProjectCards: () => ipcRenderer.invoke('get-project-cards'),
});
