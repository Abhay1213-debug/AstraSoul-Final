/// <reference types="vitest/config" />
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Runs the server functions in api/ on this computer too, so booking and payment work under `npm run dev` exactly as
 * they will on Vercel. Server settings come from .env.local (never sent to the browser: only VITE_ values are).
 */
function devApi(): Plugin {
  const readBody = (req: IncomingMessage) => new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject)
  })
  return {
    name: 'ankiro-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v
      process.env.ANKIRO_DEV = '1'
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
        if (!url.pathname.startsWith('/api/')) return next()
        const name = url.pathname.slice('/api/'.length)
        const file = name === 'dev/mock-pay' ? '/api/_lib/mock.ts' : /^[a-z-]+$/.test(name) ? `/api/${name}.ts` : null
        try {
          const mod = file ? ((await server.ssrLoadModule(file)) as Record<string, (r: Request) => Promise<Response>>) : null
          const handler = mod?.[req.method ?? 'GET']
          if (!handler) {
            res.statusCode = mod ? 405 : 404
            return res.end()
          }
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
          const response = await handler(new Request(url, { method: req.method, headers, body }))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          if (e instanceof Error) server.ssrFixStacktrace(e)
          console.error(e)
          res.statusCode = 500
          res.end('api error')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApi()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
