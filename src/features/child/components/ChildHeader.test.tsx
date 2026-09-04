// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildHeader } from './ChildHeader';

afterEach(cleanup);

describe('ChildHeader', () => {
  it('renders an HTTPS child avatar with only the child name', () => {
    render(
      <ChildHeader
        avatarPath="https://example.test/child-avatar.webp"
        childName="Khôi"
        onOpenMenu={vi.fn()}
      />,
    );

    const avatar = screen.getByRole('img', { name: 'Ảnh đại diện của Khôi' });
    expect(avatar.getAttribute('src')).toBe('https://example.test/child-avatar.webp');
    expect(screen.getByText('Khôi')).toBeTruthy();
    expect(screen.queryByText(/Lớp|Tasks Learning/i)).toBeNull();
  });

  it('falls back to the child initial and a neutral name', () => {
    const { container, rerender } = render(
      <ChildHeader childName="Minh" onOpenMenu={vi.fn()} />,
    );

    expect(container.querySelector('.child-header-avatar > span')?.textContent).toBe('M');

    rerender(<ChildHeader childName="   " onOpenMenu={vi.fn()} />);
    expect(screen.getByText('Bé')).toBeTruthy();
    expect(container.querySelector('.child-header-avatar > span')?.textContent).toBe('B');
  });

  it('exposes menu state and invokes its callback', async () => {
    const user = userEvent.setup();
    const onOpenMenu = vi.fn();
    const { rerender } = render(
      <ChildHeader childName="Khôi" onOpenMenu={onOpenMenu} />,
    );

    const menuButton = screen.getByRole('button', { name: 'Mở menu tài khoản của Khôi' });
    expect(menuButton.getAttribute('aria-haspopup')).toBe('dialog');
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');

    await user.click(menuButton);
    expect(onOpenMenu).toHaveBeenCalledOnce();

    rerender(<ChildHeader childName="Khôi" menuOpen onOpenMenu={onOpenMenu} />);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(menuButton.classList.contains('is-active')).toBe(true);
  });
});
