import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, ipcMain } from 'electron';
import { menubar } from 'menubar';
import { getProjectCards } from './ipc/projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.dock.hide();

const mb = menubar({
  index: `file://${path.join(__dirname, 'index.html')}`,
  browserWindow: {
    width: 340,
    height: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  },
});

ipcMain.handle('get-project-cards', () => getProjectCards());

mb.on('ready', () => {
  console.log('sidedash is ready');
});
