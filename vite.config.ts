import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_BRAND } from './src/config/brand.ts';
import iconConfig from './assets/app-icons.config.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      {
        name: 'inject-brand-metadata',
        transformIndexHtml(html) {
          return html.replaceAll('__APP_THEME_COLOR__', APP_BRAND.lightThemeColor);
        },
      },
      react(),
      ...(mode === 'native' ? [] : [VitePWA({
        registerType: 'autoUpdate',
        includeAssets: iconConfig.web.includeAssets,
        manifest: {
          id: '/',
          name: APP_BRAND.name,
          short_name: APP_BRAND.shortName,
          description: APP_BRAND.description,
          theme_color: APP_BRAND.lightThemeColor,
          background_color: APP_BRAND.lightBackgroundColor,
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: iconConfig.pwaManifestIcons
        },
        devOptions: {
          enabled: process.env.VITE_PWA_DEV === 'true',
          type: 'module'
        }
      })])
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: mode === 'native' ? 'dist-native' : 'dist',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react-vendor',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 20,
              },
              {
                name: 'supabase-vendor',
                test: /node_modules[\\/]@supabase[\\/]/,
                priority: 15,
              },
            ],
          },
        },
      },
    },
    test: {
      exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'dist-native/**', 'mobile/**'],
    },
  };
});
