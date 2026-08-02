import { readJsonStore, writeJsonStore } from '../lib/jsonStore';

type History = Record<string, string>;

export function recordRun(
  historyFilePath: string,
  projectPath: string,
  timestamp: string = new Date().toISOString()
): void {
  const history = readJsonStore<History>(historyFilePath, {});
  history[projectPath] = timestamp;
  writeJsonStore(historyFilePath, history);
}

export function getLastRun(historyFilePath: string, projectPath: string): string | null {
  return readJsonStore<History>(historyFilePath, {})[projectPath] ?? null;
}
