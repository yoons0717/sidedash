import { execFile, spawn, type ChildProcess } from 'node:child_process';
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

// Iterated twice on real output before landing here: "정확히 2문장"만 시켰더니
// 모든 디테일(파일명, 커밋 해시, 스크립트 이름)을 욱여넣은 만연체 두 문장이 나왔고,
// "80자, 디테일 다 빼라"로 조이니 이번엔 핵심 기능·진행상황까지 같이 날아가서 너무
// 뭉뚱그려졌다. 실제로 필요한 건 "저수준 기술 디테일(해시/경로/스크립트명)만 빼고,
// 기능·진행상황 같은 알맹이는 구체적으로" — 길이 제한은 그 알맹이가 들어갈 여유를
// 남긴 값으로 완화했다.
export const ANALYSIS_PROMPT =
  '이 프로젝트의 최근 git 커밋 로그와 소스 파일 구조를 읽고, 가장 최근에 어떤 작업을 하다가 어디서 멈췄는지만 요약해줘. 프로젝트가 전체적으로 뭘 하는 앱인지 설명하거나 예전 작업 히스토리를 정리하지 말고, 최근 상태에만 집중할 것. 확인했다는 말이나 서론 없이 바로 시작할 것. 2~3문장, 전체 150자 안팎으로 쓸 것. 어떤 기능을 다루고 있었는지는 구체적으로 말하되, 커밋 해시나 파일 경로, 스크립트 이름 같은 지엽적인 기술 디테일만 빼고 말할 것. 마크다운 형식이나 글머리 기호는 쓰지 말고, 완성도를 숫자나 퍼센트로 매기지 말고, 이 프로젝트를 계속하는 게 좋을지 말지는 추천하지 마.';

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
      (_error, stdout) => {
        const resolved = stdout?.trim();
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
    command = buildAnalyzeCommand(getResolvedClaudeBinary());
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
