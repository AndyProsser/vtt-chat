import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
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
        manualChunks: {
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
