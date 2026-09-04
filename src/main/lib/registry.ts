import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { CustomActionInput, RegistryEntry } from '../../shared/types';
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

// Keep stored actions minimal — omit the optional flags when they carry no
// meaning, so a plain action stays `{ id, label, command }` on disk.
function normalize(input: CustomActionInput): CustomActionInput {
  return {
    label: input.label,
    command: input.command,
    ...(input.promptArgs ? { promptArgs: true } : {}),
    ...(input.resultDir ? { resultDir: input.resultDir } : {}),
  };
}

export function addAction(projectName: string, input: CustomActionInput): void {
  const registry = readRegistry();
  const project = registry.projects.find((p) => p.name === projectName);
  if (!project) {
    return;
  }
  project.actions = [...(project.actions ?? []), { id: randomUUID(), ...normalize(input) }];
  writeRegistry(registry);
}

export function updateAction(projectName: string, actionId: string, input: CustomActionInput): void {
  const registry = readRegistry();
  const project = registry.projects.find((p) => p.name === projectName);
  if (!project?.actions) {
    return;
  }
  project.actions = project.actions.map((a) =>
    a.id === actionId ? { id: a.id, ...normalize(input) } : a
  );
  writeRegistry(registry);
}

export function removeAction(projectName: string, actionId: string): void {
  const registry = readRegistry();
  const project = registry.projects.find((p) => p.name === projectName);
  if (!project?.actions) {
    return;
  }
  project.actions = project.actions.filter((a) => a.id !== actionId);
  writeRegistry(registry);
}
