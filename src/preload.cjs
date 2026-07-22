const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProjectCards: () => ipcRenderer.invoke('get-project-cards'),
  addProject: () => ipcRenderer.invoke('add-project'),
  removeProject: (name) => ipcRenderer.invoke('remove-project', name),
  runAction: (path, targetPaths) => ipcRenderer.invoke('run-action', path, targetPaths),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openInVscode: (path) => ipcRenderer.invoke('open-in-vscode', path),
  openInCmux: (path) => ipcRenderer.invoke('open-in-cmux', path),
  openInFinder: (path) => ipcRenderer.invoke('open-in-finder', path),
  getUncommittedFiles: (path) => ipcRenderer.invoke('get-uncommitted-files', path),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onActionExited: (callback) =>
    ipcRenderer.on('action-exited', (event, payload) => callback(payload)),
});
