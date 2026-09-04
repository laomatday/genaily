import { describe, expect, it } from 'vitest';
import { breakPolicy, estimateSessionPoints, experienceSummary, milestoneProgress, sessionBreakCount } from './engagement';

describe('engagement metrics', () => {
  it('derives a level without inventing persisted points', () => {
    expect(experienceSummary(1_250, null)).toMatchObject({ level: 2, pointsInLevel: 250, progress: 25 });
  });

  it('uses the server reward formula for a preview', () => {
    expect(estimateSessionPoints({ duration_minutes: 30, tasks_done: 2, quick_check_score: 1, awarded_points: 0 }, null)).toBe(55);
    expect(estimateSessionPoints({ duration_minutes: 30, tasks_done: 2, quick_check_score: 1, awarded_points: 80 }, null)).toBe(80);
  });

  it('calculates milestone and break state from stored rows', () => {
    expect(milestoneProgress({ starting_points: 100, target_points: 200, status: 'active' } as never, 250)).toBe(75);
    expect(sessionBreakCount([
      { session_id: 'one', event_type: 'break_requested' },
      { session_id: 'one', event_type: 'started' },
      { session_id: 'two', event_type: 'break_requested' },
    ] as never, 'one')).toBe(1);
    expect(breakPolicy(null)).toEqual({ minutes: 5, maxBreaks: 2 });
  });
});
