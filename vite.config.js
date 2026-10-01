import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Direkt zu Appwrite (ein Hop weniger als ticket.webklar.com → nginx → Appwrite)
  const apiTarget =
    env.VITE_APPWRITE_PROXY_TARGET || 'https://appwrite.webklar.com'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/v1': {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          timeout: 120_000,
          proxyTimeout: 120_000,
          cookieDomainRewrite: 'localhost',
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              console.error('[vite proxy /v1]', err.message)
              if (res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    message: `Proxy-Fehler: ${err.message}. Ist ${apiTarget} erreichbar?`,
                  })
                )
              }
            })
          },
        },
      },
    },
  }
})
