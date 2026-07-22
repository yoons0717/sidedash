import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createUtf8Decoder, isRunning, runAction, runningProjects, shellQuote } from './run.js';

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

  it('reports isRunning(path) as true while the guard holds the path, false once cleared', async () => {
    const project = { path: '/no/such/directory/for-sidedash-isrunning-test', actionType: 'pdf' };

    expect(isRunning(project.path)).toBe(false);

    await new Promise((resolve) => {
      runAction(project, [], { onExit: () => resolve() });
      // The guard is added synchronously before spawn() is even attempted,
      // so it must already be true in the same tick runAction was called.
      expect(isRunning(project.path)).toBe(true);
    });

    expect(isRunning(project.path)).toBe(false);
  });
});

describe('createUtf8Decoder', () => {
  it('correctly stitches a multi-byte UTF-8 character split across two chunks', () => {
    const full = Buffer.from('한글 테스트 완료\n', 'utf8');
    // '한' is 3 bytes (0xEC 0x95 0x9C at this offset in the full buffer);
    // splitting after 1 byte guarantees the cut lands mid-character.
    const chunk1 = full.subarray(0, 1);
    const chunk2 = full.subarray(1);

    // Sanity check: naively decoding each half independently is where the bug
    // lives today (chunk.toString() per chunk) — confirms the split is real.
    expect(chunk1.toString('utf8') + chunk2.toString('utf8')).not.toBe(full.toString('utf8'));

    const decode = createUtf8Decoder();
    const result = decode(chunk1) + decode(chunk2);

    expect(result).toBe('한글 테스트 완료\n');
  });
});
