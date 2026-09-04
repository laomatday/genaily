import type { ReactNode } from 'react';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { estimateSessionPoints } from '../../../domain/engagement';
import type { FamilyData, LearningSessionRow } from '../../../lib/familyRepository';
import type { Reflection } from '../../../types';

interface EvidenceScreenProps {
  data: FamilyData;
  session: LearningSessionRow;
  taskState: Record<string, boolean>;
  answers: Record<string, number>;
  reflection: Reflection | null;
  previewUrl: string | null;
  elapsedMinutes: number;
  saving: boolean;
  validationError: string | null;
  onBack: () => void;
  onTaskChange: (id: string, done: boolean) => void;
  onAnswer: (questionId: string, option: number) => void;
  onReflection: (reflection: Reflection) => void;
  onFile: (file: File) => Promise<void>;
  onSubmit: () => Promise<void>;
}

function optionsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((option): option is string => typeof option === 'string') : [];
}

export function EvidenceScreen({
  data,
  session,
  taskState,
  answers,
  reflection,
  previewUrl,
  elapsedMinutes,
  saving,
  validationError,
  onBack,
  onTaskChange,
  onAnswer,
  onReflection,
  onFile,
  onSubmit,
}: EvidenceScreenProps) {
  const tasks = data.tasks.filter((task) => task.session_id === session.id);
  const questions = data.questions.filter((question) => question.subject === session.subject);
  const points = estimateSessionPoints({
    ...session,
    duration_minutes: elapsedMinutes,
    tasks_done: Object.values(taskState).filter(Boolean).length,
  }, data.settings);
  return (
    <section className="evidence-screen min-h-screen app-background p-4 app-text-color sm:p-5">
      <header className="evidence-header"><button onClick={onBack} aria-label="Quay lại" className="header-icon-button"><MaterialIcon name="arrow_back" className="text-xl" /></button><div><b>Hoàn thành nhiệm vụ</b><small>{elapsedMinutes} phút tập trung</small></div><span className="experience-chip"><MaterialIcon name="stars" />+{points} XP</span></header>
      <article className="evidence-task-summary"><span className="screen-eyebrow">{session.subject}</span><h1>{session.title}</h1><p>Kiểm tra bài, gửi ảnh minh chứng và cảm nhận của con.</p></article>

      <Card title="1 · Bài đã hoàn thành">
        <div className="grid gap-2">{tasks.map((task) => <label key={task.id} className="flex items-center gap-3 rounded-xl app-surface-subtle p-3 text-xs"><input type="checkbox" checked={Boolean(taskState[task.id])} onChange={(event) => onTaskChange(task.id, event.target.checked)} />{task.title}</label>)}</div>
        {tasks.length === 0 && <p className="text-xs app-text-muted">Buổi học chưa có bài tập.</p>}
      </Card>

      <Card title="2 · Gửi ảnh bài làm cho bố mẹ">
        <div className="mb-3 flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl app-surface-muted">
          {previewUrl ? <img src={previewUrl} alt="Ảnh bài làm đã chọn" className="h-full w-full object-cover" /> : <span className="text-xs app-text-muted">{session.evidence_url ? 'Ảnh đã lưu trong private Storage' : 'Chưa có ảnh'}</span>}
        </div>
        <label className="evidence-camera-button"><MaterialIcon name="photo_camera" />Chạm để mở máy ảnh & căn khung bài<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); }} /></label>
        {session.child_note ? <p className="evidence-note-preview"><MaterialIcon name="notes" />{session.child_note}</p> : null}
      </Card>

      <Card title={`3 · Quick-check (${questions.length} câu)`}>
        <div className="grid gap-5">
          {questions.map((question, questionIndex) => (
            <fieldset key={question.id}>
              <legend className="mb-2 text-xs font-bold">{questionIndex + 1}. {question.prompt}</legend>
              <div className="grid gap-2">{optionsFrom(question.options).map((option, optionIndex) => <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-xs ${answers[question.id] === optionIndex ? 'app-blue-border app-blue-soft font-bold app-primary-text' : 'app-border-color'}`}><input type="radio" name={question.id} checked={answers[question.id] === optionIndex} onChange={() => onAnswer(question.id, optionIndex)} />{option}</label>)}</div>
            </fieldset>
          ))}
        </div>
      </Card>

      <Card title="4 · Buổi này thấy sao?">
        <div className="grid grid-cols-3 gap-2">{(['easy', 'ok', 'hard'] as Reflection[]).map((value) => <button key={value} onClick={() => onReflection(value)} className={`rounded-2xl border p-3 text-xs ${reflection === value ? 'app-blue-border app-blue-soft font-bold app-primary-text' : 'app-border-color'}`}><MaterialIcon name={value === 'easy' ? 'sentiment_very_satisfied' : value === 'ok' ? 'sentiment_satisfied' : 'sentiment_dissatisfied'} className="mx-auto mb-1 block text-xl" />{value === 'easy' ? 'Dễ' : value === 'ok' ? 'Ổn' : 'Khó'}</button>)}</div>
      </Card>

      {validationError && <p className="mb-3 rounded-2xl app-red-soft p-3 text-xs app-red-text">{validationError}</p>}
      <article className="session-reward-card"><span><MaterialIcon name="workspace_premium" /></span><div><b>Phần thưởng phiên học</b><p>Điểm được cộng sau khi hệ thống hoặc phụ huynh duyệt.</p></div><strong>+{points} XP</strong></article>
      <button disabled={saving} onClick={() => void onSubmit()} className="evidence-submit-button">{saving ? 'Đang lưu kết quả…' : 'Hoàn thành & Gửi Bố Mẹ duyệt'} <MaterialIcon name="auto_awesome" /></button>
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <article className="mb-4 rounded-[24px] border app-border-color app-surface p-4 shadow-sm"><b className="mb-3 block text-sm">{title}</b>{children}</article>;
}
