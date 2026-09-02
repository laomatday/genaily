import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico'],
        manifest: {
          id: '/',
          name: 'genAi Family — Learning Autopilot',
          short_name: 'genAiFamily',
          description: 'Learning Autopilot system for families with domain-driven architecture, Study Lock, and Approval Engine.',
          theme_color: '#243C8F',
          background_color: '#F7F9FC',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'https://lh3.googleusercontent.com/d/1TTJ-7BMnAa6nMfNrMI1DavN64l2Y3VOP',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'https://lh3.googleusercontent.com/d/1TTJ-7BMnAa6nMfNrMI1DavN64l2Y3VOP',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            }
          ]
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
