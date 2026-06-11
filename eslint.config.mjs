import { defineConfig } from 'eslint/config'
import eslintReact from '@eslint-react/eslint-plugin'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierPlugin from 'eslint-plugin-prettier'

const ALL_SOURCE_FILES = ['**/*.{js,jsx,ts,tsx}']
const ROOT_REACT_APP_FILES = ['apps/frontend/**/*.{js,jsx,ts,tsx}', 'apps/admin/**/*.{js,jsx,ts,tsx}']
const REACT_EXCEPTION_FILES = [
  '**/src/components/workspaces/index.tsx',
  '**/src/components/workspaces/session/WorkspaceFrame.tsx',
  '**/src/components/workspaces/session/DMAudioControls.tsx',
  '**/src/components/workspaces/session/rooms/RoomSelector.tsx',
  '**/src/components/workspaces/shared/panels/CampaignInformationPanel.tsx',
]
const REACT_RULE_OVERRIDES = {
  '@eslint-react/no-array-index-key': 'off',
  '@eslint-react/no-forward-ref': 'off',
  '@eslint-react/set-state-in-effect': 'off',
  '@eslint-react/unsupported-syntax': 'off',
  '@eslint-react/use-state': 'off',
  '@eslint-react/web-api-no-leaked-fetch': 'off',
  '@eslint-react/naming-convention-ref-name': 'off',
}

export default defineConfig([
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', 'packages/shared/**/*.js', 'packages/shared/index.js'],
  },
  {
    files: ALL_SOURCE_FILES,
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        WebSocket: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ROOT_REACT_APP_FILES,
    extends: [eslintReact.configs['recommended-typescript']],
    rules: REACT_RULE_OVERRIDES,
  },
  {
    files: REACT_EXCEPTION_FILES,
    rules: {
      '@eslint-react/refs': 'off',
    },
  },
])
