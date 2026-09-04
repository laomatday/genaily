import { useEffect, useState, type ReactNode } from 'react';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { formatActivityName } from '../../../domain/schedulePolicy';
import { APP_CONFIG } from '../../../config/appConfig';
import { useDialogFocusTrap } from '../../../hooks/useDialogFocusTrap';
import { getEvidenceSignedUrl, type ChildMilestoneInput, type FamilyData, type LearningSessionRow } from '../../../lib/familyRepository';

const reflectionLabel: Record<string, string> = {
  easy: 'Dễ hiểu',
  ok: 'Vừa sức',
  hard: 'Cần hỗ trợ',
};

const sessionStatusLabel: Record<LearningSessionRow['status'], string> = {
  scheduled: 'Sắp học',
  in_progress: 'Đang học',
  awaiting_parent: 'Chờ duyệt',
  approved: 'Đã duyệt',
  completed: 'Hoàn thành',
  rejected: 'Cần làm lại',
  cancelled: 'Đã hủy',
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useDialogFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div className="app-modal-layer" role="presentation">
      <button type="button" className="app-modal-backdrop" aria-label="Đóng hộp thoại" onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} className="app-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div className="app-modal-heading">
          <div><span className="screen-eyebrow">genAi Family</span><b id="app-modal-title">{title}</b></div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="modal-close-button"><MaterialIcon name="close" /></button>
        </div>
        <div className="app-modal-content">{children}</div>
      </div>
    </div>
  );
}

