import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { cpSync, mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'ship-devtools-app',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        const distDevtoolsDir = resolve(distDir, 'devtools');

        mkdirSync(distDevtoolsDir, { recursive: true });

        // Ship the devtools UI app inside dist so npm/build consumers can host it directly.
        cpSync(resolve(__dirname, 'lib/devtools'), distDevtoolsDir, { recursive: true });
        cpSync(resolve(__dirname, 'assets'), resolve(distDir, 'assets'), { recursive: true });

        // Devtools FlowState engine imports ../FlowState.js, so provide a bridge in dist root.
        writeFileSync(
          resolve(distDir, 'FlowState.js'),
          "export * from './flow-state.js';\n",
          'utf8'
        );
      },
    },
  ],
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
