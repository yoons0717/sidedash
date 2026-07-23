import { execFileSync } from 'node:child_process';
import type { UncommittedFile } from '../../shared/types';

export function getUncommittedFiles(projectPath: string): UncommittedFile[] {
  try {
    const output = execFileSync('git', ['-C', projectPath, 'status', '--porcelain'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // Don't trim() the whole output before splitting — the first line can
    // legitimately start with a space (e.g. " M file" for an unstaged
    // modification), and trimming the full string strips that meaningful
    // leading character along with the trailing newline.
    return output
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => ({
        status: line.slice(0, 2).trim(),
        file: line.slice(3),
      }));
  } catch {
    return [];
  }
}
