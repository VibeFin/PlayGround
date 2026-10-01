import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Keep the rendering engine cacheable across gameplay and UI updates.
        manualChunks: { 'three-engine': ['three'] },
      },
    },
  },
});
