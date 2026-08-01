export type ActionType = 'pipeline' | 'pdf';

export type RunKind = ActionType | 'analyze';

export interface RegistryEntry {
  name: string;
  path: string;
  addedAt: string;
}

export interface LastCommit {
  date: string;
  message: string;
}

export interface AnalysisResult {
  summary: string;
  analyzedAt: string;
}

export interface GitStatus {
  branch: string | null;
  hasUncommittedChanges: boolean;
  changedFileCount: number;
}

export interface UncommittedFile {
  status: string;
  file: string;
}

export interface ProjectCard {
  name: string;
  path: string;
  pathExists: boolean;
  branch: string | null;
  lastCommit: LastCommit | null;
  hasUncommittedChanges: boolean;
  changedFileCount: number;
  action: ActionType | null;
  lastRun: string | null;
  githubUrl: string | null;
}

export type AddProjectRejectionReason = 'already-registered' | 'name-collision';

export type CanAddProjectResult = { ok: true } | { ok: false; reason: AddProjectRejectionReason };

export type RunActionResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'already-running' };

export interface ActionExitedPayload {
  path: string;
  code: number | null;
}

export interface LogExitPayload {
  code: number | null;
  path: string;
  actionType: RunKind;
}
