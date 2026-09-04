// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParentGate } from './ParentGate';

afterEach(() => {
  cleanup();
  document.body.className = '';
});

describe('ParentGate', () => {
  it('focuses the password field and closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ParentGate open accountEmail="parent@example.test" onClose={onClose} onVerify={vi.fn()} />);

    const password = screen.getByLabelText('Mật khẩu tài khoản');
    await waitFor(() => expect(document.activeElement).toBe(password));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not submit an empty password', async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn();
    render(<ParentGate open onClose={vi.fn()} onVerify={onVerify} />);

    await user.click(screen.getByRole('button', { name: 'Mở trang ba/mẹ' }));
    expect(screen.getByRole('alert').textContent).toContain('Vui lòng nhập mật khẩu');
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('keeps the gate locked and restores focus after verification fails', async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn().mockRejectedValue(new Error('Sai mật khẩu'));
    render(<ParentGate open onClose={vi.fn()} onVerify={onVerify} />);

    const password = screen.getByLabelText('Mật khẩu tài khoản');
    await user.type(password, 'not-the-password');
    await user.click(screen.getByRole('button', { name: 'Mở trang ba/mẹ' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Không xác minh được');
    await waitFor(() => expect(document.activeElement).toBe(password));
    expect(onVerify).toHaveBeenCalledWith('not-the-password');
  });
});
