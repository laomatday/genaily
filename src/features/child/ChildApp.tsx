import { useEffect, useMemo, useState } from 'react';
import { OfflineIndicator } from '../../components/OfflineIndicator';
import { AppSidebar } from '../../components/AppSidebar';
import type {
  FamilyData,
  LearningSessionRow,
  QuickCheckAnswerInput,
  TaskAnswerInput,
} from '../../lib/familyRepository';
import type { Reflection } from '../../types';
import { isSelfStudyType } from '../../domain/schedulePolicy';
import { getDayKey } from '../../lib/date';
import { breakPolicy, sessionBreakCount } from '../../domain/engagement';
import { ChildHome } from './screens/ChildHome';
import { ChildHeader } from './components/ChildHeader';
import { ChildNav, type ChildTab } from './components/ChildNav';
import { ChildProgressPanel } from './screens/ChildProgressPanel';
import { ChildRewardsPanel } from './screens/ChildRewardsPanel';
import { ChildWeekPanel } from './screens/ChildWeekPanel';
import { UnlockedScreen, WaitingScreen } from './screens/CompletionScreens';
import { EvidenceScreen } from './screens/EvidenceScreen';
import { FocusScreen } from './screens/FocusScreen';
import { StudyLockScreen } from './screens/StudyLockScreen';
import { resolveStudyLockState } from './studyLockState';

type ChildView = ChildTab | 'lock' | 'focus' | 'evidence' | 'waiting' | 'unlocked';

export interface ChildSubmission {
  reflection: Reflection;
  durationMinutes: number;
  tasks: TaskAnswerInput[];
  answers: QuickCheckAnswerInput[];
}

interface ChildAppProps {
  data: FamilyData;
  accountName: string;
  accountEmail?: string | null;
  currentSession?: LearningSessionRow;
  saving: boolean;
  loadingMore: boolean;
  error: string | null;
  onStartSession: () => Promise<void>;
  onRequestBreak: (minutes: number) => Promise<void>;
  onSaveNote: (note: string) => Promise<void>;
  onMessageParent: (message: string) => Promise<void>;
  onRedeemMilestone: (milestoneId: string) => Promise<void>;
  onSubmitSession: (input: ChildSubmission) => Promise<void>;
  onUploadEvidence: (file: File) => Promise<string>;
  onLoadMoreSessions: () => Promise<void>;
  onSwitchToParent: () => void;
  onLogout: () => Promise<void>;
}

function viewForStatus(status: string | undefined, studyLockEnabled: boolean): ChildView {
  if (status === 'awaiting_parent') return 'waiting';
  if (status === 'approved' || status === 'completed') return 'unlocked';
  if (status === 'in_progress') return studyLockEnabled ? 'lock' : 'focus';
  return 'today';
}

function remainingForSession(session: LearningSessionRow | undefined, plannedMinutes: number): number {
  if (!session?.actual_started_at) return plannedMinutes * 60;
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(session.actual_started_at).getTime()) / 1000));
  return Math.max(0, plannedMinutes * 60 - elapsed);
}

