// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
});
