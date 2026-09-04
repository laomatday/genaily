import { APP_CONFIG } from '../config/appConfig';
import { deviceAdapter } from '../domain/adapters';
import { parseSmartWeekOutput } from '../domain/plannerService';
import { normalizeScheduleOrder, validateScheduleSetup } from '../domain/schedulePolicy';
import { assertTransition } from '../domain/stateMachine';
import type { Json } from './database.types';
import { isUuid, type FamilyContext } from './familyIdentity';
import { assertValidContext, getLocalCacheKey, throwIfSupabaseError } from './familyRepository.shared';
import type {
  AppEntryMode,
  AiPlanRow,
  DeviceCommandRow,
  DevicePairingResult,
  DevicePlatform,
  LearningSessionRow,
  ScheduleSetupItem,
  ServerAppMode,
} from './familyRepository.types';
import { supabase } from './supabase';

export async function updateChildProfile(ctx: FamilyContext, childName: string, gradeLevel: number): Promise<void> {
  assertValidContext(ctx);
  const { error } = await supabase.rpc('update_child_profile_details', {
    p_child_profile_id: ctx.childProfileId,
    p_child_name: childName.trim(),
    p_grade_level: gradeLevel,
  });
  throwIfSupabaseError(error, 'Không cập nhật được hồ sơ của bé');
}

const CHILD_AVATAR_BUCKET = 'child-avatars';
const CHILD_AVATAR_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function isOwnedChildAvatarPath(ctx: FamilyContext, path: string | null): path is string {
  return Boolean(path?.startsWith(`${ctx.familyId}/${ctx.childProfileId}/`));
}

export async function getChildAvatarSignedUrl(path: string): Promise<string> {
  if (/^https:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage
    .from(CHILD_AVATAR_BUCKET)
    .createSignedUrl(path, APP_CONFIG.childAvatarSignedUrlSeconds);
  throwIfSupabaseError(error, 'Không tải được ảnh đại diện');
  if (!data?.signedUrl) throw new Error('Supabase không trả về ảnh đại diện.');
  return data.signedUrl;
}

export async function uploadChildAvatar(ctx: FamilyContext, file: File): Promise<string> {
  assertValidContext(ctx);
  const extension = CHILD_AVATAR_TYPES.get(file.type);
  if (!extension) throw new Error('Ảnh đại diện phải là JPEG, PNG hoặc WebP.');
  if (file.size <= 0 || file.size > APP_CONFIG.childAvatarMaxBytes) {
    throw new Error(`Ảnh đại diện không được vượt quá ${Math.round(APP_CONFIG.childAvatarMaxBytes / 1024 / 1024)} MB.`);
  }

  const path = `${ctx.familyId}/${ctx.childProfileId}/${crypto.randomUUID()}.${extension}`;
  const upload = await supabase.storage
    .from(CHILD_AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  throwIfSupabaseError(upload.error, 'Không tải được ảnh đại diện');

  const update = await supabase.rpc('update_child_avatar', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_avatar_path: path,
  });
  if (update.error) {
    await supabase.storage.from(CHILD_AVATAR_BUCKET).remove([path]);
    throwIfSupabaseError(update.error, 'Không gắn được ảnh vào hồ sơ bé');
  }

  if (isOwnedChildAvatarPath(ctx, update.data) && update.data !== path) {
    await supabase.storage.from(CHILD_AVATAR_BUCKET).remove([update.data]);
  }
  return path;
}

export async function removeChildAvatar(ctx: FamilyContext): Promise<void> {
  assertValidContext(ctx);
  const { data: previousPath, error } = await supabase.rpc('update_child_avatar', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_avatar_path: null,
  });
  throwIfSupabaseError(error, 'Không xóa được ảnh đại diện');
  if (isOwnedChildAvatarPath(ctx, previousPath)) {
    await supabase.storage.from(CHILD_AVATAR_BUCKET).remove([previousPath]);
  }
}

export async function enterChildMode(ctx: FamilyContext): Promise<void> {
  assertValidContext(ctx);
  const { data, error } = await supabase.rpc('enter_child_mode', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
  });
  throwIfSupabaseError(error, 'Không khóa được chế độ trẻ');
  if (!data) throw new Error('Máy chủ không xác nhận chế độ trẻ.');
}

