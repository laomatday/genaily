import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { GoogleGenAI } from 'npm:@google/genai@2.21.0';
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { isAiRequestTimeout, resolveAiRuntimeConfig } from '../_shared/ai-runtime.ts';
import { parseWeekPlan } from '../_shared/week-plan.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (
  body: unknown,
  status = 200,
  responseHeaders: Record<string, string> = {},
) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', ...responseHeaders },
});

type FunctionClient = ReturnType<typeof createClient>;
interface AiGenerationLease {
  slot_number: number;
  lease_token: string;
  expires_at: string;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let leaseClient: FunctionClient | null = null;
  let leaseToken: string | null = null;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ error: 'Missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!supabaseUrl || !supabaseKey || !serviceRoleKey) {
      return json({ error: 'Supabase runtime is not configured' }, 500);
    }
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY is not configured' }, 503);
    const aiRuntime = resolveAiRuntimeConfig((name) => Deno.env.get(name));

    const client = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Invalid user token' }, 401);

    const payload = await request.json() as { family_id?: string; child_profile_id?: string };
    if (!payload.family_id || !UUID_PATTERN.test(payload.family_id)
        || !payload.child_profile_id || !UUID_PATTERN.test(payload.child_profile_id)) {
      return json({ error: 'Valid family_id and child_profile_id values are required' }, 400);
    }

    // Reserve project-wide capacity before the four prompt-data reads. The
    // service-role RPC independently verifies this authenticated user is the
    // active parent of the requested active child.
    leaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const leaseRequestId = crypto.randomUUID();
    const { data: leaseRows, error: leaseError } = await leaseClient.rpc(
      'claim_ai_generation_lease',
      {
        p_request_id: leaseRequestId,
        p_user_id: authData.user.id,
        p_family_id: payload.family_id,
        p_child_profile_id: payload.child_profile_id,
        p_max_concurrency: aiRuntime.maxConcurrency,
        p_ttl_seconds: aiRuntime.leaseTtlSeconds,
      },
    );
    if (leaseError) {
      const accessDenied = leaseError.message.includes('AI_LEASE_ACCESS_DENIED');
      if (!accessDenied) {
        console.error('AI generation lease claim failed', { message: leaseError.message });
      }
      return json({
        code: accessDenied ? 'AI_LEASE_ACCESS_DENIED' : 'AI_LEASE_UNAVAILABLE',
        error: accessDenied
          ? 'Bạn không có quyền tạo kế hoạch cho hồ sơ này.'
          : 'Không thể cấp lượt tạo kế hoạch AI lúc này.',
      }, accessDenied ? 403 : 503);
    }
    const lease = ((leaseRows ?? []) as AiGenerationLease[])[0];
    if (!lease?.lease_token) {
      return json({
        code: 'AI_GENERATION_BUSY',
        error: 'Hệ thống đang tạo nhiều kế hoạch. Vui lòng thử lại sau.',
        retry_after_seconds: aiRuntime.retryAfterSeconds,
      }, 429, { 'Retry-After': String(aiRuntime.retryAfterSeconds) });
    }
    leaseToken = lease.lease_token;

    const [childResult, scheduleResult, goalsResult, exceptionsResult] = await Promise.all([
      client.from('profiles').select('id, full_name').eq('id', payload.child_profile_id).single(),
      client.from('schedule_events')
        .select('id, title, event_type, subject, day_of_week, start_time, duration_minutes, status, sort_order')
        .eq('family_id', payload.family_id)
        .eq('child_profile_id', payload.child_profile_id)
        .order('day_of_week')
        .order('start_time')
        .limit(100),
      client.from('learning_goals')
        .select('subject, target_minutes, description, status')
        .eq('family_id', payload.family_id)
        .eq('child_profile_id', payload.child_profile_id)
        .eq('status', 'active')
        .limit(50),
      client.from('exceptions')
        .select('title, description, severity, recommended_action')
        .eq('family_id', payload.family_id)
        .eq('child_profile_id', payload.child_profile_id)
        .eq('status', 'open')
        .limit(20),
    ]);
    const firstError = childResult.error ?? scheduleResult.error ?? goalsResult.error ?? exceptionsResult.error;
    if (firstError) return json({ error: firstError.message }, firstError.code === 'PGRST116' ? 403 : 400);

    // Daily quota is claimed only after capacity is reserved. Saturated bursts
    // therefore do not consume a family's limited generation allowance.
    const { data: quota, error: quotaError } = await client.rpc('claim_ai_plan_quota', {
      p_family_id: payload.family_id,
      p_child_profile_id: payload.child_profile_id,
    });
    if (quotaError) {
      const exceeded = quotaError.message.includes('AI_DAILY_QUOTA_EXCEEDED');
      return json({ error: exceeded ? 'Đã hết lượt tạo kế hoạch AI hôm nay.' : quotaError.message }, exceeded ? 429 : 403);
    }

    const modelName = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.7-flash';
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = [
      'Bạn là bộ lập lịch học an toàn cho một học sinh.',
      'Hãy cân bằng lịch hiện tại và mục tiêu. Không thay đổi các hoạt động đã có.',
      'Chỉ đề xuất thêm hoặc cập nhật lịch self_study. Không xếp quá 120 phút tự học liên tục.',
      'Trả về JSON theo schema; dùng mon..sun, HH:MM:SS và giữ id khi sửa sự kiện hiện có.',
      JSON.stringify({
        child: childResult.data,
        schedule: scheduleResult.data,
        goals: goalsResult.data,
        open_exceptions: exceptionsResult.data,
      }),
    ].join('\n');

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        // @google/genai defines HttpOptions.timeout in milliseconds on the
        // per-request GenerateContentConfig.
        httpOptions: { timeout: aiRuntime.requestTimeoutMs },
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          required: ['summary', 'warnings', 'schedule_updates'],
          properties: {
            summary: { type: 'string' },
            warnings: { type: 'array', items: { type: 'string' } },
            schedule_updates: {
              type: 'array',
              items: {
                type: 'object',
                required: ['title', 'subject', 'day_of_week', 'start_time', 'duration_minutes', 'event_type', 'status', 'study_lock_enabled'],
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  subject: { type: ['string', 'null'] },
                  day_of_week: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
                  start_time: { type: 'string' },
                  duration_minutes: { type: 'integer', minimum: 5, maximum: 120 },
                  event_type: { type: 'string', enum: ['self_study'] },
                  status: { type: 'string', enum: ['upcoming'] },
                  sort_order: { type: 'integer' },
                  study_lock_enabled: { type: 'boolean', enum: [true] },
                },
              },
            },
          },
        },
      },
    });
    const planOutput = parseWeekPlan(response.text ?? '');
    const { data: planId, error: insertError } = await client.rpc('create_generated_ai_plan', {
      p_family_id: payload.family_id,
      p_child_profile_id: payload.child_profile_id,
      p_model_name: modelName,
      p_plan_type: 'study_schedule',
      p_input_summary: `${scheduleResult.data?.length ?? 0} hoạt động · ${goalsResult.data?.length ?? 0} mục tiêu`,
      p_output_json: planOutput,
    });
    if (insertError || !planId) return json({ error: insertError?.message ?? 'Plan was not stored' }, 400);

    const { data: plan, error: planError } = await client
      .from('ai_plans')
      .select('*')
      .eq('id', planId)
      .single();
    if (planError || !plan) return json({ error: planError?.message ?? 'Plan was not found after creation' }, 400);
    return json({ plan, quota: quota?.[0] ?? null });
  } catch (error) {
    console.error('AI plan generation failed', {
      message: error instanceof Error ? error.message : 'Unexpected generation failure',
    });
    if (isAiRequestTimeout(error)) {
      return json({
        code: 'AI_PROVIDER_TIMEOUT',
        error: 'Dịch vụ AI phản hồi quá lâu. Vui lòng thử lại sau.',
      }, 504);
    }
    return json({
      code: 'AI_GENERATION_FAILED',
      error: 'Không thể tạo kế hoạch AI lúc này.',
    }, 500);
  } finally {
    if (leaseClient && leaseToken) {
      const tokenToRelease = leaseToken;
      try {
        const { error: releaseError } = await leaseClient.rpc(
          'release_ai_generation_lease',
          { p_lease_token: tokenToRelease },
        );
        if (releaseError) {
          // Do not log the lease token. TTL recovery guarantees that an isolate
          // crash or release failure cannot exhaust capacity permanently.
          console.error('AI generation lease release failed', { message: releaseError.message });
        }
      } catch (releaseFailure) {
        console.error('AI generation lease release failed', {
          message: releaseFailure instanceof Error
            ? releaseFailure.message
            : 'Unexpected release failure',
        });
      }
    }
  }
});
