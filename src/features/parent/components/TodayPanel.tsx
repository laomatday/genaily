import { ScheduleList } from '../../../components/ScheduleList';
import { StatusBadge } from '../../../components/DesignSystem';
import { MaterialIcon, type MaterialIconName } from '../../../components/MaterialIcon';
import { estimateSessionPoints, experienceSummary } from '../../../domain/engagement';
import { completionPercent, completedSessionMinutes, learningStreak } from '../../../domain/progressMetrics';
import { getActivityDetail } from '../../../domain/schedulePolicy';
import { formatLocalDateKey, formatTodayLabel, getDayKey } from '../../../lib/date';
import type {
  DeviceCommandRow,
  FamilyData,
  LearningSessionRow,
  ScheduleEventRow,
} from '../../../lib/familyRepository';

interface TodayPanelProps {
  data: FamilyData;
  session?: LearningSessionRow;
  onApprove: (session: LearningSessionRow) => Promise<void>;
  onOpenDetails: (session: LearningSessionRow) => void;
  onSelectEvent: (event: ScheduleEventRow) => void;
  onSwitchToChild: () => Promise<void>;
  onOpenDevices: () => void;
  onOpenSetup: () => void;
  saving: boolean;
}

const reflectionLabel: Record<string, string> = {
  easy: 'Dễ hiểu',
  ok: 'Vừa sức',
  hard: 'Cần hỗ trợ',
};

function deviceLabel(command?: DeviceCommandRow) {
  if (!command) return 'Chưa có lệnh thiết bị';
  const labels: Record<string, string> = {
    queued: 'Đang chờ gửi',
    sent: 'Đã gửi thiết bị',
    acknowledged: 'Thiết bị đã xác nhận',
    failed: 'Gửi thiết bị thất bại',
    configuration_required: 'Chưa cấu hình thiết bị',
  };
  return labels[command.status] ?? command.status;
}

interface AutomationStatus {
  icon: MaterialIconName;
  title: string;
  description: string;
  badge: string;
  tone: 'warning' | 'info' | 'success';
}

function getAutomationStatus(
  session: LearningSessionRow | undefined,
  pending: boolean,
  command?: DeviceCommandRow,
): AutomationStatus {
  if (pending) {
    return {
      icon: 'hourglass_top',
      title: 'Đang chờ phụ huynh duyệt',
      description: command ? deviceLabel(command) : 'Kết quả đã được lưu và chưa có lệnh mở khóa.',
      badge: 'Cần duyệt',
      tone: 'warning',
    };
  }
  if (!session) {
    return {
      icon: 'event_available',
      title: 'Theo dõi lịch đang hoạt động',
      description: 'Chưa có buổi tự học cần xử lý lúc này.',
      badge: 'Sẵn sàng',
      tone: 'info',
    };
  }
  if (session.approval_policy === 'auto_approve') {
    return {
      icon: 'verified',
      title: 'Tự động duyệt theo kết quả',
      description: command ? deviceLabel(command) : 'Hoàn thành đủ bài và đạt ít nhất 80% câu hỏi sẽ được duyệt tự động.',
      badge: 'Tự động',
      tone: 'success',
    };
  }
  if (session.approval_policy === 'evidence_required') {
    return {
      icon: 'photo_camera',
      title: 'Tự động duyệt khi có minh chứng',
      description: command ? deviceLabel(command) : 'Cần hoàn thành đủ bài, đạt câu hỏi và gửi ảnh minh chứng.',
      badge: 'Minh chứng',
      tone: 'info',
    };
  }
  return {
    icon: 'family_restroom',
    title: 'Phụ huynh duyệt thủ công',
    description: command ? deviceLabel(command) : 'Kết quả sẽ chờ phụ huynh xác nhận sau khi trẻ nộp bài.',
    badge: 'Thủ công',
    tone: 'info',
  };
}

