import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ native: false, token: 'parent-session',
  provisionChild: vi.fn(), openAppPicker: vi.fn(), getStatus: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => mocks.native ? 'android' : 'web' },
  registerPlugin: () => mocks,
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: mocks.token ? { access_token: mocks.token } : null }, error: null }),
} } }));
import { isNativeAndroid, isBoundTo, isReadyForChild, nativeStudyLock, type NativeDeviceStatus } from './studyLock';
const context = { familyId: 'family', childProfileId: 'child', parentProfileId: 'parent' };
const ready: NativeDeviceStatus = { paired: true, familyId: 'family', childProfileId: 'child',
  accessibilityEnabled: true, selectedAppCount: 1, lockActive: false, lastHeartbeat: 0,
  serverVerified: false, protectionLevel: 'selected_apps', error: null, version: 'test' };
describe('native Study Lock contract', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.native = false; mocks.token = 'parent-session'; });
  it('does not treat the PWA as native', () => expect(isNativeAndroid()).toBe(false));
  it('recognizes the Android wrapper', () => { mocks.native = true; expect(isNativeAndroid()).toBe(true); });
  it('requires matching family and child', () => {
    expect(isBoundTo(ready, context)).toBe(true);
    expect(isBoundTo({ ...ready, familyId: 'other' }, context)).toBe(false);
    expect(isBoundTo({ ...ready, childProfileId: 'sibling' }, context)).toBe(false);
    expect(isBoundTo({ ...ready, paired: false }, context)).toBe(false);
  });
  it('requires both permission and selected applications', () => {
    expect(isReadyForChild(ready, context)).toBe(true);
    expect(isReadyForChild({ ...ready, accessibilityEnabled: false }, context)).toBe(false);
    expect(isReadyForChild({ ...ready, selectedAppCount: 0 }, context)).toBe(false);
  });
  it('sends parent session to native provisioning, never a service key', async () => {
    await nativeStudyLock.provision(context);
    expect(mocks.provisionChild).toHaveBeenCalledWith({ accessToken: 'parent-session', familyId: 'family', childProfileId: 'child' });
  });
  it('fails closed without authentication', async () => {
    mocks.token = '';
    await expect(nativeStudyLock.provision(context)).rejects.toThrow('đăng nhập');
    await expect(nativeStudyLock.chooseApps()).rejects.toThrow('đăng nhập');
    expect(mocks.provisionChild).not.toHaveBeenCalled();
    expect(mocks.openAppPicker).not.toHaveBeenCalled();
  });
  it('does not expose local unlock or token removal', () => {
    for (const method of ['unlock', 'setLock', 'clearToken', 'clearPairing', 'setUrl']) {
      expect(method in nativeStudyLock).toBe(false);
    }
  });
});
