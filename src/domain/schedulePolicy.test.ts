import { describe, expect, it } from 'vitest';
import {
  formatActivityName,
  getActivityDetail,
  isLearningActivityType,
  isSelfStudyType,
  normalizeScheduleOrder,
  sortScheduleEvents,
  validateScheduleSetup,
  type ScheduleSetupLike,
} from './schedulePolicy';

const validEvent: ScheduleSetupLike = {
  title: 'Tự học Toán',
  subject: 'Toán',
  day_of_week: 'mon',
  start_time: '19:00',
  duration_minutes: 45,
  event_type: 'self_study',
  status: 'upcoming',
  sort_order: 0,
  study_lock_enabled: true,
};

describe('schedule setup validation', () => {
  it('only shows the subject when session details are missing or duplicated', () => {
    expect(formatActivityName('Toán', '')).toBe('Toán');
    expect(formatActivityName('Toán', 'toán')).toBe('Toán');
    expect(getActivityDetail('Toán', '  ')).toBeNull();
    expect(formatActivityName('Toán', 'Ôn phân số')).toBe('Toán · Ôn phân số');
  });

  it('accepts school, extra and self-study categories', () => {
    expect(() => validateScheduleSetup([
      { ...validEvent, event_type: 'school' },
      { ...validEvent, event_type: 'extra' },
      validEvent,
    ])).not.toThrow();
    expect(['school', 'extra', 'self_study', 'learning'].every((type) =>
      isLearningActivityType(type as ScheduleSetupLike['event_type']))).toBe(true);
    expect(['rest', 'sleep', 'sport', 'play', 'other', 'routine'].some((type) =>
      isLearningActivityType(type as ScheduleSetupLike['event_type']))).toBe(false);
  });

  it('accepts non-learning activities without a subject', () => {
    expect(() => validateScheduleSetup([
      { ...validEvent, title: 'Ngủ trưa', subject: null, event_type: 'sleep' },
      { ...validEvent, title: 'Đá bóng', subject: null, event_type: 'sport' },
      { ...validEvent, title: 'Giờ chơi', subject: null, event_type: 'play' },
    ])).not.toThrow();
  });

  it('requires Study Lock for every learning activity', () => {
    expect(() => validateScheduleSetup([{ ...validEvent, study_lock_enabled: false }]))
      .toThrow('phải bật Khóa tập trung');
    expect(() => validateScheduleSetup([{
      ...validEvent,
      title: 'Ngủ trưa',
      subject: null,
      event_type: 'sleep',
      study_lock_enabled: false,
    }])).not.toThrow();
  });

  it('opens learning-session behavior only for self-study', () => {
    expect(isSelfStudyType('self_study')).toBe(true);
    expect(isSelfStudyType('learning')).toBe(true); // legacy self-study rows
    expect(['school', 'extra', 'rest', 'sleep', 'sport', 'play', 'other']
      .some((type) => isSelfStudyType(type as ScheduleSetupLike['event_type']))).toBe(false);
  });

  it('rejects synthetic IDs and malformed time or duration', () => {
    expect(() => validateScheduleSetup([{ ...validEvent, id: 'event-local' }])).toThrow('ID không hợp lệ');
    expect(() => validateScheduleSetup([{ ...validEvent, start_time: '25:70' }])).toThrow('giờ không hợp lệ');
    expect(() => validateScheduleSetup([{ ...validEvent, duration_minutes: 0 }])).toThrow('thời lượng không hợp lệ');
  });

  it('sorts activities chronologically and normalizes each day independently', () => {
    const events = [
      { ...validEvent, title: 'Tối', start_time: '19:30', sort_order: 10 },
      { ...validEvent, title: 'Sáng', start_time: '07:30', sort_order: 30 },
      { ...validEvent, title: 'Chiều', start_time: '17:30', sort_order: 20 },
      { ...validEvent, title: 'Thứ ba', day_of_week: 'tue' as const, start_time: '06:30', sort_order: 5 },
    ];

    expect(sortScheduleEvents(events).map((event) => event.title)).toEqual([
      'Sáng',
      'Chiều',
      'Tối',
      'Thứ ba',
    ]);
    expect(normalizeScheduleOrder(events).map((event) => [event.day_of_week, event.sort_order])).toEqual([
      ['mon', 10],
      ['mon', 20],
      ['mon', 30],
      ['tue', 10],
    ]);
  });
});
