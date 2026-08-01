import path from 'node:path';
import { spawn } from 'node:child_process';
import { app, ipcMain, dialog, shell, Notification } from 'electron';
import { menubar } from 'menubar';
import * as registry from './lib/registry';
import { getProjectCards, canAddProject } from './ipc/projects';
import { runAction, isRunning, hasRunningActions, killAllRunning, shellQuote } from './actions/run';
import { recordRun } from './actions/history';
import { recordAnalysis } from './actions/analysis';
import { getUncommittedFiles } from './actions/git';
import { openLogWindow } from './logwindow';
import type { ActionType, AddProjectRejectionReason, RunActionResult } from '../shared/types';
// `?asset` doesn't copy this into `out/` — it resolves to a path relative to
// the project root (`out/main/../../resources/IconTemplate.png`), relying on
// `resources/` shipping alongside `out/` in the packaged app (true for the
// current non-asar `electron-packager` setup; would break under `--asar` or
// a bundler that packs `out/` on its own). IconTemplate@2x.png needs no
// import of its own — menubar finds it next to the base icon via filename
// convention, and it ships because the whole `resources/` dir ships as-is.
import iconPath from '../../resources/IconTemplate.png?asset';

const HISTORY_FILE = path.join(app.getPath('userData'), 'last-run.json');
const ANALYSIS_FILE = path.join(app.getPath('userData'), 'analysis.json');

app.dock.hide();

// Only the packaged .app should register as a login item — app.isPackaged
// is false under `electron .`, which would otherwise add the shared
// node_modules/electron binary itself to Login Items.
if (app.isPackaged) {
  app.setLoginItemSettings({ openAtLogin: true });
}

const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

const mb = menubar({
  index:
    import.meta.env.DEV && rendererUrl
      ? `${rendererUrl}/index.html`
      : `file://${path.join(__dirname, '../renderer/index.html')}`,
  icon: iconPath,
  browserWindow: {
    width: 360,
    height: 560,
    webPreferences: {
      // electron-vite builds the preload script as an ES module (.mjs);
      // ESM preload scripts aren't supported under Electron's default
      // sandboxed preload, so sandboxing needs to be off explicitly.
      sandbox: false,
      preload: path.join(__dirname, '../preload/index.mjs'),
    },
  },
});

ipcMain.handle('get-project-cards', () => getProjectCards(HISTORY_FILE, ANALYSIS_FILE));

const ADD_REJECTION_MESSAGES: Record<AddProjectRejectionReason, string> = {
  'already-registered': '이미 등록된 프로젝트입니다.',
  'name-collision': '같은 이름의 프로젝트가 이미 등록되어 있습니다. 폴더 이름이 겹치지 않게 해주세요.',
};

ipcMain.handle('add-project', async () => {
  // Passing the popup window as parent attaches these as sheets on macOS
  // instead of separate windows — without it, the popup loses focus the
  // moment the dialog opens and menubar's hide-on-blur closes it underneath.
  const result = await dialog.showOpenDialog(mb.window!, { properties: ['openDirectory'] });
  if (!result.canceled && result.filePaths.length > 0) {
    const projectPath = result.filePaths[0];
    const check = canAddProject(projectPath, registry.getAll());
    if (!check.ok) {
      await dialog.showMessageBox(mb.window!, { type: 'warning', message: ADD_REJECTION_MESSAGES[check.reason] });
      return getProjectCards(HISTORY_FILE, ANALYSIS_FILE);
    }
    const name = path.basename(projectPath);
    registry.add(name, projectPath);
  }
  return getProjectCards(HISTORY_FILE, ANALYSIS_FILE);
});

ipcMain.handle('remove-project', (_event, name: string) => {
  registry.remove(name);
  return getProjectCards(HISTORY_FILE, ANALYSIS_FILE);
});

ipcMain.handle('open-external', (_event, url: string) => shell.openExternal(url));

// shell.openPath resolves with an error string on failure (not a rejection),
// so a bad path fails silently unless that string is checked.
ipcMain.handle('open-in-finder', async (_event, projectPath: string) => {
  const error = await shell.openPath(projectPath);
  if (error) {
    dialog.showErrorBox('Finder에서 열 수 없습니다', error);
  }
});

ipcMain.handle('get-uncommitted-files', (_event, projectPath: string) => getUncommittedFiles(projectPath));

