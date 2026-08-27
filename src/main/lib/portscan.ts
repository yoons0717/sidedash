import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { RegistryEntry, ServerInfo } from '../../shared/types';

// ponytail: allowlist, not denylist — a raw `lsof` listen-scan on macOS also
// returns unrelated system daemons (ControlCenter, rapportd, Spotify, Dropbox,
// Code Helper, ...). A short allowlist of known dev-runtime interpreter names
// is far cheaper to maintain than a denylist of every system process. Ceiling:
// misses compiled dev servers (Go binaries, Docker-proxied ports) whose
// process name isn't one of these. Upgrade path: add names here, or switch to
// a denylist if this proves too restrictive.
export const DEV_SERVER_COMMAND_ALLOWLIST = ['node', 'python', 'python3', 'ruby', 'php', 'java', 'deno', 'bun'];

interface Candidate {
  pid: number;
  command: string;
  port: number;
}

export function parseListeningProcesses(lsofOutput: string): Candidate[] {
  const candidates: Candidate[] = [];
  let pid: number | null = null;
  let command: string | null = null;

  for (const line of lsofOutput.split('\n')) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1));
    } else if (line.startsWith('c')) {
      command = line.slice(1);
    } else if (line.startsWith('n') && pid !== null && command !== null) {
      const match = line.match(/:(\d+)$/);
      if (match) {
        candidates.push({ pid, command, port: Number(match[1]) });
      }
    }
  }

  return candidates;
}

export function filterAndDedupeCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const result: Candidate[] = [];

  for (const candidate of candidates) {
    if (!DEV_SERVER_COMMAND_ALLOWLIST.includes(candidate.command.toLowerCase())) {
      continue;
    }
    const key = `${candidate.pid}:${candidate.port}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

export function getListeningCandidates(): Candidate[] {
  try {
    const output = execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return filterAndDedupeCandidates(parseListeningProcesses(output));
  } catch {
    return [];
  }
}

export function parseCwdOutput(lsofOutput: string): string | null {
  for (const line of lsofOutput.split('\n')) {
    if (line.startsWith('n')) {
      return line.slice(1);
    }
  }
  return null;
}

export function getProcessCwd(pid: number): string | null {
  try {
    // A candidate process can exit between the listen-scan and this lookup
    // (real race, not a speculative case) — that failure just means this one
    // entry loses its cwd, not that the whole scan should throw.
    const output = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseCwdOutput(output);
  } catch {
    return null;
  }
}

export function matchRegisteredProject(cwd: string, entries: RegistryEntry[]): string | null {
  const match = entries.find((entry) => cwd === entry.path || cwd.startsWith(entry.path + path.sep));
  return match?.name ?? null;
}

const JS_FRAMEWORK_DEPS: [string, string][] = [
  ['next', 'Next.js'],
  ['nuxt', 'Nuxt'],
  ['gatsby', 'Gatsby'],
  ['@sveltejs/kit', 'SvelteKit'],
  ['svelte', 'Svelte'],
  ['vite', 'Vite'],
  ['@nestjs/core', 'NestJS'],
  ['vue', 'Vue'],
  ['react', 'React'],
  ['express', 'Express'],
];

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  const content = readFileIfExists(filePath);
  if (content === null) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function detectJsStack(cwd: string): string | null {
  const pkg = readJsonFile(path.join(cwd, 'package.json'));
  if (!pkg) return null;

  const deps = { ...(pkg.dependencies as Record<string, string> | undefined), ...(pkg.devDependencies as Record<string, string> | undefined) };
  for (const [dep, label] of JS_FRAMEWORK_DEPS) {
    if (deps[dep]) return label;
  }
  return 'Node.js';
}

function detectPythonStack(cwd: string): string | null {
  if (fs.existsSync(path.join(cwd, 'manage.py'))) return 'Django';

  const marker = readFileIfExists(path.join(cwd, 'requirements.txt')) ?? readFileIfExists(path.join(cwd, 'pyproject.toml'));
  if (marker === null) return null;
  if (/flask/i.test(marker)) return 'Flask';
  if (/fastapi/i.test(marker)) return 'FastAPI';
  return 'Python';
}

function detectRubyStack(cwd: string): string | null {
  const gemfile = readFileIfExists(path.join(cwd, 'Gemfile'));
  if (gemfile === null) return null;
  return /rails/i.test(gemfile) ? 'Rails' : 'Ruby';
}

const COMMAND_FALLBACK: Record<string, string> = {
  node: 'Node.js',
  python: 'Python',
  python3: 'Python',
  ruby: 'Ruby',
  php: 'PHP',
  java: 'Java',
  deno: 'Deno',
  bun: 'Bun',
};

export function detectTechStack(cwd: string | null, command: string): string {
  if (cwd) {
    const js = detectJsStack(cwd);
    if (js) return js;

    const python = detectPythonStack(cwd);
    if (python) return python;

    const ruby = detectRubyStack(cwd);
    if (ruby) return ruby;

    if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'Go';
  }

  return COMMAND_FALLBACK[command.toLowerCase()] ?? 'Unknown';
}

const KILL_GRACE_PERIOD_MS = 2000;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// These are processes sidedash didn't spawn (found via lsof, not tracked as
// a ChildProcess), so there's no 'exit' event to await and no process-group
// leader to assume — signal the pid itself, and escalate to SIGKILL only if
// it's still alive after a grace period (mirrors run.ts's killAllRunning).
export function killServer(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      if (isAlive(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
      resolve();
    }, KILL_GRACE_PERIOD_MS);
  });
}

// `selfPath` is sidedash's own project root (Electron's app.getAppPath()).
// Under `npm start`, electron-vite runs its own Vite dev server (a `node`
// process, listening on a port, cwd == sidedash's project root) to serve
// sidedash's own windows — indistinguishable from any other dev server to
// the scan, so it shows up in the list like any registered project would.
// Killing it kills the server rendering sidedash's own UI, taking down every
// sidedash window (main popup, log window, this server window) at once.
// Excluding it here is the only place this can be caught once, rather than
// leaving every caller to remember to filter it out.
export function getRunningServers(registryEntries: RegistryEntry[], selfPath: string): ServerInfo[] {
  return getListeningCandidates()
    .map(({ pid, command, port }) => {
      const cwd = getProcessCwd(pid);
      return {
        port,
        pid,
        projectName: cwd ? matchRegisteredProject(cwd, registryEntries) : null,
        cwd,
        techStack: detectTechStack(cwd, command),
        command,
      };
    })
    .filter((server) => server.cwd !== selfPath);
}
