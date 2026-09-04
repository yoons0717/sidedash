import type {
  ActionExitedPayload,
  ActionType,
  CustomAction,
  ProjectCard,
  RunActionResult,
  ServerInfo,
} from '../../shared/types';
import { ACTION_LABELS } from '../../shared/types';

const ACTION_ICONS: Record<ActionType, { text: string; className: string }> = {
  pipeline: { text: '>_', className: 'icon-pipeline' },
  pdf: { text: '▤', className: 'icon-pdf' },
};
const DEFAULT_ICON = { text: '📁', className: '' };

const runningPaths = new Set<string>();
let currentProjects: ProjectCard[] = [];

function formatRelativeTime(isoString: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(isoString).getTime();
  if (Number.isNaN(diffMs)) return '알 수 없음';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function sortProjects(projects: ProjectCard[]): ProjectCard[] {
  // Most recent commit first; projects with no commit date (missing path, no
  // commits yet) sort last.
  return [...projects].sort((a, b) => {
    const aTime = a.lastCommit ? new Date(a.lastCommit.date).getTime() : -Infinity;
    const bTime = b.lastCommit ? new Date(b.lastCommit.date).getTime() : -Infinity;
    return bTime - aTime;
  });
}

const ANALYZE_BUTTON_LABEL = '🔍 상태 점검';

function setButtonState(btn: HTMLButtonElement, project: ProjectCard, labelWhenIdle: string): void {
  const running = runningPaths.has(project.path);
  btn.disabled = running;
  btn.classList.toggle('card-action-running', running);
  btn.textContent = running ? '실행 중…' : labelWhenIdle;
}

// One card can now have an unbounded number of action-producing buttons
// (the auto-detected action, 상태 점검, and any number of custom-action
// pills) — all of them share the same backend busy guard (runningProjects
// is keyed by path only, not by action), so starting any one of them must
// visually disable every other one on the card immediately. Each caller
// passes every button on its card, not just the one that was clicked.
type CardButton = { btn: HTMLButtonElement; label: string };

// Marks every button running optimistically, before run-action resolves —
// so it needs to be undone whenever the call turns out not to have actually
// started anything. "already-running" is the one exception: that means a
// real run *is* in progress (started by an earlier, still-in-flight click),
// so the buttons stay disabled and self-clear when that run's own
// action-exited arrives. Every other case (invalid project, or the IPC
// call itself rejecting) has no run in flight to fix it later, so it's
// undone right here — otherwise the buttons are stuck on "실행 중…" until
// the app restarts.
async function runProjectAction(
  project: ProjectCard,
  buttons: CardButton[],
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

function handleRunAction(
  project: ProjectCard,
  buttons: CardButton[],
  targetPaths: string[]
): Promise<void> {
  return runProjectAction(
    project,
    buttons,
    () => window.api.runAction(project.path, targetPaths),
    'run-action'
  );
}

function handleRunAnalysis(project: ProjectCard, buttons: CardButton[]): Promise<void> {
  return runProjectAction(project, buttons, () => window.api.runAnalysis(project.path), 'run-analysis');
}

function handleRunCustomAction(
  project: ProjectCard,
  buttons: CardButton[],
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

// For a promptArgs action: clicking the pill expands a one-line input (same
// expanding-panel pattern as buildTargetSelectPanel) to collect the arg
// string before the run starts.
function buildArgsPromptPanel(
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

// ---- 액션 목록 / 액션 추가 서브뷰 (실행 중인 서버 뷰와 같은 방식) ----

let currentActionProjectName: string | null = null;

function getActionProject(): ProjectCard | undefined {
  return currentProjects.find((p) => p.name === currentActionProjectName);
}

function showActionView(project: ProjectCard): void {
  currentActionProjectName = project.name;
  document.body.classList.remove('server-mode');
  document.body.classList.add('action-mode');
  renderActionList();
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

function buildActionItem(opts: {
  label: string;
  command: string;
  auto: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'action-item';

  const text = document.createElement('div');
  text.className = 'action-item-text';
  const label = document.createElement('span');
  label.className = 'action-item-label';
  label.textContent = opts.label;
  const command = document.createElement('span');
  command.className = `action-item-command${opts.auto ? ' auto' : ''}`;
  command.textContent = opts.command;
  text.append(label, command);
  item.appendChild(text);

  if (opts.onEdit || opts.onDelete) {
    const buttons = document.createElement('div');
    buttons.className = 'action-item-buttons';
    if (opts.onEdit) {
      const edit = document.createElement('button');
      edit.textContent = '✎';
      edit.title = '수정';
      edit.addEventListener('click', opts.onEdit);
      buttons.appendChild(edit);
    }
    if (opts.onDelete) {
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = '삭제';
      del.addEventListener('click', opts.onDelete);
      buttons.appendChild(del);
    }
    item.appendChild(buttons);
  }

  return item;
}

function renderActionList(): void {
  const project = getActionProject();
  const titleEl = document.getElementById('action-view-title')!;
  const bodyEl = document.getElementById('action-view-body')!;
  bodyEl.innerHTML = '';

  if (!project) {
    showProjectView();
    return;
  }
  titleEl.textContent = `액션 · ${project.name}`;

  if (project.action) {
    bodyEl.appendChild(
      buildActionItem({
        label: ACTION_LABELS[project.action],
        command: project.action === 'pipeline' ? './run.sh · 자동 감지' : 'npm run pdf · 자동 감지',
        auto: true,
      })
    );
  }

  for (const action of project.customActions) {
    bodyEl.appendChild(
      buildActionItem({
        label: action.label,
        command: action.command,
        auto: false,
        onEdit: () => renderActionForm(action),
        onDelete: () =>
          void applyActionChange(
            () => window.api.removeCustomAction(project.name, action.id),
            'remove-custom-action',
            renderActionList
          ),
      })
    );
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
  const project = getActionProject();
  const titleEl = document.getElementById('action-view-title')!;
  const bodyEl = document.getElementById('action-view-body')!;
  bodyEl.innerHTML = '';

  if (!project) {
    showProjectView();
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
      renderActionList
    );
  });

  const cancel = document.createElement('button');
  cancel.className = 'action-form-cancel';
  cancel.textContent = '취소';
  cancel.addEventListener('click', () => renderActionList());

  buttons.append(save, cancel);
  form.appendChild(buttons);
  bodyEl.appendChild(form);
}

function syncExpandedStyle(card: HTMLElement): void {
  const anyOpen = [...card.querySelectorAll<HTMLElement>('.target-select')].some(
    (panel) => panel.style.display !== 'none'
  );
  card.classList.toggle('expanded-style', anyOpen);
}

function buildTargetSelectPanel(
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

// Monochrome (currentColor) so hover/opacity styling in CSS applies without
// per-icon overrides.
const LINK_ICONS: Record<string, string> = {
  github:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
  vscode:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4 1 8l4 4M11 4l4 4-4 4"/></svg>',
  finder:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1.5 3A1.5 1.5 0 013 1.5h3.5L8 3.5h4.5A1.5 1.5 0 0114 5v7.5A1.5 1.5 0 0112.5 14h-9A1.5 1.5 0 012 12.5V3z"/></svg>',
  cmux:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6.5 6.5 9 4 11.5M8 11.5h4"/></svg>',
};

// Rendered as their own row below the title (see renderCard) rather than
// inline in the header — with icons *and* an action button both competing
// for header space, longer project names got truncated again even after
// switching from text labels to icons.
function buildLinkButtons(project: ProjectCard): HTMLButtonElement[] {
  const links: [string, string, () => void][] = [];
  if (project.githubUrl) {
    links.push(['github', 'GitHub에서 열기', () => window.api.openExternal(project.githubUrl!)]);
  }
  if (project.pathExists) {
    links.push(['vscode', 'VS Code에서 열기', () => window.api.openInVscode(project.path)]);
    links.push(['finder', 'Finder에서 열기', () => window.api.openInFinder(project.path)]);
    links.push(['cmux', 'cmux에서 열기', () => window.api.openInCmux(project.path)]);
  }

  return links.map(([icon, title, onClick]) => {
    const link = document.createElement('button');
    link.className = 'card-link';
    link.innerHTML = LINK_ICONS[icon];
    link.title = title;
    link.addEventListener('click', (event) => {
      event.stopPropagation();
      Promise.resolve(onClick()).catch((err) => console.error(`${title} failed:`, err));
    });
    return link;
  });
}

function renderCard(project: ProjectCard): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'card';

  const icon = project.action ? ACTION_ICONS[project.action] : DEFAULT_ICON;
  const iconEl = document.createElement('div');
  iconEl.className = `card-icon ${icon.className}`.trim();
  iconEl.textContent = icon.text;
  card.appendChild(iconEl);

  const body = document.createElement('div');
  body.className = 'card-body';

  const header = document.createElement('div');
  header.className = 'card-header';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = project.name;
  header.appendChild(title);

  let targetSelectPanel: HTMLDivElement | null = null;
  // Every action-producing button on this card, filled in as each is
  // created below — read by runProjectAction so starting any one of them
  // visually disables the rest too (see the comment on CardButton).
  const cardButtons: CardButton[] = [];

  if (project.action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'card-action';
    actionBtn.dataset.path = project.path;
    setButtonState(actionBtn, project, ACTION_LABELS[project.action]);
    actionBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (project.action === 'pipeline') {
        const isOpen = targetSelectPanel!.style.display !== 'none';
        targetSelectPanel!.style.display = isOpen ? 'none' : 'block';
        syncExpandedStyle(card);
      } else {
        handleRunAction(project, cardButtons, []);
      }
    });
    cardButtons.push({ btn: actionBtn, label: ACTION_LABELS[project.action] });
    header.appendChild(actionBtn);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'card-remove';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    handleRemove(project.name);
  });
  header.appendChild(removeBtn);

  body.appendChild(header);

  const linkButtons = buildLinkButtons(project);
  if (linkButtons.length > 0) {
    const linksRow = document.createElement('div');
    linksRow.className = 'card-links';
    for (const link of linkButtons) {
      linksRow.appendChild(link);
    }
    body.appendChild(linksRow);
  }

  const detail = document.createElement('div');
  detail.className = 'card-detail';

  if (!project.pathExists) {
    detail.classList.add('missing');
    detail.textContent = '경로를 찾을 수 없음';
  } else {
    const mainSpan = document.createElement('span');
    mainSpan.className = 'card-detail-main';
    const branchSpan = document.createElement('span');
    branchSpan.className = 'card-branch';
    branchSpan.textContent = project.branch ?? '(알 수 없음)';
    mainSpan.appendChild(branchSpan);
    detail.appendChild(mainSpan);

    if (project.lastCommit) {
      const dateSpan = document.createElement('span');
      dateSpan.className = 'card-detail-date';
      dateSpan.textContent = formatRelativeTime(project.lastCommit.date);
      detail.appendChild(dateSpan);
    }
  }
  body.appendChild(detail);

  if (project.pathExists) {
    const analyzeBtn = document.createElement('button');
    analyzeBtn.className = 'card-action card-action-secondary';
    analyzeBtn.dataset.path = project.path;
    setButtonState(analyzeBtn, project, ANALYZE_BUTTON_LABEL);
    analyzeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleRunAnalysis(project, cardButtons);
    });
    cardButtons.push({ btn: analyzeBtn, label: ANALYZE_BUTTON_LABEL });

    const analyzeRow = document.createElement('div');
    analyzeRow.className = 'card-analyze-row';
    analyzeRow.appendChild(analyzeBtn);
    body.appendChild(analyzeRow);

    const customRow = document.createElement('div');
    customRow.className = 'card-custom-actions';
    const argsPanels: HTMLDivElement[] = [];

    for (const action of project.customActions) {
      const pill = document.createElement('button');
      pill.className = 'card-custom-action';
      pill.dataset.path = project.path;
      setButtonState(pill, project, action.label);
      cardButtons.push({ btn: pill, label: action.label });

      if (action.promptArgs) {
        const argsPanel = buildArgsPromptPanel(project, card, cardButtons, action);
        argsPanels.push(argsPanel);
        pill.addEventListener('click', (event) => {
          event.stopPropagation();
          const isOpen = argsPanel.style.display !== 'none';
          argsPanel.style.display = isOpen ? 'none' : 'block';
          syncExpandedStyle(card);
        });
      } else {
        pill.addEventListener('click', (event) => {
          event.stopPropagation();
          handleRunCustomAction(project, cardButtons, action);
        });
      }
      customRow.appendChild(pill);
    }

    const manageBtn = document.createElement('button');
    manageBtn.className = 'card-custom-action card-custom-action-manage';
    manageBtn.textContent = project.customActions.length > 0 ? '＋' : '＋ 액션';
    manageBtn.title = '액션 추가 / 수정 / 삭제';
    manageBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      showActionView(project);
    });
    customRow.appendChild(manageBtn);

    body.appendChild(customRow);
    for (const argsPanel of argsPanels) {
      body.appendChild(argsPanel);
    }
  }

  if (project.hasUncommittedChanges) {
    const dirtyLine = document.createElement('div');
    dirtyLine.className = 'card-dirty-toggle';
    dirtyLine.textContent = `미커밋 변경사항 ${project.changedFileCount}개`;
    body.appendChild(dirtyLine);
  }

  if (project.action && project.lastRun) {
    const lastRunEl = document.createElement('div');
    lastRunEl.className = 'card-last-run';
    lastRunEl.textContent = `마지막 실행: ${formatRelativeTime(project.lastRun)}`;
    body.appendChild(lastRunEl);
  }

  if (project.action === 'pipeline') {
    targetSelectPanel = buildTargetSelectPanel(project, card, cardButtons);
    body.appendChild(targetSelectPanel);
  }

  card.appendChild(body);

  return card;
}

