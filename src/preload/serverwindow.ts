import { contextBridge, ipcRenderer } from 'electron';
import type { ServerInfo } from '../shared/types';

const serverApi = {
  onServersUpdated: (callback: (servers: ServerInfo[]) => void): void => {
    ipcRenderer.on('servers-updated', (_event, servers: ServerInfo[]) => callback(servers));
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  killServer: (pid: number): Promise<void> => ipcRenderer.invoke('kill-server', pid),
};

export type ServerWindowApi = typeof serverApi;

contextBridge.exposeInMainWorld('serverApi', serverApi);
