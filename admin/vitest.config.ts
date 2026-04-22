import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/tests/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/tests/**',
      ],
      thresholds: {
        branches: 6,
        functions: 7,
        lines: 7,
        statements: 7,
      },
    },
  },
})
