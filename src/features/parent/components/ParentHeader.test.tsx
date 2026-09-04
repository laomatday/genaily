// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParentHeader } from './ParentHeader';

afterEach(cleanup);

const baseProps = {
  childName: 'Minh Triết',
  childAvatarPath: null,
  parentName: 'Nguyễn Phụ huynh',
  parentAvatarUrl: null,
  notificationCount: 0,
  onOpenMenu: vi.fn(),
  onOpenChildProfiles: vi.fn(),
  onShowNotifications: vi.fn(),
};

describe('ParentHeader', () => {
  it('exposes the selected child and all header actions accessibly', async () => {
    const user = userEvent.setup();
    const onOpenChildProfiles = vi.fn();
    const onShowNotifications = vi.fn();
    const onOpenMenu = vi.fn();

    render(
      <ParentHeader
        {...baseProps}
        childProfilesOpen
        notificationCount={12}
        onOpenChildProfiles={onOpenChildProfiles}
        onShowNotifications={onShowNotifications}
        onOpenMenu={onOpenMenu}
      />,
    );

    const childButton = screen.getByRole('button', { name: 'Quản lý hồ sơ của Minh Triết' });
    const notificationButton = screen.getByRole('button', { name: 'Thông báo, 12 chưa đọc' });
    const accountButton = screen.getByRole('button', { name: 'Mở menu tài khoản của Nguyễn Phụ huynh' });

    expect(childButton.getAttribute('aria-haspopup')).toBe('dialog');
    expect(childButton.getAttribute('aria-expanded')).toBe('true');
    expect(notificationButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Lớp 4')).toBeNull();
    expect(screen.getByText('9+')).toBeTruthy();

    await user.click(childButton);
    await user.click(notificationButton);
    await user.click(accountButton);

    expect(onOpenChildProfiles).toHaveBeenCalledOnce();
    expect(onShowNotifications).toHaveBeenCalledOnce();
    expect(onOpenMenu).toHaveBeenCalledOnce();
  });

  it('hides an empty notification badge and falls back to the parent initial', () => {
    const { container } = render(<ParentHeader {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeTruthy();
    expect(container.querySelector('.parent-notification-badge')).toBeNull();
    expect(container.querySelector('.parent-avatar-button > span')?.textContent).toBe('N');
  });

  it('renders the parent photo inside the account control when available', () => {
    const { container } = render(
      <ParentHeader {...baseProps} parentAvatarUrl="https://example.test/parent-avatar.png" />,
    );

    expect(container.querySelector<HTMLImageElement>('.parent-avatar-button > img')?.src)
      .toBe('https://example.test/parent-avatar.png');
  });

  it('renders the selected child photo inside the profile control when available', () => {
    render(
      <ParentHeader
        {...baseProps}
        childAvatarPath="https://example.test/child-avatar.webp"
      />,
    );

    expect(screen.getByRole('img', { name: 'Ảnh đại diện của Minh Triết' }).getAttribute('src'))
      .toBe('https://example.test/child-avatar.webp');
  });
});
