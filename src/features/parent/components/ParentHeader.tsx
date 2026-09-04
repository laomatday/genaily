import { OfflineIndicator } from '../../../components/OfflineIndicator';
import { ChildAvatar } from '../../../components/ChildAvatar';
import { MaterialIcon } from '../../../components/MaterialIcon';

interface ParentHeaderProps {
  childName: string;
  childAvatarPath?: string | null;
  parentName: string;
  parentAvatarUrl: string | null;
  notificationCount?: number;
  childProfilesOpen?: boolean;
  notificationsOpen?: boolean;
  menuOpen?: boolean;
  onOpenMenu: () => void;
  onOpenChildProfiles: () => void;
  onShowNotifications?: () => void;
}

export function ParentHeader({
  childName,
  childAvatarPath,
  parentName,
  parentAvatarUrl,
  notificationCount = 0,
  childProfilesOpen = false,
  notificationsOpen = false,
  menuOpen = false,
  onOpenMenu,
  onOpenChildProfiles,
  onShowNotifications,
}: ParentHeaderProps) {
  const displayChild = childName || 'Bé';
  const parentInitial = parentName.trim().charAt(0).toUpperCase() || 'P';
  const notificationLabel = notificationCount > 0
    ? `Thông báo, ${notificationCount} chưa đọc`
    : 'Thông báo';

  return (
    <>
      <header className="parent-compact-header" aria-label="Thanh điều khiển phụ huynh">
        <button
          type="button"
          className={`parent-child-pill ${childProfilesOpen ? 'is-active' : ''}`}
          onClick={onOpenChildProfiles}
          aria-label={`Quản lý hồ sơ của ${displayChild}`}
          aria-haspopup="dialog"
          aria-expanded={childProfilesOpen}
        >
          <ChildAvatar className="parent-child-avatar" name={displayChild} avatarPath={childAvatarPath} />
          <span className="parent-child-copy">
            <b>{displayChild}</b>
          </span>
          <MaterialIcon name="expand_more" className="parent-child-chevron" />
        </button>
        <div className="parent-header-actions">
            <button
              type="button"
              onClick={onShowNotifications}
              className={`parent-notification-button ${notificationsOpen ? 'is-active' : ''}`}
              title="Thông báo"
              aria-label={notificationLabel}
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
            >
              <MaterialIcon name="notifications" className="parent-notification-icon" />
              {notificationCount > 0 && (
                <span className="parent-notification-badge" aria-hidden="true">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenMenu}
              className={`parent-avatar-button ${menuOpen ? 'is-active' : ''}`}
              title="Mở menu"
              aria-label={`Mở menu tài khoản của ${parentName || 'phụ huynh'}`}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              {parentAvatarUrl
                ? <img src={parentAvatarUrl} alt="" />
                : <span>{parentInitial}</span>}
            </button>
        </div>
      </header>
      <OfflineIndicator />
    </>
  );
}
