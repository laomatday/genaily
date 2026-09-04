import type {
  ChildMilestoneRow,
  FamilySettingsRow,
  LearningSessionRow,
  SessionEventRow,
} from '../lib/familyRepository';

const DEFAULT_LEVEL_SIZE = 1_000;
const DEFAULT_XP_PER_MINUTE = 1;
const DEFAULT_XP_PER_TASK = 10;
const DEFAULT_XP_PER_CORRECT_ANSWER = 5;
const DEFAULT_BREAK_MINUTES = 5;
const DEFAULT_MAX_BREAKS = 2;

export interface ExperienceSummary {
  level: number;
  points: number;
  pointsInLevel: number;
  levelSize: number;
  pointsToNextLevel: number;
  progress: number;
}

export function experienceSummary(points: number, settings: FamilySettingsRow | null): ExperienceSummary {
  const safePoints = Math.max(0, Math.floor(points));
  const levelSize = Math.max(1, settings?.xp_level_size ?? DEFAULT_LEVEL_SIZE);
  const pointsInLevel = safePoints % levelSize;
  return {
    level: Math.floor(safePoints / levelSize) + 1,
    points: safePoints,
    pointsInLevel,
    levelSize,
    pointsToNextLevel: levelSize - pointsInLevel,
    progress: Math.round((pointsInLevel / levelSize) * 100),
  };
}

export function estimateSessionPoints(
  session: Pick<LearningSessionRow, 'duration_minutes' | 'tasks_done' | 'quick_check_score' | 'awarded_points'>,
  settings: FamilySettingsRow | null,
): number {
  if (session.awarded_points > 0) return session.awarded_points;
  return Math.max(0, session.duration_minutes ?? 0) * (settings?.xp_per_minute ?? DEFAULT_XP_PER_MINUTE)
    + Math.max(0, session.tasks_done) * (settings?.xp_per_completed_task ?? DEFAULT_XP_PER_TASK)
    + Math.max(0, session.quick_check_score ?? 0) * (settings?.xp_per_correct_answer ?? DEFAULT_XP_PER_CORRECT_ANSWER);
}

export function milestoneProgress(milestone: ChildMilestoneRow, points: number): number {
  if (milestone.status === 'unlocked' || milestone.status === 'redeemed') return 100;
  const earned = Math.max(0, points - milestone.starting_points);
  return Math.min(100, Math.round((earned / Math.max(1, milestone.target_points)) * 100));
}

export function breakPolicy(settings: FamilySettingsRow | null): { minutes: number; maxBreaks: number } {
  return {
    minutes: settings?.break_duration_minutes ?? DEFAULT_BREAK_MINUTES,
    maxBreaks: settings?.max_breaks_per_session ?? DEFAULT_MAX_BREAKS,
  };
}

export function sessionBreakCount(events: SessionEventRow[], sessionId: string): number {
  return events.filter((event) => event.session_id === sessionId && event.event_type === 'break_requested').length;
}
