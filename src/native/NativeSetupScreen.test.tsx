// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeDeviceStatus } from './studyLock';
const mock = vi.hoisted(() => ({
  status: null as NativeDeviceStatus | null,
  refresh: vi.fn(), provision: vi.fn(), chooseApps: vi.fn(), permissions: vi.fn(),
}));
vi.mock('./useNativeDevice', () => ({ useNativeDevice: () => ({ status: mock.status, error: null, refresh: mock.refresh }) }));
vi.mock('./studyLock', () => ({
  isBoundTo: (s: NativeDeviceStatus, c: { familyId: string; childProfileId: string }) => s.paired && s.familyId === c.familyId && s.childProfileId === c.childProfileId,
  isReadyForChild: (s: NativeDeviceStatus, c: { familyId: string; childProfileId: string }) => s.paired && s.familyId === c.familyId && s.childProfileId === c.childProfileId && s.accessibilityEnabled && s.selectedAppCount > 0,
  nativeStudyLock: mock,
}));
vi.mock('../components/AppLogo', () => ({ AppLogo: () => <span>genaily</span> }));
vi.mock('../components/MaterialIcon', () => ({ MaterialIcon: () => null }));
import { NativeSetupScreen } from './NativeSetupScreen';
const context = { familyId: 'family', childProfileId: 'child', parentProfileId: 'parent' };
const ready: NativeDeviceStatus = { paired: true, familyId: 'family', childProfileId: 'child', accessibilityEnabled: true,
  selectedAppCount: 2, lockActive: false, lastHeartbeat: 1, serverVerified: true, protectionLevel: 'selected_apps', error: null, version: 'test' };
const complete = vi.fn();
function show() { return render(<NativeSetupScreen context={context} childName="Bé Hai" onComplete={complete} onBack={vi.fn()} />); }
describe('native setup screen', () => {
  beforeEach(() => { vi.clearAllMocks(); mock.status = { ...ready }; mock.refresh.mockResolvedValue({ ...ready }); complete.mockResolvedValue(undefined); });
  afterEach(cleanup);
  it('does not silently rebind another child', () => {
    mock.status = { ...ready, childProfileId: 'other' }; show();
    expect((screen.getByRole('button', { name: 'Kết nối thiết bị này' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Hoàn tất/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('requires explicit consent before opening Accessibility settings', () => {
    show(); const button = screen.getByRole('button', { name: 'Mở cài đặt Trợ năng' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button.disabled).toBe(false);
  });
  it('keeps child entry disabled without protection permissions', () => {
    mock.status = { ...ready, accessibilityEnabled: false }; show();
    expect((screen.getByRole('button', { name: /Hoàn tất/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('rechecks native readiness at handover, not only the cached UI', async () => {
    mock.refresh.mockResolvedValue({ ...ready, selectedAppCount: 0 }); show();
    fireEvent.click(screen.getByRole('button', { name: /Hoàn tất/ }));
    await screen.findByRole('alert');
    expect(complete).not.toHaveBeenCalled();
  });
  it('finishes only through the server-backed handover callback', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: /Hoàn tất/ }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  });
  it('shows provisioning errors without claiming a connected device', async () => {
    mock.status = { ...ready, paired: false }; mock.provision.mockRejectedValue(new Error('Parent access required')); show();
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối thiết bị này' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Parent access required');
    expect(complete).not.toHaveBeenCalled();
  });
});
