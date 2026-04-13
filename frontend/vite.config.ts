import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
        target: (process.env.VITE_BACKEND_URL || 'http://localhost:3000').replace(
          'http',
          'ws'
        ),
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
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-livekit': ['@livekit/components-react'],
          'vendor-store': ['zustand'],
        },
      },
    },
  },
})
