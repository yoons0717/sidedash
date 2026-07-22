function renderCard(project) {
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = project.name;
  card.appendChild(title);

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

  return card;
}

async function init() {
  const projects = await window.api.getProjectCards();
  const listEl = document.getElementById('project-list');
  const countEl = document.getElementById('project-count');

  countEl.textContent = String(projects.length);
  listEl.innerHTML = '';
  for (const project of projects) {
    listEl.appendChild(renderCard(project));
  }
}

init();
