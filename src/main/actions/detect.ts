import fs from 'node:fs';
import path from 'node:path';
import { getPackageScripts } from '../lib/scanner';
import type { ActionType } from '../../shared/types';

export function detectAction(projectPath: string): ActionType | null {
  if (fs.existsSync(path.join(projectPath, 'run.sh'))) {
    return 'pipeline';
  }

  const scripts = getPackageScripts(projectPath);
  if (scripts.pdf) {
    return 'pdf';
  }

  return null;
}
