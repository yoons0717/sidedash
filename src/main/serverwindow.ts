import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import * as registry from './lib/registry';
import { getRunningServers } from './lib/portscan';

let win: BrowserWindow | null = null;

// Also called after a kill-server request resolves, to drop the just-killed
// entry from the list without waiting for the window to regain focus.
export function pushServers(): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('servers-updated', getRunningServers(registry.getAll(), app.getAppPath()));
}

// Toggled by a single header button — open when closed, close when open —
// rather than a normal window the user manages separately, so the button
// itself doubles as the on/off switch.
export function toggleServerWindow(anchorWindow: BrowserWindow): void {
  if (win && !win.isDestroyed()) {
    win.close();
    return;
  }

  const anchorBounds = anchorWindow.getBounds();

  win = new BrowserWindow({
    width: 300,
    height: 420,
    x: anchorBounds.x + anchorBounds.width + 8,
    y: anchorBounds.y,
    title: '실행 중인 서버',
    show: false,
    webPreferences: {
      // electron-vite builds the preload script as an ES module (.mjs);
      // ESM preload scripts aren't supported under Electron's default
      // sandboxed preload, so sandboxing needs to be off explicitly.
      sandbox: false,
      preload: path.join(__dirname, '../preload/serverwindow.mjs'),
    },
  });

  // menubar hides its popup ~100ms after it loses focus (see the `menubar`
  // package's internal blur handler) — unless the popup is alwaysOnTop, in
  // which case blur is a no-op. Without this, clicking into this window to
  // use it (not just glancing at it) immediately hides the popup it's
  // anchored next to. Restored on close (below) so the popup still
  // auto-hides normally once this window isn't open to be clicked into.
  anchorWindow.setAlwaysOnTop(true);

  // showInactive() (not the default auto-show) keeps focus on the menubar
  // popup — a normal show() would steal focus and trigger the same
  // hide-on-blur this window is meant to sit alongside.
  win.once('ready-to-show', () => {
    win?.showInactive();
    pushServers();
  });

  // serverwindow.html's static <title> tag would otherwise override the
  // title set above the moment the page finishes loading, per Electron's
  // default (page title always wins over the constructor option).
  win.on('page-title-updated', (event) => event.preventDefault());

  // The window is a real BrowserWindow with a native close button, not just
  // toggled via the popup's button — clearing the reference on close (either
  // path) keeps `win` from pointing at a destroyed window.
  win.on('closed', () => {
    win = null;
    if (!anchorWindow.isDestroyed()) anchorWindow.setAlwaysOnTop(false);
  });

  // Re-fetching on focus (not a timer) mirrors how the main popup already
  // treats "user is looking at this now" as the refresh trigger, without
  // adding a polling interval that runs even while the window sits unfocused.
  win.on('focus', pushServers);

  if (import.meta.env.DEV && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/serverwindow.html`);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/serverwindow.html'));
  }
}
