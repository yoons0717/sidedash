import type { ActionExitedPayload, ActionType, ProjectCard } from '../../shared/types';
import { setCurrentProjects } from './state';
// Import cycle with project-view.ts — intentional, see CLAUDE.md.
import { showProjectDetail } from './project-view';
import { clearRunning } from './action-runner';

const ACTION_ICONS: Record<ActionType, { text: string; className: string }> = {
  pipeline: { text: '>_', className: 'icon-pipeline' },
  pdf: { text: '▤', className: 'icon-pdf' },
};
const DEFAULT_ICON = { text: '📁', className: '' };

export function formatRelativeTime(isoString: string, now = new Date()): string {
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

// Shared by the card's own link row and project-view.ts's detail page (same
// links, just a bigger/spaced-out rendering there).
export function buildLinkButtons(project: ProjectCard): HTMLButtonElement[] {
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

// Shared by the card's branch/date line and project-view.ts's detail page
// meta line — same two spans, each caller wraps/appends them differently.
export function buildBranchAndDateSpans(project: ProjectCard): HTMLSpanElement[] {
  const branchSpan = document.createElement('span');
  branchSpan.className = 'card-branch';
  branchSpan.textContent = project.branch ?? '(알 수 없음)';
  const spans = [branchSpan];

  if (project.lastCommit) {
    const dateSpan = document.createElement('span');
    dateSpan.className = 'card-detail-date';
    dateSpan.textContent = formatRelativeTime(project.lastCommit.date);
    spans.push(dateSpan);
  }
  return spans;
}

// Shared by the card and project-view.ts's detail page — null when there's
// nothing uncommitted, so callers can just `if (line) append(line)`.
export function buildDirtyLine(project: ProjectCard): HTMLDivElement | null {
  if (!project.hasUncommittedChanges) return null;
  const line = document.createElement('div');
  line.className = 'card-dirty-toggle';
  line.textContent = `미커밋 변경사항 ${project.changedFileCount}개`;
  return line;
}

// A glance-only row: icon, name, remove, links, branch/commit, dirty count.
// Everything action-producing (상태 점검, the auto-detected action, custom
// actions) lives in project-view.ts's detail page instead — clicking
// anywhere on the card that isn't one of its own buttons opens it.
function renderCard(project: ProjectCard): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.addEventListener('click', () => showProjectDetail(project.name));

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
    const [branchSpan, dateSpan] = buildBranchAndDateSpans(project);
    const mainSpan = document.createElement('span');
    mainSpan.className = 'card-detail-main';
    mainSpan.appendChild(branchSpan);
    detail.appendChild(mainSpan);
    if (dateSpan) detail.appendChild(dateSpan);
  }
  body.appendChild(detail);

  const dirtyLine = buildDirtyLine(project);
  if (dirtyLine) body.appendChild(dirtyLine);

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
