import path from 'node:path';
import os from 'node:os';
import type { RegistryEntry } from '../../shared/types';
import { readJsonStore, writeJsonStore } from './jsonStore';

const REGISTRY_PATH = path.join(os.homedir(), '.pj', 'registry.json');

interface Registry {
  projects: RegistryEntry[];
}

function readRegistry(): Registry {
  const registry = readJsonStore<Registry>(REGISTRY_PATH, { projects: [] });
  // A legacy/hand-edited file that parses as valid JSON but doesn't have the
  // expected shape (e.g. missing `projects`) would otherwise crash every
  // caller of getAll() with a TypeError on `.map`/`.filter`.
  if (!Array.isArray(registry.projects)) {
    return { projects: [] };
  }
  return registry;
}

function writeRegistry(registry: Registry): void {
  writeJsonStore(REGISTRY_PATH, registry);
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
