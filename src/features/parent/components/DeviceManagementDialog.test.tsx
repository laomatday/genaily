// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyData } from '../../../lib/familyRepository';
import { DeviceManagementDialog } from './DeviceManagementDialog';

function familyData(): FamilyData {
  return {
    parent: { id: 'parent-1', full_name: 'Ba', avatar_url: null, role: 'parent', grade_level: null, experience_points: 0 },
    child: { id: 'child-1', full_name: 'Khang', avatar_url: null, role: 'child', grade_level: 5, experience_points: 0 },
    managedDevices: [],
    deviceCommandDeliveries: [],
  } as FamilyData;
}

describe('DeviceManagementDialog integration', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('creates and shows a one-time pairing code', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({
      deviceId: 'device-1',
      pairingCode: 'ABCDEF0123456789',
      expiresAt: '2026-09-04T10:10:00.000Z',
    });
    render(
      <DeviceManagementDialog
        data={familyData()}
        saving={false}
        onCreate={onCreate}
        onRevoke={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Tạo mã ghép' }));
    expect(onCreate).toHaveBeenCalledWith('Khang · Android', 'android');
    expect(await screen.findByText('ABCD EF01 2345 6789')).toBeTruthy();
    expect(screen.getByText('Mã dùng một lần')).toBeTruthy();
  });

  it('does not count an expired pending code as a paired device and lets the parent replace it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-04T06:00:00.000Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const data = familyData();
    data.managedDevices = [{
      id: 'device-pending',
      family_id: 'family-1',
      child_profile_id: data.child.id,
      display_name: 'Khang · Android',
      platform: 'android',
      status: 'pairing',
      pairing_expires_at: '2026-09-04T05:20:00.000Z',
    } as FamilyData['managedDevices'][number]];
    const onCreate = vi.fn().mockResolvedValue({
      deviceId: 'device-new',
      pairingCode: '0123456789ABCDEF',
      expiresAt: '2026-09-04T06:10:00.000Z',
    });

    render(
      <DeviceManagementDialog
        data={data}
        saving={false}
        onCreate={onCreate}
        onRevoke={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('0 thiết bị')).toBeTruthy();
    expect(screen.getByText('Mã ghép trước đã hết hạn. Hãy tạo mã mới.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tạo mã mới' }));
    expect(onCreate).toHaveBeenCalledWith('Khang · Android', 'android');
    expect(await screen.findByText('0123 4567 89AB CDEF')).toBeTruthy();
  });
});
