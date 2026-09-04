import { useState } from 'react';
import type { AccountChild } from '../hooks/useAccountChildren';
import { AppLogo } from './AppLogo';
import { ChildAvatar } from './ChildAvatar';
import { MaterialIcon } from './MaterialIcon';
import { ThemeToggle } from './ThemeToggle';

interface EntryModeScreenProps {
  accountName: string;
  accountEmail?: string | null;
  children: AccountChild[];
  childrenError?: string | null;
  initialStep?: 'mode' | 'child';
  onSelectParent: () => Promise<void>;
  onSelectChild: (child: AccountChild) => Promise<void>;
  onLogout: () => Promise<void>;
}

export function EntryModeScreen({
  accountName,
  accountEmail,
  children,
  childrenError,
  initialStep = 'mode',
  onSelectParent,
  onSelectChild,
  onLogout,
}: EntryModeScreenProps) {
  const [step, setStep] = useState<'mode' | 'child'>(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseParent = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSelectParent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không mở được chế độ ba/mẹ.');
      setBusy(false);
    }
  };

  const chooseChild = async (child: AccountChild) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSelectChild(child);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không mở được chế độ trẻ.');
      setBusy(false);
    }
  };

  return (
    <main className="entry-mode-screen app-background app-text-color">
      <div className="entry-mode-shell">
        <header className="entry-mode-header">
          <div className="entry-mode-brand">
            <AppLogo />
            <span>
              <b>genAi Family</b>
              <small>{accountEmail || accountName}</small>
            </span>
          </div>
          <div className="entry-mode-header-actions">
            <ThemeToggle />
            <button
              type="button"
              className="entry-mode-logout"
              aria-label="Đăng xuất"
              disabled={busy}
              onClick={() => void onLogout()}
            >
              <MaterialIcon name="logout" />
            </button>
          </div>
        </header>

        <section className="entry-mode-card" aria-labelledby="entry-mode-title" aria-busy={busy}>
          {step === 'mode' ? (
            <>
              <div className="entry-mode-intro">
                <span className="entry-mode-eyebrow"><MaterialIcon name="family_restroom" />Thiết lập lần đầu</span>
                <h1 id="entry-mode-title">Ai đang sử dụng ứng dụng?</h1>
                <p>Chọn không gian phù hợp. Ba/mẹ có thể chuyển sang Góc của trẻ sau khi thiết lập hồ sơ.</p>
              </div>

              <div className="entry-mode-options">
                <button type="button" className="entry-mode-option is-parent" disabled={busy} onClick={() => void chooseParent()}>
                  <span className="entry-mode-option-icon"><MaterialIcon name="supervisor_account" /></span>
                  <span className="entry-mode-option-copy">
                    <b>Ba/mẹ</b>
                    <small>Quản lý lịch, duyệt kết quả, mục tiêu và thiết bị của con.</small>
                  </span>
                  <MaterialIcon name="chevron_right" className="entry-mode-chevron" />
                </button>

                <button
                  type="button"
                  className="entry-mode-option is-child"
                  disabled={busy || children.length === 0}
                  aria-describedby={children.length === 0 ? 'entry-mode-child-help' : undefined}
                  onClick={() => setStep('child')}
                >
                  <span className="entry-mode-option-icon"><MaterialIcon name="child_care" /></span>
                  <span className="entry-mode-option-copy">
                    <b>Trẻ</b>
                    <small>{children.length > 0 ? 'Xem lịch, học tập và theo dõi phần thưởng của mình.' : 'Cần có hồ sơ trẻ trước khi mở chế độ này.'}</small>
                  </span>
                  <MaterialIcon name="chevron_right" className="entry-mode-chevron" />
                </button>
              </div>

              {children.length === 0 ? (
                <div className="entry-mode-empty" id="entry-mode-child-help">
                  <MaterialIcon name="info" />
                  <span>Chưa có hồ sơ trẻ. Hãy tiếp tục với Ba/mẹ để tạo hồ sơ đầu tiên.</span>
                  <button type="button" disabled={busy} onClick={() => void chooseParent()}>Thiết lập hồ sơ</button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="entry-mode-child-heading">
                <button type="button" className="entry-mode-back" disabled={busy} aria-label="Quay lại chọn chế độ" onClick={() => setStep('mode')}>
                  <MaterialIcon name="arrow_back" />
                </button>
                <div>
                  <span className="entry-mode-eyebrow"><MaterialIcon name="child_care" />Góc của trẻ</span>
                  <h1 id="entry-mode-title">Chọn hồ sơ của con</h1>
                  <p>Sau khi vào, cần mật khẩu tài khoản để quay lại khu vực ba/mẹ.</p>
                </div>
              </div>

              <div className="entry-mode-child-list">
                {children.map((child) => (
                  <button
                    type="button"
                    className="entry-mode-child-option"
                    key={child.child_profile_id}
                    disabled={busy}
                    onClick={() => void chooseChild(child)}
                  >
                    <ChildAvatar className="entry-mode-child-avatar" name={child.child_name} avatarPath={child.child_avatar_url} />
                    <span>
                      <b>{child.child_name || 'Bé'}</b>
                      <small>{child.child_grade_level ? `Lớp ${child.child_grade_level}` : 'Chưa cập nhật lớp'}</small>
                    </span>
                    <MaterialIcon name="chevron_right" />
                  </button>
                ))}
              </div>
              {children.length === 0 ? (
                <div className="entry-mode-empty">
                  <MaterialIcon name="info" />
                  <span>Không tìm thấy hồ sơ trẻ nào cho tài khoản này. Quay lại để mở khu vực ba/mẹ.</span>
                </div>
              ) : null}
            </>
          )}

          {busy ? (
            <p className="entry-mode-loading" role="status">
              <MaterialIcon name="sync" />
              Đang mở không gian đã chọn…
            </p>
          ) : null}

          {(error || childrenError) ? <p className="entry-mode-error" role="alert">{error ?? childrenError}</p> : null}

          <p className="entry-mode-security-note">
            <MaterialIcon name="shield" />
            Chế độ trẻ được khóa theo phiên đăng nhập và không thể mở quyền ba/mẹ bằng cách sửa URL.
          </p>
        </section>
      </div>
    </main>
  );
}
