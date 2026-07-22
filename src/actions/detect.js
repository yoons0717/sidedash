import fs from 'node:fs';
import path from 'node:path';
import { getPackageScripts } from 'reentry-cli/src/scanner.js';

export function detectAction(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'run.sh'))) {
    return 'pipeline';
  }

  const scripts = getPackageScripts(projectPath);
  if (scripts.pdf) {
    return 'pdf';
  }

  return null;
}
