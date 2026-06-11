import path from 'path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    execArgv: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/bootstrap.ts',
        'src/types/**',
        'src/**/index.ts',
        'src/services/dev-mock/**',
        'src/api/dev.routes.ts',
        'src/constants/dev-mock*.ts',
      ],
      thresholds: {
        branches: 51,
        functions: 60,
        lines: 61,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/index.ts'),
    },
  },
})
