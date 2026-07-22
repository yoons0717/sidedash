import { spawn } from 'node:child_process';

export function shellQuote(str) {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

const runningProjects = new Set();

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

  child.stdout.on('data', (chunk) => onData?.(chunk.toString()));
  child.stderr.on('data', (chunk) => onData?.(chunk.toString()));

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