export function ChildApp({
  data,
  accountName,
  accountEmail,
  currentSession,
  saving,
  loadingMore,
  error,
  onStartSession,
  onRequestBreak,
  onSaveNote,
  onMessageParent,
  onRedeemMilestone,
  onSubmitSession,
  onUploadEvidence,
  onLoadMoreSessions,
  onSwitchToParent,
  onLogout,
}: ChildAppProps) {
  const scheduled = useMemo(() => data.schedule.find((event) =>
    event.id === currentSession?.schedule_event_id
    || (
      !currentSession?.schedule_event_id
      && isSelfStudyType(event.event_type)
      && event.subject === currentSession?.subject
      && event.title === currentSession?.title
      && event.day_of_week === (currentSession ? getDayKey(new Date(currentSession.starts_at)) : undefined)
    )
  ), [currentSession, data.schedule]);
  const occurrence = useMemo(() => data.occurrences.find(
    (item) => item.id === currentSession?.schedule_occurrence_id,
  ), [currentSession?.schedule_occurrence_id, data.occurrences]);
  const studyLockEnabled = occurrence?.study_lock_enabled ?? scheduled?.study_lock_enabled ?? true;
  const hasStudyDetails = scheduled ? isSelfStudyType(scheduled.event_type) : true;
  const plannedMinutes = useMemo(() => {
    return scheduled?.duration_minutes ?? currentSession?.duration_minutes ?? 0;
  }, [currentSession?.duration_minutes, scheduled?.duration_minutes]);
  const [view, setView] = useState<ChildView>(() => viewForStatus(currentSession?.status, studyLockEnabled));
  const [remainingSeconds, setRemainingSeconds] = useState(() => remainingForSession(currentSession, plannedMinutes));
  const [taskState, setTaskState] = useState<Record<string, boolean>>(() => Object.fromEntries(
    data.tasks
      .filter((task) => task.session_id === currentSession?.id)
      .map((task) => [task.id, task.is_done]),
  ));
  const [answers, setAnswers] = useState<Record<string, number>>(() => Object.fromEntries(
    data.answers
      .filter((answer) => answer.session_id === currentSession?.id)
      .map((answer) => [answer.question_id, answer.selected_option]),
  ));
  const [reflection, setReflection] = useState<Reflection | null>(
    (currentSession?.reflection as Reflection | null) ?? null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [breakMessage, setBreakMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setView(viewForStatus(currentSession?.status, studyLockEnabled));
  }, [currentSession?.status, studyLockEnabled]);

  useEffect(() => {
    setRemainingSeconds(remainingForSession(currentSession, plannedMinutes));
    if (view !== 'focus') return;
    const timer = window.setInterval(() => {
      setRemainingSeconds(remainingForSession(currentSession, plannedMinutes));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentSession, plannedMinutes, view]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const sessionTasks = currentSession && hasStudyDetails
    ? data.tasks.filter((task) => task.session_id === currentSession.id)
    : [];
  const sessionQuestions = currentSession && hasStudyDetails
    ? data.questions.filter((question) => question.subject === currentSession.subject)
    : [];
  const latestCommand = currentSession
    ? data.deviceCommands.find((command) => command.session_id === currentSession.id)
    : undefined;
  const lockState = resolveStudyLockState(studyLockEnabled, latestCommand?.status);
  const elapsedMinutes = Math.max(1, Math.round((plannedMinutes * 60 - remainingSeconds) / 60));
  const breaks = breakPolicy(data.settings);
  const usedBreaks = currentSession ? sessionBreakCount(data.sessionEvents, currentSession.id) : 0;
  const dashboardVisible = view === 'today' || view === 'week' || view === 'rewards' || view === 'progress';

  const handleFile = async (file: File) => {
    setValidationError(null);
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return nextUrl;
    });
    try {
      await onUploadEvidence(file);
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : 'Không tải được ảnh.');
    }
  };

  const handleSubmit = async () => {
    setValidationError(null);
    if (!currentSession) {
      setValidationError('Không có buổi tự học đang diễn ra.');
      return;
    }
    if (!reflection) {
      setValidationError('Hãy chọn cảm nhận của buổi học.');
      return;
    }
    const unanswered = sessionQuestions.some((question) => answers[question.id] === undefined);
    if (unanswered) {
      setValidationError('Hãy trả lời đủ các câu câu hỏi.');
      return;
    }
    try {
      await onSubmitSession({
        reflection,
        durationMinutes: elapsedMinutes,
        tasks: sessionTasks.map((task) => ({ id: task.id, is_done: Boolean(taskState[task.id]) })),
        answers: sessionQuestions.map((question) => ({
          question_id: question.id,
          selected_option: answers[question.id],
        })),
      });
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : 'Không gửi được kết quả.');
    }
  };

  const handleFocusComplete = async () => {
    if (hasStudyDetails) {
      setView('evidence');
      return;
    }
    setValidationError(null);
    try {
      await onSubmitSession({
        reflection: 'ok',
        durationMinutes: elapsedMinutes,
        tasks: [],
        answers: [],
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không hoàn tất được buổi học.';
      setValidationError(message);
      throw cause instanceof Error ? cause : new Error(message);
    }
  };

  return (
    <main className={`app-shell min-h-screen app-background app-text-color ${dashboardVisible ? 'pb-28' : ''}`}>
      {dashboardVisible && (
        <ChildHeader
          childName={data.child.full_name}
          avatarPath={data.child.avatar_url}
          menuOpen={menuOpen}
          onOpenMenu={() => setMenuOpen(true)}
        />
      )}
      {view === 'today' && <ChildHome data={data} session={currentSession} saving={saving} onStart={onStartSession} onStarted={() => setView(studyLockEnabled ? 'lock' : 'focus')} onMessageParent={onMessageParent} onParentAccess={onSwitchToParent} />}
      {view === 'week' && <ChildWeekPanel data={data} />}
      {view === 'rewards' && <ChildRewardsPanel data={data} saving={saving} onRedeem={onRedeemMilestone} />}
      {view === 'progress' && <ChildProgressPanel data={data} loadingMore={loadingMore} onLoadMore={onLoadMoreSessions} />}
      {view === 'lock' && currentSession && <StudyLockScreen session={currentSession} command={latestCommand} breakMessage={breakMessage} saving={saving} breakMinutes={breaks.minutes} studyLockEnabled={studyLockEnabled} onFocus={() => setView('focus')} onBreak={() => onRequestBreak(breaks.minutes)} onBreakSent={() => setBreakMessage(`Yêu cầu nghỉ ${breaks.minutes} phút đã được lưu và gửi tới phụ huynh.`)} />}
      {view === 'focus' && currentSession && (
        <FocusScreen
          session={currentSession}
          remainingSeconds={remainingSeconds}
          plannedMinutes={plannedMinutes}
          taskCount={sessionTasks.length}
          breakMessage={breakMessage}
          saving={saving}
          breakMinutes={breaks.minutes}
          usedBreaks={usedBreaks}
          maxBreaks={breaks.maxBreaks}
          note={currentSession.child_note ?? ''}
          lockState={lockState}
          onComplete={handleFocusComplete}
          onBreak={() => onRequestBreak(breaks.minutes)}
          onBreakSent={() => setBreakMessage(`Yêu cầu nghỉ ${breaks.minutes} phút đã được lưu và gửi tới phụ huynh.`)}
          onSaveNote={onSaveNote}
          onParentAccess={onSwitchToParent}
        />
      )}
      {view === 'evidence' && currentSession && hasStudyDetails && <EvidenceScreen data={data} session={currentSession} taskState={taskState} answers={answers} reflection={reflection} previewUrl={previewUrl} elapsedMinutes={elapsedMinutes} saving={saving} validationError={validationError ?? error} onBack={() => setView('focus')} onTaskChange={(id, done) => setTaskState((value) => ({ ...value, [id]: done }))} onAnswer={(questionId, option) => setAnswers((value) => ({ ...value, [questionId]: option }))} onReflection={setReflection} onFile={handleFile} onSubmit={handleSubmit} />}
      {view === 'waiting' && currentSession && <WaitingScreen session={currentSession} onSwitchToParent={onSwitchToParent} />}
      {view === 'unlocked' && currentSession && <UnlockedScreen data={data} session={currentSession} command={latestCommand} onHome={() => setView('today')} />}
      {dashboardVisible && error && <p className="mx-4 mb-3 rounded-2xl app-red-soft p-3 text-center text-xs app-red-text">{error}</p>}
      {dashboardVisible && <ChildNav active={view} onChange={setView} />}
      <OfflineIndicator />
      <AppSidebar
        open={menuOpen}
        mode="child"
        accountName={accountName}
        accountEmail={accountEmail}
        childName={data.child.full_name || 'bé'}
        onClose={() => setMenuOpen(false)}
        onSwitchMode={onSwitchToParent}
        onLogout={onLogout}
      />
    </main>
  );
}
