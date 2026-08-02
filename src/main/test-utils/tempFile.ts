import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

export function tempFilePath(prefix: string, filename: string): () => string {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  return () => {
    dir = mkdtempSync(path.join(tmpdir(), prefix));
    return path.join(dir, filename);
  };
}
