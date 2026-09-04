import { ChildAvatar } from '../../../components/ChildAvatar';
import { MaterialIcon } from '../../../components/MaterialIcon';

interface ChildHeaderProps {
  avatarPath?: string | null;
  childName: string;
  menuOpen?: boolean;
  onOpenMenu: () => void;
}

export function ChildHeader({
  avatarPath,
  childName,
  menuOpen = false,
  onOpenMenu,
}: ChildHeaderProps) {
  const displayName = childName.trim() || 'Bé';

  return (
    <header className="child-app-header" aria-label="Thanh điều khiển của bé">
      <div className="child-identity-pill">
        <ChildAvatar
          avatarPath={avatarPath}
          className="child-header-avatar"
          name={displayName}
        />
        <span className="child-header-copy">
          <b>{displayName}</b>
        </span>
      </div>
      <button
        type="button"
        className={`header-icon-button header-action-control child-header-menu ${menuOpen ? 'is-active' : ''}`}
        onClick={onOpenMenu}
        aria-label={`Mở menu tài khoản của ${displayName}`}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
      >
        <MaterialIcon name="menu" />
      </button>
    </header>
  );
}
