import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applySmartWeek,
  approveLearningSession,
  clearChildData,
  createDevicePairing,
  createLearningGoal,
  generateSmartWeek,
  loadFamilyData,
  loadMoreSessionHistory,
  markNotificationRead,
  redeemChildMilestone,
  requestSessionBreak,
  removeChildAvatar,
  revokeManagedDevice,
  saveChildMilestone,
  saveScheduleSetup,
  saveSessionNote,
  sendParentMessage,
  startLearningSession,
  submitLearningSession,
  subscribeToChildChanges,
  uploadSessionEvidence,
  uploadChildAvatar,
  updateChildProfile,
  type AiPlanRow,
  type FamilyContext,
  type FamilyData,
  type ChildMilestoneInput,
  type DevicePlatform,
  type LearningSessionRow,
  type ScheduleSetupItem,
  type SubmitSessionInput,
} from '../lib/familyRepository';

export type FamilyDataAccessScope = 'parent' | 'child';

export function useFamilyData(context: FamilyContext | null, accessScope: FamilyDataAccessScope) {
  const [data, setData] = useState<FamilyData | null>(null);
  const [loadedAccessScope, setLoadedAccessScope] = useState<FamilyDataAccessScope | null>(null);
  const [loading, setLoading] = useState(Boolean(context));
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    if (!context) {
      requestGeneration.current += 1;
      setData(null);
      setLoading(false);
      return;
    }
    const target = context;
    const targetAccessScope = accessScope;
    const generation = ++requestGeneration.current;
    try {
      const nextData = await loadFamilyData(target);
      if (generation !== requestGeneration.current) return;
      setData(nextData);
      setLoadedAccessScope(targetAccessScope);
      setError(null);
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu Supabase.');
      setData((current) => current?.child.id === target.childProfileId ? current : null);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [accessScope, context]);

  useEffect(() => {
    if (!context) {
      requestGeneration.current += 1;
      setData(null);
      setLoadedAccessScope(null);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      return;
    }
    setLoading(true);
    setData(null);
    void refresh();
    const unsubscribe = subscribeToChildChanges(context, () => void refresh());
    return () => {
      requestGeneration.current += 1;
      unsubscribe();
    };
  }, [accessScope, context, refresh]);

  const loadMore = useCallback(async () => {
    const target = context;
    const cursor = data?.sessionPage.cursor;
    if (!target || !cursor || !data.sessionPage.hasMore || loadingMore) return;
    const generation = requestGeneration.current;
    setLoadingMore(true);
    try {
      const page = await loadMoreSessionHistory(target, cursor);
      if (generation !== requestGeneration.current) return;
      setData((current) => {
        if (!current || current.child.id !== target.childProfileId) return current;
        const knownSessions = new Set(current.sessions.map((session) => session.id));
        const knownTasks = new Set(current.tasks.map((task) => task.id));
        const knownAnswers = new Set(current.answers.map((answer) => answer.id));
        const knownEvents = new Set(current.sessionEvents.map((event) => event.id));
        return {
          ...current,
          sessions: [...current.sessions, ...page.sessions.filter((session) => !knownSessions.has(session.id))],
          tasks: [...current.tasks, ...page.tasks.filter((task) => !knownTasks.has(task.id))],
          answers: [...current.answers, ...page.answers.filter((answer) => !knownAnswers.has(answer.id))],
          sessionEvents: [...current.sessionEvents, ...page.sessionEvents.filter((event) => !knownEvents.has(event.id))],
          sessionPage: page.page,
        };
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải thêm được lịch sử.');
    } finally {
      setLoadingMore(false);
    }
  }, [context, data, loadingMore]);

  const runMutation = useCallback(async <T,>(mutation: () => Promise<T>): Promise<T> => {
    setSaving(true);
    try {
      const result = await mutation();
      await refresh();
      setError(null);
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không lưu được dữ liệu Supabase.';
      setError(message);
      await refresh();
      setError(message);
      throw cause;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  // Effects run after React commits. Guard the public hook value as well so a
  // context switch can never expose the previous child's data for one frame.
  const visibleData = context
    && data?.child.id === context.childProfileId
    && loadedAccessScope === accessScope
    ? data
    : null;
  const visibleLoading = Boolean(context) && (loading || !visibleData);

  return {
    data: visibleData,
    loading: visibleLoading,
    saving,
    error,
    refresh,
    loadMoreSessions: loadMore,
    loadingMore,
    startSession: (session: LearningSessionRow) => runMutation(() => startLearningSession(session)),
    requestBreak: (session: LearningSessionRow, minutes = 10) => runMutation(() => requestSessionBreak(session, minutes)),
    saveNote: (session: LearningSessionRow, note: string) => runMutation(() => saveSessionNote(session, note)),
    sendParentMessage: (message: string) => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(() => sendParentMessage(context, message));
    },
    markNotificationRead: (notificationId: string) => runMutation(() => markNotificationRead(notificationId)),
    saveMilestone: (input: ChildMilestoneInput) => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(() => saveChildMilestone(context, input));
    },
    redeemMilestone: (milestoneId: string) => runMutation(() => redeemChildMilestone(milestoneId)),
    submitSession: (input: SubmitSessionInput) => runMutation(() => submitLearningSession(input)),
    approveSession: (session: LearningSessionRow) => runMutation(() => approveLearningSession(session)),
    addGoal: (subject: string, minutes: number) => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(() => createLearningGoal(context, subject, minutes));
    },
    saveSchedule: (events: ScheduleSetupItem[]) => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(() => saveScheduleSetup(context, events));
    },
    uploadEvidence: (sessionId: string, file: File) => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(() => uploadSessionEvidence(context, sessionId, file));
    },
    generateWeek: () => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(() => generateSmartWeek(context));
    },
    applyWeek: (plan: AiPlanRow) => runMutation(() => applySmartWeek(plan)),
    updateProfile: (childName: string, gradeLevel: number, avatarFile?: File | null, removeAvatar = false) => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(async () => {
        await updateChildProfile(context, childName, gradeLevel);
        if (avatarFile) await uploadChildAvatar(context, avatarFile);
        else if (removeAvatar) await removeChildAvatar(context);
      });
    },
    clearAllData: () => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(() => clearChildData(context));
    },
    createDevicePairing: (displayName: string, platform: DevicePlatform) => {
      if (!context) return Promise.reject(new Error('Chưa chọn bé.'));
      return runMutation(() => createDevicePairing(context, displayName, platform));
    },
    revokeDevice: (deviceId: string) => runMutation(() => revokeManagedDevice(deviceId)),
  };
}
