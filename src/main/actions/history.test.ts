import { describe, expect, it } from 'vitest';
import { getLastRun, recordRun } from './history';
import { tempFilePath } from '../test-utils/tempFile';

describe('history', () => {
  const historyFileFor = tempFilePath('sidedash-history-', 'last-run.json');
  let historyFile: string;

  function setup(): void {
    historyFile = historyFileFor();
  }

  it('returns null for a project that has never been recorded', () => {
    setup();
    expect(getLastRun(historyFile, '/Users/x/debrief')).toBeNull();
  });

  it('records and retrieves a timestamp for a project', () => {
    setup();
    recordRun(historyFile, '/Users/x/debrief', '2026-07-20T10:00:00.000Z');
    expect(getLastRun(historyFile, '/Users/x/debrief')).toBe('2026-07-20T10:00:00.000Z');
  });

  it('overwrites the previous timestamp on a second recording, without disturbing other projects', () => {
    setup();
    recordRun(historyFile, '/Users/x/debrief', '2026-07-20T10:00:00.000Z');
    recordRun(historyFile, '/Users/x/resume-ym', '2026-07-21T09:00:00.000Z');
    recordRun(historyFile, '/Users/x/debrief', '2026-07-22T11:00:00.000Z');

    expect(getLastRun(historyFile, '/Users/x/debrief')).toBe('2026-07-22T11:00:00.000Z');
    expect(getLastRun(historyFile, '/Users/x/resume-ym')).toBe('2026-07-21T09:00:00.000Z');
  });

  it('defaults the timestamp to now when not given explicitly', () => {
    setup();
    const before = Date.now();
    recordRun(historyFile, '/Users/x/debrief');
    const after = Date.now();

    const recorded = new Date(getLastRun(historyFile, '/Users/x/debrief')!).getTime();
    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(after);
  });
});
