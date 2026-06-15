import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(process.cwd(), 'public/lib.js'),
      formats: ['es'],  // ES module，与 Webpack 输出一致
      fileName: () => 'lib.js',
    },
    outDir: 'dist/lib',
    emptyOutDir: true,
    rollupOptions: {
      external: [], // 所有依赖打包进 lib.js
    },
  },
  resolve: {
    alias: {
      '@sillytavern': path.resolve(process.cwd(), 'public/scripts'),
    },
  },
});
