// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

describe('ChildProfileSheet avatar editor', () => {
  it('passes a selected image when saving child information', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:avatar-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    const { container } = render(
      <ChildProfileSheet
        open
        children={[child]}
        selectedChildId={child.child_profile_id}
        saving={false}
        onClose={vi.fn()}
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
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }));

    expect(onRename).toHaveBeenCalledWith('Minh', 4, file, false);
  });
});
