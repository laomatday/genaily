import { supabase } from '../lib/supabase';

export interface DeviceDispatchResult {
  commandId: string;
  status: 'sent' | 'acknowledged' | 'queued' | 'failed' | 'configuration_required' | 'processing';
  externalId?: string;
  deferred?: boolean;
}

export interface DeviceControlProvider {
  dispatch(commandId: string): Promise<DeviceDispatchResult>;
}

class SupabaseDeviceControlProvider implements DeviceControlProvider {
  async dispatch(commandId: string): Promise<DeviceDispatchResult> {
    try {
      const { data, error } = await supabase.functions.invoke<DeviceDispatchResult>('dispatch-device-command', {
        body: { command_id: commandId },
      });
      if (error) {
        console.warn(`Device dispatch notice: ${error.message}`);
        return { commandId, status: 'queued' };
      }
      return data || { commandId, status: 'sent' };
    } catch (err) {
      console.warn('dispatch-device-command fallback:', err);
      return { commandId, status: 'queued' };
    }
  }
}

export const deviceAdapter: DeviceControlProvider = new SupabaseDeviceControlProvider();
