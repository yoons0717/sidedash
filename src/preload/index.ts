import { contextBridge, ipcRenderer } from 'electron';
import type { ActionExitedPayload, ProjectCard, RunActionResult, UncommittedFile } from '../shared/types';

const api = {
  getProjectCards: (): Promise<ProjectCard[]> => ipcRenderer.invoke('get-project-cards'),
  toggleServerWindow: (): Promise<void> => ipcRenderer.invoke('toggle-server-window'),
  addProject: (): Promise<ProjectCard[]> => ipcRenderer.invoke('add-project'),
  removeProject: (name: string): Promise<ProjectCard[]> => ipcRenderer.invoke('remove-project', name),
  runAction: (path: string, targetPaths: string[]): Promise<RunActionResult> =>
    ipcRenderer.invoke('run-action', path, targetPaths),
  runAnalysis: (path: string): Promise<RunActionResult> => ipcRenderer.invoke('run-analysis', path),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  openInVscode: (path: string): Promise<void> => ipcRenderer.invoke('open-in-vscode', path),
  openInCmux: (path: string): Promise<void> => ipcRenderer.invoke('open-in-cmux', path),
  openInFinder: (path: string): Promise<void> => ipcRenderer.invoke('open-in-finder', path),
  getUncommittedFiles: (path: string): Promise<UncommittedFile[]> =>
    ipcRenderer.invoke('get-uncommitted-files', path),
  quitApp: (): Promise<void> => ipcRenderer.invoke('quit-app'),
  onActionExited: (callback: (payload: ActionExitedPayload) => void): void => {
    ipcRenderer.on('action-exited', (_event, payload: ActionExitedPayload) => callback(payload));
  },
};

export type SidedashApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
