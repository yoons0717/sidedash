const ACTION_LABELS = {
  pipeline: '파이프라인 실행',
  pdf: 'PDF 생성',
};

function renderCard(project) {
  const card = document.createElement('div');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'card-header';
  header.addEventListener('click', () => toggleExpanded(card, project));

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = project.name;
  header.appendChild(title);

  if (project.action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'card-action';
    actionBtn.textContent = ACTION_LABELS[project.action];
    actionBtn.addEventListener('click', (event) => event.stopPropagation());
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

  card.appendChild(header);

  const detail = document.createElement('div');
  detail.className = 'card-detail';
  if (!project.pathExists) {
    detail.textContent = '경로를 찾을 수 없음';
  } else {
    const branch = project.branch ?? '(알 수 없음)';
    const commitMessage = project.lastCommit ? project.lastCommit.message : '(커밋 없음)';
    const dirty = project.hasUncommittedChanges ? ' · 미커밋 변경사항 있음' : '';
    detail.textContent = `${branch} · ${commitMessage}${dirty}`;
  }
  card.appendChild(detail);

  const expanded = document.createElement('div');
  expanded.className = 'card-expanded';
  expanded.style.display = 'none';
  card.appendChild(expanded);

  return card;
}

async function toggleExpanded(card, project) {
  const expanded = card.querySelector('.card-expanded');
  if (expanded.style.display !== 'none') {
    expanded.style.display = 'none';
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
}

function renderProjects(projects) {
  const listEl = document.getElementById('project-list');
  const countEl = document.getElementById('project-count');

  countEl.textContent = String(projects.length);
  listEl.innerHTML = '';
  for (const project of projects) {
    listEl.appendChild(renderCard(project));
  }
}

async function handleRemove(name) {
  const projects = await window.api.removeProject(name);
  renderProjects(projects);
}

async function handleAdd() {
  const projects = await window.api.addProject();
  renderProjects(projects);
}

async function init() {
  document.getElementById('add-project').addEventListener('click', handleAdd);

  const projects = await window.api.getProjectCards();
  renderProjects(projects);
}

init();
