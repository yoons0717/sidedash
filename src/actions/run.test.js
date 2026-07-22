import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { shellQuote } from './run.js';

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
