import fs from 'node:fs';

type History = Record<string, string>;

function readHistory(historyFilePath: string): History {
  if (!fs.existsSync(historyFilePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(historyFilePath, 'utf-8'));
  } catch {
    return {};
  }
}

export function recordRun(
  historyFilePath: string,
  projectPath: string,
  timestamp: string = new Date().toISOString()
): void {
  const history = readHistory(historyFilePath);
  history[projectPath] = timestamp;
  fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2));
}

export function getLastRun(historyFilePath: string, projectPath: string): string | null {
  return readHistory(historyFilePath)[projectPath] ?? null;
}
