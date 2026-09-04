import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_TIMEOUT_MS = 12_000;
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 20;

type DeliveryClient = ReturnType<typeof createClient>;
type DeliveryStatus = 'sent' | 'acknowledged' | 'failed' | 'configuration_required';
type DeviceCommand = {
  id: string;
  family_id: string;
  child_profile_id: string;
  session_id: string | null;
  command: string;
  policy: string | null;
  status: string;
  external_id: string | null;
  idempotency_key: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

async function updateDelivery(
  client: DeliveryClient,
  commandId: string,
  status: DeliveryStatus,
  externalId: string | null,
  errorMessage: string | null,
) {
  return client.rpc('update_device_command_delivery', {
    p_command_id: commandId,
    p_status: status,
    p_external_id: externalId,
    p_error_message: errorMessage,
  });
}

async function deliverCommand(client: DeliveryClient, command: DeviceCommand) {
  if (command.status === 'sent' || command.status === 'acknowledged') {
    return { commandId: command.id, status: command.status, externalId: command.external_id };
  }

  // A paired first-party companion pulls this delivery itself. Keep the
  // command queued until that device actually polls; an optional external
  // webhook remains a fallback for future enterprise MDM integrations.
  const { data: agentCount, error: agentError } = await client.rpc(
    'prepare_device_command_for_agents',
    { p_command_id: command.id },
  );
  if (agentError) return { commandId: command.id, status: 'failed', error: agentError.message };
  if ((agentCount ?? 0) > 0) {
    return { commandId: command.id, status: 'queued', deferred: true, deliveryCount: agentCount };
  }

  const { data: claimed, error: claimError } = await client.rpc('claim_device_command', {
    p_command_id: command.id,
  });
  if (claimError) return { commandId: command.id, status: 'failed', error: claimError.message };
  if (!claimed) return { commandId: command.id, status: command.status, deferred: true };

  const providerUrl = Deno.env.get('DEVICE_CONTROL_WEBHOOK_URL');
  if (!providerUrl) {
    await updateDelivery(
      client,
      command.id,
      'configuration_required',
      null,
      'DEVICE_CONTROL_WEBHOOK_URL is not configured',
    );
    return { commandId: command.id, status: 'configuration_required' };
  }

  const providerToken = Deno.env.get('DEVICE_CONTROL_WEBHOOK_TOKEN');
  let providerResponse: Response;
  try {
    providerResponse = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(providerToken ? { Authorization: `Bearer ${providerToken}` } : {}),
      },
      body: JSON.stringify({
        command_id: command.id,
        family_id: command.family_id,
        child_profile_id: command.child_profile_id,
        session_id: command.session_id,
        command: command.command,
        policy: command.policy,
        idempotency_key: command.idempotency_key,
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Device provider request failed';
    await updateDelivery(client, command.id, 'failed', null, message);
    return { commandId: command.id, status: 'failed', error: message };
  }

  const providerBody = await providerResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!providerResponse.ok) {
    const message = typeof providerBody.error === 'string'
      ? providerBody.error
      : `Provider returned ${providerResponse.status}`;
    await updateDelivery(client, command.id, 'failed', null, message);
    return { commandId: command.id, status: 'failed', error: message };
  }

  const status: DeliveryStatus = providerBody.acknowledged === true ? 'acknowledged' : 'sent';
  const externalId = typeof providerBody.id === 'string' ? providerBody.id : null;
  const { error: updateError } = await updateDelivery(client, command.id, status, externalId, null);
  if (updateError) return { commandId: command.id, status: 'failed', error: updateError.message };
  return { commandId: command.id, status, externalId };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!authorization) return json({ error: 'Missing authorization' }, 401);
    if (!supabaseUrl || !supabaseKey || !serviceRoleKey) {
      return json({ error: 'Supabase runtime is not configured' }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const deliveryClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const isServiceRequest = authorization === `Bearer ${serviceRoleKey}`;
    const payload = await request.json() as { command_id?: string; batch?: boolean; limit?: number };

    if (payload.batch === true) {
      if (!isServiceRequest) return json({ error: 'Service role access required' }, 403);
      const requestedLimit = Number.isInteger(payload.limit) ? Number(payload.limit) : DEFAULT_BATCH_SIZE;
      const limit = Math.min(MAX_BATCH_SIZE, Math.max(1, requestedLimit));
      const { data: commands, error } = await deliveryClient.rpc(
        'prepare_due_device_command_batch',
        { p_limit: limit },
      );
      if (error) return json({ error: error.message }, 400);
      const results = await Promise.all(
        ((commands ?? []) as DeviceCommand[]).map((command) => deliverCommand(deliveryClient, command)),
      );
      return json({ processed: results.length, results });
    }

    if (!payload.command_id || !UUID_PATTERN.test(payload.command_id)) {
      return json({ error: 'A valid command_id is required' }, 400);
    }

    let queryClient = deliveryClient;
    if (!isServiceRequest) {
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) return json({ error: 'Invalid user token' }, 401);
      queryClient = userClient;
    }
    const { data: command, error: commandError } = await queryClient
      .from('device_commands')
      .select('id, family_id, child_profile_id, session_id, command, policy, status, external_id, idempotency_key')
      .eq('id', payload.command_id)
      .single();
    if (commandError || !command) {
      return json({ error: commandError?.message ?? 'Command not found' }, 404);
    }

    const result = await deliverCommand(deliveryClient, command as DeviceCommand);
    const status = result.status === 'failed' ? 502 : result.deferred ? 202 : 200;
    return json(result, status);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
