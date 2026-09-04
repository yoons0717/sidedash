import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { RunKind } from '../../shared/types';

export interface RunnableProject {
  path: string;
  actionType: RunKind;
  // Only read for actionType 'custom' — the exact shell command the user
  // saved for this action button.
  command?: string;
}

export interface RunActionCallbacks {
  onData?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  onExit?: (code: number | null) => void;
}

export function shellQuote(str: string): string {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

// Shared with index.ts, which prints this in the log window before the
// result streams in — so the score has visible criteria to be read against,
// instead of landing as a bare, unexplained number.
export const ANALYSIS_CRITERIA =
  '0~25: 뼈대만 있음 — 핵심 플로우가 끝까지 이어지지 않음\n26~50: 핵심 플로우 일부는 동작하지만 중간에 끊기거나 미구현된 지점이 있음\n51~75: 핵심 플로우는 처음부터 끝까지 동작하지만 에러 처리나 엣지케이스가 미흡함\n76~100: 핵심 플로우와 에러 처리까지 되어 있어 지금 상태로 계속 써도 무리 없음';

export const ANALYSIS_PROMPT =
  `이 프로젝트의 최근 git 커밋 로그와 소스 파일 구조를 읽고, 핵심 플로우가 어디까지 동작하는지 판단해서 아래 기준으로 완성도 점수를 매기고 다음에 할 일을 제안해줘.\n\n${ANALYSIS_CRITERIA}\n\n프로젝트 전체가 뭘 하는 앱인지 설명하거나 예전 작업 히스토리를 정리하지 말고, 지금 상태만 보고 판단할 것. 다음 할 일은 어떤 기능을 다뤄야 하는지 구체적으로 말하되 커밋 해시나 파일 경로, 스크립트 이름 같은 지엽적인 디테일은 빼고 말할 것. 확인했다는 말이나 서론 없이, 마크다운이나 글머리 기호 없이, 아래 두 줄 형식으로만 답할 것:\n\n완성도: {점수}%\n다음: {한 문장}`;

// Login items run under launchd's minimal environment, which sources only
// ~/.zshenv/.zprofile/.zlogin (none of which exist on this machine) — never
// ~/.zshrc, where PATH additions (nvm, ~/.local/bin) actually live. A bare
// `claude` resolves under `npm run dev` (inherits the terminal's PATH) but
// silently fails in the packaged app. Resolving via an interactive login
// shell once, sources ~/.zshrc the same way a real terminal does.
//
// This MUST be async (execFile, not execFileSync): Electron's main process
// is single-threaded, so a synchronous exec — even with a timeout — blocks
// the entire app (every window, every IPC call) for the full duration. A
// live test confirmed this: the "3s timeout" from an earlier version still
// froze the whole app for ~3s on every single analyze click, which macOS
// can surface as a "not responding" prompt. Resolving once at startup and
// caching the result means `runAction()` only ever reads a plain string.
let cachedClaudeBinary = 'claude';

export function warmClaudeBinaryCache(): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      '/bin/zsh',
      ['-ilc', 'command -v claude'],
      { encoding: 'utf8', timeout: 3000 },
      (error, stdout) => {
        const resolved = stdout?.trim();
        if (!resolved && error) {
          console.error('Failed to resolve claude binary path:', error);
        }
        cachedClaudeBinary = resolved || 'claude';
        resolve(cachedClaudeBinary);
      }
    );
  });
}

export function getResolvedClaudeBinary(): string {
  return cachedClaudeBinary;
}

// `-p` without piped input makes the CLI wait ~3s for stdin, then print a
// "no stdin data received" warning before proceeding — harmless, but it
// shows up as the first line of every analysis run and reads like an
// error. Redirecting from /dev/null skips the wait and the warning.
export function buildAnalyzeCommand(claudeBinary: string): string {
  return `${shellQuote(claudeBinary)} -p ${shellQuote(ANALYSIS_PROMPT)} --allowedTools ${shellQuote('Read')} ${shellQuote('Glob')} ${shellQuote('Bash(git log:*)')} < /dev/null`;
}