// Neither `open -a` nor a missing shell command produce a spawn 'error'
// event on their own (the child process itself launches fine) — the failure
// shows up as stderr + a non-zero exit code instead. Without listening for
// both, a missing app/CLI fails completely silently (or, if 'error' really
// does fire and nothing handles it, can crash the main process).
function spawnAndReportErrors(label: string, command: string, args: string[]): void {
  const child = spawn(command, args);
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('error', (err) => {
    dialog.showErrorBox(`${label}를 열 수 없습니다`, err.message);
  });
  child.on('exit', (code) => {
    if (code !== 0) {
      dialog.showErrorBox(`${label}를 열 수 없습니다`, stderr.trim() || `종료 코드 ${code}`);
    }
  });
}

// `open -a` resolves the app by name via Launch Services, so it works
// regardless of whether the `code` shell command is installed.
ipcMain.handle('open-in-vscode', (_event, projectPath: string) => {
  spawnAndReportErrors('VS Code', 'open', ['-a', 'Visual Studio Code', projectPath]);
});

// cmux's bin/ isn't on PATH via any shell profile or /etc/paths.d entry —
// cmux injects it only into terminal sessions it spawns itself, so even the
// login-shell trick (which works for nvm/homebrew PATH entries in ~/.zprofile)
// can't find it from a plain Electron-spawned shell. Call the CLI inside the
// app bundle directly instead of relying on `cmux` resolving via PATH.
const CMUX_CLI = '/Applications/cmux.app/Contents/Resources/bin/cmux';

// `cmux <path>` only creates the workspace over its control socket, it
// doesn't raise the app — without `open -a cmux` after it, the workspace
// opens invisibly behind whatever window already has focus.
ipcMain.handle('open-in-cmux', (_event, projectPath: string) => {
  spawnAndReportErrors('cmux', '/bin/zsh', ['-lc', `${shellQuote(CMUX_CLI)} ${shellQuote(projectPath)} && open -a cmux`]);
});

ipcMain.handle('quit-app', async () => {
  if (hasRunningActions()) {
    const result = await dialog.showMessageBox(mb.window!, {
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

const ACTION_LABELS: Record<ActionType, string> = {
  pipeline: '파이프라인 실행',
  pdf: 'PDF 생성',
};

// Return value lets the renderer tell "genuinely didn't start, re-enable the
// button now" apart from "already running elsewhere, leave it disabled —
// the real run's own action-exited will clear it". Collapsing both into a
// bare no-op return left the renderer with no way to distinguish them: it
// optimistically marks the button running before this call resolves, and
// nothing ever un-marks it for the "didn't start" case since no run started
// to eventually fire action-exited.
ipcMain.handle('run-action', (_event, projectPath: string, targetPaths: string[]): RunActionResult => {
  const cards = getProjectCards(HISTORY_FILE, ANALYSIS_FILE);
  const project = cards.find((p) => p.path === projectPath);
  if (!project || !project.action) {
    return { ok: false, reason: 'invalid' };
  }

  // Check the backend-authoritative guard *before* opening the log window —
  // otherwise a suppressed duplicate run (e.g. renderer state lost after a
  // popup reload) opens a window that never receives data or an exit signal.
  if (isRunning(project.path)) {
    return { ok: false, reason: 'already-running' };
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

        const actionLabel = ACTION_LABELS[project.action!];
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

  return { ok: true };
});

const ANALYSIS_LABEL = '상태 분석';

ipcMain.handle('run-analysis', (_event, projectPath: string): RunActionResult => {
  const cards = getProjectCards(HISTORY_FILE, ANALYSIS_FILE);
  const project = cards.find((p) => p.path === projectPath);
  if (!project) {
    return { ok: false, reason: 'invalid' };
  }

  if (isRunning(project.path)) {
    return { ok: false, reason: 'already-running' };
  }

  const projectWithType = { ...project, actionType: 'analyze' as const };
  const logWindow = openLogWindow(project.name, projectWithType);

  let summary = '';

  runAction(
    projectWithType,
    [],
    {
      onData: (chunk) => {
        summary += chunk;
        logWindow.appendData(chunk);
      },
      onExit: (code) => {
        mb.window?.webContents.send('action-exited', { path: project.path, code });
        logWindow.finish(code);

        if (code === 0) {
          recordAnalysis(ANALYSIS_FILE, project.path, summary.trim());
        }

        const body =
          code === 0 ? `${ANALYSIS_LABEL} 완료`
          : code === null ? `${ANALYSIS_LABEL} 실패 (프로세스를 시작하지 못함)`
          : `${ANALYSIS_LABEL} 실패 (종료 코드 ${code})`;
        const notification = new Notification({ title: project.name, body });
        notification.on('click', () => logWindow.focus());
        notification.show();
      },
    }
  );

  return { ok: true };
});

mb.on('ready', () => {
  console.log('sidedash is ready');
});
