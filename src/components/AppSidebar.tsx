import { useRef } from 'react';
import { useTheme, type ThemePreference } from '../hooks/useTheme';
import { AppLogo } from './AppLogo';
import { MaterialIcon, type MaterialIconName } from './MaterialIcon';
import { PWAInstallButton } from './PWAInstallButton';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

interface AppSidebarProps {
  open: boolean;
  mode: 'parent' | 'child';
  accountName: string;
  accountEmail?: string | null;
  childName: string;
  onClose: () => void;
  onSwitchMode: () => void | Promise<void>;
  onLogout: () => Promise<void>;
}

const themeOptions: Array<{ value: ThemePreference; icon: MaterialIconName; label: string }> = [
  { value: 'light', icon: 'light_mode', label: 'Sáng' },
  { value: 'dark', icon: 'dark_mode', label: 'Tối' },
  { value: 'system', icon: 'desktop_windows', label: 'Theo máy' },
];

export function AppSidebar({
  open,
  mode,
  accountName,
  accountEmail,
  childName,
  onClose,
  onSwitchMode,
  onLogout,
}: AppSidebarProps) {
  const { preference, setPreference } = useTheme();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocusTrap<HTMLElement>(open, onClose, closeButtonRef);

  if (!open) return null;

  return (
    <div className="app-drawer-layer">
      <button type="button" className="app-drawer-backdrop" onClick={onClose} aria-label="Đóng menu" />
      <aside ref={dialogRef} className="app-sidebar" role="dialog" aria-modal="true" aria-label="Menu tài khoản" tabIndex={-1}>
        <header className="app-sidebar-header">
          <div className="app-sidebar-brand">
            <AppLogo className="h-10 w-10 flex-shrink-0" />
            <div>
              <b>genAi Family</b>
              <small>Quản lý lịch và tiến độ</small>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" className="header-icon-button" onClick={onClose} aria-label="Đóng menu">
            <MaterialIcon name="close" className="text-xl" />
          </button>
        </header>

        <section className="app-account-card" aria-label="Thông tin tài khoản">
          <span className="app-account-avatar"><MaterialIcon name="account_circle" /></span>
          <div className="min-w-0">
            <small>Tài khoản phụ huynh</small>
            <b>{accountName || 'Phụ huynh'}</b>
            {accountEmail ? <span>{accountEmail}</span> : null}
          </div>
        </section>

        <nav className="app-sidebar-menu" aria-label="Chức năng tài khoản">
          <MenuButton
            icon={mode === 'parent' ? 'child_care' : 'supervisor_account'}
            label={mode === 'parent' ? 'Góc của bé' : 'Trang ba/mẹ'}
            detail={mode === 'parent' ? `Xem ứng dụng của ${childName || 'bé'}` : 'Quay lại phần quản lý'}
            onClick={() => {
              onClose();
              void Promise.resolve(onSwitchMode()).catch(() => undefined);
            }}
          />
        </nav>

        <section className="app-sidebar-section">
          <b className="app-sidebar-section-title">Giao diện</b>
          <div className="theme-preference-grid" role="radiogroup" aria-label="Chọn giao diện">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={preference === option.value}
                className={`theme-preference-option ${preference === option.value ? 'is-active' : ''}`}
                onClick={() => setPreference(option.value)}
              >
                <MaterialIcon name={option.icon} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="app-sidebar-section app-about-card">
          <div className="app-about-heading">
            <MaterialIcon name="info" />
            <b>Thông tin ứng dụng</b>
          </div>
          <p>genAi Family giúp phụ huynh sắp lịch học, sinh hoạt và theo dõi tiến độ riêng của từng bé.</p>
          <PWAInstallButton />
        </section>

        <button
          type="button"
          className="app-logout-button"
          onClick={() => { onClose(); void onLogout(); }}
        >
          <MaterialIcon name="logout" />
          <span>Đăng xuất</span>
        </button>
      </aside>
    </div>
  );
}

function MenuButton({ icon, label, detail, onClick }: { icon: MaterialIconName; label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="app-menu-button" onClick={onClick}>
      <span className="app-menu-icon"><MaterialIcon name={icon} /></span>
      <span className="app-menu-copy"><b>{label}</b><small>{detail}</small></span>
      <MaterialIcon name="chevron_right" className="text-xl" />
    </button>
  );
}
