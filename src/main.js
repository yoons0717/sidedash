import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, ipcMain, dialog } from 'electron';
import { menubar } from 'menubar';
import * as registry from 'reentry-cli/src/registry.js';
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

ipcMain.handle('add-project', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (!result.canceled && result.filePaths.length > 0) {
    const projectPath = result.filePaths[0];
    const name = path.basename(projectPath);
    registry.add(name, projectPath);
  }
  return getProjectCards();
});

ipcMain.handle('remove-project', (event, name) => {
  registry.remove(name);
  return getProjectCards();
});

mb.on('ready', () => {
  console.log('sidedash is ready');
});
