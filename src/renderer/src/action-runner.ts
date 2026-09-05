import type { CustomAction, ProjectCard, RunActionResult } from '../../shared/types';

const runningPaths = new Set<string>();

export function setButtonState(btn: HTMLButtonElement, project: ProjectCard, labelWhenIdle: string): void {
  const running = runningPaths.has(project.path);
  btn.disabled = running;
  btn.classList.toggle('card-action-running', running);
  btn.textContent = running ? '실행 중…' : labelWhenIdle;
}

// A project's detail page can show any number of action-producing buttons
// (the auto-detected action, 상태 점검, custom actions), all sharing one busy
// guard keyed by project path — so starting any one must visually disable
// the rest too. Callers pass every such button currently on screen for that
// project, not just the one clicked.
export type ActionButton = { btn: HTMLButtonElement; label: string };

// Marks buttons running optimistically, before the call resolves, so it
// must be undone if nothing actually started. Exception: "already-running"
// means a real run is in progress elsewhere and will self-clear via its
// own action-exited — undoing here too would race it.
async function runProjectAction(
  project: ProjectCard,
  buttons: ActionButton[],
  call: () => Promise<RunActionResult>,
  errorLabel: string
): Promise<void> {
  if (runningPaths.has(project.path)) {
    return;
  }
  const setAll = (): void => {
    for (const { btn, label } of buttons) setButtonState(btn, project, label);
  };
  runningPaths.add(project.path);
  setAll();
  try {
    const result = await call();
    if (result.ok === false && result.reason !== 'already-running') {
      runningPaths.delete(project.path);
      setAll();
    }
  } catch (err) {
    console.error(`${errorLabel} failed:`, err);
    runningPaths.delete(project.path);
    setAll();
  }
}

export function handleRunAction(
  project: ProjectCard,
  buttons: ActionButton[],
  targetPaths: string[]
): Promise<void> {
  return runProjectAction(
    project,
    buttons,
    () => window.api.runAction(project.path, targetPaths),
    'run-action'
  );
}

export function handleRunAnalysis(project: ProjectCard, buttons: ActionButton[]): Promise<void> {
  return runProjectAction(project, buttons, () => window.api.runAnalysis(project.path), 'run-analysis');
}

export function handleRunCustomAction(
  project: ProjectCard,
  buttons: ActionButton[],
  action: CustomAction,
  args?: string
): Promise<void> {
  return runProjectAction(
    project,
    buttons,
    () => window.api.runCustomAction(project.path, action.id, args),
    'run-custom-action'
  );
}

// Called from the app-level action-exited IPC listener (cards.ts's
// handleActionExited) once a run genuinely finishes — runningPaths itself
// stays private to this module so every write to it goes through a
// function here.
export function clearRunning(path: string): void {
  runningPaths.delete(path);
}
