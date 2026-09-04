import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryModeScreen } from '../../src/components/EntryModeScreen';
import { MaterialIcon } from '../../src/components/MaterialIcon';
import { ParentGate } from '../../src/components/ParentGate';
import { ChildNav, type ChildTab } from '../../src/features/child/components/ChildNav';
import { ParentNav, type ParentTab } from '../../src/features/parent/components/ParentNav';
import { ThemeProvider } from '../../src/hooks/useTheme';
import type { AccountChild } from '../../src/hooks/useAccountChildren';
import '../../src/style.css';

const child: AccountChild = {
  account_space_id: '10000000-0000-4000-8000-000000000001',
  parent_profile_id: '10000000-0000-4000-8000-000000000002',
  child_profile_id: '10000000-0000-4000-8000-000000000003',
  child_name: 'Minh Triết',
  child_avatar_url: null,
  child_grade_level: 4,
  child_joined_at: '2026-09-04T00:00:00.000Z',
};

const children: AccountChild[] = [
  child,
  {
    ...child,
    account_space_id: '10000000-0000-4000-8000-000000000011',
    child_profile_id: '10000000-0000-4000-8000-000000000013',
    child_name: 'An',
    child_grade_level: 2,
  },
  {
    ...child,
    account_space_id: '10000000-0000-4000-8000-000000000021',
    child_profile_id: '10000000-0000-4000-8000-000000000023',
    child_name: 'Bình',
    child_grade_level: 7,
  },
];

function recordSelection(value: string): Promise<void> {
  document.documentElement.dataset.fixtureSelection = value;
  return Promise.resolve();
}

function ParentNavigationFixture() {
  const [active, setActive] = useState<ParentTab>('today');
  return (
    <main className="app-status-screen">
      <ParentNav active={active} onChange={setActive} />
    </main>
  );
}

function ChildNavigationFixture() {
  const [active, setActive] = useState<ChildTab>('today');
  return (
    <main className="app-status-screen">
      <ChildNav active={active} onChange={setActive} />
    </main>
  );
}

export function UiRegressionFixture() {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'parent-gate') {
    return (
      <main className="app-status-screen">
        <ParentGate
          open
          accountEmail="parent@example.test"
          onClose={() => undefined}
          onVerify={() => Promise.reject(new Error('Fixture verification'))}
        />
      </main>
    );
  }

  if (view === 'parent-pill') {
    return (
      <main className="app-status-screen">
        <div className="child-quick-stats">
          <button type="button"><MaterialIcon name="lock" />Phụ huynh</button>
        </div>
      </main>
    );
  }

  if (view === 'parent-nav') return <ParentNavigationFixture />;
  if (view === 'child-nav') return <ChildNavigationFixture />;

  return (
    <EntryModeScreen
      accountName="Nguyễn Phụ huynh"
      accountEmail="parent@example.test"
      children={children}
      onSelectParent={() => recordSelection('parent')}
      onSelectChild={(selected) => recordSelection(`child:${selected.child_profile_id}`)}
      onLogout={() => recordSelection('logout')}
    />
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root.');
createRoot(root).render(<ThemeProvider><UiRegressionFixture /></ThemeProvider>);
