import { useState } from 'react';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { ScheduleList } from '../../../components/ScheduleList';
import { learningStreak } from '../../../domain/progressMetrics';
import { estimateSessionPoints, experienceSummary, milestoneProgress } from '../../../domain/engagement';
import { getActivityDetail } from '../../../domain/schedulePolicy';
import { formatLocalDateKey, formatTodayLabel, getDayKey } from '../../../lib/date';
import { useDialogFocusTrap } from '../../../hooks/useDialogFocusTrap';
import type { FamilyData, LearningSessionRow } from '../../../lib/familyRepository';
import { ChildActionFeedback, childActionError } from '../components/ChildActionFeedback';

interface ChildHomeProps {
  data: FamilyData;
  session?: LearningSessionRow;
  saving: boolean;
  onStart: () => Promise<void>;
  onStarted: () => void;
  onMessageParent: (message: string) => Promise<void>;
  onParentAccess: () => void;
}

export function ChildHome({ data, session, saving, onStart, onStarted, onMessageParent, onParentAccess }: ChildHomeProps) {
  const childName = data.child.full_name || 'Bé';
  const todayKey = formatLocalDateKey();
  const events = data.schedule
    .filter((event) => event.day_of_week === getDayKey())
    .map((event) => {
      const occurrence = data.occurrences.find((item) => (
        item.schedule_event_id === event.id && item.occurrence_date === todayKey
      ));
      return {
        ...event,
        status: occurrence?.status === 'completed'
          ? 'completed' as const
          : occurrence?.status === 'in_progress'
            ? 'live' as const
            : 'upcoming' as const,
      };
    });
  const completedEvents = events.filter((event) => event.status === 'completed').length;
  const tasks = data.tasks.filter((task) => task.session_id === session?.id);
  const canStart = session?.status === 'scheduled' || session?.status === 'rejected';
  const sessionDetail = session ? getActivityDetail(session.subject, session.title) : null;
  const experience = experienceSummary(data.child.experience_points, data.settings);
  const milestone = data.milestones.find((item) => ['active', 'unlocked'].includes(item.status));
  const [messageOpen, setMessageOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const startSession = async () => {
    setActionError(null);
    try {
      await onStart();
      onStarted();
    } catch (cause) {
      setActionError(childActionError(cause, 'Chưa bắt đầu được buổi học. Hãy thử lại.'));
    }
  };

  return (
    <section className="child-dashboard-panel">
      <div className="child-quick-stats">
        <span><MaterialIcon name="local_fire_department" />{learningStreak(data.sessions)} ngày</span>
        <span><MaterialIcon name="stars" />{experience.points.toLocaleString('vi-VN')} XP</span>
        <button type="button" onClick={onParentAccess}><MaterialIcon name="lock" />Phụ huynh</button>
      </div>

      <article className="child-momentum-card">
        <div className="child-momentum-heading">
          <div><span className="screen-eyebrow"><MaterialIcon name="rocket_launch" />Hành trình ngày mới</span><h1>Chào {formatTodayLabel().toLowerCase()}, {childName}!</h1></div>
          <strong>Cấp {experience.level}</strong>
        </div>
        <div className="milestone-progress-copy"><span>Tiến độ lên Cấp {experience.level + 1}</span><b>{experience.pointsInLevel}/{experience.levelSize} XP</b></div>
        <progress className="dashboard-progress" value={experience.progress} max={100} aria-label={`Tiến độ lên cấp ${experience.level + 1}: ${experience.progress}%`} />
        <p><span className="live-dot" aria-hidden="true" />Đã sẵn sàng cho {Math.max(0, events.length - completedEvents)} nhiệm vụ tiếp theo!</p>
      </article>

      {session ? (
        <article className="child-session-hero">
          <div className="child-session-topline">
            <span><MaterialIcon name="lock" /> Study Lock</span>
            <b>{new Date(session.starts_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</b>
          </div>
          <span className="screen-eyebrow">Nhiệm vụ tiếp theo</span>
          <h1>{session.subject}</h1>
          {sessionDetail ? <p>{sessionDetail}</p> : null}
          <div className="child-session-meta">
            <span><MaterialIcon name="today" /> {session.duration_minutes ?? 0} phút</span>
            <span><MaterialIcon name="check_box" /> {tasks.length} bài</span>
            <span><MaterialIcon name="shield" /> Khóa tập trung</span>
            <span><MaterialIcon name="stars" /> +{estimateSessionPoints(session, data.settings)} XP dự kiến</span>
          </div>
          <button
            type="button"
            disabled={saving || !canStart}
            onClick={() => void startSession()}
            className="child-start-button"
          >
            <MaterialIcon name="school" />
            {saving ? 'Đang bắt đầu…' : canStart ? 'Bắt đầu buổi học' : 'Buổi học chưa thể bắt đầu'}
          </button>
        </article>
      ) : (
        <div className="child-free-time-card">
          <span><MaterialIcon name="event_available" /></span>
          <div><b>Chưa có buổi học cần bắt đầu</b><p>Con xem lịch bên dưới để chuẩn bị cho hoạt động tiếp theo nhé.</p></div>
        </div>
      )}

      <ChildActionFeedback message={actionError} />

      <section className="dashboard-section" aria-labelledby="child-today-schedule">
        <div className="section-heading-row">
          <div><span className="screen-eyebrow">Theo thời gian</span><h2 id="child-today-schedule">Lịch hôm nay</h2></div>
          <span className="section-count">{events.length}</span>
        </div>
        <ScheduleList events={events} />
      </section>

      {milestone ? <article className="child-home-milestone"><span className="milestone-card-icon"><MaterialIcon name="stars" /></span><div><b>Mục tiêu gia đình</b><h2>{milestone.title}</h2>{milestone.description ? <p>{milestone.description}</p> : null}</div><progress className="dashboard-progress" value={milestoneProgress(milestone, experience.points)} max={100} aria-label="Tiến độ mục tiêu gia đình" /></article> : null}

      <div className="child-support-actions">
        <button type="button" disabled title="Khả dụng khi buổi học đang diễn ra"><MaterialIcon name="weekend" />Giải lao trong giờ học</button>
        <button type="button" onClick={() => setMessageOpen(true)}><MaterialIcon name="chat" />Hỏi phụ huynh</button>
      </div>

      <ContactParentDialog open={messageOpen} saving={saving} onSend={onMessageParent} onClose={() => setMessageOpen(false)} />
    </section>
  );
}

function ContactParentDialog({ open, saving, onSend, onClose }: {
  open: boolean;
  saving: boolean;
  onSend: (message: string) => Promise<void>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState('Con cần ba/mẹ hỗ trợ.');
  const [sendError, setSendError] = useState<string | null>(null);
  const dialogRef = useDialogFocusTrap<HTMLDivElement>(open, onClose);
  const sendMessage = async () => {
    setSendError(null);
    try {
      await onSend(message);
      onClose();
    } catch (cause) {
      setSendError(childActionError(cause, 'Chưa gửi được tin nhắn. Hãy thử lại.'));
    }
  };
  if (!open) return null;
  return (
    <div className="app-modal-layer" role="presentation">
      <button type="button" className="app-modal-backdrop" aria-label="Đóng" onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} className="app-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="child-message-title">
        <div className="app-modal-heading">
          <b id="child-message-title">Nhắn phụ huynh</b>
          <button type="button" className="modal-close-button" aria-label="Đóng" onClick={onClose}><MaterialIcon name="close" /></button>
        </div>
        <div className="app-modal-content goal-form">
          <label className="app-field-label">Con muốn nhắn gì?
            <textarea className="gemini-control milestone-description-input" maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} autoFocus />
          </label>
          <ChildActionFeedback message={sendError} />
          <button type="button" className="primary-action modal-submit-button" disabled={saving || !message.trim()} onClick={() => void sendMessage()}>
            {saving ? 'Đang gửi…' : 'Gửi cho ba/mẹ'}
          </button>
        </div>
      </div>
    </div>
  );
}
