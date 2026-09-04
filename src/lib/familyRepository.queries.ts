import { APP_CONFIG } from '../config/appConfig';
import { sortScheduleEvents } from '../domain/schedulePolicy';
import { addLocalDays, formatLocalDateKey, startOfWeek } from './date';
import type { Json } from './database.types';
import type { FamilyContext } from './familyIdentity';
import { assertValidContext, throwIfSupabaseError } from './familyRepository.shared';
import type {
  FamilyData,
  LearningSessionRow,
  QuickCheckAnswerRow,
  ScheduleEventRow,
  ServerAppMode,
  SessionCursor,
  SessionEventRow,
  SessionHistoryPage,
  SessionTaskRow,
} from './familyRepository.types';
import { supabase } from './supabase';

export async function getServerAppMode(): Promise<ServerAppMode> {
  const { data, error } = await supabase.rpc('get_app_mode');
  throwIfSupabaseError(error, 'Không xác minh được chế độ ứng dụng');
  const mode = data?.[0];
  if (!mode || (mode.app_mode !== 'parent' && mode.app_mode !== 'child')) {
    throw new Error('Máy chủ trả về chế độ ứng dụng không hợp lệ.');
  }
  return {
    appMode: mode.app_mode,
    familyId: mode.family_id,
    childProfileId: mode.child_profile_id,
  };
}

export async function getAppOnboardingStatus(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_app_onboarding_status');
  throwIfSupabaseError(error, 'Không kiểm tra được thiết lập ban đầu');
  if (typeof data !== 'boolean') {
    throw new Error('Máy chủ trả về trạng thái thiết lập không hợp lệ.');
  }
  return data;
}

async function loadSessionDetails(sessions: LearningSessionRow[]): Promise<{
  tasks: SessionTaskRow[];
  answers: QuickCheckAnswerRow[];
  sessionEvents: SessionEventRow[];
}> {
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length === 0) return { tasks: [], answers: [], sessionEvents: [] };
  const [tasksResult, answersResult, eventsResult] = await Promise.all([
    supabase.from('session_tasks').select('*').in('session_id', sessionIds).order('sort_order'),
    supabase.from('quick_check_answers').select('*').in('session_id', sessionIds),
    supabase.from('session_events').select('*').in('session_id', sessionIds).order('event_time'),
  ]);
  throwIfSupabaseError(tasksResult.error, 'Không tải được nhiệm vụ trong lịch sử');
  throwIfSupabaseError(answersResult.error, 'Không tải được đáp án trong lịch sử');
  throwIfSupabaseError(eventsResult.error, 'Không tải được hoạt động của buổi học');
  return { tasks: tasksResult.data ?? [], answers: answersResult.data ?? [], sessionEvents: eventsResult.data ?? [] };
}

