import { createClient } from '@supabase/supabase-js';

const apiUrl = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_PARENT_EMAIL ?? 'parent-e2e@example.test';
const password = process.env.E2E_PARENT_PASSWORD ?? 'E2e-only-password-2026!';

if (!apiUrl || !anonKey || !serviceRoleKey) {
  throw new Error('E2E Supabase URL, publishable key and service-role key are required.');
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(apiUrl)
    && process.env.E2E_ALLOW_REMOTE_SEED !== 'true') {
  throw new Error('Refusing to seed a remote Supabase project without E2E_ALLOW_REMOTE_SEED=true.');
}

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;
const existing = listed.users.find((user) => user.email === email);
if (existing) {
  const { error } = await admin.auth.admin.deleteUser(existing.id);
  if (error) throw error;
}

const { error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Phụ huynh E2E' },
});
if (createError) throw createError;

const browserClient = createClient(apiUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: signInError } = await browserClient.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;

for (const [name, grade] of [['Bé E2E A', 5], ['Bé E2E B', 8]]) {
  const { error } = await browserClient.rpc('add_child_profile_with_grade', {
    p_child_name: name,
    p_grade_level: grade,
  });
  if (error) throw error;
}

await browserClient.auth.signOut();
console.log('Created an isolated parent account with two child profiles for E2E.');
