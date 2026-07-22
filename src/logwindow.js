import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openLogWindow(title) {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    title,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile(path.join(__dirname, 'logwindow.html'));

  // Chunks can arrive before the page finishes loading its IPC listeners,
  // so buffer them and flush once the page is ready.
  let ready = false;
  const queue = [];

  win.webContents.once('did-finish-load', () => {
    ready = true;
    for (const [channel, payload] of queue) {
      win.webContents.send(channel, payload);
    }
    queue.length = 0;
  });

  function send(channel, payload) {
    if (win.isDestroyed()) return;
    if (ready) {
      win.webContents.send(channel, payload);
    } else {
      queue.push([channel, payload]);
    }
  }

  return {
    appendData: (chunk) => send('log-data', chunk),
  };
}
