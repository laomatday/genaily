import type { DayKey, ScheduleEventLike, ScheduleEventStatus, ScheduleEventType } from '../types';

const dayKeys: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const eventTypes: ScheduleEventType[] = [
  'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other', 'learning', 'routine',
];
const statuses: ScheduleEventStatus[] = ['completed', 'live', 'upcoming'];

export interface ScheduleUpdate {
  id?: string;
  title: string;
  subject: string | null;
  day_of_week: DayKey;
  start_time: string;
  duration_minutes: number;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
  sort_order?: number;
}

export interface SmartWeekOutput {
  summary: string;
  warnings: string[];
  schedule_updates: ScheduleUpdate[];
}

export interface DayLoad {
  day: DayKey;
  minutes: number;
  level: 'light' | 'mid' | 'heavy';
}

export function calculateDayLoads(events: ScheduleEventLike[]): DayLoad[] {
  return dayKeys.map((day) => {
    const minutes = events
      .filter((event) => event.day_of_week === day)
      .reduce((sum, event) => sum + event.duration_minutes, 0);
    return { day, minutes, level: minutes >= 720 ? 'heavy' : minutes >= 240 ? 'mid' : 'light' };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseSmartWeekOutput(value: unknown): SmartWeekOutput {
  if (!isRecord(value)) throw new Error('Kế hoạch AI không đúng định dạng.');
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((item): item is string => typeof item === 'string')
    : [];
  if (!Array.isArray(value.schedule_updates)) throw new Error('Kế hoạch AI thiếu schedule_updates.');

  const schedule_updates = value.schedule_updates.map((item, index): ScheduleUpdate => {
    if (!isRecord(item)) throw new Error(`Lịch AI #${index + 1} không hợp lệ.`);
    if (typeof item.title !== 'string' || !item.title.trim()) throw new Error(`Lịch AI #${index + 1} thiếu tiêu đề.`);
    if (!dayKeys.includes(item.day_of_week as DayKey)) throw new Error(`Lịch AI #${index + 1} sai ngày.`);
    if (typeof item.start_time !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(item.start_time)) {
      throw new Error(`Lịch AI #${index + 1} sai giờ.`);
    }
    if (typeof item.duration_minutes !== 'number' || item.duration_minutes < 5 || item.duration_minutes > 720) {
      throw new Error(`Lịch AI #${index + 1} sai thời lượng.`);
    }
    if (!eventTypes.includes(item.event_type as ScheduleEventType)) throw new Error(`Lịch AI #${index + 1} sai loại.`);
    if (!statuses.includes(item.status as ScheduleEventStatus)) throw new Error(`Lịch AI #${index + 1} sai trạng thái.`);
    return {
      id: typeof item.id === 'string' && item.id ? item.id : undefined,
      title: item.title.trim(),
      subject: typeof item.subject === 'string' ? item.subject : null,
      day_of_week: item.day_of_week as DayKey,
      start_time: item.start_time,
      duration_minutes: item.duration_minutes,
      event_type: item.event_type as ScheduleEventType,
      status: item.status as ScheduleEventStatus,
      sort_order: typeof item.sort_order === 'number' ? item.sort_order : undefined,
    };
  });

  return { summary, warnings, schedule_updates };
}
