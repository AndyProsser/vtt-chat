import { defineConfig } from 'eslint/config'
import eslintReact from '@eslint-react/eslint-plugin'
import sharedConfig from '../eslint.config.mjs'

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
  ...sharedConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
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
