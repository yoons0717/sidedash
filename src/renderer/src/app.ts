import type { ActionExitedPayload, ActionType, ProjectCard, RunActionResult } from '../../shared/types';
import { ACTION_LABELS } from '../../shared/types';

const ACTION_ICONS: Record<ActionType, { text: string; className: string }> = {
  pipeline: { text: '>_', className: 'icon-pipeline' },
  pdf: { text: '▤', className: 'icon-pdf' },
};
const DEFAULT_ICON = { text: '📁', className: '' };

const runningPaths = new Set<string>();
let currentProjects: ProjectCard[] = [];
let sortMode: 'recent' | 'name' = 'recent';

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
  const sorted = [...projects];
  if (sortMode === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } else {
    // Projects with no commit date (missing path, no commits yet) sort last.
    sorted.sort((a, b) => {
      const aTime = a.lastCommit ? new Date(a.lastCommit.date).getTime() : -Infinity;
      const bTime = b.lastCommit ? new Date(b.lastCommit.date).getTime() : -Infinity;
      return bTime - aTime;
    });
  }
  return sorted;
}

function analyzeButtonLabel(project: ProjectCard): string {
  return project.lastAnalysis ? '🔍 다시 분석' : '🔍 상태 분석';
}

function setButtonState(btn: HTMLButtonElement, project: ProjectCard, labelWhenIdle: string): void {
  const running = runningPaths.has(project.path);
  btn.disabled = running;
  btn.classList.toggle('card-action-running', running);
  btn.textContent = running ? '실행 중…' : labelWhenIdle;
}

// Both buttons on a card share the same backend busy guard (runningProjects
// is keyed by path only, not by action), so starting either one must also
// visually disable the other immediately — otherwise the sibling button
// stays clickable until the next full refreshProjects() re-render.
//
// Marks the button running optimistically, before run-action resolves —
// so it needs to be undone whenever the call turns out not to have actually
// started anything. "already-running" is the one exception: that means a
// real run *is* in progress (started by an earlier, still-in-flight click),
// so the button stays disabled and self-clears when that run's own
// action-exited arrives. Every other case (invalid project, or the IPC
// call itself rejecting) has no run in flight to fix it later, so it's
// undone right here — otherwise the button is stuck on "실행 중…" until
// the app restarts.
async function runProjectAction(
  project: ProjectCard,
  primaryBtn: HTMLButtonElement,
  primaryLabel: string,
  secondaryBtn: HTMLButtonElement | null,
  secondaryLabel: string | null,
  call: () => Promise<RunActionResult>,
  errorLabel: string
): Promise<void> {
  if (runningPaths.has(project.path)) {
    return;
  }
  const setBoth = (): void => {
    setButtonState(primaryBtn, project, primaryLabel);
    if (secondaryBtn && secondaryLabel !== null) setButtonState(secondaryBtn, project, secondaryLabel);
  };
  runningPaths.add(project.path);
  setBoth();
  try {
    const result = await call();
    if (result.ok === false && result.reason !== 'already-running') {
      runningPaths.delete(project.path);
      setBoth();
    }
  } catch (err) {
    console.error(`${errorLabel} failed:`, err);
    runningPaths.delete(project.path);
    setBoth();
  }
}

function handleRunAction(
  project: ProjectCard,
  actionBtn: HTMLButtonElement,
  analyzeBtn: HTMLButtonElement | null,
  targetPaths: string[]
): Promise<void> {
  return runProjectAction(
    project,
    actionBtn,
    ACTION_LABELS[project.action!],
    analyzeBtn,
    analyzeBtn ? analyzeButtonLabel(project) : null,
    () => window.api.runAction(project.path, targetPaths),
    'run-action'
  );
}

function handleRunAnalysis(
  project: ProjectCard,
  analyzeBtn: HTMLButtonElement,
  actionBtn: HTMLButtonElement | null
): Promise<void> {
  return runProjectAction(
    project,
    analyzeBtn,
    analyzeButtonLabel(project),
    actionBtn,
    actionBtn ? ACTION_LABELS[project.action!] : null,
    () => window.api.runAnalysis(project.path),
    'run-analysis'
  );
}

// A card can have a target-select panel (pipeline action) and a files panel
// (uncommitted changes) at the same time — deriving expanded-style from
// current visibility (rather than each toggle setting it directly) keeps
// the two from clobbering each other's state when only one closes.
function syncExpandedStyle(card: HTMLElement): void {
  const anyOpen = [...card.querySelectorAll<HTMLElement>('.target-select, .card-files')].some(
    (panel) => panel.style.display !== 'none'
  );
  card.classList.toggle('expanded-style', anyOpen);
}

function buildFilesPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'card-files';
  panel.style.display = 'none';
  return panel;
}

async function toggleFilesPanel(project: ProjectCard, panel: HTMLDivElement, card: HTMLElement): Promise<void> {
  const isOpen = panel.style.display !== 'none';
  if (isOpen) {
    panel.style.display = 'none';
    syncExpandedStyle(card);
    return;
  }

  if (!panel.dataset.loaded) {
    const files = await window.api.getUncommittedFiles(project.path);
    for (const { status, file } of files) {
      const line = document.createElement('div');
      line.className = 'card-files-line';
      line.textContent = `${status} ${file}`;
      panel.appendChild(line);
    }
    panel.dataset.loaded = 'true';
  }

  panel.style.display = 'block';
  syncExpandedStyle(card);
}