interface DashboardSnapshot {
  family_members: Array<{ profile_id: string; role: string; status: string }>;
  profiles: Array<FamilyData['parent']>;
  learning_goals: FamilyData['goals'];
  learning_sessions: FamilyData['sessions'];
  schedule_events: FamilyData['schedule'];
  schedule_version: string;
  schedule_occurrences: FamilyData['occurrences'];
  exceptions: FamilyData['exceptions'];
  family_settings: FamilyData['settings'];
  ai_plan: FamilyData['aiPlan'];
  quick_check_questions: FamilyData['questions'];
  device_commands: FamilyData['deviceCommands'];
  managed_devices: FamilyData['managedDevices'];
  device_command_deliveries: FamilyData['deviceCommandDeliveries'];
  child_milestones: FamilyData['milestones'];
  notifications: FamilyData['notifications'];
  session_tasks: FamilyData['tasks'];
  quick_check_answers: FamilyData['answers'];
  session_events: FamilyData['sessionEvents'];
  subject_suggestions: FamilyData['subjectSuggestions'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function snapshotArray<T>(snapshot: Record<string, unknown>, key: string): T[] {
  const value = snapshot[key];
  if (!Array.isArray(value)) throw new Error(`Máy chủ trả về snapshot thiếu trường ${key}.`);
  return value as T[];
}

export function parseDashboardSnapshot(value: Json | null, ctx: FamilyContext): FamilyData {
  if (!isRecord(value)) throw new Error('Máy chủ không trả về snapshot dashboard hợp lệ.');
  if (typeof value.schedule_version !== 'string'
      || !/^[0-9a-f]{32}$/.test(value.schedule_version)) {
    throw new Error('Máy chủ trả về phiên bản lịch không hợp lệ.');
  }
  const snapshot: DashboardSnapshot = {
    family_members: snapshotArray(value, 'family_members'),
    profiles: snapshotArray(value, 'profiles'),
    learning_goals: snapshotArray(value, 'learning_goals'),
    learning_sessions: snapshotArray(value, 'learning_sessions'),
    schedule_events: snapshotArray(value, 'schedule_events'),
    schedule_version: value.schedule_version,
    schedule_occurrences: snapshotArray(value, 'schedule_occurrences'),
    exceptions: snapshotArray(value, 'exceptions'),
    family_settings: isRecord(value.family_settings)
      ? value.family_settings as unknown as FamilyData['settings']
      : null,
    ai_plan: isRecord(value.ai_plan) ? value.ai_plan as unknown as FamilyData['aiPlan'] : null,
    quick_check_questions: snapshotArray(value, 'quick_check_questions'),
    device_commands: snapshotArray(value, 'device_commands'),
    managed_devices: snapshotArray(value, 'managed_devices'),
    device_command_deliveries: snapshotArray(value, 'device_command_deliveries'),
    child_milestones: snapshotArray(value, 'child_milestones'),
    notifications: snapshotArray(value, 'notifications'),
    session_tasks: snapshotArray(value, 'session_tasks'),
    quick_check_answers: snapshotArray(value, 'quick_check_answers'),
    session_events: snapshotArray(value, 'session_events'),
    subject_suggestions: snapshotArray(value, 'subject_suggestions'),
  };

  const parentMember = snapshot.family_members.find((member) => (
    member.profile_id === ctx.parentProfileId && member.role === 'parent' && member.status === 'active'
  ));
  const childMember = snapshot.family_members.find((member) => (
    member.profile_id === ctx.childProfileId && member.role === 'child' && member.status === 'active'
  ));
  if (!parentMember || !childMember) throw new Error('Tài khoản không có quyền truy cập hồ sơ của bé này.');

  const parentProfile = snapshot.profiles.find((profile) => profile.id === ctx.parentProfileId);
  const childProfile = snapshot.profiles.find((profile) => profile.id === ctx.childProfileId);
  if (!parentProfile || !childProfile) throw new Error('Không tìm thấy hồ sơ phụ huynh hoặc trẻ.');

  const hasMoreSessions = snapshot.learning_sessions.length > APP_CONFIG.sessionPageSize;
  const historySessions = snapshot.learning_sessions.slice(0, APP_CONFIG.sessionPageSize);
  const sessions = [...historySessions];
  const sessionIds = new Set(sessions.map((session) => session.id));
  for (const session of snapshot.learning_sessions) {
    if ((session.status === 'in_progress' || session.status === 'awaiting_parent')
        && !sessionIds.has(session.id)) {
      sessions.push(session);
      sessionIds.add(session.id);
    }
  }
  sessions.sort((left, right) => (
    right.starts_at.localeCompare(left.starts_at) || right.id.localeCompare(left.id)
  ));
  return {
    parent: parentProfile,
    child: childProfile,
    goals: snapshot.learning_goals,
    sessions,
    schedule: sortScheduleEvents(snapshot.schedule_events as ScheduleEventRow[]),
    scheduleVersion: snapshot.schedule_version,
    occurrences: snapshot.schedule_occurrences,
    exceptions: snapshot.exceptions,
    settings: snapshot.family_settings,
    aiPlan: snapshot.ai_plan,
    tasks: snapshot.session_tasks,
    questions: snapshot.quick_check_questions,
    answers: snapshot.quick_check_answers,
    deviceCommands: snapshot.device_commands,
    managedDevices: snapshot.managed_devices,
    deviceCommandDeliveries: snapshot.device_command_deliveries,
    milestones: snapshot.child_milestones,
    notifications: snapshot.notifications,
    sessionEvents: snapshot.session_events,
    subjectSuggestions: snapshot.subject_suggestions,
    sessionPage: {
      hasMore: hasMoreSessions,
      cursor: historySessions.length > 0
        ? { startsAt: historySessions.at(-1)!.starts_at, id: historySessions.at(-1)!.id }
        : null,
    },
  };
}

export async function loadFamilyData(ctx: FamilyContext): Promise<FamilyData> {
  assertValidContext(ctx);
  const occurrenceStart = startOfWeek();
  const occurrenceEnd = addLocalDays(occurrenceStart, APP_CONFIG.occurrenceHorizonDays);
  const currentDayEnd = new Date();
  currentDayEnd.setHours(23, 59, 59, 999);
  const { data, error } = await supabase.rpc('get_child_dashboard_snapshot', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_session_end: currentDayEnd.toISOString(),
    p_occurrence_start: formatLocalDateKey(occurrenceStart),
    p_occurrence_end: formatLocalDateKey(occurrenceEnd),
    p_session_limit: APP_CONFIG.sessionPageSize + 1,
    p_occurrence_limit: APP_CONFIG.occurrenceQueryLimit,
    p_exception_limit: APP_CONFIG.exceptionPageSize,
    p_device_command_limit: APP_CONFIG.deviceCommandPageSize,
    p_device_delivery_limit: APP_CONFIG.deviceDeliveryPageSize,
    p_milestone_limit: APP_CONFIG.milestonePageSize,
    p_notification_limit: APP_CONFIG.notificationPageSize,
  });
  throwIfSupabaseError(error, 'Không tải được snapshot dashboard');
  return parseDashboardSnapshot(data, ctx);
}

export async function loadMoreSessionHistory(
  ctx: FamilyContext,
  cursor: SessionCursor,
): Promise<SessionHistoryPage> {
  assertValidContext(ctx);
  const base = () => supabase.from('learning_sessions').select('*')
    .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
    .order('starts_at', { ascending: false }).order('id', { ascending: false })
    .limit(APP_CONFIG.sessionPageSize + 1);
  const [sameTimeResult, olderResult] = await Promise.all([
    base().eq('starts_at', cursor.startsAt).lt('id', cursor.id),
    base().lt('starts_at', cursor.startsAt),
  ]);
  throwIfSupabaseError(sameTimeResult.error, 'Không tải được phần tiếp theo của lịch sử');
  throwIfSupabaseError(olderResult.error, 'Không tải được phần tiếp theo của lịch sử');
  const combined = [
    ...((sameTimeResult.data ?? []) as LearningSessionRow[]),
    ...((olderResult.data ?? []) as LearningSessionRow[]),
  ].sort((left, right) => (
    right.starts_at.localeCompare(left.starts_at) || right.id.localeCompare(left.id)
  ));
  const hasMore = combined.length > APP_CONFIG.sessionPageSize;
  const sessions = combined.slice(0, APP_CONFIG.sessionPageSize);
  const { tasks, answers, sessionEvents } = await loadSessionDetails(sessions);
  const last = sessions.at(-1);
  return {
    sessions,
    tasks,
    answers,
    sessionEvents,
    page: { hasMore, cursor: last ? { startsAt: last.starts_at, id: last.id } : null },
  };
}

export function subscribeToChildChanges(ctx: FamilyContext, onChange: () => void): () => void {
  const childFilter = `child_profile_id=eq.${ctx.childProfileId}`;
  let debounceTimer: number | undefined;
  let pollTimer: number | undefined;
  let stopped = false;
  const invalidate = () => {
    if (stopped || document.visibilityState === 'hidden') return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(onChange, APP_CONFIG.realtimeDebounceMs);
  };

  const startPolling = () => {
    if (pollTimer !== undefined || stopped) return;
    pollTimer = window.setInterval(invalidate, APP_CONFIG.realtimeFallbackPollMs);
  };
  const stopPolling = () => {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') invalidate();
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (!APP_CONFIG.realtimeEnabled) {
    startPolling();
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(debounceTimer);
      stopPolling();
    };
  }

  try {
    const channel = supabase.channel(`child-${ctx.childProfileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'learning_sessions', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_events', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_occurrences', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'learning_goals', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exceptions', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'device_commands', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'device_command_deliveries', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_plans', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'child_milestones', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${ctx.parentProfileId}` }, invalidate)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') stopPolling();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') startPolling();
      });
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(debounceTimer);
      stopPolling();
      void supabase.removeChannel(channel);
    };
  } catch {
    startPolling();
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(debounceTimer);
      stopPolling();
    };
  }
}
