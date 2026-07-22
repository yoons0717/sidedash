import fs from 'node:fs';
import * as registry from 'reentry-cli/src/registry.js';
import { getLastCommit, getGitStatus, getPackageScripts, findTodos } from 'reentry-cli/src/scanner.js';
import { detectAction } from '../actions/detect.js';

export function getProjectCards() {
  return registry.getAll().map(({ name, path }) => {
    const pathExists = fs.existsSync(path);
    if (!pathExists) {
      return { name, path, branch: null, lastCommit: null, hasUncommittedChanges: false, pathExists, action: null };
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
    };
  });
}

export function getProjectDetail(path) {
  return {
    todoCount: findTodos(path).length,
    scripts: getPackageScripts(path),
  };
}
