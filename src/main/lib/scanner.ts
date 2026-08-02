import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { GitStatus, LastCommit } from '../../shared/types';

function runGit(projectPath: string, args: string[]): string {
  return execFileSync('git', ['-C', projectPath, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function getPackageScripts(projectPath: string): Record<string, string> {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {};
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.scripts ?? {};
  } catch (err) {
    console.error(`Failed to parse ${pkgPath}:`, err);
    return {};
  }
}

function hasGitDir(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, '.git'));
}

export function getLastCommit(projectPath: string): LastCommit | null {
  try {
    const output = runGit(projectPath, ['log', '-1', '--date=short', '--format=%ad%x1f%s']);
    if (!output) return null;
    const [date, message] = output.split('\x1f');
    return { message, date };
  } catch {
    return null;
  }
}

export function getGitStatus(projectPath: string): GitStatus | null {
  // symbolic-ref fails whenever HEAD isn't on a branch (detached HEAD —
  // mid-rebase, or a tag/commit checked out directly). That's unrelated to
  // whether `status --porcelain` can run, so it gets its own try/catch —
  // otherwise a detached-HEAD project silently lost its uncommitted-changes
  // count too, since the original single try/catch bailed out on the first
  // failure before ever reaching the status call.
  let branch: string | null = null;
  try {
    branch = runGit(projectPath, ['symbolic-ref', '--short', 'HEAD']);
  } catch {
    // Not on a branch — leave branch as null, status can still succeed.
  }

  try {
    const statusOutput = runGit(projectPath, ['status', '--porcelain']);
    const changedFileCount = statusOutput
      ? statusOutput.split('\n').filter((line) => line.length > 0).length
      : 0;
    return {
      branch,
      hasUncommittedChanges: changedFileCount > 0,
      changedFileCount,
    };
  } catch (err) {
    // `status --porcelain` essentially never fails for an intact repo, so a
    // failure here while .git actually exists is worth surfacing — unlike
    // the branch lookup above, which fails routinely (detached HEAD).
    if (hasGitDir(projectPath)) {
      console.error(`git status failed for ${projectPath}:`, err);
    }
    return null;
  }
}

export function getGitHubUrl(projectPath: string): string | null {
  try {
    const remote = runGit(projectPath, ['remote', 'get-url', 'origin']);
    const match = remote.match(/^(?:https?:\/\/|git@|ssh:\/\/git@)github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!match) return null;
    return `https://github.com/${match[1]}/${match[2]}`;
  } catch {
    return null;
  }
}
