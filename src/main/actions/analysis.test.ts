import { describe, expect, it } from 'vitest';
import { getLastAnalysis, recordAnalysis } from './analysis';
import { tempFilePath } from '../test-utils/tempFile';

describe('analysis', () => {
  const analysisFileFor = tempFilePath('sidedash-analysis-', 'analysis.json');
  let analysisFile: string;

  function setup(): void {
    analysisFile = analysisFileFor();
  }

  it('returns null for a project that has never been analyzed', () => {
    setup();
    expect(getLastAnalysis(analysisFile, '/Users/x/debrief')).toBeNull();
  });

  it('records and retrieves a summary for a project', () => {
    setup();
    recordAnalysis(analysisFile, '/Users/x/debrief', '파서는 완성, UI는 스켈레톤만 있음.', '2026-07-30T10:00:00.000Z');

    expect(getLastAnalysis(analysisFile, '/Users/x/debrief')).toEqual({
      summary: '파서는 완성, UI는 스켈레톤만 있음.',
      analyzedAt: '2026-07-30T10:00:00.000Z',
    });
  });

  it('overwrites the previous analysis on a second recording, without disturbing other projects', () => {
    setup();
    recordAnalysis(analysisFile, '/Users/x/debrief', '1차 요약', '2026-07-30T10:00:00.000Z');
    recordAnalysis(analysisFile, '/Users/x/resume-ym', '다른 프로젝트 요약', '2026-07-31T09:00:00.000Z');
    recordAnalysis(analysisFile, '/Users/x/debrief', '2차 요약', '2026-08-01T11:00:00.000Z');

    expect(getLastAnalysis(analysisFile, '/Users/x/debrief')).toEqual({
      summary: '2차 요약',
      analyzedAt: '2026-08-01T11:00:00.000Z',
    });
    expect(getLastAnalysis(analysisFile, '/Users/x/resume-ym')).toEqual({
      summary: '다른 프로젝트 요약',
      analyzedAt: '2026-07-31T09:00:00.000Z',
    });
  });

  it('defaults analyzedAt to now when not given explicitly', () => {
    setup();
    const before = Date.now();
    recordAnalysis(analysisFile, '/Users/x/debrief', '요약');
    const after = Date.now();

    const recorded = new Date(getLastAnalysis(analysisFile, '/Users/x/debrief')!.analyzedAt).getTime();
    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(after);
  });
});
