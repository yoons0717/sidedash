import fs from 'node:fs';
import path from 'node:path';

export function readJsonStore<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    // The file exists but isn't valid JSON (truncated write, manual edit
    // gone wrong) — distinct from "never created yet", and worth knowing
    // about since the next write silently overwrites it with the default.
    console.error(`Failed to parse JSON store at ${filePath}, falling back to default:`, err);
    return defaultValue;
  }
}

export function writeJsonStore(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
