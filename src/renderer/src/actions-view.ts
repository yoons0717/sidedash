import type { CustomAction, ProjectCard } from '../../shared/types';
import { ACTION_LABELS } from '../../shared/types';
import { currentProjects } from './state';
// Import cycle with cards.ts — intentional, see CLAUDE.md.
import { renderProjects } from './cards';

// ---- 액션 목록 / 액션 추가 서브뷰 (실행 중인 서버 뷰와 같은 방식) ----

let currentActionProjectName: string | null = null;

function getActionProject(): ProjectCard | undefined {
  return currentProjects.find((p) => p.name === currentActionProjectName);
}

// Clears this subview's own state and hides it — used both as this
// module's "go back to the project list" fallback and by app.ts's
// showProjectView() (server-mode is guaranteed already off whenever
// action-mode is on, so neither needs to know about the other's CSS class).
export function resetActionView(): void {
  document.body.classList.remove('action-mode');
  currentActionProjectName = null;
}

export function showActionView(project: ProjectCard): void {
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
    resetActionView();
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
    resetActionView();
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
