import type { CustomAction, ProjectCard } from '../../shared/types';
import { ACTION_LABELS } from '../../shared/types';
import { currentProjects } from './state';
// Import cycle with cards.ts — intentional, see CLAUDE.md.
import { buildBranchAndDateSpans, buildDirtyLine, buildLinkButtons, formatRelativeTime, renderProjects } from './cards';
import {
  type ActionButton,
  handleRunAction,
  handleRunAnalysis,
  handleRunCustomAction,
  setButtonState,
} from './action-runner';
import { buildArgsPromptPanel, buildTargetSelectPanel } from './action-panels';

// ---- 프로젝트 상세 페이지 (실행 중인 서버 뷰와 같은 방식) ----
// 카드는 훑어보기용 정보만 보여주고, 링크·상태 점검·액션 관리는 전부 여기로.

const ANALYZE_BUTTON_LABEL = '🔍 상태 점검';

let currentProjectName: string | null = null;

function getCurrentProject(): ProjectCard | undefined {
  return currentProjects.find((p) => p.name === currentProjectName);
}

// Clears this view's own state and hides it — used both as this module's
// "go back to the project list" fallback and by app.ts's showProjectView()
// (server-mode is guaranteed already off whenever detail-mode is on, so
// neither needs to know about the other's CSS class).
export function resetProjectDetail(): void {
  document.body.classList.remove('detail-mode');
  currentProjectName = null;
}

export function showProjectDetail(name: string): void {
  currentProjectName = name;
  document.body.classList.remove('server-mode');
  document.body.classList.add('detail-mode');
  renderProjectDetail();
}

async function applyActionChange(
  call: () => Promise<ProjectCard[]>,
  errorLabel: string,
  after: () => void
): Promise<void> {
  try {
    renderProjects(await call());
    after();
  } catch (err) {
    console.error(`${errorLabel} failed:`, err);
  }
}

function buildActionItem(label: string, command: string, auto: boolean, trailing: HTMLElement[]): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'action-item';

  const text = document.createElement('div');
  text.className = 'action-item-text';
  const labelEl = document.createElement('span');
  labelEl.className = 'action-item-label';
  labelEl.textContent = label;
  const commandEl = document.createElement('span');
  commandEl.className = `action-item-command${auto ? ' auto' : ''}`;
  commandEl.textContent = command;
  text.append(labelEl, commandEl);
  item.appendChild(text);

  if (trailing.length > 0) {
    const buttons = document.createElement('div');
    buttons.className = 'action-item-buttons';
    for (const el of trailing) buttons.appendChild(el);
    item.appendChild(buttons);
  }

  return item;
}

function buildRunButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = '▶';
  btn.title = '실행';
  return btn;
}

