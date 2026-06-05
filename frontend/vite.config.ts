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

const TIPTAP_PACKAGES = new Set(['tiptap-markdown'])

// Mermaid and its exclusive transitive deps — all only reachable via the dynamic
// import('mermaid') in DmdxTimelineBlock. Returning undefined lets Rollup keep
// them in the lazy mermaid chunk instead of pulling them into vendor-third-party.
const MERMAID_PACKAGES = new Set([
  'mermaid',
  '@mermaid-js/parser',
  'cytoscape',
  'cytoscape-cose-bilkent',
  'cytoscape-fcose',
  'dagre-d3-es',
  'd3',
  'd3-sankey',
  'roughjs',
  'khroma',
  '@upsetjs/venn.js',
  'katex',
  'es-toolkit',
  'marked',
  '@braintree/sanitize-url',
  '@iconify/utils',
  'ts-dedent',
  'stylis',
  'dompurify',
])
const LIVEKIT_CI_OVERFLOW_PACKAGES = new Map<string, string>([
  ['webrtc-adapter', 'vendor-livekit-webrtc-adapter'],
  ['mediasoup-client', 'vendor-livekit-mediasoup'],
])

interface VendorChunkOptions {
  splitLiveKitOverflowInCi: boolean
}

function getPackageName(id: string): string | null {
  const normalized = id.split('node_modules/')[1]
  if (!normalized) return null

  const [scopeOrName, maybeName] = normalized.split('/')
  if (!scopeOrName) return null

  return scopeOrName.startsWith('@') && maybeName ? `${scopeOrName}/${maybeName}` : scopeOrName
}

function getVendorChunk(id: string, options: VendorChunkOptions): string | undefined {
  const packageName = getPackageName(id)
  if (!packageName) return undefined

  if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
    return 'vendor-react'
  }

  if (packageName === 'zustand') {
    return 'vendor-store'
  }

  if (packageName === 'livekit-client') {
    if (options.splitLiveKitOverflowInCi) {
      if (id.includes('/livekit-client/dist/src/e2ee/') || id.includes('e2ee.worker')) {
        return 'vendor-livekit-e2ee'
      }

      if (id.includes('/livekit-client/dist/src/packetTrailer/') || id.includes('pt.worker')) {
        return 'vendor-livekit-packet'
      }

      if (
        id.includes('/livekit-client/dist/src/room/track/') ||
        id.includes('/livekit-client/dist/src/room/participant/') ||
        id.includes('/livekit-client/dist/src/room/data-track/')
      ) {
        return 'vendor-livekit-rtc'
      }
    }

    return 'vendor-livekit-core'
  }

  if (options.splitLiveKitOverflowInCi && LIVEKIT_CI_OVERFLOW_PACKAGES.has(packageName)) {
    return LIVEKIT_CI_OVERFLOW_PACKAGES.get(packageName)
  }

  if (packageName.startsWith('@livekit/')) {
    return 'vendor-livekit-ui'
  }

  if (
    packageName.startsWith('@radix-ui/') ||
    packageName.startsWith('@floating-ui/') ||
    RADIX_SHARED_PACKAGES.has(packageName)
  ) {
    return 'vendor-radix'
  }

  if (
    packageName.startsWith('@tiptap/') ||
    packageName.startsWith('prosemirror-') ||
    TIPTAP_PACKAGES.has(packageName)
  ) {
    return 'vendor-tiptap'
  }

  if (
    packageName === 'clsx' ||
    packageName === 'tailwind-merge' ||
    packageName === 'react-window'
  ) {
    return 'vendor-utils'
  }

  // Mermaid ecosystem — only reachable via dynamic import, so return undefined to
  // let Rollup keep them in the lazy mermaid chunk rather than the eager vendor bundle.
  if (packageName && MERMAID_PACKAGES.has(packageName)) {
    return undefined
  }

  if (id.includes('node_modules/')) {
    return 'vendor-third-party'
  }

  return undefined
}

export default defineConfig(({ mode }) => {
  const debugBuild = process.env.VITE_DEBUG_BUILD === 'true' || mode !== 'production'
  const splitLiveKitOverflowInCi =
    process.env.CI === 'true' && process.env.VITE_CI_LIVEKIT_OVERFLOW_SPLIT !== 'false'

  return {
    plugins: [react()],
    resolve: {
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: '@shared', replacement: path.resolve(__dirname, '../shared/index.ts') },
        { find: /^@shared\/(.*)$/, replacement: path.resolve(__dirname, '../shared/$1') },
      ],
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
          entryFileNames: 'assets/app-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              if (assetInfo.name.startsWith('vendor-')) {
                return 'assets/[name]-[hash][extname]'
              }

              return 'assets/app-[hash][extname]'
            }

            return 'assets/[name]-[hash][extname]'
          },
          manualChunks: (id) =>
            getVendorChunk(id, {
              splitLiveKitOverflowInCi,
            }),
        },
      },
    },
  }
})
