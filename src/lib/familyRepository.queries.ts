import { APP_CONFIG } from '../config/appConfig';
import { sortScheduleEvents } from '../domain/schedulePolicy';
import { addLocalDays, formatLocalDateKey, startOfWeek } from './date';
import type { FamilyContext } from './familyIdentity';
import { dispatchPendingDeviceCommands } from './familyRepository.mutations';
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
  SubjectSuggestionRow,
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

export async function loadFamilyData(ctx: FamilyContext): Promise<FamilyData> {
  assertValidContext(ctx);
  const occurrenceStart = startOfWeek();
  const occurrenceEnd = addLocalDays(occurrenceStart, APP_CONFIG.occurrenceHorizonDays);
  const currentDayEnd = new Date();
  currentDayEnd.setHours(23, 59, 59, 999);
  const [
    familyMembersResult,
    profilesResult,
    goalsResult,
    sessionsResult,
    scheduleResult,
    occurrencesResult,
    exceptionsResult,
    settingsResult,
    aiPlanResult,
    questionsResult,
    commandsResult,
    managedDevicesResult,
    commandDeliveriesResult,
    milestonesResult,
    notificationsResult,
    subjectSuggestionsResult,
  ] = await Promise.all([
    supabase.from('family_members').select('profile_id, role, status').eq('family_id', ctx.familyId),
    supabase.from('profiles').select('id, full_name, avatar_url, role, grade_level, experience_points').in('id', [ctx.parentProfileId, ctx.childProfileId]),
    supabase.from('learning_goals').select('*').eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId).order('created_at'),
    supabase.from('learning_sessions').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .lte('starts_at', currentDayEnd.toISOString())
      .order('starts_at', { ascending: false }).order('id', { ascending: false })
      .limit(APP_CONFIG.sessionPageSize + 1),
    supabase.from('schedule_events').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .order('day_of_week').order('start_time').order('sort_order'),
    supabase.from('schedule_occurrences').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .gte('occurrence_date', formatLocalDateKey(occurrenceStart))
      .lte('occurrence_date', formatLocalDateKey(occurrenceEnd))
      .order('starts_at').limit(APP_CONFIG.occurrenceQueryLimit),
    supabase.from('exceptions').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .order('created_at', { ascending: false }).limit(APP_CONFIG.exceptionPageSize),
    supabase.from('family_settings').select('*').eq('family_id', ctx.familyId).maybeSingle(),
    supabase.from('ai_plans').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('quick_check_questions')
      .select('id, family_id, subject, prompt, options, active, sort_order, created_at, updated_at')
      .eq('family_id', ctx.familyId).eq('active', true).order('sort_order'),
    supabase.from('device_commands').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .order('created_at', { ascending: false }).limit(APP_CONFIG.deviceCommandPageSize),
    supabase.from('managed_devices').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .order('created_at', { ascending: false }),
    supabase.from('device_command_deliveries').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .order('created_at', { ascending: false }).limit(APP_CONFIG.deviceDeliveryPageSize),
    supabase.from('child_milestones').select('*')
      .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
      .order('created_at', { ascending: false }).limit(APP_CONFIG.milestonePageSize),
    supabase.from('notifications').select('*')
      .eq('family_id', ctx.familyId).eq('recipient_id', ctx.parentProfileId)
      .order('created_at', { ascending: false }).limit(APP_CONFIG.notificationPageSize),
    supabase.rpc('get_subject_suggestions', { p_child_profile_id: ctx.childProfileId }),
  ]);

  const results = [
    ['Không tải được liên kết tài khoản', familyMembersResult.error],
    ['Không tải được hồ sơ', profilesResult.error],
    ['Không tải được mục tiêu', goalsResult.error],
    ['Không tải được buổi học', sessionsResult.error],
    ['Không tải được lịch học', scheduleResult.error],
    ['Không tải được lần xuất hiện của lịch', occurrencesResult.error],
    ['Không tải được ngoại lệ', exceptionsResult.error],
    ['Không tải được cài đặt', settingsResult.error],
    ['Không tải được kế hoạch', aiPlanResult.error],
    ['Không tải được câu hỏi', questionsResult.error],
    ['Không tải được lệnh thiết bị', commandsResult.error],
    ['Không tải được thiết bị đã ghép', managedDevicesResult.error],
    ['Không tải được trạng thái nhận lệnh', commandDeliveriesResult.error],
    ['Không tải được cột mốc', milestonesResult.error],
    ['Không tải được thông báo', notificationsResult.error],
    ['Không tải được gợi ý môn học', subjectSuggestionsResult.error],
  ] as const;
  for (const [action, error] of results) throwIfSupabaseError(error, action);

  const members = familyMembersResult.data ?? [];
  const parentMember = members.find((member) =>
    member.profile_id === ctx.parentProfileId && member.role === 'parent' && member.status === 'active');
  const childMember = members.find((member) =>
    member.profile_id === ctx.childProfileId && member.role === 'child' && member.status === 'active');
  if (!parentMember || !childMember) throw new Error('Tài khoản không có quyền truy cập hồ sơ của bé này.');
  const profiles = profilesResult.data ?? [];
  const parentProfile = profiles.find((profile) => profile.id === ctx.parentProfileId);
  const childProfile = profiles.find((profile) => profile.id === ctx.childProfileId);
  if (!parentProfile || !childProfile) throw new Error('Không tìm thấy hồ sơ phụ huynh hoặc trẻ.');

  const sessionRows = (sessionsResult.data ?? []) as LearningSessionRow[];
  const hasMoreSessions = sessionRows.length > APP_CONFIG.sessionPageSize;
  const sessions = sessionRows.slice(0, APP_CONFIG.sessionPageSize);
  const { tasks, answers, sessionEvents } = await loadSessionDetails(sessions);
  const data: FamilyData = {
    parent: parentProfile,
    child: childProfile,
    goals: goalsResult.data ?? [],
    sessions,
    schedule: sortScheduleEvents((scheduleResult.data ?? []) as ScheduleEventRow[]),
    occurrences: occurrencesResult.data ?? [],
    exceptions: exceptionsResult.data ?? [],
    settings: settingsResult.data,
    aiPlan: aiPlanResult.data,
    tasks,
    questions: questionsResult.data ?? [],
    answers,
    deviceCommands: commandsResult.data ?? [],
    managedDevices: managedDevicesResult.data ?? [],
    deviceCommandDeliveries: commandDeliveriesResult.data ?? [],
    milestones: milestonesResult.data ?? [],
    notifications: notificationsResult.data ?? [],
    sessionEvents,
    subjectSuggestions: (subjectSuggestionsResult.data ?? []) as SubjectSuggestionRow[],
    sessionPage: {
      hasMore: hasMoreSessions,
      cursor: sessions.length > 0
        ? { startsAt: sessions.at(-1)!.starts_at, id: sessions.at(-1)!.id }
        : null,
    },
  };
  void dispatchPendingDeviceCommands(data.deviceCommands);
  return data;
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
  const invalidate = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(onChange, APP_CONFIG.realtimeDebounceMs);
  };
  try {
    const channel = supabase.channel(`child-${ctx.childProfileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'learning_sessions', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_events', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_occurrences', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'learning_goals', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exceptions', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'device_commands', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'managed_devices', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'device_command_deliveries', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_plans', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'child_milestones', filter: childFilter }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${ctx.parentProfileId}` }, invalidate)
      .subscribe();
    return () => {
      window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  } catch {
    return () => window.clearTimeout(debounceTimer);
  }
}