function renderProjectDetail(): void {
  const project = getCurrentProject();
  const titleEl = document.getElementById('detail-view-title')!;
  const bodyEl = document.getElementById('detail-view-body')!;
  bodyEl.innerHTML = '';

  if (!project) {
    resetProjectDetail();
    return;
  }
  titleEl.textContent = project.name;

  const linkButtons = buildLinkButtons(project);
  if (linkButtons.length > 0) {
    const linksRow = document.createElement('div');
    linksRow.className = 'detail-links';
    for (const link of linkButtons) linksRow.appendChild(link);
    bodyEl.appendChild(linksRow);
  }

  if (!project.pathExists) {
    const missing = document.createElement('div');
    missing.className = 'card-detail missing';
    missing.textContent = '경로를 찾을 수 없음';
    bodyEl.appendChild(missing);
    return;
  }

  const meta = document.createElement('div');
  meta.className = 'card-detail detail-meta';
  for (const span of buildBranchAndDateSpans(project)) meta.appendChild(span);
  bodyEl.appendChild(meta);

  const dirtyLine = buildDirtyLine(project);
  if (dirtyLine) bodyEl.appendChild(dirtyLine);

  if (project.action && project.lastRun) {
    const lastRun = document.createElement('div');
    lastRun.className = 'card-last-run';
    lastRun.textContent = `마지막 실행: ${formatRelativeTime(project.lastRun)}`;
    bodyEl.appendChild(lastRun);
  }

  // Every run-triggering button on this page shares one busy guard — see
  // the comment on ActionButton in action-runner.ts.
  const pageButtons: ActionButton[] = [];

  const analyzeBtn = document.createElement('button');
  analyzeBtn.className = 'card-action card-action-secondary detail-analyze';
  setButtonState(analyzeBtn, project, ANALYZE_BUTTON_LABEL);
  analyzeBtn.addEventListener('click', () => handleRunAnalysis(project, pageButtons));
  pageButtons.push({ btn: analyzeBtn, label: ANALYZE_BUTTON_LABEL });
  bodyEl.appendChild(analyzeBtn);

  const heading = document.createElement('div');
  heading.className = 'detail-h';
  heading.textContent = '액션';
  bodyEl.appendChild(heading);

  if (project.action) {
    const runBtn = buildRunButton();
    pageButtons.push({ btn: runBtn, label: '▶' });

    const row = buildActionItem(
      ACTION_LABELS[project.action],
      project.action === 'pipeline' ? './run.sh · 자동 감지' : 'npm run pdf · 자동 감지',
      true,
      [runBtn]
    );
    bodyEl.appendChild(row);

    if (project.action === 'pipeline') {
      const panel = buildTargetSelectPanel(project, pageButtons);
      bodyEl.appendChild(panel);
      runBtn.addEventListener('click', () => {
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
      });
    } else {
      runBtn.addEventListener('click', () => handleRunAction(project, pageButtons, []));
    }
  }

  for (const action of project.customActions) {
    const runBtn = buildRunButton();
    pageButtons.push({ btn: runBtn, label: action.label });

    const editBtn = document.createElement('button');
    editBtn.textContent = '✎';
    editBtn.title = '수정';
    editBtn.addEventListener('click', () => renderActionForm(action));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.title = '삭제';
    deleteBtn.addEventListener('click', () =>
      void applyActionChange(
        () => window.api.removeCustomAction(project.name, action.id),
        'remove-custom-action',
        renderProjectDetail
      )
    );

    const row = buildActionItem(action.label, action.command, false, [runBtn, editBtn, deleteBtn]);
    bodyEl.appendChild(row);

    if (action.promptArgs) {
      const panel = buildArgsPromptPanel(project, pageButtons, action);
      bodyEl.appendChild(panel);
      runBtn.addEventListener('click', () => {
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
      });
    } else {
      runBtn.addEventListener('click', () => handleRunCustomAction(project, pageButtons, action));
    }
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'action-add-new';
  addBtn.textContent = '＋ 새 액션';
  addBtn.addEventListener('click', () => renderActionForm());
  bodyEl.appendChild(addBtn);
}

function buildActionFormField(
  parent: HTMLElement,
  labelText: string,
  placeholder: string,
  value: string,
  mono: boolean,
  hint?: string,
  suggestions?: string[]
): HTMLInputElement {
  const field = document.createElement('div');
  field.className = 'action-form-field';

  const label = document.createElement('label');
  label.textContent = labelText;
  field.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;
  if (mono) input.className = 'mono';
  field.appendChild(input);

  // Clickable suggestion chips instead of native <datalist> — the browser's
  // own dropdown affordance for input[list] is a shadow-root element CSS
  // can't restyle or reliably position a custom indicator next to, and it
  // stayed too faint (and, next to our own icon, doubled-up/misaligned) at
  // rest. Chips are plain DOM: fully themeable, no native-widget fighting.
  // Only offered for package.json scripts, the one structured source of
  // "likely commands" this app already reads.
  if (suggestions && suggestions.length > 0) {
    const chipRow = document.createElement('div');
    chipRow.className = 'action-form-suggestions';
    for (const suggestion of suggestions) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'action-form-suggestion-chip';
      chip.textContent = suggestion;
      chip.addEventListener('click', () => {
        input.value = suggestion;
        // Setting .value directly never fires 'input' — dispatch it so any
        // listener depending on real typing (e.g. renderActionForm's
        // 저장-button enable check) reacts the same way it would to typing.
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
      chipRow.appendChild(chip);
    }
    field.appendChild(chipRow);
  }

  if (hint) {
    const hintEl = document.createElement('div');
    hintEl.className = 'action-form-hint';
    hintEl.textContent = hint;
    field.appendChild(hintEl);
  }

  parent.appendChild(field);
  return input;
}

function renderActionForm(existing?: CustomAction): void {
  const project = getCurrentProject();
  const titleEl = document.getElementById('detail-view-title')!;
  const bodyEl = document.getElementById('detail-view-body')!;
  bodyEl.innerHTML = '';

  if (!project) {
    resetProjectDetail();
    return;
  }
  titleEl.textContent = existing ? `액션 수정 · ${project.name}` : `새 액션 · ${project.name}`;

  const form = document.createElement('div');
  form.className = 'action-form';

  const labelInput = buildActionFormField(form, '라벨', '배포', existing?.label ?? '', false);
  const commandInput = buildActionFormField(
    form,
    '명령어',
    'npm run deploy',
    existing?.command ?? '',
    true,
    '프로젝트 루트에서 zsh -lc 로 실행',
    project.scripts.map((script) => `npm run ${script}`)
  );

  const check = document.createElement('label');
  check.className = 'action-form-check';
  const checkInput = document.createElement('input');
  checkInput.type = 'checkbox';
  checkInput.checked = existing?.promptArgs ?? false;
  const checkText = document.createElement('span');
  checkText.innerHTML = '실행 시 인자 입력받기 — 명령어의 <code>{args}</code> 자리에 삽입';
  check.append(checkInput, checkText);
  form.appendChild(check);

  const resultInput = buildActionFormField(
    form,
    '결과 폴더 (선택)',
    'dist/',
    existing?.resultDir ?? '',
    true,
    '완료 후 로그 창에 "결과 폴더 열기" 버튼 표시'
  );

  const buttons = document.createElement('div');
  buttons.className = 'action-form-buttons';

  const save = document.createElement('button');
  save.className = 'action-form-save';
  save.textContent = '저장';
  const syncSave = (): void => {
    save.disabled = labelInput.value.trim() === '' || commandInput.value.trim() === '';
  };
  syncSave();
  labelInput.addEventListener('input', syncSave);
  commandInput.addEventListener('input', syncSave);
  save.addEventListener('click', () => {
    const input = {
      label: labelInput.value.trim(),
      command: commandInput.value.trim(),
      promptArgs: checkInput.checked,
      resultDir: resultInput.value.trim(),
    };
    if (!input.label || !input.command) return;
    void applyActionChange(
      () =>
        existing
          ? window.api.updateCustomAction(project.name, existing.id, input)
          : window.api.addCustomAction(project.name, input),
      existing ? 'update-custom-action' : 'add-custom-action',
      renderProjectDetail
    );
  });

  const cancel = document.createElement('button');
  cancel.className = 'action-form-cancel';
  cancel.textContent = '취소';
  cancel.addEventListener('click', () => renderProjectDetail());

  buttons.append(save, cancel);
  form.appendChild(buttons);
  bodyEl.appendChild(form);
}