// A prompted arg string replaces `{args}` in a custom action's command, or
// is appended when the token is absent (a forgiving default — the user
// turned the prompt on, so the input should reach the command somehow).
//
// Deliberately NOT shellQuote()'d, unlike every other value this codebase
// interpolates into a shell command (targetPaths, the claude binary path,
// cmux's CLI path). Those are all a single filesystem path passed through
// verbatim; a prompted arg is closer to "the rest of a command line" —
// `--flag value` or `-x foo -y bar` needs its spaces to stay unquoted to
// mean multiple shell words, which is the more common case for this field.
// The tradeoff: an argument meant as one token but containing a space or
// shell metacharacter (;, &&, a backtick) gets word-split or interpreted
// rather than passed through literally. Acceptable for a personal tool
// where the user is trusted to know they're extending their own shell
// command, not filling in an opaque form field.
export function applyArgs(command: string, args: string): string {
  if (command.includes('{args}')) {
    return command.replaceAll('{args}', args);
  }
  return args ? `${command} ${args}` : command;
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

const KILL_GRACE_PERIOD_MS = 2000;

// Kills each tracked action's whole process tree (the login shell plus
// anything it forked — python3, node, a Chromium instance, etc.), not just
// the immediate spawned shell. Requires runAction to spawn with
// `detached: true`, which makes the child the leader of its own process
// group; signalling the negative pid targets that entire group.
//
// Waits for exit (or a grace period) before resolving, escalating to
// SIGKILL for anything that ignored SIGTERM — otherwise a caller that quits
// the app immediately after calling this (see index.ts's quit-app handler)
// can leave orphaned processes behind once the app itself is gone.
export function killAllRunning(): Promise<void> {
  const children = [...runningProjects.values()];
  for (const child of children) {
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      // Process group may already be gone — nothing left to kill.
    }
  }

  const stillAlive = (child: ChildProcess): boolean => child.exitCode === null && child.signalCode === null;

  return new Promise((resolve) => {
    if (!children.some(stillAlive)) {
      resolve();
      return;
    }

    let remaining = children.filter(stillAlive).length;
    const timeout = setTimeout(() => {
      for (const child of children) {
        if (stillAlive(child)) {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {
            // Already gone.
          }
        }
      }
      resolve();
    }, KILL_GRACE_PERIOD_MS);

    for (const child of children) {
      child.once('exit', () => {
        remaining -= 1;
        if (remaining <= 0) {
          clearTimeout(timeout);
          resolve();
        }
      });
    }
  });
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
    command = buildAnalyzeCommand(getResolvedClaudeBinary());
  } else if (project.actionType === 'custom') {
    if (!project.command) {
      return;
    }
    command = project.command;
  } else {
    return;
  }

  const child = spawn('/bin/zsh', ['-lc', command], { cwd: project.path, detached: true });
  runningProjects.set(project.path, child);

  const decodeStdout = createUtf8Decoder();
  const decodeStderr = createUtf8Decoder();

  child.stdout!.on('data', (chunk) => onData?.(decodeStdout(chunk), 'stdout'));
  child.stderr!.on('data', (chunk) => onData?.(decodeStderr(chunk), 'stderr'));

  // Unlike run.sh/npm scripts (the user's own, potentially long-running
  // scripts), a hung `claude -p` call has no legitimate reason to run this
  // long — without this, a stalled analysis leaves the project stuck
  // "실행 중…" forever with no way to recover short of quitting the app.
  const analyzeTimeout =
    project.actionType === 'analyze'
      ? setTimeout(
          () => {
            onData?.('\n분석이 너무 오래 걸려 중단합니다 (10분 초과).\n', 'stderr');
            try {
              process.kill(-child.pid!, 'SIGTERM');
            } catch {
              // Already gone.
            }
          },
          10 * 60 * 1000
        )
      : undefined;

  child.on('exit', (code) => {
    if (analyzeTimeout) clearTimeout(analyzeTimeout);
    runningProjects.delete(project.path);
    onExit?.(code);
  });

  child.on('error', (err) => {
    if (analyzeTimeout) clearTimeout(analyzeTimeout);
    runningProjects.delete(project.path);
    onData?.(`명령을 실행할 수 없습니다: ${err.message}\n`, 'stderr');
    onExit?.(null);
  });
}

export { runningProjects };
