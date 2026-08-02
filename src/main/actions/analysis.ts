import fs from 'node:fs';
import type { AnalysisResult } from '../../shared/types';

type AnalysisStore = Record<string, AnalysisResult>;

function readAnalysisStore(analysisFilePath: string): AnalysisStore {
  if (!fs.existsSync(analysisFilePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(analysisFilePath, 'utf-8'));
  } catch {
    return {};
  }
}

export function recordAnalysis(
  analysisFilePath: string,
  projectPath: string,
  summary: string,
  analyzedAt: string = new Date().toISOString()
): void {
  const store = readAnalysisStore(analysisFilePath);
  store[projectPath] = { summary, analyzedAt };
  fs.writeFileSync(analysisFilePath, JSON.stringify(store, null, 2));
}

export function getLastAnalysis(analysisFilePath: string, projectPath: string): AnalysisResult | null {
  return readAnalysisStore(analysisFilePath)[projectPath] ?? null;
}
