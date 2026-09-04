import { MaterialIcon } from '../../../components/MaterialIcon';
import { getActivityDetail } from '../../../domain/schedulePolicy';
import type { FamilyData, LearningSessionRow } from '../../../lib/familyRepository';

interface LearningPanelProps {
  data: FamilyData;
  session?: LearningSessionRow;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
}

export function LearningPanel({ data, session, loadingMore, onLoadMore }: LearningPanelProps) {
  const childName = data.child.full_name || 'Bé';
  const tasks = data.tasks.filter((task) => task.session_id === session?.id);
  const answers = data.answers.filter((answer) => answer.session_id === session?.id);
  const questions = data.questions.filter((question) => question.subject === session?.subject);
  const sessionDetail = session ? getActivityDetail(session.subject, session.title) : null;
  return (
    <section>
      <h1 className="mb-1 text-2xl font-extrabold app-text-color">Tiến độ học tập của {childName}</h1>
      <p className="mb-5 text-sm app-text-muted">Bài tập, kiểm tra nhanh và bằng chứng học tập của {childName}.</p>
      {!session ? <p className="rounded-2xl app-surface p-5 text-center text-xs app-text-muted">Chưa có buổi học.</p> : (
        <article className="rounded-[26px] border app-border-color app-surface p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between"><div><b className="block text-lg">{session.subject}</b>{sessionDetail ? <span className="text-xs app-text-muted">{sessionDetail}</span> : null}</div><span className="rounded-full app-blue-soft px-3 py-1 text-[10px] font-bold app-primary-text">{session.status}</span></div>
          <div className="mb-5 grid grid-cols-3 gap-2">
            <Metric value={`${session.duration_minutes ?? 0}'`} label="focus" />
            <Metric value={`${tasks.filter((task) => task.is_done).length}/${tasks.length}`} label="bài" />
            <Metric value={`${answers.filter((answer) => answer.is_correct).length}/${questions.length}`} label="câu hỏi" />
          </div>
          <b className="mb-2 block text-xs">Danh sách bài</b>
          <div className="grid gap-2">{tasks.map((task) => <div key={task.id} className="flex items-center gap-2 rounded-xl app-surface-subtle p-3 text-xs"><MaterialIcon name={task.is_done ? 'check_box' : 'check_box_outline_blank'} className="text-base" />{task.title}</div>)}</div>
          {session.evidence_url && <p className="mt-4 rounded-xl app-green-soft p-3 text-xs app-green-text">Đã lưu ảnh bằng chứng trong private Storage.</p>}
        </article>
      )}
      <div className="mt-5 grid gap-2.5" aria-label="Lịch sử buổi học">
        {data.sessions.map((item) => (
          <article key={item.id} className="rounded-2xl border app-border-color app-surface p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <b className="truncate text-sm">{item.subject}</b>
              <small className="app-text-muted">{new Date(item.starts_at).toLocaleDateString('vi-VN')}</small>
            </div>
            <p className="mt-1 text-xs app-text-muted">{item.duration_minutes ?? 0} phút · {item.status}</p>
          </article>
        ))}
      </div>
      {data.sessionPage.hasMore ? (
        <button
          type="button"
          className="mt-4 w-full rounded-2xl border app-blue-border app-surface px-4 py-3 text-xs font-bold app-primary-text disabled:opacity-60"
          disabled={loadingMore}
          onClick={() => void onLoadMore()}
        >
          {loadingMore ? 'Đang tải…' : 'Xem thêm lịch sử'}
        </button>
      ) : null}
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl app-surface-subtle p-3"><strong className="block">{value}</strong><span className="text-[10px] app-text-muted">{label}</span></div>;
}
