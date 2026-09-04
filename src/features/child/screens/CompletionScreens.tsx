import { MaterialIcon } from '../../../components/MaterialIcon';
import { formatActivityName } from '../../../domain/schedulePolicy';
import type { DeviceCommandRow, FamilyData, LearningSessionRow } from '../../../lib/familyRepository';

export function WaitingScreen({ session, onSwitchToParent }: { session: LearningSessionRow; onSwitchToParent: () => void }) {
  return (
    <section className="flex min-h-screen flex-col justify-between p-5 text-center">
      <div className="flex justify-between"><span className="rounded-full app-surface-muted px-3 py-1 text-xs font-bold">FOCUS CHECKPOINT</span><span className="rounded-full app-green-soft px-3 py-1 text-xs font-bold app-green-text">ĐÃ LƯU</span></div>
      <div className="my-auto"><MaterialIcon name="check_circle" className="mb-6 text-6xl app-green-text" /><h1 className="mb-3 text-3xl font-black">Đã gửi cho ba/mẹ.</h1><p className="text-sm app-text-muted">Kết quả {session.subject} đã được ghi trong database. Study Lock chờ lệnh mở khóa sau khi duyệt.</p></div>
      <button onClick={onSwitchToParent} className="w-full rounded-2xl app-primary-bg py-4 text-sm font-bold app-on-primary shadow-sm">Mở trang ba/mẹ</button>
    </section>
  );
}

export function UnlockedScreen({ data, session, command, onHome }: { data: FamilyData; session: LearningSessionRow; command?: DeviceCommandRow; onHome: () => void }) {
  const tasks = data.tasks.filter((task) => task.session_id === session.id);
  const answers = data.answers.filter((answer) => answer.session_id === session.id);
  const questions = data.questions.filter((question) => question.subject === session.subject);
  return (
    <section className="min-h-screen app-background p-5 app-text-color">
      <div className="py-8 text-center"><MaterialIcon name="check_circle" className="mb-2 text-5xl app-green-text" /><h1 className="mb-1 text-2xl font-black">Buổi học đã được duyệt.</h1><p className="text-xs app-text-muted">{command ? `Lệnh ${command.command}: ${command.status}` : 'Chưa có phản hồi lệnh thiết bị.'}</p></div>
      <article className="mb-6 rounded-[24px] border app-border-color app-surface p-4 shadow-sm">
        <b>{formatActivityName(session.subject, session.title)}</b>
        <div className="mt-4 grid grid-cols-3 gap-2"><Metric value={`${session.duration_minutes ?? 0}'`} label="tập trung" /><Metric value={`${tasks.filter((task) => task.is_done).length}/${tasks.length}`} label="bài" /><Metric value={`${answers.filter((answer) => answer.is_correct).length}/${questions.length}`} label="câu hỏi" /></div>
      </article>
      <button onClick={onHome} className="w-full rounded-2xl app-strong-bg app-on-strong py-4 text-sm font-black">Về Hôm nay</button>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl app-surface-subtle p-3"><strong className="block">{value}</strong><span className="text-[10px] app-text-muted">{label}</span></div>;
}
