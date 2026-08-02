import type { AnalysisResult } from '../../shared/types';
import { readJsonStore, writeJsonStore } from '../lib/jsonStore';

type AnalysisStore = Record<string, AnalysisResult>;

export function recordAnalysis(
  analysisFilePath: string,
  projectPath: string,
  summary: string,
  analyzedAt: string = new Date().toISOString()
): void {
  const store = readJsonStore<AnalysisStore>(analysisFilePath, {});
  store[projectPath] = { summary, analyzedAt };
  writeJsonStore(analysisFilePath, store);
}

export function getLastAnalysis(analysisFilePath: string, projectPath: string): AnalysisResult | null {
  return readJsonStore<AnalysisStore>(analysisFilePath, {})[projectPath] ?? null;
}
