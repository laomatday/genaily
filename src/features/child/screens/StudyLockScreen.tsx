import { useState } from 'react';
import { MaterialIcon } from '../../../components/MaterialIcon';
import type { DeviceCommandRow, LearningSessionRow } from '../../../lib/familyRepository';
import { ChildActionFeedback, childActionError } from '../components/ChildActionFeedback';
import { resolveStudyLockState, studyLockStartLabel } from '../studyLockState';

interface StudyLockScreenProps {
  session: LearningSessionRow;
  command?: DeviceCommandRow;
  breakMessage: string | null;
  saving: boolean;
  breakMinutes: number;
  studyLockEnabled: boolean;
  onFocus: () => void;
  onBreak: () => Promise<void>;
  onBreakSent: () => void;
}

export function StudyLockScreen({
  session,
  command,
  breakMessage,
  saving,
  breakMinutes,
  studyLockEnabled,
  onFocus,
  onBreak,
  onBreakSent,
}: StudyLockScreenProps) {
  const lockState = resolveStudyLockState(studyLockEnabled, command?.status);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestBreak = async () => {
    setActionError(null);
    try {
      await onBreak();
      onBreakSent();
    } catch (cause) {
      setActionError(childActionError(cause, 'Chưa gửi được yêu cầu nghỉ. Hãy thử lại.'));
    }
  };

  return (
    <section className="study-lock-screen child-full-screen">
      <header className="study-lock-header">
        <span className="study-lock-brand"><MaterialIcon name="shield" />Study Lock</span>
        <span
          className={`study-lock-command is-${lockState.tone}`}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />{lockState.label}
        </span>
      </header>

      <div className="study-lock-main">
        <span className="study-lock-icon"><MaterialIcon name="lock" /></span>
        <span className="screen-eyebrow">Đến giờ tập trung</span>
        <h1>{session.subject}</h1>
        <p>{lockState.detail}</p>
        <div className="study-lock-details">
          <span><MaterialIcon name="today" /><b>{session.duration_minutes ?? 0} phút</b>Thời lượng</span>
          <span><MaterialIcon name="family_restroom" /><b>{session.approval_policy === 'parent_required' ? 'Ba/mẹ' : 'Tự động'}</b>Duyệt kết quả</span>
        </div>
        {breakMessage ? <p className="focus-break-message">{breakMessage}</p> : null}
        <ChildActionFeedback message={actionError ?? command?.error_message ?? null} />
      </div>

      <footer className="focus-actions">
        <button type="button" onClick={onFocus} className="focus-complete-button">
          <MaterialIcon name="school" /> {studyLockStartLabel(lockState)}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void requestBreak()}
          className="focus-break-button"
        >
          <MaterialIcon name="weekend" /> {saving ? 'Đang gửi…' : `Xin nghỉ ${breakMinutes} phút`}
        </button>
      </footer>
    </section>
  );
}
