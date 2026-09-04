import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActionExitedPayload,
  CustomActionInput,
  ProjectCard,
  RunActionResult,
  ServerInfo,
} from '../shared/types';

const api = {
  getProjectCards: (): Promise<ProjectCard[]> => ipcRenderer.invoke('get-project-cards'),
  getRunningServers: (): Promise<ServerInfo[]> => ipcRenderer.invoke('get-running-servers'),
  killServer: (pid: number): Promise<void> => ipcRenderer.invoke('kill-server', pid),
  addProject: (): Promise<ProjectCard[]> => ipcRenderer.invoke('add-project'),
  removeProject: (name: string): Promise<ProjectCard[]> => ipcRenderer.invoke('remove-project', name),
  addCustomAction: (name: string, input: CustomActionInput): Promise<ProjectCard[]> =>
    ipcRenderer.invoke('add-custom-action', name, input),
  updateCustomAction: (
    name: string,
    actionId: string,
    input: CustomActionInput
  ): Promise<ProjectCard[]> => ipcRenderer.invoke('update-custom-action', name, actionId, input),
  removeCustomAction: (name: string, actionId: string): Promise<ProjectCard[]> =>
    ipcRenderer.invoke('remove-custom-action', name, actionId),
  runAction: (path: string, targetPaths: string[]): Promise<RunActionResult> =>
    ipcRenderer.invoke('run-action', path, targetPaths),
  runAnalysis: (path: string): Promise<RunActionResult> => ipcRenderer.invoke('run-analysis', path),
  runCustomAction: (path: string, actionId: string, args?: string): Promise<RunActionResult> =>
    ipcRenderer.invoke('run-custom-action', path, actionId, args),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  openInVscode: (path: string): Promise<void> => ipcRenderer.invoke('open-in-vscode', path),
  openInCmux: (path: string): Promise<void> => ipcRenderer.invoke('open-in-cmux', path),
  openInFinder: (path: string): Promise<void> => ipcRenderer.invoke('open-in-finder', path),
  quitApp: (): Promise<void> => ipcRenderer.invoke('quit-app'),
  onActionExited: (callback: (payload: ActionExitedPayload) => void): void => {
    ipcRenderer.on('action-exited', (_event, payload: ActionExitedPayload) => callback(payload));
  },
};

export type SidedashApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
