import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'https://nutrivault-seven.vercel.app',
            changeOrigin: true,
          },
        },
      },
      build: {
        chunkSizeWarningLimit: 500,
        sourcemap: false,
        rollupOptions: {
          external: [
            '@revenuecat/purchases-capacitor',
            '@revenuecat/purchases-capacitor-ui',
          ],
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
            },
          },
        },
      },
      plugins: [tailwindcss(), react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
