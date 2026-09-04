import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

interface RefreshFlight {
  key: string;
  promise: Promise<void>;
  queued: boolean;
}

function dataTargetKey(context: FamilyContext | null, accessScope: FamilyDataAccessScope): string | null {
  return context
    ? `${context.familyId}:${context.childProfileId}:${accessScope}`
    : null;
}

export function useFamilyData(context: FamilyContext | null, accessScope: FamilyDataAccessScope) {
  const [data, setData] = useState<FamilyData | null>(null);
  const [loadedAccessScope, setLoadedAccessScope] = useState<FamilyDataAccessScope | null>(null);
  const [loading, setLoading] = useState(Boolean(context));
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const refreshFlight = useRef<RefreshFlight | null>(null);
  const loadMoreGeneration = useRef(0);
  const mutationCounts = useRef(new Map<string, number>());
  const renderedTargetKey = dataTargetKey(context, accessScope);
  const activeTargetKey = useRef(renderedTargetKey);
  // Update at commit time before promise continuations can observe the newly
  // selected child while the passive data-loading effect is still pending.
  useLayoutEffect(() => {
    activeTargetKey.current = renderedTargetKey;
  }, [renderedTargetKey]);

  const refresh = useCallback((): Promise<void> => {
    if (!context) {
      if (activeTargetKey.current !== null) return Promise.resolve();
      requestGeneration.current += 1;
      setData(null);
      setLoading(false);
      return Promise.resolve();
    }
    const target = context;
    const targetAccessScope = accessScope;
    const targetKey = dataTargetKey(target, targetAccessScope);
    // An old runMutation callback must not invalidate the request belonging to
    // the child that is active now.
    if (!targetKey || activeTargetKey.current !== targetKey) return Promise.resolve();

    const activeFlight = refreshFlight.current;
    if (activeFlight?.key === targetKey) {
      // Collapse a burst into the in-flight request plus one trailing refresh.
      // This prevents Realtime/heartbeat events from starting unbounded reads.
      activeFlight.queued = true;
      return activeFlight.promise;
    }

    const flight: RefreshFlight = {
      key: targetKey,
      promise: Promise.resolve(),
      queued: false,
    };
    const execute = async () => {
      do {
        flight.queued = false;
        const generation = ++requestGeneration.current;
        try {
          const nextData = await loadFamilyData(target);
          if (generation === requestGeneration.current && activeTargetKey.current === targetKey) {
            setData(nextData);
            setLoadedAccessScope(targetAccessScope);
            setError(null);
          }
        } catch (cause) {
          if (generation === requestGeneration.current && activeTargetKey.current === targetKey) {
            setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu Supabase.');
            setData((current) => current?.child.id === target.childProfileId ? current : null);
          }
        }
      } while (flight.queued && activeTargetKey.current === targetKey);

      if (activeTargetKey.current === targetKey && refreshFlight.current === flight) {
        setLoading(false);
      }
    };
    flight.promise = execute().finally(() => {
      if (refreshFlight.current === flight) refreshFlight.current = null;
    });
    refreshFlight.current = flight;
    return flight.promise;
  }, [accessScope, context]);

  useEffect(() => {
    loadMoreGeneration.current += 1;
    if (!context) {
      requestGeneration.current += 1;
      setData(null);
      setLoadedAccessScope(null);
      setLoading(false);
      setSaving(false);
      setLoadingMore(false);
      setError(null);
      return;
    }
    setLoading(true);
    setSaving((mutationCounts.current.get(renderedTargetKey ?? '') ?? 0) > 0);
    setLoadingMore(false);
    setError(null);
    setData(null);
    void refresh();
    const unsubscribe = subscribeToChildChanges(context, () => void refresh());
    return () => {
      requestGeneration.current += 1;
      unsubscribe();
    };
  }, [accessScope, context, refresh, renderedTargetKey]);

  const loadMore = useCallback(async () => {
    const target = context;
    const cursor = data?.sessionPage.cursor;
    if (!target || !cursor || !data.sessionPage.hasMore || loadingMore) return;
    const targetKey = dataTargetKey(target, accessScope);
    const generation = requestGeneration.current;
    const loadMoreRequest = ++loadMoreGeneration.current;
    setLoadingMore(true);
    try {
      const page = await loadMoreSessionHistory(target, cursor);
      if (generation !== requestGeneration.current || activeTargetKey.current !== targetKey) return;
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
      if (generation === requestGeneration.current && activeTargetKey.current === targetKey) {
        setError(cause instanceof Error ? cause.message : 'Không tải thêm được lịch sử.');
      }
    } finally {
      if (loadMoreRequest === loadMoreGeneration.current && activeTargetKey.current === targetKey) {
        setLoadingMore(false);
      }
    }
  }, [accessScope, context, data, loadingMore]);

  const runMutation = useCallback(async <T,>(mutation: () => Promise<T>): Promise<T> => {
    const mutationTargetKey = renderedTargetKey;
    if (!mutationTargetKey || activeTargetKey.current !== mutationTargetKey) {
      throw new Error('Ngữ cảnh của bé đã thay đổi. Vui lòng thử lại.');
    }
    const activeMutationCount = (mutationCounts.current.get(mutationTargetKey) ?? 0) + 1;
    mutationCounts.current.set(mutationTargetKey, activeMutationCount);
    setSaving(true);
    try {
      const result = await mutation();
      if (activeTargetKey.current === mutationTargetKey) {
        await refresh();
        if (activeTargetKey.current === mutationTargetKey) setError(null);
      }
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không lưu được dữ liệu Supabase.';
      if (activeTargetKey.current === mutationTargetKey) {
        setError(message);
        await refresh();
        if (activeTargetKey.current === mutationTargetKey) setError(message);
      }
      throw cause;
    } finally {
      const remainingMutationCount = Math.max(
        0,
        (mutationCounts.current.get(mutationTargetKey) ?? 1) - 1,
      );
      if (remainingMutationCount > 0) {
        mutationCounts.current.set(mutationTargetKey, remainingMutationCount);
      } else {
        mutationCounts.current.delete(mutationTargetKey);
      }
      if (activeTargetKey.current === mutationTargetKey) {
        setSaving(remainingMutationCount > 0);
      }
    }
  }, [refresh, renderedTargetKey]);

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
      if (!data) return Promise.reject(new Error('Lịch chưa tải xong.'));
      return runMutation(() => saveScheduleSetup(context, events, data.scheduleVersion));
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
