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

function setActionButtonState(actionBtn, project) {
  const running = runningPaths.has(project.path);
  actionBtn.disabled = running;
  actionBtn.classList.toggle('card-action-running', running);
  actionBtn.textContent = running ? '실행 중…' : ACTION_LABELS[project.action];
}

// The detail panel (card-expanded) and the target-select panel are toggled
// independently, but both share the same "expanded-style" card background.
// Deriving it from current visibility (rather than each toggle handler
// setting it directly) keeps the two from clobbering each other's state.
function syncExpandedStyle(card) {
  const anyPanelOpen = [...card.querySelectorAll('.card-expanded, .target-select')].some(
    (panel) => panel.style.display !== 'none'
  );
  card.classList.toggle('expanded-style', anyPanelOpen);
}

async function handleRunAction(project, actionBtn, targetPaths) {
  if (runningPaths.has(project.path)) {
    return;
  }
  runningPaths.add(project.path);
  setActionButtonState(actionBtn, project);
  await window.api.runAction(project.path, targetPaths);
}

function buildTargetSelectPanel(project, card, actionBtn) {
  const panel = document.createElement('div');
  panel.className = 'target-select';
  panel.style.display = 'none';

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
  header.addEventListener('click', () => toggleExpanded(card, project));

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = project.name;
  header.appendChild(title);

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
  if (!project.pathExists) {
    detail.className = 'card-detail missing';
    detail.textContent = '경로를 찾을 수 없음';
  } else {
    detail.className = project.hasUncommittedChanges ? 'card-detail dirty' : 'card-detail';
    const branch = project.branch ?? '(알 수 없음)';
    const commitMessage = project.lastCommit ? project.lastCommit.message : '(커밋 없음)';
    const dirty = project.hasUncommittedChanges ? ' · 미커밋 변경사항 있음' : '';
    detail.textContent = `${branch} · ${commitMessage}${dirty}`;
  }
  body.appendChild(detail);

  const expanded = document.createElement('div');
  expanded.className = 'card-expanded';
  expanded.style.display = 'none';
  body.appendChild(expanded);

  if (project.action === 'pipeline') {
    targetSelectPanel = buildTargetSelectPanel(project, card, actionBtn);
    body.appendChild(targetSelectPanel);
  }

  card.appendChild(body);

  return card;
}

async function toggleExpanded(card, project) {
  const expanded = card.querySelector('.card-expanded');
  if (expanded.style.display !== 'none') {
    expanded.style.display = 'none';
    syncExpandedStyle(card);
    return;
  }

  if (!project.pathExists) {
    return;
  }

  if (!expanded.dataset.loaded) {
    const { todoCount, scripts } = await window.api.getProjectDetail(project.path);
    const scriptNames = Object.keys(scripts);

    const todoLine = document.createElement('div');
    todoLine.textContent = `TODO/FIXME: ${todoCount}개`;
    expanded.appendChild(todoLine);

    const scriptsLine = document.createElement('div');
    scriptsLine.textContent = scriptNames.length > 0 ? `scripts: ${scriptNames.join(', ')}` : 'scripts: 없음';
    expanded.appendChild(scriptsLine);

    expanded.dataset.loaded = 'true';
  }

  expanded.style.display = 'block';
  syncExpandedStyle(card);
}

function renderProjects(projects) {
  const listEl = document.getElementById('project-list');
  const countEl = document.getElementById('project-count');

  currentProjects = projects;
  countEl.textContent = String(projects.length);
  listEl.innerHTML = '';
  projects.forEach((project, index) => {
    listEl.appendChild(renderCard(project));
    if (index < projects.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'divider';
      listEl.appendChild(divider);
    }
  });
}

async function handleRemove(name) {
  const projects = await window.api.removeProject(name);
  renderProjects(projects);
}

async function handleAdd() {
  const projects = await window.api.addProject();
  renderProjects(projects);
}

function handleActionExited({ path }) {
  runningPaths.delete(path);
  const project = currentProjects.find((p) => p.path === path);
  const actionBtn = document.querySelector(`.card-action[data-path="${CSS.escape(path)}"]`);
  if (project && actionBtn) {
    setActionButtonState(actionBtn, project);
  }
}

async function init() {
  document.getElementById('add-project').addEventListener('click', handleAdd);
  document.getElementById('quit-app').addEventListener('click', () => window.api.quitApp());
  window.api.onActionExited(handleActionExited);

  const projects = await window.api.getProjectCards();
  renderProjects(projects);
}

init();
