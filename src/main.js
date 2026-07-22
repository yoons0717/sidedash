import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, ipcMain, dialog } from 'electron';
import { menubar } from 'menubar';
import * as registry from 'reentry-cli/src/registry.js';
import { getProjectCards, getProjectDetail, canAddProject } from './ipc/projects.js';
import { runAction, isRunning } from './actions/run.js';
import { openLogWindow } from './logwindow.js';

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

const ADD_REJECTION_MESSAGES = {
  'already-registered': '이미 등록된 프로젝트입니다.',
  'name-collision': '같은 이름의 프로젝트가 이미 등록되어 있습니다. 폴더 이름이 겹치지 않게 해주세요.',
};

ipcMain.handle('add-project', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (!result.canceled && result.filePaths.length > 0) {
    const projectPath = result.filePaths[0];
    const check = canAddProject(projectPath, registry.getAll());
    if (!check.ok) {
      await dialog.showMessageBox({ type: 'warning', message: ADD_REJECTION_MESSAGES[check.reason] });
      return getProjectCards();
    }
    const name = path.basename(projectPath);
    registry.add(name, projectPath);
  }
  return getProjectCards();
});

ipcMain.handle('remove-project', (event, name) => {
  registry.remove(name);
  return getProjectCards();
});

ipcMain.handle('get-project-detail', (event, projectPath) => getProjectDetail(projectPath));

ipcMain.handle('quit-app', () => {
  app.quit();
});

ipcMain.handle('run-action', (event, projectPath) => {
  const cards = getProjectCards();
  const project = cards.find((p) => p.path === projectPath);
  if (!project || !project.action) {
    return;
  }

  // Check the backend-authoritative guard *before* opening the log window —
  // otherwise a suppressed duplicate run (e.g. renderer state lost after a
  // popup reload) opens a window that never receives data or an exit signal.
  if (isRunning(project.path)) {
    return;
  }

  const projectWithType = { ...project, actionType: project.action };
  const logWindow = openLogWindow(project.name, projectWithType);

  runAction(
    projectWithType,
    cards,
    {
      onData: (chunk) => logWindow.appendData(chunk),
      onExit: (code) => {
        mb.window?.webContents.send('action-exited', { path: project.path, code });
        logWindow.finish(code);
      },
    }
  );
});

mb.on('ready', () => {
  console.log('sidedash is ready');
});