function ApprovalCard({ data, session, saving, onApprove, onOpenDetails }: {
  data: FamilyData;
  session: LearningSessionRow;
  saving: boolean;
  onApprove: (session: LearningSessionRow) => Promise<void>;
  onOpenDetails: (session: LearningSessionRow) => void;
}) {
  const tasks = data.tasks.filter((task) => task.session_id === session.id);
  const answers = data.answers.filter((answer) => answer.session_id === session.id);
  const taskDone = tasks.filter((task) => task.is_done).length;
  const questionTotal = session.quick_check_total
    ?? data.questions.filter((question) => question.subject === session.subject).length;
  const correct = session.quick_check_score ?? answers.filter((answer) => answer.is_correct).length;
  const points = estimateSessionPoints(session, data.settings);

  return (
    <article className="approval-review-card">
      <div className="approval-review-heading">
        <span className="approval-review-icon"><MaterialIcon name="school" /></span>
        <div className="approval-review-copy">
          <small>{new Date(session.starts_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small>
          <b>{session.subject}</b>
          {getActivityDetail(session.subject, session.title) ? <span>{session.title}</span> : null}
        </div>
        <StatusBadge status="warning" label="Chờ duyệt" />
      </div>
      <div className="approval-review-summary" aria-label="Tóm tắt kết quả">
        <span><b>{taskDone}/{tasks.length}</b>Bài tập</span>
        <span><b>{correct}/{questionTotal}</b>Câu hỏi</span>
        <span><b>{reflectionLabel[session.reflection ?? ''] ?? 'Chưa chọn'}</b>Cảm nhận</span>
        <span><b>{session.evidence_url ? 'Đã gửi' : 'Chưa có'}</b>Minh chứng</span>
      </div>
      <div className="approval-reward-preview">
        <span><MaterialIcon name="workspace_premium" />Điểm phiên học</span>
        <b>+{points} XP</b>
      </div>
      <div className="approval-review-actions">
        <button type="button" className="secondary-action" onClick={() => onOpenDetails(session)}>Xem bài làm</button>
        <button
          type="button"
          className="primary-action"
          disabled={saving}
          onClick={() => void onApprove(session).catch(() => undefined)}
        >
          {saving ? 'Đang lưu…' : `Duyệt & thưởng +${points} XP`}
        </button>
      </div>
    </article>
  );
}

export function TodayPanel({ data, session, onApprove, onOpenDetails, onSelectEvent, onSwitchToChild, onOpenDevices, onOpenSetup, saving }: TodayPanelProps) {
  const childName = data.child.full_name || 'Bé';
  const todayKey = formatLocalDateKey();
  const todayEvents = data.schedule
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
  const completedEvents = todayEvents.filter((event) => event.status === 'completed').length;
  const progress = completionPercent(completedEvents, todayEvents.length);
  const todaySessions = data.sessions.filter((item) => formatLocalDateKey(new Date(item.starts_at)) === todayKey);
  const pendingSessions = data.sessions
    .filter((item) => item.status === 'awaiting_parent')
    .sort((left, right) => new Date(right.starts_at).getTime() - new Date(left.starts_at).getTime());
  const isPending = session?.status === 'awaiting_parent';
  const isFinished = session?.status === 'approved' || session?.status === 'completed';
  const latestCommand = data.deviceCommands.find((command) => command.session_id === session?.id);
  const automation = getAutomationStatus(session, isPending, latestCommand);
  const experience = experienceSummary(data.child.experience_points, data.settings);
  const activeDevices = data.managedDevices.filter((device) => device.status === 'active');

  return (
    <section className="dashboard-panel">
      <button type="button" className="mode-switch-hero" onClick={onOpenDevices}>
        <span className="mode-switch-icon"><MaterialIcon name="devices" /></span>
        <span className="mode-switch-copy">
          <small>Study Lock trên thiết bị</small>
          <b>{activeDevices.length > 0 ? `${activeDevices.length} thiết bị của ${childName}` : `Ghép thiết bị cho ${childName}`}</b>
        </span>
        <span className="mode-switch-action">{activeDevices.length > 0 ? 'Đã ghép' : 'Quản lý'} <MaterialIcon name="arrow_forward" /></span>
      </button>

      <article className="daily-overview-card">
        <div className="daily-overview-heading">
          <div><span className="live-dot" aria-hidden="true" /><b>Động lực hôm nay</b></div>
          <strong className="streak-pill"><MaterialIcon name="local_fire_department" />Chuỗi {learningStreak(data.sessions)} ngày</strong>
        </div>
        <div className="daily-progress-copy">
          <span>Mục tiêu tập trung</span>
          <span><b>{completedSessionMinutes(todaySessions)}</b>/{todayEvents.reduce((sum, event) => sum + event.duration_minutes, 0)} phút ({progress}%)</span>
        </div>
        <progress className="dashboard-progress" value={progress} max={100} aria-label={`Tiến độ hôm nay ${progress}%`} />
        <div className="daily-stat-grid daily-stat-grid-two">
          <span><MaterialIcon name="check_circle" /><b>{completedEvents}/{todayEvents.length}</b>Đã hoàn thành</span>
          <span><MaterialIcon name="stars" /><b>+{todaySessions.reduce((sum, item) => sum + item.awarded_points, 0)} XP</b>Điểm hôm nay · Cấp {experience.level}</span>
        </div>
      </article>

      <div className={`automation-strip is-${automation.tone}`}>
        <span className="automation-strip-icon"><MaterialIcon name={automation.icon} /></span>
        <span><b>{automation.title}</b><small>{automation.description}</small></span>
        <StatusBadge status={automation.tone} label={automation.badge} />
      </div>

      {pendingSessions.length > 0 ? (
        <section className="dashboard-section" aria-labelledby="pending-approvals-title">
          <div className="section-heading-row">
            <div><h2 id="pending-approvals-title">Chờ phụ huynh duyệt</h2></div>
            <span className="section-count">{pendingSessions.length}</span>
          </div>
          <div className="dashboard-stack">
            {pendingSessions.map((pendingSession) => (
              <ApprovalCard
                key={pendingSession.id}
                data={data}
                session={pendingSession}
                saving={saving}
                onApprove={onApprove}
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        </section>
      ) : session ? (
        <article className="current-session-card">
          <span className="screen-eyebrow">Buổi học tiếp theo</span>
          <h2>{session.subject}</h2>
          {getActivityDetail(session.subject, session.title) ? <p>{session.title}</p> : null}
          <div className="current-session-meta">
            <span>{new Date(session.starts_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
            <span>{session.duration_minutes ?? 0} phút</span>
          </div>
          <div className="approval-review-actions">
            <button type="button" className="secondary-action" onClick={() => onOpenDetails(session)}>Chi tiết</button>
            <button type="button" className="primary-action" onClick={() => void onSwitchToChild().catch(() => undefined)}>
              {isFinished ? 'Xem góc của bé' : 'Bắt đầu bên trẻ'}
            </button>
          </div>
        </article>
      ) : null}

      <section className="dashboard-section" aria-labelledby="today-schedule-title">
        <div className="section-heading-row">
          <div><h2 id="today-schedule-title">Lịch học hôm nay</h2><small>{formatTodayLabel()}</small></div>
          <button type="button" className="section-text-button" onClick={onOpenSetup}><MaterialIcon name="tune" /> Tùy chỉnh</button>
        </div>
        <ScheduleList events={todayEvents} onEdit={onSelectEvent} />
        <button type="button" className="add-activity-button" onClick={onOpenSetup}><MaterialIcon name="add" />Thêm nhiệm vụ hoặc đọc tự do</button>
      </section>
    </section>
  );
}