export function NotificationCenter({ data, saving, onRead, onClose }: {
  data: FamilyData;
  saving: boolean;
  onRead: (notificationId: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal title="Thông báo" onClose={onClose}>
      <div className="notification-list">
        {data.notifications.map((notification) => (
          <button
            type="button"
            key={notification.id}
            className={`notification-item ${notification.is_read ? 'is-read' : ''}`}
            disabled={saving || notification.is_read}
            onClick={() => void onRead(notification.id).catch(() => undefined)}
          >
            <span className="notification-item-icon"><MaterialIcon name="notifications" /></span>
            <span><b>{notification.title}</b><small>{notification.message}</small><time>{new Date(notification.created_at).toLocaleString('vi-VN')}</time></span>
            {!notification.is_read ? <i aria-label="Chưa đọc" /> : null}
          </button>
        ))}
        {data.notifications.length === 0 ? <p className="empty-card">Chưa có thông báo mới.</p> : null}
      </div>
    </Modal>
  );
}

export function MilestoneModal({ currentTitle, currentDescription, currentTarget, saving, onSave, onClose }: {
  currentTitle?: string;
  currentDescription?: string | null;
  currentTarget?: number;
  saving: boolean;
  onSave: (input: ChildMilestoneInput) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(currentTitle ?? 'Phần thưởng cuối tuần');
  const [description, setDescription] = useState(currentDescription ?? 'Cùng gia đình chọn một hoạt động vui.');
  const [targetPoints, setTargetPoints] = useState(currentTarget ?? APP_CONFIG.defaultRewardPoints);
  return (
    <Modal title="Cột mốc & phần thưởng" onClose={onClose}>
      <div className="goal-form">
        <label className="app-field-label">Tên phần thưởng
          <input className="gemini-control" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label className="app-field-label">Mô tả
          <textarea className="gemini-control milestone-description-input" value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="app-field-label">Số XP cần tích lũy
          <input className="gemini-control" type="number" min={1} max={100000} value={targetPoints} onChange={(event) => setTargetPoints(Number(event.target.value))} />
        </label>
        <button
          type="button"
          className="primary-action modal-submit-button"
          disabled={saving || !title.trim() || !Number.isInteger(targetPoints) || targetPoints < 1}
          onClick={() => void onSave({ title, description, targetPoints }).then(onClose).catch(() => undefined)}
        >
          {saving ? 'Đang lưu…' : 'Lưu phần thưởng'}
        </button>
      </div>
    </Modal>
  );
}

export function GoalModal({ onClose, onSave, saving }: {
  onClose: () => void;
  onSave: (subject: string, minutes: number) => Promise<void>;
  saving: boolean;
}) {
  const [subject, setSubject] = useState('');
  const [minutes, setMinutes] = useState(60);
  return (
    <Modal title="Thêm mục tiêu" onClose={onClose}>
      <div className="goal-form">
        <label className="app-field-label">Môn học
          <input value={subject} onChange={(event) => setSubject(event.target.value)} className="gemini-control" autoFocus />
        </label>
        <label className="app-field-label">Phút mỗi tuần
          <input type="number" min={10} max={1200} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="gemini-control" />
        </label>
        <button
          type="button"
          disabled={saving || subject.trim().length < 2}
          onClick={() => void onSave(subject, minutes).then(onClose).catch(() => undefined)}
          className="primary-action modal-submit-button"
        >
          {saving ? 'Đang lưu…' : 'Lưu mục tiêu'}
        </button>
      </div>
    </Modal>
  );
}

function EvidencePreview({ path }: { path: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSignedUrl(null);
    setError(null);
    void getEvidenceSignedUrl(path)
      .then((url) => { if (active) setSignedUrl(url); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Không tải được ảnh minh chứng.');
      });
    return () => { active = false; };
  }, [path]);

  if (error) return <p className="evidence-preview-state is-error">{error}</p>;
  if (!signedUrl) return <p className="evidence-preview-state">Đang tải ảnh minh chứng…</p>;
  return <img className="evidence-preview-image" src={signedUrl} alt="Minh chứng bài làm của trẻ" />;
}

export function SessionDetailsModal({ data, session, saving, onApprove, onClose }: {
  data: FamilyData;
  session?: LearningSessionRow;
  saving: boolean;
  onApprove: (session: LearningSessionRow) => Promise<void>;
  onClose: () => void;
}) {
  const tasks = data.tasks.filter((task) => task.session_id === session?.id);
  const answers = data.answers.filter((answer) => answer.session_id === session?.id);
  const correctAnswers = session?.quick_check_score ?? answers.filter((answer) => answer.is_correct).length;
  const questionTotal = session?.quick_check_total
    ?? data.questions.filter((question) => question.subject === session?.subject).length;

  return (
    <Modal title="Chi tiết buổi học" onClose={onClose}>
      {!session ? <p className="empty-card">Không có buổi học.</p> : (
        <div className="session-review-detail">
          <article className="session-review-hero">
            <span className="session-review-icon"><MaterialIcon name="school" /></span>
            <div>
              <span className="screen-eyebrow">{new Date(session.starts_at).toLocaleString('vi-VN', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</span>
              <h2>{formatActivityName(session.subject, session.title)}</h2>
              <p>{session.duration_minutes ?? 0} phút · {sessionStatusLabel[session.status]}</p>
            </div>
          </article>

          <div className="session-review-metrics">
            <Metric label="Bài tập" value={`${tasks.filter((task) => task.is_done).length}/${tasks.length}`} />
            <Metric label="Quick-check" value={`${correctAnswers}/${questionTotal}`} />
            <Metric label="Cảm nhận" value={reflectionLabel[session.reflection ?? ''] ?? 'Chưa chọn'} />
            <Metric label="Tập trung" value={session.focus_score === null ? 'Chưa có' : `${session.focus_score}%`} />
          </div>

          <section className="review-section">
            <h3>Bài tập đã nộp</h3>
            {tasks.length > 0 ? (
              <div className="review-task-list">
                {tasks.map((task) => (
                  <p key={task.id} className={task.is_done ? 'is-done' : ''}>
                    <MaterialIcon name={task.is_done ? 'check_box' : 'check_box_outline_blank'} />
                    <span>{task.title}</span>
                  </p>
                ))}
              </div>
            ) : <p className="review-empty-copy">Buổi học không thiết lập bài tập chi tiết.</p>}
          </section>

          {session.child_note ? <section className="review-section"><h3>Ghi chú của con</h3><p className="review-note">{session.child_note}</p></section> : null}

          <section className="review-section">
            <h3>Minh chứng</h3>
            {session.evidence_url
              ? <EvidencePreview path={session.evidence_url} />
              : <p className="review-empty-copy">Trẻ chưa gửi ảnh minh chứng.</p>}
          </section>

          {session.status === 'awaiting_parent' ? (
            <button
              type="button"
              className="primary-action modal-submit-button"
              disabled={saving}
              onClick={() => void onApprove(session).then(onClose).catch(() => undefined)}
            >
              {saving ? 'Đang duyệt…' : 'Duyệt bài & mở khóa'}
            </button>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><b>{value}</b><span>{label}</span></div>;
}
