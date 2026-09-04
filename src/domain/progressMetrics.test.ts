import { describe, expect, it } from 'vitest';
import {
  completionPercent,
  durationBetweenMinutes,
  learningStreak,
} from './progressMetrics';

function session(day: Date, status: 'completed' | 'scheduled' = 'completed') {
  return {
    starts_at: day.toISOString(),
    status,
    duration_minutes: 45,
  } as const;
}

describe('progress metrics', () => {
  it('keeps a streak through today or yesterday', () => {
    const today = new Date(2026, 8, 4, 12);
    expect(learningStreak([
      session(new Date(2026, 8, 3, 19)),
      session(new Date(2026, 8, 2, 19)),
      session(new Date(2026, 8, 1, 19), 'scheduled'),
    ], today)).toBe(2);
  });

  it('clamps completion percentage and invalid durations', () => {
    expect(completionPercent(3, 4)).toBe(75);
    expect(completionPercent(2, 0)).toBe(0);
    expect(durationBetweenMinutes('2026-09-04T10:00:00Z', '2026-09-04T10:45:00Z')).toBe(45);
    expect(durationBetweenMinutes('bad', '2026-09-04T10:45:00Z')).toBe(0);
  });
});
