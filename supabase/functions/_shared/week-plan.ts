const DAY_KEYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WeekPlanOutput {
  summary: string;
  warnings: string[];
  schedule_updates: Array<{
    id?: string;
    title: string;
    subject: string;
    day_of_week: string;
    start_time: string;
    duration_minutes: number;
    event_type: 'self_study';
    status: 'upcoming';
    sort_order: number;
    study_lock_enabled: true;
  }>;
}
export function parseWeekPlan(text: string): WeekPlanOutput {
  const cleaned = text.replace(/^\s*```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const value = JSON.parse(cleaned) as Partial<WeekPlanOutput>;
  if (typeof value.summary !== 'string' || !Array.isArray(value.warnings) || !Array.isArray(value.schedule_updates)) {
    throw new Error('Gemini returned an invalid Smart Week object');
  }
  if (!value.warnings.every((warning) => typeof warning === 'string') || value.schedule_updates.length > 100) {
    throw new Error('Gemini returned invalid Smart Week metadata');
  }

  const updates = value.schedule_updates.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') throw new Error(`Invalid schedule update #${index + 1}`);
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const subject = typeof candidate.subject === 'string' ? candidate.subject.trim() : '';
    const id = typeof candidate.id === 'string' ? candidate.id : undefined;
    if (!title || !subject || title.length > 120 || subject.length > 100) {
      throw new Error(`Invalid schedule update content #${index + 1}`);
    }
    if (id && !UUID_PATTERN.test(id)) throw new Error(`Invalid schedule update id #${index + 1}`);
    if (!DAY_KEYS.has(candidate.day_of_week) || !TIME_PATTERN.test(candidate.start_time)) {
      throw new Error(`Invalid schedule update time #${index + 1}`);
    }
    if (!Number.isInteger(candidate.duration_minutes)
      || candidate.duration_minutes < 5
      || candidate.duration_minutes > 120) {
      throw new Error(`Invalid schedule update duration #${index + 1}`);
    }
    if (candidate.event_type !== 'self_study') throw new Error(`Invalid schedule update type #${index + 1}`);
    return {
      id,
      title,
      subject,
      day_of_week: candidate.day_of_week,
      start_time: candidate.start_time,
      duration_minutes: candidate.duration_minutes,
      event_type: 'self_study' as const,
      status: 'upcoming' as const,
      sort_order: Number.isInteger(candidate.sort_order) ? candidate.sort_order : index * 10 + 10,
      study_lock_enabled: true as const,
    };
  });

  return { summary: value.summary.trim(), warnings: value.warnings, schedule_updates: updates };
}
