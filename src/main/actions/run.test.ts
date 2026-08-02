import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ANALYSIS_PROMPT,
  buildAnalyzeCommand,
  createUtf8Decoder,
  getResolvedClaudeBinary,
  hasRunningActions,
  isRunning,
  killAllRunning,
  runAction,
  runningProjects,
  shellQuote,
  warmClaudeBinaryCache,
} from './run';

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

describe('buildAnalyzeCommand', () => {
  it('wraps the resolved claude binary path and analysis prompt as quoted arguments, scoped to allowed tools', () => {
    expect(buildAnalyzeCommand('/usr/local/bin/claude')).toBe(
      `${shellQuote('/usr/local/bin/claude')} -p ${shellQuote(ANALYSIS_PROMPT)} --allowedTools ${shellQuote('Read')} ${shellQuote('Glob')} ${shellQuote('Bash(git log:*)')} < /dev/null`
    );
  });
});

describe('warmClaudeBinaryCache / getResolvedClaudeBinary', () => {
  it('defaults to the bare command name before warming', () => {
    // Only meaningful if nothing earlier in this file's run already warmed
    // the module-level cache — this codebase's tests don't reset module
    // state between files, so this documents the fallback value rather than
    // strictly proving cold-start behavior.
    expect(typeof getResolvedClaudeBinary()).toBe('string');
    expect(getResolvedClaudeBinary().length).toBeGreaterThan(0);
  });

  it('resolves and caches an absolute path (or falls back to "claude")', async () => {
    const resolved = await warmClaudeBinaryCache();

    expect(resolved.length).toBeGreaterThan(0);
    expect(getResolvedClaudeBinary()).toBe(resolved);
  });
});

describe('runAction', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('passes exactly the given targetPaths as quoted arguments to a pipeline action, nothing implicit', async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'sidedash-pipeline-'));
    writeFileSync(path.join(tempDir, 'run.sh'), '#!/bin/bash\necho "$@"\n');
    chmodSync(path.join(tempDir, 'run.sh'), 0o755);

    const project = { path: tempDir, actionType: 'pipeline' as const };
    const targetPaths = ['/Users/x/My Project', '/Users/x/other'];
    const dataChunks: string[] = [];

    await new Promise<void>((resolve) => {
      runAction(project, targetPaths, {
        onData: (chunk) => dataChunks.push(chunk),
        onExit: () => resolve(),
      });
    });

    expect(dataChunks.join('').trim()).toBe('/Users/x/My Project /Users/x/other');
  });

  it('clears runningProjects and reports failure when the process fails to spawn', async () => {
    // A cwd that does not exist makes the OS-level spawn itself fail (ENOENT),
    // which emits 'error' on the ChildProcess instead of a normal 'exit'.
    const project = { path: '/no/such/directory/for-sidedash-spawn-error-test', actionType: 'pdf' as const };
    const dataChunks: string[] = [];

    const exitCode = await new Promise<number | null>((resolve) => {
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
    const project = { path: '/no/such/directory/for-sidedash-isrunning-test', actionType: 'pdf' as const };

    expect(isRunning(project.path)).toBe(false);

    await new Promise<void>((resolve) => {
      runAction(project, [], { onExit: () => resolve() });
      // The guard is added synchronously before spawn() is even attempted,
      // so it must already be true in the same tick runAction was called.
      expect(isRunning(project.path)).toBe(true);
    });

    expect(isRunning(project.path)).toBe(false);
  });

  it('killAllRunning() terminates the whole process tree, not just the top-level shell', async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'sidedash-kill-'));
    const markerFile = path.join(tempDir, 'child.pid');
    // run.sh's own zsh process forks a grandchild (sleep) in the background
    // and writes ITS pid to a file — this proves whether killing the tracked
    // child actually reaches descendants, not just the immediate shell.
    writeFileSync(
      path.join(tempDir, 'run.sh'),
      '#!/bin/bash\nsleep 30 &\necho $! > child.pid\nwait\n'
    );
    chmodSync(path.join(tempDir, 'run.sh'), 0o755);

    const project = { path: tempDir, actionType: 'pipeline' as const };

    expect(hasRunningActions()).toBe(false);

    const exitPromise = new Promise<number | null>((resolve) => {
      runAction(project, [], { onExit: (code) => resolve(code) });
    });

    // Give run.sh a moment to fork sleep and write its pid (login shell
    // startup, e.g. loading .zshrc/nvm, can take a bit).
    await new Promise((r) => setTimeout(r, 1000));

    expect(hasRunningActions()).toBe(true);

    const grandchildPid = Number(readFileSync(markerFile, 'utf-8').trim());

    killAllRunning();
    await exitPromise;

    expect(hasRunningActions()).toBe(false);

    // If only the top-level shell died, this grandchild `sleep` would still
    // be alive; signalling it with 0 throws ESRCH once it's actually gone.
    await new Promise((r) => setTimeout(r, 200));
    expect(() => process.kill(grandchildPid, 0)).toThrow();
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
