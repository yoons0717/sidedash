import fs from 'node:fs';
import * as registry from 'reentry-cli/src/registry.js';
import { getLastCommit, getGitStatus } from 'reentry-cli/src/scanner.js';

export function getProjectCards() {
  return registry.getAll().map(({ name, path }) => {
    const pathExists = fs.existsSync(path);
    if (!pathExists) {
      return { name, path, branch: null, lastCommit: null, hasUncommittedChanges: false, pathExists };
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
    };
  });
}
