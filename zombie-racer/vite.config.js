import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const TRAINING_DIR = fileURLToPath(new URL('./training-data', import.meta.url))
const MAX_BODY = 5 * 1024 * 1024
const strList = v => Array.isArray(v) ? v.filter(s => typeof s === 'string').map(s => s.slice(0, 40)) : []

// Dev-only: przyjmuje nagrania jazdy z DriveRecorder i zapisuje je do training-data/.
function aiRecordPlugin() {
  return {
    name: 'ai-record',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__ai/record', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let size = 0
        const chunks = []
        req.on('data', c => {
          size += c.length
          if (size > MAX_BODY) { res.statusCode = 413; res.end(); req.destroy() }
          else chunks.push(c)
        })
        req.on('end', () => {
          if (res.writableEnded) return
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const valid = Number.isInteger(data?.featureCount) && Array.isArray(data.rows)
              && data.rows.every(r => Array.isArray(r) && r.every(Number.isFinite))
            if (!valid) { res.statusCode = 400; return res.end('invalid payload') }
            fs.mkdirSync(TRAINING_DIR, { recursive: true })
            const source = data.source === 'npc' ? 'npc' : 'player'
            const name = `${source === 'npc' ? 'npc' : 'drive'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.json`
            fs.writeFileSync(path.join(TRAINING_DIR, name), JSON.stringify({
              version: Number.isInteger(data.version) ? data.version : 1, source, featureCount: data.featureCount,
              featureNames: strList(data.featureNames), actionNames: strList(data.actionNames), rows: data.rows,
            }))
            res.statusCode = 204
            res.end()
          } catch {
            res.statusCode = 400
            res.end('bad json')
          }
        })
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [viteSingleFile(), aiRecordPlugin()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: true,
    assetsInlineLimit: 4 * 1024 * 1024, // inline up to 4MB (covers the ~182KB GLB)
    rollupOptions: {
      output: { inlineDynamicImports: true }
    }
  },
  server: { port: 5174, open: false },
})
