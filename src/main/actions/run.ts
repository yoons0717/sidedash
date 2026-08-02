import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { RunKind } from '../../shared/types';

export interface RunnableProject {
  path: string;
  actionType: RunKind;
}

export interface RunActionCallbacks {
  onData?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  onExit?: (code: number | null) => void;
}

export function shellQuote(str: string): string {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

export const ANALYSIS_PROMPT =
  '이 프로젝트의 README, 최근 git 커밋 로그, 소스 파일 구조를 읽고, 지금 이 프로젝트가 어디까지 완성됐고 어디서 작업이 멈췄는지를 2~3문장의 평문으로 요약해줘. 마크다운 형식이나 글머리 기호는 쓰지 말고, 완성도를 숫자나 퍼센트로 매기지 말고, 이 프로젝트를 계속하는 게 좋을지 말지는 추천하지 마.';

// Login items run under launchd's minimal environment, which sources only
// ~/.zshenv/.zprofile/.zlogin (none of which exist on this machine) — never
// ~/.zshrc, where PATH additions (nvm, ~/.local/bin) actually live. A bare
// `claude` resolves under `npm run dev` (inherits the terminal's PATH) but
// silently fails in the packaged app. Resolving via an interactive login
// shell once, up front, sources ~/.zshrc the same way a real terminal does.
// `-i` has no controlling TTY here (Electron's main process), so a stalled
// shell-startup hook could otherwise block forever — the timeout turns that
// into the same graceful bare-'claude' fallback as any other resolution
// failure, instead of freezing the whole app.
export function resolveClaudeBinary(): string {
  try {
    const resolved = execFileSync('/bin/zsh', ['-ilc', 'command -v claude'], {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
    return resolved || 'claude';
  } catch {
    return 'claude';
  }
}

export function buildAnalyzeCommand(claudeBinary: string): string {
  return `${shellQuote(claudeBinary)} -p ${shellQuote(ANALYSIS_PROMPT)} --allowedTools ${shellQuote('Read')} ${shellQuote('Glob')} ${shellQuote('Bash(git log:*)')}`;
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
  } else if (project.actionType === 'analyze') {
    command = buildAnalyzeCommand(resolveClaudeBinary());
  } else {
    return;
  }

  const child = spawn('/bin/zsh', ['-lc', command], { cwd: project.path, detached: true });
  runningProjects.set(project.path, child);

  const decodeStdout = createUtf8Decoder();
  const decodeStderr = createUtf8Decoder();

  child.stdout!.on('data', (chunk) => onData?.(decodeStdout(chunk), 'stdout'));
  child.stderr!.on('data', (chunk) => onData?.(decodeStderr(chunk), 'stderr'));

  child.on('exit', (code) => {
    runningProjects.delete(project.path);
    onExit?.(code);
  });

  child.on('error', (err) => {
    runningProjects.delete(project.path);
    onData?.(`명령을 실행할 수 없습니다: ${err.message}\n`, 'stderr');
    onExit?.(null);
  });
}

export { runningProjects };
