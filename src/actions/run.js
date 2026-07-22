import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export function shellQuote(str) {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

export function createUtf8Decoder() {
  const decoder = new StringDecoder('utf8');
  return (chunk) => decoder.write(chunk);
}

const runningProjects = new Map(); // project.path -> ChildProcess

export function isRunning(projectPath) {
  return runningProjects.has(projectPath);
}

export function hasRunningActions() {
  return runningProjects.size > 0;
}

// Kills each tracked action's whole process tree (the login shell plus
// anything it forked — python3, node, a Chromium instance, etc.), not just
// the immediate spawned shell. Requires runAction to spawn with
// `detached: true`, which makes the child the leader of its own process
// group; signalling the negative pid targets that entire group.
export function killAllRunning() {
  for (const child of runningProjects.values()) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Process group may already be gone — nothing left to kill.
    }
  }
}

export function runAction(project, targetPaths, { onData, onExit } = {}) {
  if (runningProjects.has(project.path)) {
    return;
  }

  let command;
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

  child.stdout.on('data', (chunk) => onData?.(decodeStdout(chunk)));
  child.stderr.on('data', (chunk) => onData?.(decodeStderr(chunk)));

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
