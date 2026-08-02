import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function git(dir: string, args: string[]): void {
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf-8' });
}

export function setupRepo(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  return dir;
}
