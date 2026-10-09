import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { port: 5187, strictPort: true },
  build: {
    rollupOptions: { input: { demo: resolve('index.html'), workspace: resolve('workspace.html') } },
  },
});
