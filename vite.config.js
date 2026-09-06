import { defineConfig, build as viteBuild } from 'vite';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { cpSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'build-devtools-entry',
      apply: 'build',
      async closeBundle() {
        await viteBuild({
          configFile: false,
          root: resolve(__dirname, 'lib'),
          publicDir: false,
          build: {
            minify: 'esbuild',
            outDir: resolve(__dirname, 'dist'),
            emptyOutDir: false,
            rollupOptions: {
              input: {
                'devtools/index': resolve(__dirname, 'lib/devtools/index.html'),
              },
              output: {
                entryFileNames: ({ name }) => {
                  const safeName = String(name || 'index').replace(/^devtools\//, '');
                  return `devtools/${safeName}-[hash].js`;
                },
                chunkFileNames: 'devtools/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                  if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                    return 'devtools/[name]-[hash][extname]';
                  }
                  return 'assets/[name]-[hash][extname]';
                },
              },
            },
          },
        });

        cpSync(resolve(__dirname, 'lib/assets'), resolve(__dirname, 'dist/assets'), { recursive: true });
        cpSync(resolve(__dirname, 'lib/devtools/server.js'), resolve(__dirname, 'dist/devtools/server.js'));
        cpSync(resolve(__dirname, 'types/index.d.ts'), resolve(__dirname, 'dist/flow-state.d.ts'));
      },
    },
  ],
  build: {
    minify: 'esbuild',
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
