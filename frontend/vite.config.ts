import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const RADIX_SHARED_PACKAGES = new Set([
  'react-remove-scroll',
  'react-remove-scroll-bar',
  'react-style-singleton',
  'use-callback-ref',
  'use-sidecar',
  'aria-hidden',
  'get-nonce',
  'tslib',
])

function getPackageName(id: string): string | null {
  const normalized = id.split('node_modules/')[1]
  if (!normalized) return null

  const [scopeOrName, maybeName] = normalized.split('/')
  if (!scopeOrName) return null

  return scopeOrName.startsWith('@') && maybeName ? `${scopeOrName}/${maybeName}` : scopeOrName
}

function getVendorChunk(id: string): string | undefined {
  const packageName = getPackageName(id)
  if (!packageName) return undefined

  if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
    return 'vendor-react'
  }

  if (packageName === 'zustand') {
    return 'vendor-store'
  }

  if (packageName === 'livekit-client' || packageName.startsWith('@livekit/')) {
    return 'vendor-livekit'
  }

  if (packageName === '@radix-ui/react-dialog') {
    return 'vendor-radix-dialog'
  }

  if (packageName === '@radix-ui/react-tabs') {
    return 'vendor-radix-tabs'
  }

  if (packageName === '@radix-ui/react-tooltip') {
    return 'vendor-radix-tooltip'
  }

  if (packageName === '@radix-ui/react-separator') {
    return 'vendor-radix-separator'
  }

  if (
    (packageName.startsWith('@radix-ui/') &&
      packageName !== '@radix-ui/react-dialog' &&
      packageName !== '@radix-ui/react-tabs' &&
      packageName !== '@radix-ui/react-tooltip' &&
      packageName !== '@radix-ui/react-separator') ||
    packageName.startsWith('@floating-ui/') ||
    RADIX_SHARED_PACKAGES.has(packageName)
  ) {
    return 'vendor-radix-shared'
  }

  if (packageName === 'clsx' || packageName === 'tailwind-merge') {
    return 'vendor-utils'
  }

  if (id.includes('node_modules/')) {
    return 'vendor-misc'
  }

  return undefined
}

export default defineConfig(({ mode }) => {
  const debugBuild = process.env.VITE_DEBUG_BUILD === 'true' || mode !== 'production'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: (process.env.VITE_BACKEND_URL || 'http://localhost:3000').replace('http', 'ws'),
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: debugBuild,
      minify: debugBuild ? false : 'terser',
      rollupOptions: {
        output: {
          manualChunks: getVendorChunk,
        },
      },
    },
  }
})
