import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: true,
    assetsInlineLimit: 4 * 1024 * 1024,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  server: {
    port: 5177,
    open: false,
  },
});
