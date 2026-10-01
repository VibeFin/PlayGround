import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3002,
    strictPort: true,
    // Capturing evidence or updating the live feed must not restart an active match.
    watch: { ignored: ['**/public/evidence/**', '**/public/progress-data.json', '**/docs/**', '**/tests/**', '**/CONTRACT.md'] },
  },
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
