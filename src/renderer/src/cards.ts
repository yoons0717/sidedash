import type { ActionExitedPayload, ActionType, ProjectCard } from '../../shared/types';
import { ACTION_LABELS } from '../../shared/types';
import { setCurrentProjects } from './state';
// Import cycle with actions-view.ts — intentional, see CLAUDE.md.
import { showActionView } from './actions-view';
import {
  type CardButton,
  clearRunning,
  handleRunAction,
  handleRunAnalysis,
  handleRunCustomAction,
  setButtonState,
} from './card-runner';
import { buildArgsPromptPanel, buildTargetSelectPanel, syncExpandedStyle } from './card-panels';

const ACTION_ICONS: Record<ActionType, { text: string; className: string }> = {
  pipeline: { text: '>_', className: 'icon-pipeline' },
  pdf: { text: '▤', className: 'icon-pdf' },
};
const DEFAULT_ICON = { text: '📁', className: '' };

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
  // created below — passed to handleRunAction/handleRunAnalysis/
  // handleRunCustomAction (card-runner.ts) so starting any one of them
  // visually disables the rest too (see the comment on CardButton there).
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

export function renderProjects(projects: ProjectCard[]): void {
  const listEl = document.getElementById('project-list')!;
  const countEl = document.getElementById('project-count')!;

  setCurrentProjects(projects);
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

export async function handleAdd(): Promise<void> {
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

export async function refreshProjects(): Promise<void> {
  try {
    const projects = await window.api.getProjectCards();
    renderProjects(projects);
  } catch (err) {
    console.error('get-project-cards failed:', err);
  }
}

export async function handleActionExited({ path }: ActionExitedPayload): Promise<void> {
  clearRunning(path);
  // Re-fetch rather than just resetting the button: a successful run
  // updates lastRun on disk, and the card needs fresh data to show it
  // without waiting for the next app restart.
  await refreshProjects();
}
