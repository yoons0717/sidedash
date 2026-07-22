import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function runGit(projectPath, args) {
  return execFileSync('git', ['-C', projectPath, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function getPackageScripts(projectPath) {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {};
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

export function getLastCommit(projectPath) {
  try {
    const output = runGit(projectPath, ['log', '-1', '--date=short', '--format=%ad%x1f%s']);
    if (!output) return null;
    const [date, message] = output.split('\x1f');
    return { message, date };
  } catch {
    return null;
  }
}

export function getGitStatus(projectPath) {
  try {
    const branch = runGit(projectPath, ['symbolic-ref', '--short', 'HEAD']);
    const statusOutput = runGit(projectPath, ['status', '--porcelain']);
    const changedFileCount = statusOutput
      ? statusOutput.split('\n').filter((line) => line.length > 0).length
      : 0;
    return {
      branch,
      hasUncommittedChanges: changedFileCount > 0,
      changedFileCount,
    };
  } catch {
    return null;
  }
}

export function getGitHubUrl(projectPath) {
  try {
    const remote = runGit(projectPath, ['remote', 'get-url', 'origin']);
    const match = remote.match(/^(?:https?:\/\/|git@|ssh:\/\/git@)github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!match) return null;
    return `https://github.com/${match[1]}/${match[2]}`;
  } catch {
    return null;
  }
}
