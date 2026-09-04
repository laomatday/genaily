import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyContext } from './familyIdentity';
import type { ScheduleSetupItem } from './familyRepository.types';
import { saveScheduleSetup } from './familyRepository.mutations';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn() },
  },
}));

vi.mock('../domain/adapters', () => ({
  deviceAdapter: { dispatch: vi.fn() },
}));

const secondChildContext: FamilyContext = {
  familyId: '10000000-0000-4000-8000-000000000010',
  parentProfileId: '10000000-0000-4000-8000-000000000001',
  childProfileId: '10000000-0000-4000-8000-000000000012',
};

const schedule: ScheduleSetupItem[] = [{
  title: 'Ôn phân số',
  subject: 'Toán',
  day_of_week: 'mon',
  start_time: '19:00',
  duration_minutes: 45,
  event_type: 'self_study',
  status: 'upcoming',
  sort_order: 0,
  study_lock_enabled: true,
}];

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

describe('saveScheduleSetup child targeting', () => {
  it('sends the selected second child id to the atomic schedule RPC', async () => {
    await saveScheduleSetup(secondChildContext, schedule);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('save_schedule_setup', expect.objectContaining({
      p_family_id: secondChildContext.familyId,
      p_child_profile_id: secondChildContext.childProfileId,
    }));
    expect(mocks.rpc.mock.calls[0]?.[1]?.p_child_profile_id)
      .not.toBe('10000000-0000-4000-8000-000000000011');
  });
});