function renderProjects(projects: ProjectCard[]): void {
  const listEl = document.getElementById('project-list')!;
  const countEl = document.getElementById('project-count')!;

  currentProjects = projects;
  countEl.textContent = String(projects.length);
  listEl.innerHTML = '';

  if (projects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '등록된 프로젝트가 없어요. 위 + 버튼으로 추가해보세요.';
    listEl.appendChild(empty);
    return;
  }

  const sorted = sortProjects(projects);
  sorted.forEach((project, index) => {
    listEl.appendChild(renderCard(project));
    if (index < sorted.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'divider';
      listEl.appendChild(divider);
    }
  });
}

async function handleRemove(name: string): Promise<void> {
  try {
    const projects = await window.api.removeProject(name);
    renderProjects(projects);
  } catch (err) {
    console.error('remove-project failed:', err);
  }
}

let addInFlight = false;

async function handleAdd(): Promise<void> {
  if (addInFlight) return;
  addInFlight = true;
  try {
    const projects = await window.api.addProject();
    renderProjects(projects);
  } catch (err) {
    console.error('add-project failed:', err);
  } finally {
    addInFlight = false;
  }
}

async function refreshProjects(): Promise<void> {
  try {
    const projects = await window.api.getProjectCards();
    renderProjects(projects);
  } catch (err) {
    console.error('get-project-cards failed:', err);
  }
}

