import type { CustomAction, ProjectCard } from '../../shared/types';
import { currentProjects } from './state';
import { type CardButton, handleRunAction, handleRunCustomAction } from './card-runner';

// For a promptArgs action: clicking the pill expands a one-line input (same
// expanding-panel pattern as buildTargetSelectPanel) to collect the arg
// string before the run starts.
export function buildArgsPromptPanel(
  project: ProjectCard,
  card: HTMLElement,
  buttons: CardButton[],
  action: CustomAction
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'target-select args-prompt';
  panel.style.display = 'none';
  panel.addEventListener('click', (event) => event.stopPropagation());

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '인자 (명령어의 {args} 자리에 삽입)';
  panel.appendChild(input);

  const actions = document.createElement('div');
  actions.className = 'target-select-actions';

  const runBtn = document.createElement('button');
  runBtn.className = 'target-select-run';
  runBtn.textContent = '실행';
  runBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const args = input.value.trim();
    panel.style.display = 'none';
    syncExpandedStyle(card);
    handleRunCustomAction(project, buttons, action, args);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'target-select-cancel';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    panel.style.display = 'none';
    syncExpandedStyle(card);
  });

  actions.append(runBtn, cancelBtn);
  panel.appendChild(actions);
  return panel;
}

export function syncExpandedStyle(card: HTMLElement): void {
  const anyOpen = [...card.querySelectorAll<HTMLElement>('.target-select')].some(
    (panel) => panel.style.display !== 'none'
  );
  card.classList.toggle('expanded-style', anyOpen);
}

export function buildTargetSelectPanel(
  project: ProjectCard,
  card: HTMLElement,
  buttons: CardButton[]
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'target-select';
  panel.style.display = 'none';
  // Without this, clicking a checkbox (or anywhere else in the panel) would
  // bubble up past the action button's own stopPropagation.
  panel.addEventListener('click', (event) => event.stopPropagation());

  const otherProjects = currentProjects.filter((p) => p.path !== project.path);
  const checkboxes: HTMLInputElement[] = [];
  let preview: HTMLDivElement | null = null;

  // Purely illustrative quoting for the preview line — the actual command
  // sent to the shell uses run.ts's shellQuote (single-quote escaping), not
  // this. Showing that exact escaping here would need duplicating it in the
  // renderer just to render a hint, which isn't worth the coupling.
  function updatePreview(): void {
    if (!preview) return;
    const checked = checkboxes.filter((cb) => cb.checked);
    const args = checked.map((cb) => `"${cb.dataset.path}"`).join(' ');
    preview.textContent = `$ ./run.sh${args ? ' ' + args : ''}`;
  }

  if (otherProjects.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '대상으로 고를 다른 프로젝트가 없어요.';
    panel.appendChild(empty);
  } else {
    const hint = document.createElement('div');
    hint.className = 'target-select-hint';
    hint.textContent = '체크한 프로젝트의 경로가 아래처럼 run.sh 인자로 전달됩니다.';
    panel.appendChild(hint);

    for (const other of otherProjects) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = false;
      checkbox.dataset.path = other.path;
      checkbox.addEventListener('change', updatePreview);
      checkboxes.push(checkbox);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(other.name));
      panel.appendChild(label);
    }

    preview = document.createElement('div');
    preview.className = 'target-select-preview';
    panel.appendChild(preview);
    updatePreview();
  }

  const actions = document.createElement('div');
  actions.className = 'target-select-actions';

  if (otherProjects.length > 0) {
    const runBtn = document.createElement('button');
    runBtn.className = 'target-select-run';
    runBtn.textContent = '실행';
    runBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const targetPaths = checkboxes.filter((cb) => cb.checked).map((cb) => cb.dataset.path!);
      panel.style.display = 'none';
      syncExpandedStyle(card);
      handleRunAction(project, buttons, targetPaths);
    });
    actions.appendChild(runBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'target-select-cancel';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    panel.style.display = 'none';
    syncExpandedStyle(card);
  });
  actions.appendChild(cancelBtn);

  panel.appendChild(actions);
  return panel;
}
