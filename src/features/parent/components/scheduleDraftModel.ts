import { getActivityDetail, isLearningActivityType } from '../../../domain/schedulePolicy';
import { DAY_KEYS, DAY_LONG_VI } from '../../../lib/date';
import type { FamilyData } from '../../../lib/familyRepository';
import type {
  ActivityCategoryType,
  DayKey,
  ScheduleEventStatus,
} from '../../../types';

export interface DraftSubject {
  key: string;
  subject: string;
  subjectSource: 'catalog' | 'custom';
  title: string;
  category: ActivityCategoryType;
  startTime: string;
  duration: number | '';
  studyLock: boolean;
  days: DayKey[];
  idsByDay: Partial<Record<DayKey, string>>;
  statusByDay: Partial<Record<DayKey, ScheduleEventStatus>>;
  sortByDay: Partial<Record<DayKey, number>>;
}

interface TimeSlot {
  draftKey: string;
  subject: string;
  day: DayKey;
  startMinutes: number;
  endMinutes: number;
}

export interface ConflictInfo {
  day: DayKey;
  slot1: TimeSlot;
  slot2: TimeSlot;
  description: string;
}

export function timeToMinutes(time: string): number | null {
  if (!time || !time.includes(':')) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function calculateConflicts(drafts: DraftSubject[]): ConflictInfo[] {
  const slots = drafts.flatMap((draft): TimeSlot[] => {
    const startMinutes = timeToMinutes(draft.startTime);
    if (startMinutes === null || typeof draft.duration !== 'number' || draft.duration <= 0) return [];
    const duration = draft.duration;
    return draft.days.map((day) => ({
      draftKey: draft.key,
      subject: draft.subject || draft.title || 'Hoạt động',
      day,
      startMinutes,
      endMinutes: startMinutes + duration,
    }));
  });
  const conflicts: ConflictInfo[] = [];
  for (let leftIndex = 0; leftIndex < slots.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < slots.length; rightIndex += 1) {
      const left = slots[leftIndex];
      const right = slots[rightIndex];
      if (left.day !== right.day || left.draftKey === right.draftKey) continue;
      if (left.startMinutes >= right.endMinutes || right.startMinutes >= left.endMinutes) continue;
      const dayLabel = DAY_LONG_VI[DAY_KEYS.indexOf(left.day)] || left.day;
      conflicts.push({
        day: left.day,
        slot1: left,
        slot2: right,
        description: `[${dayLabel}] "${left.subject}" (${minutesToTime(left.startMinutes)}–${minutesToTime(left.endMinutes)}) trùng giờ với "${right.subject}" (${minutesToTime(right.startMinutes)}–${minutesToTime(right.endMinutes)})`,
      });
    }
  }
  return conflicts;
}

export function makeDrafts(data: FamilyData): DraftSubject[] {
  const grouped = new Map<string, DraftSubject>();
  const catalogSubjects = new Set(data.subjectSuggestions.map((item) => item.subject_name));
  for (const event of data.schedule) {
    const category: ActivityCategoryType = event.event_type === 'learning'
      ? 'self_study'
      : event.event_type === 'routine' ? 'other' : event.event_type;
    const key = [
      event.subject ?? '', event.title, category, event.start_time.slice(0, 5),
      event.duration_minutes, event.study_lock_enabled,
    ].join('::');
    const draft = grouped.get(key) ?? {
      key,
      subject: event.subject ?? '',
      subjectSource: event.subject && catalogSubjects.has(event.subject) ? 'catalog' : 'custom',
      title: getActivityDetail(event.subject, event.title) ?? '',
      category,
      startTime: event.start_time.slice(0, 5),
      duration: event.duration_minutes,
      studyLock: isLearningActivityType(category) || event.study_lock_enabled,
      days: [],
      idsByDay: {},
      statusByDay: {},
      sortByDay: {},
    } satisfies DraftSubject;
    if (!draft.days.includes(event.day_of_week)) draft.days.push(event.day_of_week);
    draft.idsByDay[event.day_of_week] = event.id;
    draft.statusByDay[event.day_of_week] = event.status;
    draft.sortByDay[event.day_of_week] = event.sort_order;
    grouped.set(key, draft);
  }
  return [...grouped.values()];
}

export function subjectSwatchClass(subject: string): string {
  const paletteIndex = [...subject].reduce((hash, character) => (
    (hash * 31 + character.charCodeAt(0)) % 8
  ), 2);
  return `subject-swatch-${paletteIndex}`;
}
