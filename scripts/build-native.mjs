import { readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const values = Object.fromEntries(readFileSync(path.join(root, 'mobile/android/config/production.properties'), 'utf8')
  .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
const ref = values.GENAI_PROJECT_REF;
const url = (process.env.GENAI_DEVICE_AGENT_URL || values.GENAI_DEVICE_AGENT_URL || '').trim();
const key = (process.env.GENAI_PUBLISHABLE_KEY || values.GENAI_PUBLISHABLE_KEY || '').trim();
if (!/^[a-z]{20}$/.test(ref) || url !== `https://${ref}.supabase.co/functions/v1/device-agent`
    || !/^sb_publishable_[A-Za-z0-9_-]{20,160}$/.test(key) || /REPLACE|PLACEHOLDER/.test(key)) {
  throw new Error('Invalid native production configuration. Privileged keys are never allowed.');
}
// Always rebuild from source. Never package a stale PWA service worker or a remote URL.
rmSync(path.join(root, 'dist-native'), { recursive: true, force: true });
const env = { ...process.env, VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: key, VITE_NATIVE_WRAPPER: 'true' };
for (const [script, args] of [
  ['node_modules/vite/bin/vite.js', ['build', '--mode', 'native']],
  ['node_modules/@capacitor/cli/bin/capacitor', ['copy', 'android']],
]) {
  const run = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, env, stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
