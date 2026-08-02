import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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
  } catch (err) {
    // `status --porcelain` essentially never fails for an intact repo, so a
    // failure while .git actually exists is worth surfacing rather than
    // silently looking identical to "0 uncommitted files".
    if (fs.existsSync(path.join(projectPath, '.git'))) {
      console.error(`git status failed for ${projectPath}:`, err);
    }
    return [];
  }
}
