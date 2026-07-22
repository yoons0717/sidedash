const ACTION_LABELS = {
  pipeline: '파이프라인 실행',
  pdf: 'PDF 생성',
};

const ACTION_ICONS = {
  pipeline: { text: '>_', className: 'icon-pipeline' },
  pdf: { text: '▤', className: 'icon-pdf' },
};
const DEFAULT_ICON = { text: '📁', className: '' };

const runningPaths = new Set();
let currentProjects = [];
let sortMode = 'recent';

function formatRelativeTime(isoString, now = new Date()) {
  const diffMs = now.getTime() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function sortProjects(projects) {
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

function setActionButtonState(actionBtn, project) {
  const running = runningPaths.has(project.path);
  actionBtn.disabled = running;
  actionBtn.classList.toggle('card-action-running', running);
  actionBtn.textContent = running ? '실행 중…' : ACTION_LABELS[project.action];
}

async function handleRunAction(project, actionBtn, targetPaths) {
  if (runningPaths.has(project.path)) {
    return;
  }
  runningPaths.add(project.path);
  setActionButtonState(actionBtn, project);
  await window.api.runAction(project.path, targetPaths);
}

// A card can have a target-select panel (pipeline action) and a files panel
// (uncommitted changes) at the same time — deriving expanded-style from
// current visibility (rather than each toggle setting it directly) keeps
// the two from clobbering each other's state when only one closes.
function syncExpandedStyle(card) {
  const anyOpen = [...card.querySelectorAll('.target-select, .card-files')].some(
    (panel) => panel.style.display !== 'none'
  );
  card.classList.toggle('expanded-style', anyOpen);
}

function buildFilesPanel() {
  const panel = document.createElement('div');
  panel.className = 'card-files';
  panel.style.display = 'none';
  return panel;
}

async function toggleFilesPanel(project, panel, card) {
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

function buildTargetSelectPanel(project, card, actionBtn) {
  const panel = document.createElement('div');
  panel.className = 'target-select';
  panel.style.display = 'none';
  // Without this, clicking a checkbox (or anywhere else in the panel) would
  // bubble up past the action button's own stopPropagation.
  panel.addEventListener('click', (event) => event.stopPropagation());

  const otherProjects = currentProjects.filter((p) => p.path !== project.path);
  const checkboxes = [];

  if (otherProjects.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '대상으로 고를 다른 프로젝트가 없어요.';
    panel.appendChild(empty);
  } else {
    for (const other of otherProjects) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.dataset.path = other.path;
      checkboxes.push(checkbox);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(other.name));
      panel.appendChild(label);
    }
  }

  const actions = document.createElement('div');
  actions.className = 'target-select-actions';

  if (otherProjects.length > 0) {
    const runBtn = document.createElement('button');
    runBtn.className = 'target-select-run';
    runBtn.textContent = '실행';
    runBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const targetPaths = checkboxes.filter((cb) => cb.checked).map((cb) => cb.dataset.path);
      panel.style.display = 'none';
      syncExpandedStyle(card);
      handleRunAction(project, actionBtn, targetPaths);
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

function renderCard(project) {
  const card = document.createElement('div');
  card.className = 'card';

  const icon = ACTION_ICONS[project.action] ?? DEFAULT_ICON;
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

  if (project.githubUrl) {
    const githubBtn = document.createElement('button');
    githubBtn.className = 'card-github';
    githubBtn.textContent = '🔗';
    githubBtn.title = 'GitHub에서 열기';
    githubBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      window.api.openExternal(project.githubUrl);
    });
    header.appendChild(githubBtn);
  }

  let targetSelectPanel = null;
  let actionBtn = null;

  if (project.action) {
    actionBtn = document.createElement('button');
    actionBtn.className = 'card-action';
    actionBtn.dataset.path = project.path;
    setActionButtonState(actionBtn, project);
    actionBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (project.action === 'pipeline') {
        const isOpen = targetSelectPanel.style.display !== 'none';
        targetSelectPanel.style.display = isOpen ? 'none' : 'block';
        syncExpandedStyle(card);
      } else {
        handleRunAction(project, actionBtn, []);
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

  const detail = document.createElement('div');
  detail.className = 'card-detail';
  let filesPanel = null;

  if (!project.pathExists) {
    detail.classList.add('missing');
    detail.textContent = '경로를 찾을 수 없음';
  } else {
    const branch = project.branch ?? '(알 수 없음)';
    const commitMessage = project.lastCommit ? project.lastCommit.message : '(커밋 없음)';

    const branchSpan = document.createElement('span');
    branchSpan.className = 'card-branch';
    branchSpan.textContent = branch;
    detail.appendChild(branchSpan);
    detail.appendChild(document.createTextNode(` · ${commitMessage}`));
  }
  body.appendChild(detail);

  if (project.hasUncommittedChanges) {
    const dirtyLine = document.createElement('div');
    dirtyLine.className = 'card-dirty-toggle';
    dirtyLine.textContent = `미커밋 변경사항 ${project.changedFileCount}개`;
    body.appendChild(dirtyLine);

    filesPanel = buildFilesPanel();
    body.appendChild(filesPanel);
    // Only dirty cards have anything to expand — clicking a clean card
    // (or a pipeline card's target-select area, which stopPropagates)
    // does nothing.
    card.classList.add('clickable');
    card.addEventListener('click', () => toggleFilesPanel(project, filesPanel, card));
  }

  if (project.action && project.lastRun) {
    const lastRunEl = document.createElement('div');
    lastRunEl.className = 'card-last-run';
    lastRunEl.textContent = `마지막 실행: ${formatRelativeTime(project.lastRun)}`;
    body.appendChild(lastRunEl);
  }

  if (project.action === 'pipeline') {
    targetSelectPanel = buildTargetSelectPanel(project, card, actionBtn);
    body.appendChild(targetSelectPanel);
  }

  card.appendChild(body);

  return card;
}

function renderProjects(projects) {
  const listEl = document.getElementById('project-list');
  const countEl = document.getElementById('project-count');

  currentProjects = projects;
  countEl.textContent = String(projects.length);
  listEl.innerHTML = '';
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

function setSortMode(mode) {
  sortMode = mode;
  document.getElementById('sort-recent').classList.toggle('active', mode === 'recent');
  document.getElementById('sort-name').classList.toggle('active', mode === 'name');
  renderProjects(currentProjects);
}

async function handleRemove(name) {
  const projects = await window.api.removeProject(name);
  renderProjects(projects);
}

async function handleAdd() {
  const projects = await window.api.addProject();
  renderProjects(projects);
}

async function handleActionExited({ path }) {
  runningPaths.delete(path);
  // Re-fetch rather than just resetting the button: a successful run updates
  // lastRun on disk, and the card needs fresh data to show it without
  // waiting for the next app restart.
  const projects = await window.api.getProjectCards();
  renderProjects(projects);
}

async function init() {
  document.getElementById('add-project').addEventListener('click', handleAdd);
  document.getElementById('quit-app').addEventListener('click', () => window.api.quitApp());
  document.getElementById('sort-recent').addEventListener('click', () => setSortMode('recent'));
  document.getElementById('sort-name').addEventListener('click', () => setSortMode('name'));
  window.api.onActionExited(handleActionExited);

  const projects = await window.api.getProjectCards();
  renderProjects(projects);
}

init();
