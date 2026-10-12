import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'

const here = fileURLToPath(new URL('.', import.meta.url))
// Plugin UI lives outside the frontend root (../plugins/*, /plugins/*),
// so bare imports in plugin files can't walk up to our node_modules.
// Alias the shared deps to our copies — generic, no plugin named here.
// `@tanstack/react-query` is deliberately NOT aliased: plugins are
// react-only (README + AGENTS.md), and leaving it out turns that rule
// into a build error instead of a comment nobody reads.
const sharedDeps = ['react', 'react-dom', 'react-router-dom']

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: sharedDeps.map((d) => ({ find: d, replacement: `${here}node_modules/${d}` })),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow the brief's `../../plugins/*` glob to resolve both on host
    // (repo_root/plugins) and in Docker (mounted at /plugins).
    fs: { allow: ['.', '..', '../..', '/plugins'] },
    // Same-origin /api proxy so the browser never needs localhost:8100.
    // Works from any host (laptop, Tailscale IP, domain).
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
})
