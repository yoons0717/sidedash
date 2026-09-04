import type { ProjectCard } from '../../shared/types';

// Set by cards.ts's renderProjects(), read live by cards.ts and
// actions-view.ts. Only setCurrentProjects() writes it (see CLAUDE.md's
// shared-state convention).
export let currentProjects: ProjectCard[] = [];

export function setCurrentProjects(projects: ProjectCard[]): void {
  currentProjects = projects;
}
