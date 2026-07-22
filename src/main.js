import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, ipcMain, dialog, shell, Notification } from 'electron';
import { menubar } from 'menubar';
import * as registry from 'reentry-cli/src/registry.js';
import { getProjectCards, canAddProject } from './ipc/projects.js';
import { runAction, isRunning, hasRunningActions, killAllRunning } from './actions/run.js';
import { recordRun } from './actions/history.js';
import { getUncommittedFiles } from './actions/git.js';
import { openLogWindow } from './logwindow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(app.getPath('userData'), 'last-run.json');

app.dock.hide();

const mb = menubar({
  index: `file://${path.join(__dirname, 'index.html')}`,
  // menubar's default icon lookup is `<options.dir>/IconTemplate.png`, and
  // options.dir defaults to app.getAppPath() (the project root) — not this
  // src/ directory where the icon files actually live. Without this explicit
  // path it silently falls back to menubar's own bundled default icon.
  icon: path.join(__dirname, 'IconTemplate.png'),
  browserWindow: {
    width: 360,
    height: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  },
});

ipcMain.handle('get-project-cards', () => getProjectCards(HISTORY_FILE));

const ADD_REJECTION_MESSAGES = {
  'already-registered': '이미 등록된 프로젝트입니다.',
  'name-collision': '같은 이름의 프로젝트가 이미 등록되어 있습니다. 폴더 이름이 겹치지 않게 해주세요.',
};

ipcMain.handle('add-project', async () => {
  // Passing the popup window as parent attaches these as sheets on macOS
  // instead of separate windows — without it, the popup loses focus the
  // moment the dialog opens and menubar's hide-on-blur closes it underneath.
  const result = await dialog.showOpenDialog(mb.window, { properties: ['openDirectory'] });
  if (!result.canceled && result.filePaths.length > 0) {
    const projectPath = result.filePaths[0];
    const check = canAddProject(projectPath, registry.getAll());
    if (!check.ok) {
      await dialog.showMessageBox(mb.window, { type: 'warning', message: ADD_REJECTION_MESSAGES[check.reason] });
      return getProjectCards(HISTORY_FILE);
    }
    const name = path.basename(projectPath);
    registry.add(name, projectPath);
  }
  return getProjectCards(HISTORY_FILE);
});

ipcMain.handle('remove-project', (event, name) => {
  registry.remove(name);
  return getProjectCards(HISTORY_FILE);
});

ipcMain.handle('open-external', (event, url) => shell.openExternal(url));

ipcMain.handle('get-uncommitted-files', (event, projectPath) => getUncommittedFiles(projectPath));

ipcMain.handle('quit-app', async () => {
  if (hasRunningActions()) {
    const result = await dialog.showMessageBox(mb.window, {
      type: 'warning',
      buttons: ['종료', '취소'],
      defaultId: 1,
      cancelId: 1,
      message: '실행 중인 작업이 있습니다. 지금 종료하면 작업이 중단됩니다. 그래도 종료할까요?',
    });
    if (result.response !== 0) {
      return;
    }
    killAllRunning();
  }
  app.quit();
});

const ACTION_LABELS = {
  pipeline: '파이프라인 실행',
  pdf: 'PDF 생성',
};

ipcMain.handle('run-action', (event, projectPath, targetPaths) => {
  const cards = getProjectCards(HISTORY_FILE);
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
    targetPaths ?? [],
    {
      onData: (chunk) => logWindow.appendData(chunk),
      onExit: (code) => {
        mb.window?.webContents.send('action-exited', { path: project.path, code });
        logWindow.finish(code);

        if (code === 0) {
          recordRun(HISTORY_FILE, project.path);
        }

        const actionLabel = ACTION_LABELS[project.action];
        const body =
          code === 0 ? `${actionLabel} 완료`
          : code === null ? `${actionLabel} 실패 (프로세스를 시작하지 못함)`
          : `${actionLabel} 실패 (종료 코드 ${code})`;
        const notification = new Notification({ title: project.name, body });
        notification.on('click', () => logWindow.focus());
        notification.show();
      },
    }
  );
});

mb.on('ready', () => {
  console.log('sidedash is ready');
});
