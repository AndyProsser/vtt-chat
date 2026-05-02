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
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/admin/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/admin\/api/, '/api/admin'),
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
