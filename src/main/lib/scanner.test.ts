import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getGitStatus } from './scanner';
import { git, setupRepo } from '../test-utils/gitRepo';

describe('getGitStatus', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('reports branch and clean status on a normal branch', () => {
    dir = setupRepo('sidedash-scanner-');
    writeFileSync(path.join(dir, 'a.txt'), 'hello');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);

    expect(getGitStatus(dir)).toEqual({
      branch: 'main',
      hasUncommittedChanges: false,
      changedFileCount: 0,
    });
  });

  it('still reports uncommitted changes when HEAD is detached', () => {
    dir = setupRepo('sidedash-scanner-');
    writeFileSync(path.join(dir, 'a.txt'), 'hello');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'first']);
    writeFileSync(path.join(dir, 'a.txt'), 'changed');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'second']);

    git(dir, ['checkout', '-q', 'HEAD~1']);
    writeFileSync(path.join(dir, 'a.txt'), 'dirty uncommitted edit');

    const status = getGitStatus(dir);
    expect(status!.branch).toBeNull();
    expect(status!.hasUncommittedChanges).toBe(true);
    expect(status!.changedFileCount).toBe(1);
  });

  it('returns null for a path that is not a git repo', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'sidedash-scanner-notgit-'));
    expect(getGitStatus(dir)).toBeNull();
  });
});
