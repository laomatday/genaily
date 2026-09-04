import { MaterialIcon, type MaterialIconName } from '../../../components/MaterialIcon';

export type ChildTab = 'today' | 'week' | 'rewards' | 'progress';

const items: Array<{ tab: ChildTab; icon: MaterialIconName; label: string }> = [
  { tab: 'today', icon: 'today', label: 'Nhiệm vụ' },
  { tab: 'week', icon: 'calendar_month', label: 'Lịch' },
  { tab: 'rewards', icon: 'redeem', label: 'Phần thưởng' },
  { tab: 'progress', icon: 'military_tech', label: 'Thành tựu' },
];

export function ChildNav({ active, onChange }: { active: ChildTab; onChange: (tab: ChildTab) => void }) {
  return (
    <nav aria-label="Điều hướng dành cho trẻ" className="app-bottom-nav child-bottom-nav">
      {items.map((item) => (
        <button
          key={item.tab}
          type="button"
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
