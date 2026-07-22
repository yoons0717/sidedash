const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProjectCards: () => ipcRenderer.invoke('get-project-cards'),
  addProject: () => ipcRenderer.invoke('add-project'),
  removeProject: (name) => ipcRenderer.invoke('remove-project', name),
  getProjectDetail: (path) => ipcRenderer.invoke('get-project-detail', path),
  runAction: (path, targetPaths) => ipcRenderer.invoke('run-action', path, targetPaths),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onActionExited: (callback) =>
    ipcRenderer.on('action-exited', (event, payload) => callback(payload)),
});
