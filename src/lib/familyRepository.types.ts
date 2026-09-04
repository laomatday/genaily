import type { Tables } from './database.types';
import type { DayKey, ScheduleEventStatus, ScheduleEventType, SessionStatus } from '../types';

export type { FamilyContext } from './familyIdentity';
export type ProfileRow = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'avatar_url' | 'role' | 'grade_level' | 'experience_points'>;
export type LearningGoalRow = Tables<'learning_goals'>;
export type LearningSessionRow = Omit<Tables<'learning_sessions'>, 'status'> & { status: SessionStatus };
export type ScheduleEventRow = Omit<Tables<'schedule_events'>, 'day_of_week' | 'event_type' | 'status'> & {
  day_of_week: DayKey;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
};

export interface ScheduleSetupItem {
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

export type ExceptionRow = Tables<'exceptions'>;
export type FamilySettingsRow = Tables<'family_settings'>;
export type AiPlanRow = Tables<'ai_plans'>;
export type SessionTaskRow = Tables<'session_tasks'>;
export type QuickCheckAnswerRow = Tables<'quick_check_answers'>;
export type DeviceCommandRow = Tables<'device_commands'>;
export type ManagedDeviceRow = Tables<'managed_devices'>;
export type DeviceCommandDeliveryRow = Tables<'device_command_deliveries'>;
export type DevicePlatform = 'android' | 'ios';
export interface DevicePairingResult {
  deviceId: string;
  pairingCode: string;
  expiresAt: string;
}
export type ScheduleOccurrenceRow = Tables<'schedule_occurrences'>;
export type ChildMilestoneRow = Tables<'child_milestones'>;
export type NotificationRow = Tables<'notifications'>;
export type SessionEventRow = Tables<'session_events'>;
export interface ServerAppMode {
  appMode: 'parent' | 'child';
  familyId: string | null;
  childProfileId: string | null;
}
export type AppEntryMode = ServerAppMode['appMode'];
export interface SubjectSuggestionRow {
  subject_name: string;
  education_stage: 'primary' | 'lower_secondary' | 'upper_secondary';
  curriculum_group: 'required' | 'elective' | 'optional';
  sort_order: number;
}
export type QuickCheckQuestionRow = Pick<
  Tables<'quick_check_questions'>,
  'id' | 'family_id' | 'subject' | 'prompt' | 'options' | 'active' | 'sort_order' | 'created_at' | 'updated_at'
>;

export interface SessionCursor {
  startsAt: string;
  id: string;
}
export interface SessionPageInfo {
  hasMore: boolean;
  cursor: SessionCursor | null;
}
export interface FamilyData {
  parent: ProfileRow;
  child: ProfileRow;
  goals: LearningGoalRow[];
  sessions: LearningSessionRow[];
  schedule: ScheduleEventRow[];
  scheduleVersion: string;
  occurrences: ScheduleOccurrenceRow[];
  exceptions: ExceptionRow[];
  settings: FamilySettingsRow | null;
  aiPlan: AiPlanRow | null;
  tasks: SessionTaskRow[];
  questions: QuickCheckQuestionRow[];
  answers: QuickCheckAnswerRow[];
  deviceCommands: DeviceCommandRow[];
  managedDevices: ManagedDeviceRow[];
  deviceCommandDeliveries: DeviceCommandDeliveryRow[];
  milestones: ChildMilestoneRow[];
  notifications: NotificationRow[];
  sessionEvents: SessionEventRow[];
  subjectSuggestions: SubjectSuggestionRow[];
  sessionPage: SessionPageInfo;
}
export interface SessionHistoryPage {
  sessions: LearningSessionRow[];
  tasks: SessionTaskRow[];
  answers: QuickCheckAnswerRow[];
  sessionEvents: SessionEventRow[];
  page: SessionPageInfo;
}
