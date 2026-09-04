import { MaterialIcon, type MaterialIconName } from '../../../components/MaterialIcon';

export type ParentTab = 'today' | 'week' | 'plan' | 'learning' | 'exceptions';

const items: Array<{ tab: ParentTab; icon: MaterialIconName; label: string }> = [
  { tab: 'today', icon: 'today', label: 'Hôm nay' },
  { tab: 'week', icon: 'calendar_month', label: 'Lịch' },
  { tab: 'plan', icon: 'auto_awesome', label: 'Kế hoạch' },
  { tab: 'learning', icon: 'school', label: 'Học tập' },
  { tab: 'exceptions', icon: 'event_busy', label: 'Ngoại lệ' },
];

export function ParentNav({ active, onChange }: { active: ParentTab; onChange: (tab: ParentTab) => void }) {
  return (
    <nav aria-label="Điều hướng dành cho phụ huynh" className="app-bottom-nav parent-bottom-nav">
      {items.map((item) => (
        <button
          type="button"
          key={item.tab}
          aria-label={item.label}
          title={item.label}
          aria-current={active === item.tab ? 'page' : undefined}
          onClick={() => onChange(item.tab)}
          className={active === item.tab ? 'is-active' : ''}
        >
          <MaterialIcon name={item.icon} filled={active === item.tab} className="bottom-nav-icon" />
        </button>
      ))}
    </nav>
  );
}
