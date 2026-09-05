import { handleActionExited, handleAdd, refreshProjects } from './cards';
import { resetProjectDetail } from './project-view';
import { showServerView } from './servers-view';

function showProjectView(): void {
  document.body.classList.remove('server-mode');
  resetProjectDetail();
}

async function init(): Promise<void> {
  if (import.meta.env.DEV) {
    document.getElementById('dev-badge')!.textContent = 'dev';
  }
  document.getElementById('add-project')!.addEventListener('click', handleAdd);
  document.getElementById('toggle-servers')!.addEventListener('click', () => {
    if (document.body.classList.contains('server-mode')) {
      showProjectView();
    } else {
      showServerView();
    }
  });
  document.getElementById('server-back')!.addEventListener('click', showProjectView);
  document.getElementById('detail-back')!.addEventListener('click', showProjectView);
  document.getElementById('quit-app')!.addEventListener('click', () => {
    window.api.quitApp().catch((err) => console.error('quit-app failed:', err));
  });
  window.api.onActionExited(handleActionExited);

  // menubar keeps this window's page loaded and just shows/hides it rather
  // than reloading — without this, branch/commit/dirty-file status stays
  // frozen at whatever it was when the app launched, until the next action
  // happens to run and refresh it as a side effect.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      showProjectView();
      refreshProjects();
    }
  });

  await refreshProjects();
}

init();
