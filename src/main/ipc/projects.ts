import fs from 'node:fs';
import path from 'node:path';
import * as registry from '../lib/registry';
import { getLastCommit, getGitStatus, getGitHubUrl } from '../lib/scanner';
import { detectAction } from '../actions/detect';
import { getLastRun } from '../actions/history';
import { getLastAnalysis } from '../actions/analysis';
import type { CanAddProjectResult, ProjectCard } from '../../shared/types';

// registry.add() has no dedup and registry.remove() filters by name, so
// without this check a duplicate path (or a different path sharing a
// basename with an already-registered project) can create ambiguous
// entries where removing one silently removes both.
export function canAddProject(
  newPath: string,
  existingProjects: { name: string; path: string }[]
): CanAddProjectResult {
  if (existingProjects.some((p) => p.path === newPath)) {
    return { ok: false, reason: 'already-registered' };
  }

  const name = path.basename(newPath);
  if (existingProjects.some((p) => p.name === name)) {
    return { ok: false, reason: 'name-collision' };
  }

  return { ok: true };
}

export function getProjectCards(historyFilePath: string, analysisFilePath: string): ProjectCard[] {
  return registry.getAll().map(({ name, path: projectPath }) => {
    const lastRun = historyFilePath ? getLastRun(historyFilePath, projectPath) : null;
    const lastAnalysis = analysisFilePath ? getLastAnalysis(analysisFilePath, projectPath) : null;
    const pathExists = fs.existsSync(projectPath);
    if (!pathExists) {
      return {
        name,
        path: projectPath,
        branch: null,
        lastCommit: null,
        hasUncommittedChanges: false,
        changedFileCount: 0,
        pathExists,
        action: null,
        lastRun,
        githubUrl: null,
        lastAnalysis,
      };
    }

    const gitStatus = getGitStatus(projectPath);
    const lastCommit = getLastCommit(projectPath);

    return {
      name,
      path: projectPath,
      branch: gitStatus?.branch ?? null,
      lastCommit,
      hasUncommittedChanges: gitStatus?.hasUncommittedChanges ?? false,
      changedFileCount: gitStatus?.changedFileCount ?? 0,
      pathExists,
      action: detectAction(projectPath),
      lastRun,
      githubUrl: getGitHubUrl(projectPath),
      lastAnalysis,
    };
  });
}
