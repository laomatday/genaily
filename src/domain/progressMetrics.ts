import { addLocalDays, formatLocalDateKey } from '../lib/date';
import type { ScheduleEventType, SessionStatus } from '../types';

const FINISHED_SESSION_STATUSES = new Set<SessionStatus>(['approved', 'completed']);
const LEARNING_EVENT_TYPES = new Set<ScheduleEventType>([
  'school',
  'extra',
  'self_study',
  'learning',
]);

interface SessionProgressLike {
  starts_at: string;
  status: SessionStatus;
  duration_minutes: number | null;
}

export function isFinishedSession(status: SessionStatus): boolean {
  return FINISHED_SESSION_STATUSES.has(status);
}

export function isLearningEvent(type: ScheduleEventType): boolean {
  return LEARNING_EVENT_TYPES.has(type);
}

export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
}

export function durationBetweenMinutes(startsAt: string, endsAt: string): number {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

export function completedSessionMinutes(sessions: readonly SessionProgressLike[]): number {
  return sessions.reduce(
    (total, session) => total + (isFinishedSession(session.status) ? session.duration_minutes ?? 0 : 0),
    0,
  );
}

export function learningStreak(
  sessions: readonly SessionProgressLike[],
  today = new Date(),
): number {
  const completedDays = new Set(
    sessions
      .filter((session) => isFinishedSession(session.status))
      .map((session) => formatLocalDateKey(new Date(session.starts_at))),
  );
  const todayKey = formatLocalDateKey(today);
  let cursor = completedDays.has(todayKey) ? today : addLocalDays(today, -1);
  let streak = 0;
  while (completedDays.has(formatLocalDateKey(cursor))) {
    streak += 1;
    cursor = addLocalDays(cursor, -1);
  }
  return streak;
}
