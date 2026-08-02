import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getUncommittedFiles } from './git';
import { git, setupRepo } from '../test-utils/gitRepo';

describe('getUncommittedFiles', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('returns an empty array for a clean repo', () => {
    dir = setupRepo('sidedash-git-');
    writeFileSync(path.join(dir, 'a.txt'), 'hello');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);

    expect(getUncommittedFiles(dir)).toEqual([]);
  });

  it('lists modified and untracked files with their status codes', () => {
    dir = setupRepo('sidedash-git-');
    writeFileSync(path.join(dir, 'a.txt'), 'hello');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);

    writeFileSync(path.join(dir, 'a.txt'), 'changed');
    writeFileSync(path.join(dir, 'b.txt'), 'new file');

    const files = getUncommittedFiles(dir);
    expect(files).toHaveLength(2);
    expect(files).toContainEqual({ status: 'M', file: 'a.txt' });
    expect(files).toContainEqual({ status: '??', file: 'b.txt' });
  });

  it('returns an empty array for a path that is not a git repo', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'sidedash-notgit-'));
    expect(getUncommittedFiles(dir)).toEqual([]);
  });
});
