import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectTechStack,
  filterAndDedupeCandidates,
  getProcessArgv,
  getProcessCwd,
  isNonDevServerProcess,
  matchRegisteredProject,
  parseCwdOutput,
  parseListeningProcesses,
} from './portscan';

describe('parseListeningProcesses', () => {
  it('pairs each n-line with the most recent p/c lines and skips ports it cannot parse', () => {
    const output = [
      'p655',
      'crapportd',
      'f10',
      'n*:57535',
      'p700',
      'cControlCenter',
      'f12',
      'n*:5000',
      'f13',
      'n*:5000',
      'p995',
      'cpostgres',
      'f7',
      'n[::1]:5432',
      'p1',
      'csomething',
      'f1',
      'nnamed-pipe-no-port',
    ].join('\n');

    expect(parseListeningProcesses(output)).toEqual([
      { pid: 655, command: 'rapportd', port: 57535 },
      { pid: 700, command: 'ControlCenter', port: 5000 },
      { pid: 700, command: 'ControlCenter', port: 5000 },
      { pid: 995, command: 'postgres', port: 5432 },
    ]);
  });
});

describe('filterAndDedupeCandidates', () => {
  it('keeps only allowlisted commands and dedupes by pid:port', () => {
    const candidates = [
      { pid: 1, command: 'ControlCenter', port: 5000 },
      { pid: 2, command: 'node', port: 3000 },
      { pid: 2, command: 'node', port: 3000 },
      { pid: 3, command: 'Python', port: 8000 },
    ];

    expect(filterAndDedupeCandidates(candidates)).toEqual([
      { pid: 2, command: 'node', port: 3000 },
      { pid: 3, command: 'Python', port: 8000 },
    ]);
  });
});

describe('isNonDevServerProcess', () => {
  it('rejects a Serena MCP language-server process by its command line', () => {
    expect(
      isNonDevServerProcess('/.../Python /Users/me/.cache/uv/archive-v0/xxx/bin/serena start-mcp-server --project-from-cwd'),
    ).toBe(true);
  });

  it('keeps a real dev server whose command line has no denied marker', () => {
    expect(isNonDevServerProcess('/.../node /Users/me/app/node_modules/astro/bin/astro.mjs dev')).toBe(false);
    expect(isNonDevServerProcess('/.../python manage.py runserver')).toBe(false);
  });

  it('keeps a process whose argv could not be read', () => {
    expect(isNonDevServerProcess('')).toBe(false);
  });
});

describe('getProcessArgv', () => {
  it('resolves the current process command line via a real ps call', () => {
    expect(getProcessArgv(process.pid)).toContain('node');
  });

  it('returns an empty string for a pid that does not exist', () => {
    expect(getProcessArgv(2 ** 31 - 1)).toBe('');
  });
});

describe('parseCwdOutput', () => {
  it('extracts the path from an n-line', () => {
    expect(parseCwdOutput('p28264\nfcwd\nn/Users/yoonmigoo/some-project')).toBe('/Users/yoonmigoo/some-project');
  });

  it('returns null when there is no n-line', () => {
    expect(parseCwdOutput('p28264\nfcwd')).toBe(null);
  });
});

describe('getProcessCwd', () => {
  it('resolves the current process cwd via a real lsof call', () => {
    expect(getProcessCwd(process.pid)).toBe(process.cwd());
  });
});

describe('matchRegisteredProject', () => {
  const entries = [
    { name: 'outer', path: '/Users/me/projects/outer', addedAt: '' },
    { name: 'outer-app', path: '/Users/me/projects/outer/app', addedAt: '' },
  ];

  it('matches an exact path', () => {
    expect(matchRegisteredProject('/Users/me/projects/outer', entries)).toBe('outer');
  });

  it('matches a nested path against a containing registered entry', () => {
    expect(matchRegisteredProject('/Users/me/projects/outer/app/src', entries)).toBe('outer');
  });

  it('returns null when nothing matches', () => {
    expect(matchRegisteredProject('/Users/me/projects/unrelated', entries)).toBe(null);
  });
});

describe('detectTechStack', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidedash-portscan-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects React from package.json dependencies', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }));
    expect(detectTechStack(dir, 'node')).toBe('React');
  });

  it('falls back to Node.js when package.json has no known framework', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { lodash: '^4.0.0' } }));
    expect(detectTechStack(dir, 'node')).toBe('Node.js');
  });

  it('detects Django from manage.py', () => {
    fs.writeFileSync(path.join(dir, 'manage.py'), '');
    expect(detectTechStack(dir, 'python3')).toBe('Django');
  });

  it('detects Flask from requirements.txt content', () => {
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask==3.0.0\n');
    expect(detectTechStack(dir, 'python3')).toBe('Flask');
  });

  it('falls back to Python for a bare requirements.txt', () => {
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'requests==2.31.0\n');
    expect(detectTechStack(dir, 'python3')).toBe('Python');
  });

  it('detects Rails from Gemfile content', () => {
    fs.writeFileSync(path.join(dir, 'Gemfile'), "gem 'rails'\n");
    expect(detectTechStack(dir, 'ruby')).toBe('Rails');
  });

  it('falls back to Ruby for a bare Gemfile', () => {
    fs.writeFileSync(path.join(dir, 'Gemfile'), "gem 'sinatra'\n");
    expect(detectTechStack(dir, 'ruby')).toBe('Ruby');
  });

  it('detects Go from go.mod', () => {
    fs.writeFileSync(path.join(dir, 'go.mod'), 'module example.com/app\n');
    expect(detectTechStack(dir, 'go')).toBe('Go');
  });

  it('falls back to the process command name when cwd has no markers', () => {
    expect(detectTechStack(dir, 'python3')).toBe('Python');
  });

  it('falls back to Unknown when neither cwd markers nor command match', () => {
    expect(detectTechStack(dir, 'mystery-runtime')).toBe('Unknown');
  });

  it('falls back to the command name when cwd is null', () => {
    expect(detectTechStack(null, 'node')).toBe('Node.js');
  });
});
