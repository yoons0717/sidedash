import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export function shellQuote(str) {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

export function createUtf8Decoder() {
  const decoder = new StringDecoder('utf8');
  return (chunk) => decoder.write(chunk);
}

const runningProjects = new Set();

export function isRunning(projectPath) {
  return runningProjects.has(projectPath);
}

export function runAction(project, allProjects, { onData, onExit } = {}) {
  if (runningProjects.has(project.path)) {
    return;
  }

  let command;
  if (project.actionType === 'pipeline') {
    const otherPaths = allProjects.filter((p) => p.path !== project.path).map((p) => p.path);
    const quotedPaths = otherPaths.map(shellQuote);
    command = './run.sh ' + quotedPaths.join(' ');
  } else if (project.actionType === 'pdf') {
    command = 'npm run pdf';
  } else {
    return;
  }

  runningProjects.add(project.path);

  const child = spawn('/bin/zsh', ['-lc', command], { cwd: project.path });

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
