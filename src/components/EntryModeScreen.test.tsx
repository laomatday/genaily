// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountChild } from '../hooks/useAccountChildren';
import { EntryModeScreen } from './EntryModeScreen';

vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <button type="button" aria-label="Đổi giao diện">Giao diện</button>,
}));

afterEach(cleanup);

const child: AccountChild = {
  account_space_id: '10000000-0000-4000-8000-000000000001',
  parent_profile_id: '10000000-0000-4000-8000-000000000002',
  child_profile_id: '10000000-0000-4000-8000-000000000003',
  child_name: 'Minh',
  child_avatar_url: null,
  child_grade_level: 4,
  child_joined_at: '2026-09-04T00:00:00.000Z',
};

const secondChild: AccountChild = {
  ...child,
  account_space_id: '10000000-0000-4000-8000-000000000011',
  child_profile_id: '10000000-0000-4000-8000-000000000013',
  child_name: 'An',
  child_grade_level: 2,
};

const thirdChild: AccountChild = {
  ...child,
  account_space_id: '10000000-0000-4000-8000-000000000021',
  child_profile_id: '10000000-0000-4000-8000-000000000023',
  child_name: 'Bình',
  child_grade_level: 7,
};

function renderScreen(overrides: Partial<Parameters<typeof EntryModeScreen>[0]> = {}) {
  const props: Parameters<typeof EntryModeScreen>[0] = {
    accountName: 'Mẹ An',
    accountEmail: 'parent@example.test',
    children: [child],
    onSelectParent: vi.fn().mockResolvedValue(undefined),
    onSelectChild: vi.fn().mockResolvedValue(undefined),
    onLogout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<EntryModeScreen {...props} />);
  return props;
}

describe('EntryModeScreen', () => {
  it('opens parent mode only after the parent chooses it', async () => {
    const user = userEvent.setup();
    const props = renderScreen();

    expect(screen.getByRole('heading', { name: 'Ai đang sử dụng ứng dụng?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Ba\/mẹ/ }));

    expect(props.onSelectParent).toHaveBeenCalledTimes(1);
    expect(props.onSelectChild).not.toHaveBeenCalled();
  });

  it('requires an explicit child profile before opening child mode', async () => {
    const user = userEvent.setup();
    const props = renderScreen();

    await user.click(screen.getByRole('button', { name: /^Trẻ/ }));
    expect(screen.getByRole('heading', { name: 'Chọn hồ sơ của con' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Minh.*Lớp 4/ }));

    expect(props.onSelectChild).toHaveBeenCalledWith(child);
    expect(props.onSelectParent).not.toHaveBeenCalled();
  });

  it('never auto-selects a child and supports choosing the exact profile when the account has more than two children', async () => {
    const user = userEvent.setup();
    const props = renderScreen({ children: [child, secondChild, thirdChild], initialStep: 'child' });

    expect(screen.getByRole('heading', { name: 'Chọn hồ sơ của con' })).toBeTruthy();
    expect(props.onSelectChild).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /Lớp/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /Bình.*Lớp 7/ }));

    expect(props.onSelectChild).toHaveBeenCalledTimes(1);
    expect(props.onSelectChild).toHaveBeenCalledWith(thirdChild);
  });

  it('disables child mode until a profile exists and offers parent setup', async () => {
    const user = userEvent.setup();
    const props = renderScreen({ children: [] });
    expect((screen.getByRole('button', { name: /^Trẻ/ }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Thiết lập hồ sơ' }));
    expect(props.onSelectParent).toHaveBeenCalledTimes(1);
  });

  it('keeps the chooser visible and announces a server error', async () => {
    const user = userEvent.setup();
    renderScreen({ onSelectParent: vi.fn().mockRejectedValue(new Error('Máy chủ từ chối lựa chọn.')) });

    await user.click(screen.getByRole('button', { name: /Ba\/mẹ/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Máy chủ từ chối lựa chọn.');
    expect(screen.getByRole('heading', { name: 'Ai đang sử dụng ứng dụng?' })).toBeTruthy();
  });

  it('announces a pending selection and prevents duplicate submits', async () => {
    const user = userEvent.setup();
    const onSelectParent = vi.fn(() => new Promise<void>(() => undefined));
    renderScreen({ onSelectParent });

    const parentOption = screen.getByRole('button', { name: /Ba\/mẹ/ });
    await user.click(parentOption);

    expect(screen.getByRole('status').textContent).toContain('Đang mở không gian đã chọn');
    expect((parentOption as HTMLButtonElement).disabled).toBe(true);
    await user.click(parentOption);
    expect(onSelectParent).toHaveBeenCalledTimes(1);
  });
});
