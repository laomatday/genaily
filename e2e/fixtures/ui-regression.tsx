import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryModeScreen } from '../../src/components/EntryModeScreen';
import { MaterialIcon } from '../../src/components/MaterialIcon';
import { ParentGate } from '../../src/components/ParentGate';
import { ChildHeader } from '../../src/features/child/components/ChildHeader';
import { ChildNav, type ChildTab } from '../../src/features/child/components/ChildNav';
import { ParentHeader } from '../../src/features/parent/components/ParentHeader';
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

function ScrollFixtureContent({ label }: { label: string }) {
  return (
    <section className="child-dashboard-panel" aria-label={`Nội dung cuộn ${label}`}>
      {Array.from({ length: 16 }, (_, index) => (
        <article key={index} className="rounded-2xl border app-border-color app-surface p-4 shadow-sm">
          <b className="block text-sm">{label} {index + 1}</b>
          <p className="mt-1 text-xs app-text-muted">
            Nội dung kiểm thử giúp trang đủ dài để xác nhận header luôn hiển thị khi cuộn.
          </p>
        </article>
      ))}
    </section>
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

  if (view === 'parent-header') {
    return (
      <main className="app-shell min-h-screen app-background app-text-color">
        <ParentHeader
          childName="Minh Triết có một tên hồ sơ rất dài"
          childAvatarPath={null}
          parentName="Nguyễn Phụ huynh"
          parentAvatarUrl={null}
          notificationCount={12}
          onOpenChildProfiles={() => void recordSelection('profiles')}
          onShowNotifications={() => void recordSelection('notifications')}
          onOpenMenu={() => void recordSelection('menu')}
        />
        <div className="parent-dashboard-content"><ScrollFixtureContent label="Mục phụ huynh" /></div>
      </main>
    );
  }

  if (view === 'child-header') {
    return (
      <main className="app-shell min-h-screen app-background app-text-color">
        <ChildHeader
          avatarPath="https://example.test/child-avatar.svg"
          childName="Minh Triết"
          onOpenMenu={() => void recordSelection('child-menu')}
        />
        <ScrollFixtureContent label="Nhiệm vụ của bé" />
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
