import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { runAction, runningProjects, shellQuote } from './run.js';

describe('shellQuote', () => {
  it('wraps a plain string in single quotes', () => {
    expect(shellQuote('/Users/x/project')).toBe("'/Users/x/project'");
  });

  it('escapes an embedded single quote using the close-escape-reopen trick', () => {
    expect(shellQuote("/Users/x/it's-mine")).toBe("'/Users/x/it'\\''s-mine'");
  });

  it('keeps a path containing a space as a single shell argument', () => {
    const original = '/Users/x/My Project';
    const quoted = shellQuote(original);

    // If quoting were wrong, the space would split this into two argv entries
    // and printf's format string would recycle, producing two lines instead of one.
    const output = execFileSync('/bin/zsh', ['-lc', `printf '%s\\n' ${quoted}`]).toString();

    expect(output.split('\n').filter(Boolean)).toEqual([original]);
  });

  it('keeps a path containing an embedded single quote as a single shell argument', () => {
    const original = "/Users/x/it's-mine";
    const quoted = shellQuote(original);

    const output = execFileSync('/bin/zsh', ['-lc', `printf '%s\\n' ${quoted}`]).toString();

    expect(output.split('\n').filter(Boolean)).toEqual([original]);
  });
});

describe('runAction', () => {
  it('clears runningProjects and reports failure when the process fails to spawn', async () => {
    // A cwd that does not exist makes the OS-level spawn itself fail (ENOENT),
    // which emits 'error' on the ChildProcess instead of a normal 'exit'.
    const project = { path: '/no/such/directory/for-sidedash-spawn-error-test', actionType: 'pdf' };
    const dataChunks = [];

    const exitCode = await new Promise((resolve) => {
      runAction(project, [], {
        onData: (chunk) => dataChunks.push(chunk),
        onExit: (code) => resolve(code),
      });
    });

    expect(exitCode).toBeNull();
    expect(runningProjects.has(project.path)).toBe(false);
    expect(dataChunks.join('')).toContain('명령을 실행할 수 없습니다');
  });
});
