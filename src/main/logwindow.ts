import path from 'node:path';
import { BrowserWindow } from 'electron';
import type { ActionType } from '../shared/types';

interface LogWindowProject {
  path: string;
  actionType: ActionType;
}

export interface LogWindowHandle {
  appendData: (chunk: string) => void;
  finish: (code: number | null) => void;
  focus: () => void;
}

export function openLogWindow(title: string, project: LogWindowProject): LogWindowHandle {
  const win = new BrowserWindow({
    width: 600,
    height: 320,
    title,
    show: false,
    webPreferences: {
      // electron-vite builds the preload script as an ES module (.mjs);
      // ESM preload scripts aren't supported under Electron's default
      // sandboxed preload, so sandboxing needs to be off explicitly.
      sandbox: false,
      preload: path.join(__dirname, '../preload/logwindow.mjs'),
    },
  });

  // showInactive() (not the default auto-show) keeps focus on the menubar
  // popup — a normal show() would steal focus and trigger menubar's
  // hide-on-blur, closing the popup the moment the log window appears.
  win.once('ready-to-show', () => win.showInactive());

  // electron-vite serves the renderer from a dev server (HMR) instead of a
  // built file while `npm run dev` is running.
  if (import.meta.env.DEV && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/logwindow.html`);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/logwindow.html'));
  }

  // Chunks can arrive before the page finishes loading its IPC listeners,
  // so buffer them and flush once the page is ready.
  let ready = false;
  const queue: [string, unknown][] = [];

  win.webContents.once('did-finish-load', () => {
    ready = true;
    for (const [channel, payload] of queue) {
      win.webContents.send(channel, payload);
    }
    queue.length = 0;
  });

  function send(channel: string, payload: unknown): void {
    if (win.isDestroyed()) return;
    if (ready) {
      win.webContents.send(channel, payload);
    } else {
      queue.push([channel, payload]);
    }
  }

  return {
    appendData: (chunk) => send('log-data', chunk),
    finish: (code) => send('log-exit', { code, path: project.path, actionType: project.actionType }),
    focus: () => {
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
  };
}
