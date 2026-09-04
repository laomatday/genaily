import { describe, expect, it } from 'vitest';
import { formatTodayLabel, formatWeekRange, getDayKey, getWeekDays } from './date';

describe('calendar helpers', () => {
  const wednesday = new Date(2026, 8, 2, 12, 0, 0);

  it('uses the actual weekday', () => {
    expect(getDayKey(wednesday)).toBe('wed');
    expect(formatTodayLabel(wednesday)).toBe('Thứ Tư · 2/9');
  });

  it('builds the current Monday-Sunday range', () => {
    expect(formatWeekRange(wednesday)).toBe('31/8–6/9');
    expect(getWeekDays(wednesday).map((day) => day.date.getDate())).toEqual([31, 1, 2, 3, 4, 5, 6]);
  });
});
