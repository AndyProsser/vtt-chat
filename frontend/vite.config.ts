import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
  if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/clsx')) {
    return 'vendor-ui'
  }
}

export default defineConfig({
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
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: getVendorChunk,
      },
    },
  },
})
