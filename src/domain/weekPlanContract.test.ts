import { describe, expect, it } from 'vitest';
import { parseWeekPlan } from '../../supabase/functions/_shared/week-plan';

describe('Gemini structured week-plan contract', () => {
  it('normalizes a valid plan and always enables Study Lock', () => {
    const plan = parseWeekPlan(JSON.stringify({
      summary: 'Tăng một buổi ôn Toán.',
      warnings: [],
      schedule_updates: [{
        title: 'Ôn phân số',
        subject: 'Toán',
        day_of_week: 'mon',
        start_time: '19:30:00',
        duration_minutes: 45,
        event_type: 'self_study',
        status: 'upcoming',
      }],
    }));

    expect(plan.schedule_updates[0]).toMatchObject({
      status: 'upcoming',
      study_lock_enabled: true,
      sort_order: 10,
    });
  });

  it('rejects malformed, excessive and non-self-study output', () => {
    expect(() => parseWeekPlan('{}')).toThrow('invalid Smart Week');
    expect(() => parseWeekPlan(JSON.stringify({
      summary: 'Sai loại',
      warnings: [],
      schedule_updates: [{
        title: 'Đá bóng',
        subject: 'Thể dục',
        day_of_week: 'mon',
        start_time: '19:30',
        duration_minutes: 45,
        event_type: 'sport',
      }],
    }))).toThrow('type');
  });
});
