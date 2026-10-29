import { devtools } from '@tanstack/devtools-vite'
import { defineConfig, loadEnv } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const allowedHosts = env.ALLOWED_HOSTS
    ? env.ALLOWED_HOSTS.split(',').map((host) => host.trim())
    : []

  return {
    resolve: { tsconfigPaths: true },
    server: { allowedHosts },
    preview: { allowedHosts },
    plugins: [
      devtools(),
      cloudflare({
        viteEnvironment: { name: 'ssr' },
        configPath: process.env.WRANGLER_CONFIG,
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})
