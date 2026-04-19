import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: true,
    rollupOptions: {
      output: { inlineDynamicImports: true }
    }
  },
  server: { port: 5174, open: false },
})
