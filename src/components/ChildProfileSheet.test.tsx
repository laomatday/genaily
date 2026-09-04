// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountChild } from '../hooks/useAccountChildren';
import { ChildProfileSheet } from './ChildProfileSheet';

const child: AccountChild = {
  account_space_id: '10000000-0000-4000-8000-000000000001',
  parent_profile_id: '10000000-0000-4000-8000-000000000002',
  child_profile_id: '10000000-0000-4000-8000-000000000003',
  child_name: 'Minh',
  child_avatar_url: null,
  child_grade_level: 4,
  child_joined_at: '2026-09-04T00:00:00.000Z',
};

afterEach(cleanup);

describe('ChildProfileSheet avatar editor', () => {
  it('passes a selected image when saving child information', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:avatar-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    const { container } = render(
      <ChildProfileSheet
        open
        children={[child]}
        selectedChildId={child.child_profile_id}
        saving={false}
        onClose={onClose}
        onSelect={vi.fn()}
        onRename={onRename}
        onAdd={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Sửa thông tin' }));
    const file = new File(['avatar'], 'minh.png', { type: 'image/png' });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    await user.upload(input!, file);

    // Returning from a native mobile file picker focuses the web view again.
    // The avatar draft must remain open until the parent explicitly saves it.
    window.dispatchEvent(new Event('focus'));
    expect(screen.getByRole('dialog', { name: 'Quản lý hồ sơ trẻ' })).toBeTruthy();
    expect(container.querySelector<HTMLImageElement>('img[src="blob:avatar-preview"]')).toBeTruthy();
    expect(onRename).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }));

    expect(onRename).toHaveBeenCalledWith('Minh', 4, file, false);
  });

  it('shows the avatar picker and passes the selected image when adding a child', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue({
      ...child,
      child_profile_id: '10000000-0000-4000-8000-000000000004',
      child_name: 'Lan',
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:new-avatar-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    const { container } = render(
      <ChildProfileSheet
        open
        children={[child]}
        selectedChildId={child.child_profile_id}
        saving={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onAdd={onAdd}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Thêm bé' }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();

    const file = new File(['new-avatar'], 'lan.webp', { type: 'image/webp' });
    await user.upload(input!, file);
    await user.type(screen.getByRole('textbox', { name: 'Tên bé / học sinh' }), 'Lan');
    await user.click(screen.getByRole('button', { name: 'Lớp đang học: Chọn lớp hiện tại' }));
    await user.click(screen.getByRole('option', { name: 'Lớp 4' }));
    await user.click(screen.getByRole('button', { name: 'Thêm bé' }));

    expect(onAdd).toHaveBeenCalledWith('Lan', 4, file);
  });
});
