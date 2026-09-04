import { OfflineIndicator } from '../../../components/OfflineIndicator';
import { AppLogo } from '../../../components/AppLogo';
import { ChildAvatar } from '../../../components/ChildAvatar';
import { MaterialIcon } from '../../../components/MaterialIcon';

interface ParentHeaderProps {
  childName: string;
  childGrade: number | null;
  childAvatarPath?: string | null;
  parentName: string;
  parentAvatarUrl: string | null;
  notificationCount?: number;
  onOpenMenu: () => void;
  onOpenChildProfiles: () => void;
  onShowNotifications?: () => void;
}

export function ParentHeader({
  childName,
  childGrade,
  childAvatarPath,
  parentName,
  parentAvatarUrl,
  notificationCount = 0,
  onOpenMenu,
  onOpenChildProfiles,
  onShowNotifications,
}: ParentHeaderProps) {
  const displayChild = childName || 'Bé';
  const parentInitial = parentName.trim().charAt(0).toUpperCase() || 'P';

  return (
    <>
      <header className="parent-compact-header">
        <AppLogo className="parent-compact-logo" />
        <button
          type="button"
          className="parent-child-pill"
          onClick={onOpenChildProfiles}
          aria-label={`Quản lý hồ sơ của ${displayChild}`}
          aria-haspopup="dialog"
        >
          <ChildAvatar className="parent-child-avatar" name={displayChild} avatarPath={childAvatarPath} />
          <span>{displayChild}{childGrade ? ` (Lớp ${childGrade})` : ''}</span>
          <MaterialIcon name="expand_more" />
        </button>
        <div className="parent-header-actions">
            <button
              type="button"
              onClick={onShowNotifications}
              className="parent-notification-button"
              title="Thông báo"
              aria-label="Thông báo"
            >
              <MaterialIcon name="notifications" className="parent-notification-icon" />
              {notificationCount > 0 && (
                <span className="parent-notification-badge">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenMenu}
              className="parent-avatar-button"
              title="Mở menu"
              aria-label="Mở menu tài khoản"
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