export async function completeAppOnboarding(
  mode: AppEntryMode,
  ctx?: FamilyContext,
): Promise<ServerAppMode> {
  if (mode === 'child') {
    if (!ctx) throw new Error('Hãy chọn hồ sơ của bé trước.');
    assertValidContext(ctx);
  }
  const { data, error } = await supabase.rpc('complete_app_onboarding', {
    p_mode: mode,
    p_family_id: mode === 'child' ? ctx!.familyId : null,
    p_child_profile_id: mode === 'child' ? ctx!.childProfileId : null,
  });
  throwIfSupabaseError(error, 'Không lưu được lựa chọn chế độ');
  const selected = data?.[0];
  if (!selected || (selected.app_mode !== 'parent' && selected.app_mode !== 'child')) {
    throw new Error('Máy chủ không xác nhận lựa chọn chế độ.');
  }
  return {
    appMode: selected.app_mode,
    familyId: selected.family_id,
    childProfileId: selected.child_profile_id,
  };
}

function dispatchCommand(commandId: string | null): void {
  if (!commandId) return;
  // The queue remains authoritative if the Edge Function or provider is down.
  void deviceAdapter.dispatch(commandId).catch(() => undefined);
}

export async function dispatchPendingDeviceCommands(commands: DeviceCommandRow[]): Promise<void> {
  const now = Date.now();
  const due = commands.filter((command) => (
    command.attempt_count < command.max_attempts
    && (
      (['queued', 'failed', 'configuration_required'].includes(command.status)
        && new Date(command.next_attempt_at).getTime() <= now)
      || (command.status === 'processing'
        && command.last_attempt_at !== null
        && new Date(command.last_attempt_at).getTime() + APP_CONFIG.deviceClaimLeaseMs <= now)
    )
  ));
  await Promise.allSettled(due.map((command) => deviceAdapter.dispatch(command.id)));
}

export async function createDevicePairing(
  ctx: FamilyContext,
  displayName: string,
  platform: DevicePlatform,
): Promise<DevicePairingResult> {
  assertValidContext(ctx);
  const normalizedName = displayName.trim();
  if (!normalizedName || normalizedName.length > 80) throw new Error('Tên thiết bị không hợp lệ.');
  if (platform !== 'android' && platform !== 'ios') throw new Error('Nền tảng thiết bị không hợp lệ.');
  const { data, error } = await supabase.rpc('create_device_pairing', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_display_name: normalizedName,
    p_platform: platform,
    p_policy: null,
  });
  throwIfSupabaseError(error, 'Không tạo được mã ghép thiết bị');
  const pairing = data?.[0];
  if (!pairing) throw new Error('Máy chủ không trả về mã ghép thiết bị.');
  return {
    deviceId: pairing.device_id,
    pairingCode: pairing.pairing_code,
    expiresAt: pairing.expires_at,
  };
}

export async function revokeManagedDevice(deviceId: string): Promise<void> {
  if (!isUuid(deviceId)) throw new Error('Thiết bị không hợp lệ.');
  const { data, error } = await supabase.rpc('revoke_managed_device', { p_device_id: deviceId });
  throwIfSupabaseError(error, 'Không thu hồi được thiết bị');
  if (!data) throw new Error('Thiết bị không tồn tại hoặc đã được thu hồi.');
}

export async function startLearningSession(session: LearningSessionRow): Promise<void> {
  assertTransition(session.status, 'in_progress');
  const { data, error } = await supabase.rpc('start_learning_session', { p_session_id: session.id });
  throwIfSupabaseError(error, 'Không bắt đầu được buổi học');
  dispatchCommand(data);
}
export async function requestSessionBreak(session: LearningSessionRow, minutes = 10): Promise<void> {
  if (session.status !== 'in_progress') throw new Error('Chỉ có thể xin nghỉ khi buổi học đang diễn ra.');
  const { error } = await supabase.rpc('request_session_break', {
    p_session_id: session.id,
    p_minutes: minutes,
  });
  throwIfSupabaseError(error, 'Không gửi được yêu cầu nghỉ');
}

export async function saveSessionNote(session: LearningSessionRow, note: string): Promise<void> {
  if (session.status !== 'in_progress') throw new Error('Chỉ có thể ghi chú khi buổi học đang diễn ra.');
  const { error } = await supabase.rpc('save_session_note', {
    p_session_id: session.id,
    p_note: note.trim(),
  });
  throwIfSupabaseError(error, 'Không lưu được ghi chú');
}

