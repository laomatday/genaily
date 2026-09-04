import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 32 * 1024;
const COMMAND_LIMIT = 20;
const REDELIVERY_SECONDS = 30;

type ServiceClient = ReturnType<typeof createClient>;
type JsonRecord = Record<string, unknown>;
type ManagedDevice = {
  id: string;
  family_id: string;
  child_profile_id: string;
  platform: 'android' | 'ios';
  status: 'active';
  policy: JsonRecord;
  policy_version: number;
};

const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: jsonHeaders,
});

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function readJson(request: Request): Promise<JsonRecord> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON');
  return value as JsonRecord;
}

async function authenticateDevice(client: ServiceClient, request: Request): Promise<ManagedDevice | null> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Device ')) return null;
  const rawToken = authorization.slice('Device '.length).trim();
  if (rawToken.length < 40 || rawToken.length > 128) return null;
  const tokenHash = await sha256(rawToken);
  if (!SHA256_PATTERN.test(tokenHash)) return null;
  const { data, error } = await client
    .from('managed_devices')
    .select('id, family_id, child_profile_id, platform, status, policy, policy_version')
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  return data as ManagedDevice;
}

async function latestDesiredState(client: ServiceClient, device: ManagedDevice) {
  const { data } = await client
    .from('device_commands')
    .select('id, command, policy, created_at')
    .eq('family_id', device.family_id)
    .eq('child_profile_id', device.child_profile_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data
    ? { command_id: data.id, state: data.command, policy: data.policy, changed_at: data.created_at }
    : { command_id: null, state: 'unlock', policy: null, changed_at: null };
}

async function pairDevice(client: ServiceClient, payload: JsonRecord) {
  const codeValue = typeof payload.pairing_code === 'string'
    ? payload.pairing_code.replace(/[\s-]/g, '').toUpperCase()
    : '';
  if (!/^[0-9A-F]{16}$/.test(codeValue)) {
    return respond({ error: 'Mã ghép không hợp lệ hoặc đã hết hạn.' }, 400);
  }
  const pairingHash = await sha256(codeValue);
  const { data: pending, error: findError } = await client
    .from('managed_devices')
    .select('id, family_id, child_profile_id, platform, policy, policy_version')
    .eq('pairing_code_hash', pairingHash)
    .eq('status', 'pairing')
    .gt('pairing_expires_at', new Date().toISOString())
    .maybeSingle();
  if (findError || !pending) {
    return respond({ error: 'Mã ghép không hợp lệ hoặc đã hết hạn.' }, 404);
  }
  if (payload.platform !== pending.platform) {
    return respond({ error: 'Mã ghép không dành cho nền tảng này.' }, 409);
  }

  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const pairedAt = new Date().toISOString();
  const { data: activated, error: activateError } = await client
    .from('managed_devices')
    .update({
      status: 'active',
      token_hash: tokenHash,
      pairing_code_hash: null,
      pairing_expires_at: null,
      paired_at: pairedAt,
      last_seen_at: pairedAt,
    })
    .eq('id', pending.id)
    .eq('status', 'pairing')
    .select('id')
    .maybeSingle();
  if (activateError || !activated) {
    return respond({ error: 'Mã ghép đã được sử dụng.' }, 409);
  }

  const device = {
    id: pending.id,
    family_id: pending.family_id,
    child_profile_id: pending.child_profile_id,
    platform: pending.platform,
    status: 'active' as const,
    policy: pending.policy as JsonRecord,
    policy_version: pending.policy_version,
  };
  const desired = await latestDesiredState(client, device);
  if (desired.command_id) {
    await client.from('device_command_deliveries').upsert({
      command_id: desired.command_id,
      device_id: device.id,
      family_id: device.family_id,
      child_profile_id: device.child_profile_id,
    }, { onConflict: 'command_id,device_id', ignoreDuplicates: true });
  }

  return respond({
    device_id: device.id,
    device_token: rawToken,
    platform: device.platform,
    policy: device.policy,
    policy_version: device.policy_version,
    desired,
  }, 201);
}

async function pollCommands(client: ServiceClient, device: ManagedDevice) {
  const now = new Date();
  const staleDelivery = new Date(now.getTime() - REDELIVERY_SECONDS * 1000).toISOString();
  await client.from('managed_devices').update({ last_seen_at: now.toISOString() }).eq('id', device.id);

  const { data: candidates, error: deliveryError } = await client
    .from('device_command_deliveries')
    .select('id, command_id, status, attempt_count, max_attempts, next_attempt_at, delivered_at')
    .eq('device_id', device.id)
    .in('status', ['queued', 'failed', 'delivered'])
    .order('created_at', { ascending: true })
    .limit(COMMAND_LIMIT * 2);
  if (deliveryError) return respond({ error: 'Không tải được lệnh thiết bị.' }, 500);

  const due = (candidates ?? []).filter((delivery) => (
    delivery.attempt_count < delivery.max_attempts
    && (
      ((delivery.status === 'queued' || delivery.status === 'failed')
        && new Date(delivery.next_attempt_at).getTime() <= now.getTime())
      || (delivery.status === 'delivered'
        && delivery.delivered_at !== null
        && delivery.delivered_at <= staleDelivery)
    )
  )).slice(0, COMMAND_LIMIT);

  const claimedDeliveryIds: string[] = [];
  for (const delivery of due) {
    const nextAttempt = new Date(now.getTime() + REDELIVERY_SECONDS * 1000).toISOString();
    const { data: claimed } = await client
      .from('device_command_deliveries')
      .update({
        status: 'delivered',
        delivered_at: now.toISOString(),
        attempt_count: delivery.attempt_count + 1,
        next_attempt_at: nextAttempt,
        error_message: null,
      })
      .eq('id', delivery.id)
      .eq('attempt_count', delivery.attempt_count)
      .select('id')
      .maybeSingle();
    if (claimed) claimedDeliveryIds.push(delivery.id);
  }

  let commands: Array<Record<string, unknown>> = [];
  if (claimedDeliveryIds.length > 0) {
    const { data: claimedDeliveries } = await client
      .from('device_command_deliveries')
      .select('id, command_id')
      .in('id', claimedDeliveryIds);
    const commandIds = (claimedDeliveries ?? []).map((item) => item.command_id);
    const { data: commandRows } = await client
      .from('device_commands')
      .select('id, command, policy, session_id, created_at, idempotency_key')
      .in('id', commandIds);
    const deliveryByCommand = new Map((claimedDeliveries ?? []).map((item) => [item.command_id, item.id]));
    commands = (commandRows ?? []).map((command) => ({
      delivery_id: deliveryByCommand.get(command.id),
      ...command,
    }));
    await client.from('device_commands').update({
      status: 'sent',
      external_id: `companion:${device.id}`,
      processed_at: now.toISOString(),
      error_message: null,
    }).in('id', commandIds).in('status', ['queued', 'processing', 'failed', 'configuration_required']);
  }

  return respond({
    server_time: now.toISOString(),
    heartbeat_timeout_seconds: Number(Deno.env.get('DEVICE_HEARTBEAT_TIMEOUT_SECONDS') ?? 180),
    policy: device.policy,
    policy_version: device.policy_version,
    desired: await latestDesiredState(client, device),
    commands,
  });
}

async function acknowledgeCommand(client: ServiceClient, device: ManagedDevice, payload: JsonRecord) {
  const commandId = typeof payload.command_id === 'string' ? payload.command_id : '';
  const requestedStatus = payload.status === 'acknowledged' ? 'acknowledged' : payload.status === 'failed' ? 'failed' : '';
  if (!UUID_PATTERN.test(commandId) || !requestedStatus) return respond({ error: 'Xác nhận lệnh không hợp lệ.' }, 400);
  const errorMessage = typeof payload.error_message === 'string'
    ? payload.error_message.trim().slice(0, 1000) || null
    : null;
  const now = new Date();
  const { data: delivery, error } = await client
    .from('device_command_deliveries')
    .update({
      status: requestedStatus,
      acknowledged_at: requestedStatus === 'acknowledged' ? now.toISOString() : null,
      next_attempt_at: requestedStatus === 'failed'
        ? new Date(now.getTime() + REDELIVERY_SECONDS * 1000).toISOString()
        : now.toISOString(),
      error_message: requestedStatus === 'failed' ? errorMessage ?? 'Thiết bị không áp dụng được lệnh.' : null,
    })
    .eq('command_id', commandId)
    .eq('device_id', device.id)
    .in('status', ['queued', 'delivered', 'failed', 'acknowledged'])
    .select('id')
    .maybeSingle();
  if (error || !delivery) return respond({ error: 'Không tìm thấy lệnh cho thiết bị này.' }, 404);

  const { data: states } = await client
    .from('device_command_deliveries')
    .select('status, attempt_count, max_attempts')
    .eq('command_id', commandId);
  const allAcknowledged = (states?.length ?? 0) > 0 && states!.every((item) => item.status === 'acknowledged');
  const allTerminal = (states?.length ?? 0) > 0 && states!.every((item) => (
    item.status === 'acknowledged'
    || item.status === 'expired'
    || (item.status === 'failed' && item.attempt_count >= item.max_attempts)
  ));
  const aggregateStatus = allAcknowledged ? 'acknowledged' : allTerminal ? 'failed' : 'sent';
  await client.from('device_commands').update({
    status: aggregateStatus,
    processed_at: allAcknowledged ? now.toISOString() : undefined,
    error_message: aggregateStatus === 'failed' ? errorMessage : null,
  }).eq('id', commandId);
  await client.from('managed_devices').update({ last_seen_at: now.toISOString() }).eq('id', device.id);
  return respond({ command_id: commandId, status: requestedStatus });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: jsonHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return respond({ error: 'Máy chủ chưa được cấu hình.' }, 500);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const payload = await readJson(request);
    const action = typeof payload.action === 'string' ? payload.action : '';
    if (action === 'pair') return pairDevice(client, payload);

    const device = await authenticateDevice(client, request);
    if (!device) return respond({ error: 'Thiết bị chưa được ghép hoặc đã bị thu hồi.' }, 401);
    if (action === 'poll' || action === 'heartbeat') return pollCommands(client, device);
    if (action === 'ack') return acknowledgeCommand(client, device, payload);
    return respond({ error: 'Hành động không được hỗ trợ.' }, 400);
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') {
      return respond({ error: 'Yêu cầu vượt quá dung lượng cho phép.' }, 413);
    }
    return respond({ error: 'Yêu cầu không hợp lệ.' }, 400);
  }
});
