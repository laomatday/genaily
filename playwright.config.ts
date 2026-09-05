import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT ?? 43173);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: e2eBaseUrl,
    // The seeded family uses Asia/Ho_Chi_Minh. A 04:00 family session is
    // 21:00 on the previous UTC date; the browser must use the same timezone
    // rather than treating a valid session for today as yesterday on CI.
    timezoneId: process.env.E2E_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    // Never accept an unrelated local app as a valid E2E server. A busy port
    // must fail loudly instead of producing a false test result.
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? 'not-configured',
    },
  },
});