export async function sendParentMessage(ctx: FamilyContext, message: string): Promise<void> {
  assertValidContext(ctx);
  const normalized = message.trim();
  if (!normalized) throw new Error('Tin nhắn không được để trống.');
  const { error } = await supabase.rpc('send_parent_message', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_message: normalized,
  });
  throwIfSupabaseError(error, 'Không gửi được tin nhắn cho phụ huynh');
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  if (!isUuid(notificationId)) throw new Error('Thông báo không hợp lệ.');
  const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: notificationId });
  throwIfSupabaseError(error, 'Không cập nhật được thông báo');
}

export interface ChildMilestoneInput {
  title: string;
  description: string;
  targetPoints: number;
}

export async function saveChildMilestone(ctx: FamilyContext, input: ChildMilestoneInput): Promise<void> {
  assertValidContext(ctx);
  if (!input.title.trim()) throw new Error('Tên phần thưởng không được để trống.');
  if (!Number.isInteger(input.targetPoints) || input.targetPoints < 1) throw new Error('Mục tiêu điểm không hợp lệ.');
  const { error } = await supabase.rpc('save_child_milestone', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_target_points: input.targetPoints,
  });
  throwIfSupabaseError(error, 'Không lưu được phần thưởng');
}

export async function redeemChildMilestone(milestoneId: string): Promise<void> {
  if (!isUuid(milestoneId)) throw new Error('Cột mốc không hợp lệ.');
  const { error } = await supabase.rpc('redeem_child_milestone', { p_milestone_id: milestoneId });
  throwIfSupabaseError(error, 'Không nhận được phần thưởng');
}

export interface TaskAnswerInput { id: string; is_done: boolean }
export interface QuickCheckAnswerInput { question_id: string; selected_option: number }
export interface SubmitSessionInput {
  session: LearningSessionRow;
  reflection: 'easy' | 'ok' | 'hard';
  durationMinutes: number;
  tasks: TaskAnswerInput[];
  answers: QuickCheckAnswerInput[];
}
export async function submitLearningSession(input: SubmitSessionInput): Promise<void> {
  const { data, error } = await supabase.rpc('submit_learning_session', {
    p_session_id: input.session.id,
    p_reflection: input.reflection,
    p_duration_minutes: input.durationMinutes,
    p_tasks: input.tasks as unknown as Json,
    p_answers: input.answers as unknown as Json,
  });
  throwIfSupabaseError(error, 'Không nộp được buổi học');
  dispatchCommand(data?.[0]?.device_command_id ?? null);
}
export async function approveLearningSession(session: LearningSessionRow): Promise<void> {
  const { data, error } = await supabase.rpc('approve_learning_session', { p_session_id: session.id });
  throwIfSupabaseError(error, 'Không duyệt được buổi học');
  dispatchCommand(data);
}

