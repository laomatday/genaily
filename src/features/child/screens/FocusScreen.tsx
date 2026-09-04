import { useState } from 'react';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { formatActivityName } from '../../../domain/schedulePolicy';
import type { LearningSessionRow } from '../../../lib/familyRepository';

interface FocusScreenProps {
  session: LearningSessionRow;
  remainingSeconds: number;
  plannedMinutes: number;
  taskCount: number;
  breakMessage: string | null;
  saving: boolean;
  breakMinutes: number;
  usedBreaks: number;
  maxBreaks: number;
  note: string;
  onComplete: () => void;
  onBreak: () => Promise<void>;
  onBreakSent: () => void;
  onSaveNote: (note: string) => Promise<void>;
  onParentAccess: () => void;
}

export function FocusScreen({
  session,
  remainingSeconds,
  plannedMinutes,
  taskCount,
  breakMessage,
  saving,
  breakMinutes,
  usedBreaks,
  maxBreaks,
  note,
  onComplete,
  onBreak,
  onBreakSent,
  onSaveNote,
  onParentAccess,
}: FocusScreenProps) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const totalSeconds = Math.max(plannedMinutes * 60, 1);
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const progress = Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100));
  const circleRadius = 52;
  const circleLength = 2 * Math.PI * circleRadius;
  const circleOffset = circleLength * (1 - progress / 100);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draftNote, setDraftNote] = useState(note);

  return (
    <section className="focus-screen">
      <header className="focus-header">
        <span className="focus-subject"><MaterialIcon name="menu_book" />Task Active · {session.subject}</span>
        <button type="button" className="focus-parent-unlock" onClick={onParentAccess}><MaterialIcon name="lock_open" />Phụ huynh mở khóa</button>
      </header>

      <main className="focus-main">
        <section className="focus-lock-banner"><span><MaterialIcon name="shield" />Đang bật Khóa tập trung</span><p>Ứng dụng giải trí được tạm ẩn an toàn trong thời gian học.</p></section>
        <article className="focus-task-card"><span className="screen-eyebrow">{session.subject} · Mục tiêu {plannedMinutes} phút</span><h1>{formatActivityName(session.subject, session.title)}</h1><p>Tập trung hoàn thành nhiệm vụ, sau đó gửi kết quả để ba/mẹ duyệt.</p></article>
        <section className="focus-timer-card">
          <div className="focus-timer-ring">
            <svg viewBox="0 0 120 120" role="img" aria-label={`Đã hoàn thành ${progress}% thời gian tập trung`}>
              <circle className="focus-ring-track" cx="60" cy="60" r={circleRadius} />
              <circle className="focus-ring-value" cx="60" cy="60" r={circleRadius} strokeDasharray={circleLength} strokeDashoffset={circleOffset} />
            </svg>
            <div><time className="focus-timer" dateTime={`PT${remainingSeconds}S`}>{String(minutes).padStart(2, '0')}<small>:</small>{String(seconds).padStart(2, '0')}</time><span>Thời gian còn lại</span><small>{Math.round(elapsedSeconds / 60)} / {plannedMinutes} phút</small></div>
          </div>
          <p className="focus-encouragement">{dataCopy(session.subject)}</p>
          <div className="focus-task-summary"><span><MaterialIcon name="check_box" /><b>{taskCount}</b>bài cuối buổi</span><span><MaterialIcon name="today" /><b>{plannedMinutes}'</b>mục tiêu</span></div>
        </section>
        {breakMessage ? <p className="focus-break-message">{breakMessage}</p> : null}
        {noteOpen ? <section className="focus-note-editor"><label className="app-field-label">Nháp & ghi chú<textarea className="gemini-control milestone-description-input" value={draftNote} maxLength={1000} onChange={(event) => setDraftNote(event.target.value)} autoFocus /></label><button type="button" className="primary-action" disabled={saving} onClick={() => void onSaveNote(draftNote).then(() => setNoteOpen(false)).catch(() => undefined)}>{saving ? 'Đang lưu…' : 'Lưu ghi chú'}</button></section> : null}
      </main>

      <footer className="focus-actions">
        <button type="button" className="focus-complete-button" onClick={onComplete}>
          <MaterialIcon name="check_circle" /> Hoàn thành & gửi ba/mẹ duyệt
        </button>
        <button
          type="button"
          className="focus-break-button"
          disabled={saving || usedBreaks >= maxBreaks}
          onClick={() => void onBreak().then(onBreakSent).catch(() => undefined)}
        >
          <MaterialIcon name="weekend" /> {saving ? 'Đang gửi…' : usedBreaks >= maxBreaks ? 'Đã hết lượt nghỉ' : `Giải lao ${breakMinutes}p (${maxBreaks - usedBreaks} lượt)`}
        </button>
        <button type="button" className="focus-note-button" onClick={() => setNoteOpen((value) => !value)}><MaterialIcon name="notes" />Nháp & ghi chú</button>
      </footer>
    </section>
  );
}

function dataCopy(subject: string): string {
  return `Con đang tập trung rất tốt với ${subject}. Giữ vững nhịp độ này nhé!`;
}
