import { spawn, type ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { ActionType } from '../../shared/types';

export interface RunnableProject {
  path: string;
  actionType: ActionType;
}

export interface RunActionCallbacks {
  onData?: (chunk: string) => void;
  onExit?: (code: number | null) => void;
}

export function shellQuote(str: string): string {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

export function createUtf8Decoder(): (chunk: Buffer) => string {
  const decoder = new StringDecoder('utf8');
  return (chunk) => decoder.write(chunk);
}

const runningProjects = new Map<string, ChildProcess>(); // project.path -> ChildProcess

export function isRunning(projectPath: string): boolean {
  return runningProjects.has(projectPath);
}

export function hasRunningActions(): boolean {
  return runningProjects.size > 0;
}

// Kills each tracked action's whole process tree (the login shell plus
// anything it forked — python3, node, a Chromium instance, etc.), not just
// the immediate spawned shell. Requires runAction to spawn with
// `detached: true`, which makes the child the leader of its own process
// group; signalling the negative pid targets that entire group.
export function killAllRunning(): void {
  for (const child of runningProjects.values()) {
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      // Process group may already be gone — nothing left to kill.
    }
  }
}

export function runAction(
  project: RunnableProject,
  targetPaths: string[],
  { onData, onExit }: RunActionCallbacks = {}
): void {
  if (runningProjects.has(project.path)) {
    return;
  }

  let command: string;
  if (project.actionType === 'pipeline') {
    const quotedPaths = targetPaths.map(shellQuote);
    command = './run.sh ' + quotedPaths.join(' ');
  } else if (project.actionType === 'pdf') {
    command = 'npm run pdf';
  } else {
    return;
  }

  const child = spawn('/bin/zsh', ['-lc', command], { cwd: project.path, detached: true });
  runningProjects.set(project.path, child);

  const decodeStdout = createUtf8Decoder();
  const decodeStderr = createUtf8Decoder();

  child.stdout!.on('data', (chunk) => onData?.(decodeStdout(chunk)));
  child.stderr!.on('data', (chunk) => onData?.(decodeStderr(chunk)));

  child.on('exit', (code) => {
    runningProjects.delete(project.path);
    onExit?.(code);
  });

  child.on('error', (err) => {
    runningProjects.delete(project.path);
    onData?.(`명령을 실행할 수 없습니다: ${err.message}\n`);
    onExit?.(null);
  });
}

export { runningProjects };
