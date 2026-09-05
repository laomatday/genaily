import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.genaifamily.device',
  appName: 'genaily',
  webDir: 'dist-native',
  loggingBehavior: 'none',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [],
  },
  android: {
    path: 'mobile/android',
    allowMixedContent: false,
    useLegacyBridge: false,
    webContentsDebuggingEnabled: false,
    resolveServiceWorkerRequests: false,
  },
};
export default config;
