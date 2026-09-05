import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import type { FamilyContext } from '../lib/familyIdentity';

export interface NativeDeviceStatus {
  paired: boolean;
  familyId: string | null;
  childProfileId: string | null;
  accessibilityEnabled: boolean;
  selectedAppCount: number;
  lockActive: boolean;
  lastHeartbeat: number;
  serverVerified: boolean;
  protectionLevel: 'selected_apps';
  error: string | null;
  version: string;
}
export interface StudyLockBridge {
  getStatus(): Promise<NativeDeviceStatus>;
  provisionChild(options: { accessToken: string; familyId: string; childProfileId: string }): Promise<NativeDeviceStatus>;
  openAppPicker(options: { accessToken: string }): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  requestNotifications(): Promise<void>;
  diagnose(): Promise<{ message: string }>;
}
// Deliberately no unlock, clearToken, setPolicy, setUrl, or generic HTTP bridge.
const bridge = registerPlugin<StudyLockBridge>('StudyLock');
export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export function isBoundTo(status: NativeDeviceStatus, context: FamilyContext): boolean {
  return status.paired && status.familyId === context.familyId && status.childProfileId === context.childProfileId;
}
export function isReadyForChild(status: NativeDeviceStatus, context: FamilyContext): boolean {
  return isBoundTo(status, context) && status.accessibilityEnabled && status.selectedAppCount > 0;
}
async function parentAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Ba/mẹ cần đăng nhập lại để thiết lập thiết bị.');
  // Native code independently checks the server session mode and device ownership.
  return data.session.access_token;
}
export const nativeStudyLock = {
  status: () => bridge.getStatus(),
  provision: async (context: FamilyContext) => bridge.provisionChild({
    accessToken: await parentAccessToken(), familyId: context.familyId, childProfileId: context.childProfileId,
  }),
  chooseApps: async () => bridge.openAppPicker({ accessToken: await parentAccessToken() }),
  permissions: () => bridge.openAccessibilitySettings(),
  notifications: () => bridge.requestNotifications(),
  diagnose: () => bridge.diagnose(),
};
