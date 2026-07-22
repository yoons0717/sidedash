import fs from 'node:fs';
import path from 'node:path';
import * as registry from 'reentry-cli/src/registry.js';
import { getLastCommit, getGitStatus, getPackageScripts, findTodos } from 'reentry-cli/src/scanner.js';
import { detectAction } from '../actions/detect.js';
import { getLastRun } from '../actions/history.js';

// registry.add() has no dedup and registry.remove() filters by name, so
// without this check a duplicate path (or a different path sharing a
// basename with an already-registered project) can create ambiguous
// entries where removing one silently removes both.
export function canAddProject(newPath, existingProjects) {
  if (existingProjects.some((p) => p.path === newPath)) {
    return { ok: false, reason: 'already-registered' };
  }

  const name = path.basename(newPath);
  if (existingProjects.some((p) => p.name === name)) {
    return { ok: false, reason: 'name-collision' };
  }

  return { ok: true };
}

export function getProjectCards(historyFilePath) {
  return registry.getAll().map(({ name, path }) => {
    const lastRun = historyFilePath ? getLastRun(historyFilePath, path) : null;
    const pathExists = fs.existsSync(path);
    if (!pathExists) {
      return {
        name,
        path,
        branch: null,
        lastCommit: null,
        hasUncommittedChanges: false,
        pathExists,
        action: null,
        lastRun,
      };
    }

    const gitStatus = getGitStatus(path);
    const lastCommit = getLastCommit(path);

    return {
      name,
      path,
      branch: gitStatus?.branch ?? null,
      lastCommit,
      hasUncommittedChanges: gitStatus?.hasUncommittedChanges ?? false,
      pathExists,
      action: detectAction(path),
      lastRun,
    };
  });
}

export function getProjectDetail(path) {
  return {
    todoCount: findTodos(path).length,
    scripts: getPackageScripts(path),
  };
}
