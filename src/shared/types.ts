export type ActionType = 'pipeline' | 'pdf';

export type RunKind = ActionType | 'analyze' | 'custom';

export const ACTION_LABELS: Record<ActionType, string> = {
  pipeline: '파이프라인 실행',
  pdf: 'PDF 생성',
};

export interface CustomAction {
  id: string;
  label: string;
  command: string;
  // When true, the user is asked for an argument string at run time; it
  // replaces `{args}` in the command (appended if the token is absent).
  promptArgs?: boolean;
  // Optional folder (relative to the project, or absolute) offered as a
  // "결과 폴더 열기" button in the log window on success.
  resultDir?: string;
}

export type CustomActionInput = Omit<CustomAction, 'id'>;

export interface RegistryEntry {
  name: string;
  path: string;
  addedAt: string;
  actions?: CustomAction[];
}

export interface LastCommit {
  date: string;
  message: string;
}

export interface GitStatus {
  branch: string | null;
  hasUncommittedChanges: boolean;
  changedFileCount: number;
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
  customActions: CustomAction[];
  // package.json script names, offered as autocomplete for a new action's
  // command field — not used for anything else.
  scripts: string[];
  lastRun: string | null;
  githubUrl: string | null;
}

export interface ServerInfo {
  port: number;
  pid: number;
  projectName: string | null;
  cwd: string | null;
  techStack: string;
  command: string;
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
  resultDir?: string;
}
