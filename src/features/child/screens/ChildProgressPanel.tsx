import { MaterialIcon } from '../../../components/MaterialIcon';
import { experienceSummary } from '../../../domain/engagement';
import { formatActivityName } from '../../../domain/schedulePolicy';
import type { FamilyData, LearningSessionRow } from '../../../lib/familyRepository';

const statusLabel: Record<LearningSessionRow['status'], string> = {
  scheduled: 'Sắp học',
  in_progress: 'Đang học',
  awaiting_parent: 'Chờ duyệt',
  approved: 'Đã duyệt',
  completed: 'Hoàn thành',
  rejected: 'Làm lại',
  cancelled: 'Đã hủy',
};

interface ChildProgressPanelProps {
  data: FamilyData;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
}

export function ChildProgressPanel({ data, loadingMore, onLoadMore }: ChildProgressPanelProps) {
  const finishedSessions = data.sessions.filter((session) => ['approved', 'completed'].includes(session.status));
  const completedMinutes = finishedSessions.reduce((sum, session) => sum + (session.duration_minutes ?? 0), 0);
  const completedTasks = data.tasks.filter((task) => task.is_done).length;
  const experience = experienceSummary(data.child.experience_points, data.settings);

  return (
    <section className="p-4 sm:p-5">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold">Tiến độ của {data.child.full_name || 'bé'}</h1>
        <p className="mt-1 text-sm app-text-muted">Mục tiêu và kết quả các buổi tự học của con.</p>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-2.5">
        <Metric value={String(finishedSessions.length)} label="buổi xong" />
        <Metric value={`${completedMinutes}'`} label="đã học" />
        <Metric value={String(completedTasks)} label="bài xong" />
        <Metric value={String(experience.points)} label="XP" />
      </div>

      <b className="mb-3 block text-sm">Mục tiêu</b>
      <div className="mb-6 grid gap-2.5">
        {data.goals.map((goal) => {
          const scheduledMinutes = data.schedule
            .filter((event) => event.subject === goal.subject)
            .reduce((sum, event) => sum + event.duration_minutes, 0);
          const percent = Math.min(100, Math.round(scheduledMinutes / Math.max(goal.target_minutes, 1) * 100));
          return (
            <article key={goal.id} className="rounded-[20px] border app-border-color app-surface p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-sm">{goal.subject}</b>
                  <small className="block text-xs app-text-muted">{goal.description ?? goal.title}</small>
                </div>
                <strong className="app-primary-text">{scheduledMinutes}/{goal.target_minutes}'</strong>
              </div>
              <progress className="plan-progress" value={percent} max={100} aria-label={`Tiến độ mục tiêu ${goal.subject}: ${percent}%`} />
            </article>
          );
        })}
        {data.goals.length === 0 && <EmptyState message="Con chưa có mục tiêu học tập." />}
      </div>

      <b className="mb-3 block text-sm">Các buổi tự học gần đây</b>
      <div className="grid gap-2.5">
        {data.sessions.map((session) => (
          <article key={session.id} className="flex items-center gap-3 rounded-[20px] border app-border-color app-surface p-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl app-blue-soft app-primary-text">
              <MaterialIcon name={['approved', 'completed'].includes(session.status) ? 'check_circle' : 'menu_book'} />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm">{formatActivityName(session.subject, session.title)}</b>
              <small className="text-xs app-text-muted">
                {new Date(session.starts_at).toLocaleDateString('vi-VN')} · {session.duration_minutes ?? 0} phút
              </small>
            </div>
            <span className="session-history-result"><b>{session.awarded_points > 0 ? `+${session.awarded_points} XP` : statusLabel[session.status]}</b><small>{statusLabel[session.status]}</small></span>
          </article>
        ))}
        {data.sessions.length === 0 && <EmptyState message="Con chưa có buổi tự học." />}
        {data.sessionPage.hasMore ? (
          <button
            type="button"
            className="rounded-2xl border app-blue-border app-surface px-4 py-3 text-xs font-bold app-primary-text disabled:opacity-60"
            disabled={loadingMore}
            onClick={() => void onLoadMore()}
          >
            {loadingMore ? 'Đang tải…' : 'Xem thêm'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[20px] border app-border-color app-surface p-3.5 shadow-sm">
      <strong className="block text-lg">{value}</strong>
      <span className="text-[10.5px] app-text-muted">{label}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-2xl border app-border-color app-surface p-5 text-center text-xs app-text-muted">{message}</p>;
}
