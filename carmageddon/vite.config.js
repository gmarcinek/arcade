import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: true,
  },
  server: {
    port: 5173,
    open: true,
  },
})
