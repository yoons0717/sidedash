import { describe, expect, it } from 'vitest';
import { canAddProject } from './projects.js';

describe('canAddProject', () => {
  it('allows adding a path that is not already registered', () => {
    const existing = [{ name: 'debrief', path: '/Users/x/debrief' }];

    expect(canAddProject('/Users/x/resume-ym', existing)).toEqual({ ok: true });
  });

  it('rejects a path that is already registered', () => {
    const existing = [{ name: 'debrief', path: '/Users/x/debrief' }];

    expect(canAddProject('/Users/x/debrief', existing)).toEqual({
      ok: false,
      reason: 'already-registered',
    });
  });

  it('rejects a different path whose basename collides with an already-registered name', () => {
    const existing = [{ name: 'app', path: '/Users/x/projects/app' }];

    // registry.remove() filters by name, so two different paths sharing a
    // basename would make removing one of them silently remove both.
    expect(canAddProject('/Users/x/other/app', existing)).toEqual({
      ok: false,
      reason: 'name-collision',
    });
  });
});