async function handleActionExited({ path }: ActionExitedPayload): Promise<void> {
  runningPaths.delete(path);
  // Re-fetch rather than just resetting the button: a successful run
  // updates lastRun on disk, and the card needs fresh data to show it
  // without waiting for the next app restart.
  await refreshProjects();
}

function serverDisplayName(server: ServerInfo): string {
  if (server.projectName) return server.projectName;
  if (server.cwd) return server.cwd.split('/').pop() || '알 수 없음';
  return '알 수 없음';
}

function renderServers(servers: ServerInfo[]): void {
  const listEl = document.getElementById('server-list')!;
  listEl.innerHTML = '';

  if (servers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '실행 중인 개발 서버가 없어요.';
    listEl.appendChild(empty);
    return;
  }

  for (const server of servers) {
    const row = document.createElement('div');
    row.className = 'server-row';

    const name = document.createElement('span');
    name.className = 'server-row-name';
    name.textContent = `${serverDisplayName(server)} · ${server.techStack}`;
    row.appendChild(name);

    const port = document.createElement('span');
    port.className = 'server-row-meta';
    port.textContent = `:${server.port}`;
    row.appendChild(port);

    const killBtn = document.createElement('button');
    killBtn.className = 'server-row-kill';
    killBtn.textContent = '✕';
    killBtn.title = '서버 종료';
    killBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      killBtn.disabled = true;
      killBtn.textContent = '…';
      window.api
        .killServer(server.pid)
        .then(refreshServers)
        .catch((err) => console.error('kill-server failed:', err));
    });
    row.appendChild(killBtn);

    row.addEventListener('click', () => {
      window.api
        .openExternal(`http://localhost:${server.port}`)
        .catch((err) => console.error('open server failed:', err));
    });

    listEl.appendChild(row);
  }
}

async function refreshServers(): Promise<void> {
  try {
    renderServers(await window.api.getRunningServers());
  } catch (err) {
    console.error('get-running-servers failed:', err);
  }
}

function showServerView(): void {
  document.body.classList.remove('action-mode');
  currentActionProjectName = null;
  document.body.classList.add('server-mode');
  void refreshServers();
}

function showProjectView(): void {
  document.body.classList.remove('server-mode');
  document.body.classList.remove('action-mode');
  currentActionProjectName = null;
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
  document.getElementById('action-back')!.addEventListener('click', showProjectView);
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
