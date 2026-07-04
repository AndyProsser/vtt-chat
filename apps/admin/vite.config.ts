import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function getVendorChunk(id: string): string | undefined {
  if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
    return 'vendor-react'
  }
  if (id.includes('node_modules/zustand')) {
    return 'vendor-store'
  }
  if (id.includes('node_modules/@livekit')) {
    return 'vendor-livekit'
  }
  if (id.includes('node_modules/@mui') || id.includes('node_modules/@emotion')) {
    return 'vendor-mui'
  }
}

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
      {
        find: '@shared',
        replacement: path.resolve(import.meta.dirname, '../../packages/shared/index.ts'),
      },
      {
        find: /^@shared\/(.*)$/,
        replacement: path.resolve(import.meta.dirname, '../../packages/shared/$1'),
      },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: getVendorChunk,
      },
    },
  },
})
