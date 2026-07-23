import { contextBridge, ipcRenderer, shell } from 'electron';
import type { LogExitPayload } from '../shared/types';

const logApi = {
  onLogData: (callback: (chunk: string) => void): void => {
    ipcRenderer.on('log-data', (_event, chunk: string) => callback(chunk));
  },
  onLogExit: (callback: (payload: LogExitPayload) => void): void => {
    ipcRenderer.on('log-exit', (_event, payload: LogExitPayload) => callback(payload));
  },
  openPath: (targetPath: string): Promise<string> => shell.openPath(targetPath),
};

export type LogWindowApi = typeof logApi;

contextBridge.exposeInMainWorld('logApi', logApi);
