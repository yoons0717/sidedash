import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectAction } from './detect.js';

describe('detectAction', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidedash-detect-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns 'pipeline' when run.sh exists at the project root", () => {
    fs.writeFileSync(path.join(dir, 'run.sh'), '#!/bin/sh\necho hi\n');

    expect(detectAction(dir)).toBe('pipeline');
  });

  it("returns 'pdf' when package.json has a scripts.pdf entry", () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { pdf: 'some-pdf-command' } })
    );

    expect(detectAction(dir)).toBe('pdf');
  });

  it('returns null when neither run.sh nor a pdf script exists', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } })
    );

    expect(detectAction(dir)).toBe(null);
  });
});
