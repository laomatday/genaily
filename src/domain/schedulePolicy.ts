import type { DayKey, ScheduleEventStatus, ScheduleEventType } from '../types';

export interface ScheduleSetupLike {
  id?: string;
  title: string;
  subject: string | null;
  day_of_week: DayKey;
  start_time: string;
  duration_minutes: number;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
  sort_order: number;
  study_lock_enabled: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const EDITABLE_TYPES: ScheduleEventType[] = [
  'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other', 'learning', 'routine',
];
const SUBJECT_TYPES: ScheduleEventType[] = ['school', 'extra', 'self_study', 'learning'];
const DAY_ORDER: Record<DayKey, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

export function isSelfStudyType(type: ScheduleEventType): boolean {
  return type === 'self_study' || type === 'learning';
}

export function isLearningActivityType(type: ScheduleEventType): boolean {
  return SUBJECT_TYPES.includes(type);
}

export function getActivityDetail(subject: string | null | undefined, title: string | null | undefined): string | null {
  const normalizedSubject = subject?.trim() ?? '';
  const normalizedTitle = title?.trim() ?? '';
  if (!normalizedTitle) return null;
  if (normalizedSubject && normalizedTitle.localeCompare(normalizedSubject, 'vi', { sensitivity: 'base' }) === 0) {
    return null;
  }
  return normalizedTitle;
}

export function formatActivityName(subject: string | null | undefined, title: string | null | undefined): string {
  const normalizedSubject = subject?.trim() ?? '';
  const detail = getActivityDetail(normalizedSubject, title);
  return [normalizedSubject, detail].filter(Boolean).join(' · ');
}

export function sortScheduleEvents<T extends Pick<ScheduleSetupLike, 'day_of_week' | 'start_time' | 'sort_order' | 'title'>>(
  events: readonly T[],
): T[] {
  return [...events].sort((left, right) => (
    DAY_ORDER[left.day_of_week] - DAY_ORDER[right.day_of_week]
    || left.start_time.localeCompare(right.start_time)
    || left.sort_order - right.sort_order
    || left.title.localeCompare(right.title, 'vi')
  ));
}

export function normalizeScheduleOrder<T extends ScheduleSetupLike>(events: readonly T[]): T[] {
  const dayPositions = new Map<DayKey, number>();
  return sortScheduleEvents(events).map((event) => {
    const position = (dayPositions.get(event.day_of_week) ?? 0) + 1;
    dayPositions.set(event.day_of_week, position);
    return { ...event, sort_order: position * 10 };
  });
}

export function validateScheduleSetup(events: ScheduleSetupLike[]): void {
  for (const [index, event] of events.entries()) {
    const label = `Lịch #${index + 1}`;
    if (event.id && !UUID_PATTERN.test(event.id)) throw new Error(`${label} có ID không hợp lệ.`);
    if (!EDITABLE_TYPES.includes(event.event_type)) throw new Error(`${label} có loại không được chỉnh sửa.`);
    if (!event.title.trim()) throw new Error(`${label} thiếu tên hoạt động.`);
    if (isLearningActivityType(event.event_type) && !event.subject?.trim()) {
      throw new Error(`${label} thiếu tên môn học.`);
    }
    if (isLearningActivityType(event.event_type) && !event.study_lock_enabled) {
      throw new Error(`${label} phải bật Khóa tập trung.`);
    }
    if (!TIME_PATTERN.test(event.start_time)) throw new Error(`${label} có giờ không hợp lệ.`);
    if (!Number.isInteger(event.duration_minutes) || event.duration_minutes < 5 || event.duration_minutes > 720) {
      throw new Error(`${label} có thời lượng không hợp lệ.`);
    }
  }
}