function buildTargetSelectPanel(
  project: ProjectCard,
  card: HTMLElement,
  actionBtn: HTMLButtonElement | null,
  analyzeBtn: HTMLButtonElement | null
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
      handleRunAction(project, actionBtn!, analyzeBtn, targetPaths);
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
  let actionBtn: HTMLButtonElement | null = null;
  let analyzeBtn: HTMLButtonElement | null = null;

  if (project.action) {
    actionBtn = document.createElement('button');
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
        handleRunAction(project, actionBtn!, analyzeBtn, []);
      }
    });
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
  let filesPanel: HTMLDivElement | null = null;
  let detailMainSpan: HTMLSpanElement | null = null;
  let analysisTextEl: HTMLDivElement | null = null;

  if (!project.pathExists) {
    detail.classList.add('missing');
    detail.textContent = '경로를 찾을 수 없음';
  } else {
    const branch = project.branch ?? '(알 수 없음)';
    const commitMessage = project.lastCommit ? project.lastCommit.message : '(커밋 없음)';

    const mainSpan = document.createElement('span');
    mainSpan.className = 'card-detail-main';
    const branchSpan = document.createElement('span');
    branchSpan.className = 'card-branch';
    branchSpan.textContent = branch;
    mainSpan.appendChild(branchSpan);
    mainSpan.appendChild(document.createTextNode(` · ${commitMessage}`));
    detail.appendChild(mainSpan);
    detailMainSpan = mainSpan;

    if (project.lastCommit) {
      const dateSpan = document.createElement('span');
      dateSpan.className = 'card-detail-date';
      dateSpan.textContent = project.lastCommit.date;
      detail.appendChild(dateSpan);
    }
  }
  body.appendChild(detail);

  if (project.pathExists) {
    if (project.lastAnalysis) {
      const analysisBox = document.createElement('div');
      analysisBox.className = 'card-analysis';

      const analysisText = document.createElement('div');
      analysisText.className = 'card-analysis-text';
      analysisText.textContent = project.lastAnalysis.summary;
      analysisBox.appendChild(analysisText);
      analysisTextEl = analysisText;

      body.appendChild(analysisBox);
    }

    analyzeBtn = document.createElement('button');
    analyzeBtn.className = 'card-action card-action-secondary';
    analyzeBtn.dataset.path = project.path;
    setButtonState(analyzeBtn, project, analyzeButtonLabel(project));
    analyzeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleRunAnalysis(project, analyzeBtn!, actionBtn);
    });

    const analysisTag = document.createElement('span');
    analysisTag.className = 'card-analysis-tag' + (project.lastAnalysis ? ' done' : '');
    analysisTag.textContent = project.lastAnalysis
      ? `${formatRelativeTime(project.lastAnalysis.analyzedAt)} 분석`
      : '미분석';

    const analyzeRow = document.createElement('div');
    analyzeRow.className = 'card-analyze-row';
    analyzeRow.appendChild(analyzeBtn);
    analyzeRow.appendChild(analysisTag);
    body.appendChild(analyzeRow);
  }

  if (project.hasUncommittedChanges) {
    const dirtyLine = document.createElement('div');
    dirtyLine.className = 'card-dirty-toggle';
    dirtyLine.textContent = `미커밋 변경사항 ${project.changedFileCount}개`;
    body.appendChild(dirtyLine);

    filesPanel = buildFilesPanel();
    body.appendChild(filesPanel);
  }

  // Clicking a card toggles its truncated commit message open, the
  // uncommitted-files panel, and the analysis summary's clamp — all at once,
  // for the same reason: each is a "this is truncated for space" affordance
  // and there's no reason to make the user find a separate toggle per line.
  if (detailMainSpan || filesPanel || analysisTextEl) {
    card.classList.add('clickable');
    card.addEventListener('click', () => {
      detailMainSpan?.classList.toggle('expanded');
      analysisTextEl?.classList.toggle('expanded');
      if (filesPanel) {
        toggleFilesPanel(project, filesPanel, card);
      }
    });
  }

  if (project.action && project.lastRun) {
    const lastRunEl = document.createElement('div');
    lastRunEl.className = 'card-last-run';
    lastRunEl.textContent = `마지막 실행: ${formatRelativeTime(project.lastRun)}`;
    body.appendChild(lastRunEl);
  }

  if (project.action === 'pipeline') {
    targetSelectPanel = buildTargetSelectPanel(project, card, actionBtn, analyzeBtn);
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

function setSortMode(mode: 'recent' | 'name'): void {
  sortMode = mode;
  document.getElementById('sort-recent')!.classList.toggle('active', mode === 'recent');
  document.getElementById('sort-name')!.classList.toggle('active', mode === 'name');
  renderProjects(currentProjects);
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

async function init(): Promise<void> {
  document.getElementById('add-project')!.addEventListener('click', handleAdd);
  document.getElementById('quit-app')!.addEventListener('click', () => {
    window.api.quitApp().catch((err) => console.error('quit-app failed:', err));
  });
  document.getElementById('sort-recent')!.addEventListener('click', () => setSortMode('recent'));
  document.getElementById('sort-name')!.addEventListener('click', () => setSortMode('name'));
  window.api.onActionExited(handleActionExited);

  // menubar keeps this window's page loaded and just shows/hides it rather
  // than reloading — without this, branch/commit/dirty-file status stays
  // frozen at whatever it was when the app launched, until the next action
  // happens to run and refresh it as a side effect.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshProjects();
    }
  });

  await refreshProjects();
}

init();