export async function uploadSessionEvidence(
  ctx: FamilyContext,
  sessionId: string,
  file: File,
): Promise<string> {
  assertValidContext(ctx);
  if (!isUuid(sessionId)) throw new Error('Buổi học không hợp lệ.');
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('Ảnh phải là JPEG, PNG hoặc WebP.');
  if (file.size > APP_CONFIG.evidenceMaxBytes) throw new Error('Ảnh vượt quá dung lượng cho phép.');
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${ctx.familyId}/${sessionId}/${crypto.randomUUID()}.${extension}`;
  const uploadResult = await supabase.storage
    .from('learning-evidence').upload(path, file, { contentType: file.type, upsert: false });
  throwIfSupabaseError(uploadResult.error, 'Không tải được ảnh minh chứng');
  const attachResult = await supabase.rpc('attach_session_evidence', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_session_id: sessionId,
    p_evidence_path: path,
  });
  if (attachResult.error) {
    await supabase.storage.from('learning-evidence').remove([path]);
    throwIfSupabaseError(attachResult.error, 'Không gắn được ảnh vào buổi học');
  }
  return path;
}
export async function getEvidenceSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('learning-evidence').createSignedUrl(path, APP_CONFIG.evidenceSignedUrlSeconds);
  throwIfSupabaseError(error, 'Không tạo được liên kết ảnh minh chứng');
  if (!data?.signedUrl) throw new Error('Supabase không trả về liên kết ảnh minh chứng.');
  return data.signedUrl;
}

export async function createLearningGoal(ctx: FamilyContext, subject: string, targetMinutes: number): Promise<void> {
  assertValidContext(ctx);
  if (!subject.trim()) throw new Error('Tên môn học không được để trống.');
  if (!Number.isInteger(targetMinutes) || targetMinutes < 5) throw new Error('Mục tiêu phải từ 5 phút.');
  const { error } = await supabase.rpc('create_learning_goal', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_subject: subject.trim(),
    p_target_minutes: targetMinutes,
  });
  throwIfSupabaseError(error, 'Không tạo được mục tiêu học tập');
}
export interface CreateExceptionInput {
  exceptionType: 'sick' | 'trip' | 'event' | 'other';
  startDate: string;
  endDate: string;
  reason: string;
}
export async function createException(ctx: FamilyContext, input: CreateExceptionInput): Promise<void> {
  assertValidContext(ctx);
  if (!input.reason.trim()) throw new Error('Lý do ngoại lệ không được để trống.');
  const { error } = await supabase.rpc('create_child_exception', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_title: `Ngoại lệ: ${input.exceptionType}`,
    p_description: input.reason.trim(),
    p_recommended_action: `Nghỉ học từ ${input.startDate} đến ${input.endDate}`,
    p_severity: 'low',
  });
  throwIfSupabaseError(error, 'Không tạo được ngoại lệ');
}

export async function saveScheduleSetup(
  ctx: FamilyContext,
  events: ScheduleSetupItem[],
  expectedVersion: string,
): Promise<void> {
  assertValidContext(ctx);
  validateScheduleSetup(events);
  if (!/^[0-9a-f]{32}$/.test(expectedVersion)) {
    throw new Error('Phiên bản lịch không hợp lệ. Vui lòng tải lại.');
  }
  const { error } = await supabase.rpc('save_schedule_setup_v2', {
    p_family_id: ctx.familyId,
    p_child_profile_id: ctx.childProfileId,
    p_events: normalizeScheduleOrder(events) as unknown as Json,
    p_expected_version: expectedVersion,
  });
  if (error?.message.includes('SCHEDULE_VERSION_CONFLICT')) {
    throw new Error('Lịch vừa được thay đổi ở nơi khác. Dữ liệu mới đã được tải lại; hãy kiểm tra rồi lưu lại.');
  }
  throwIfSupabaseError(error, 'Không lưu được lịch hoạt động');
}
interface GeneratePlanResponse { plan: AiPlanRow }
export async function generateSmartWeek(ctx: FamilyContext): Promise<void> {
  assertValidContext(ctx);
  const { data, error } = await supabase.functions.invoke<GeneratePlanResponse>('generate-week-plan', {
    body: { family_id: ctx.familyId, child_profile_id: ctx.childProfileId },
  });
  throwIfSupabaseError(error, 'Không tạo được kế hoạch tuần');
  if (!data?.plan) throw new Error('AI không trả về kế hoạch tuần.');
}
export async function applySmartWeek(plan: AiPlanRow): Promise<void> {
  const parsed = parseSmartWeekOutput(plan.output_json);
  if (parsed.schedule_updates.length === 0) throw new Error('Kế hoạch chưa có thay đổi lịch để áp dụng.');
  const { error } = await supabase.rpc('apply_week_plan', {
    p_plan_id: plan.id,
    p_events: parsed.schedule_updates as unknown as Json,
  });
  throwIfSupabaseError(error, 'Không áp dụng được kế hoạch tuần');
}

export async function clearChildData(ctx: FamilyContext): Promise<void> {
  assertValidContext(ctx);
  const evidenceResult = await supabase.from('learning_sessions').select('evidence_url')
    .eq('family_id', ctx.familyId).eq('child_profile_id', ctx.childProfileId)
    .not('evidence_url', 'is', null);
  throwIfSupabaseError(evidenceResult.error, 'Không tải được danh sách ảnh minh chứng');
  const evidencePaths = (evidenceResult.data ?? [])
    .map((session) => session.evidence_url)
    .filter((path): path is string => Boolean(path));
  if (evidencePaths.length > 0) {
    const removeResult = await supabase.storage.from('learning-evidence').remove(evidencePaths);
    throwIfSupabaseError(removeResult.error, 'Không xóa được ảnh minh chứng');
  }
  const { error } = await supabase.rpc('clear_child_data', { p_child_profile_id: ctx.childProfileId });
  throwIfSupabaseError(error, 'Không xóa được dữ liệu của bé');
  const resetResult = await supabase.rpc('reset_child_engagement', { p_child_profile_id: ctx.childProfileId });
  throwIfSupabaseError(resetResult.error, 'Không đặt lại được điểm và phần thưởng của bé');
  if (typeof window !== 'undefined') localStorage.removeItem(getLocalCacheKey(ctx));
}
