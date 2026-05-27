import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'index.js'),
      name: 'FlowState',
      fileName: 'flow-state',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // No external dependencies — zero-dep library
    },
  },
});
