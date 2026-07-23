import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { RegistryEntry } from '../../shared/types';

const REGISTRY_DIR = path.join(os.homedir(), '.pj');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'registry.json');

interface Registry {
  projects: RegistryEntry[];
}

function readRegistry(): Registry {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { projects: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  } catch {
    return { projects: [] };
  }
}

function writeRegistry(registry: Registry): void {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

export function getAll(): RegistryEntry[] {
  return readRegistry().projects;
}

export function add(name: string, projectPath: string): void {
  const registry = readRegistry();
  registry.projects.push({
    name,
    path: projectPath,
    addedAt: new Date().toISOString(),
  });
  writeRegistry(registry);
}

export function remove(name: string): void {
  const registry = readRegistry();
  registry.projects = registry.projects.filter((p) => p.name !== name);
  writeRegistry(registry);
}
