const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProjectCards: () => ipcRenderer.invoke('get-project-cards'),
  addProject: () => ipcRenderer.invoke('add-project'),
  removeProject: (name) => ipcRenderer.invoke('remove-project', name),
  getProjectDetail: (path) => ipcRenderer.invoke('get-project-detail', path),
});
