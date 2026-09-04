import { MaterialIcon } from '../../../components/MaterialIcon';
import type { DeviceCommandRow, LearningSessionRow } from '../../../lib/familyRepository';

interface StudyLockScreenProps {
  session: LearningSessionRow;
  command?: DeviceCommandRow;
  breakMessage: string | null;
  saving: boolean;
  breakMinutes: number;
  onFocus: () => void;
  onBreak: () => Promise<void>;
  onBreakSent: () => void;
}

const commandStatusLabel: Record<string, string> = {
  queued: 'Đang chờ gửi tới thiết bị',
  sent: 'Đã gửi tới thiết bị',
  acknowledged: 'Thiết bị đã xác nhận khóa',
  failed: 'Chưa khóa được thiết bị',
  configuration_required: 'Cần cấu hình thiết bị',
};

export function StudyLockScreen({ session, command, breakMessage, saving, breakMinutes, onFocus, onBreak, onBreakSent }: StudyLockScreenProps) {
  const commandText = command ? commandStatusLabel[command.status] ?? command.status : 'Đang chuẩn bị khóa tập trung';
  const isReady = command?.status === 'acknowledged' || command?.status === 'sent';

  return (
    <section className="study-lock-screen">
      <header className="study-lock-header">
        <span className="study-lock-brand"><MaterialIcon name="shield" />Study Lock</span>
        <span className={`study-lock-command ${isReady ? 'is-ready' : ''}`}><span aria-hidden="true" />{commandText}</span>
      </header>

      <main className="study-lock-main">
        <span className="study-lock-icon"><MaterialIcon name="lock" /></span>
        <span className="screen-eyebrow">Đến giờ tập trung</span>
        <h1>{session.subject}</h1>
        <p>Study Lock giúp con giữ nhịp học bằng cách tạm khóa ứng dụng giải trí trong khung giờ này.</p>
        <div className="study-lock-details">
          <span><MaterialIcon name="today" /><b>{session.duration_minutes ?? 0} phút</b>Thời lượng</span>
          <span><MaterialIcon name="family_restroom" /><b>{session.approval_policy === 'parent_required' ? 'Ba/mẹ' : 'Tự động'}</b>Duyệt kết quả</span>
        </div>
        {breakMessage ? <p className="focus-break-message">{breakMessage}</p> : null}
      </main>

      <footer className="focus-actions">
        <button type="button" onClick={onFocus} className="focus-complete-button">
          <MaterialIcon name="school" /> Bắt đầu tập trung
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void onBreak().then(onBreakSent).catch(() => undefined)}
          className="focus-break-button"
        >
          <MaterialIcon name="weekend" /> {saving ? 'Đang gửi…' : `Xin nghỉ ${breakMinutes} phút`}
        </button>
      </footer>
    </section>
  );
}
