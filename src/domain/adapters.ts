import { ScheduleEvent } from '../types';

export interface DeviceControlProvider {
  lock(deviceId: string, policy: string): Promise<void>;
  unlock(deviceId: string): Promise<void>;
  getStatus(deviceId: string): Promise<'LOCKED' | 'UNLOCKED' | 'RESTRICTED'>;
}

export class MockDeviceControlProvider implements DeviceControlProvider {
  async lock(deviceId: string, policy: string): Promise<void> {
    console.log(`[DeviceAdapter] Locking device ${deviceId} with policy: ${policy}`);
  }
  async unlock(deviceId: string): Promise<void> {
    console.log(`[DeviceAdapter] Unlocking device ${deviceId}`);
  }
  async getStatus(deviceId: string): Promise<'LOCKED' | 'UNLOCKED' | 'RESTRICTED'> {
    return 'LOCKED';
  }
}

export interface NotificationProvider {
  send(targetUserId: string, title: string, body: string): Promise<void>;
}

export class MockNotificationProvider implements NotificationProvider {
  async send(targetUserId: string, title: string, body: string): Promise<void> {
    console.log(`[NotificationAdapter] Sending to ${targetUserId}: "${title} - ${body}"`);
  }
}

export const deviceAdapter = new MockDeviceControlProvider();
export const notificationAdapter = new MockNotificationProvider();
