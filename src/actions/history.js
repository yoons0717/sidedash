import fs from 'node:fs';

function readHistory(historyFilePath) {
  if (!fs.existsSync(historyFilePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(historyFilePath, 'utf-8'));
  } catch {
    return {};
  }
}

export function recordRun(historyFilePath, projectPath, timestamp = new Date().toISOString()) {
  const history = readHistory(historyFilePath);
  history[projectPath] = timestamp;
  fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2));
}

export function getLastRun(historyFilePath, projectPath) {
  return readHistory(historyFilePath)[projectPath] ?? null;
}
