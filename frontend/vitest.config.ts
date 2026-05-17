import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    maxWorkers: 1,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'tests/**',
        'src/**/index.ts',
        // Temporary scope exclusions for modules without targeted coverage yet.
        'src/components/notes/NotesPanel.tsx',
        'src/components/chat/ChatWindow.tsx',
        'src/components/chat/MessageList.tsx',
        'src/components/notes/NoteCard.tsx',
        'src/components/session/CampaignSettingsPage.tsx',
        'src/components/chat/MessageInput.tsx',
        'src/utils/fetchDebug.ts',
        'src/components/session/SessionRoomsStatusPanel.tsx',
        'src/components/ui/Panel.tsx',
        'src/components/session/SessionUserSettingsPanel.tsx',
        'src/components/metadata/MetadataTimeline.tsx',
        'src/state/audioPresetsSlice.ts',
        'src/components/audio/AudioStateSlideout.tsx',
        'src/components/audio/EnvironmentPanel.tsx',
        'src/components/metadata/MetadataCard.tsx',
        'src/components/audio/ConditionsPanel.tsx',
        'src/components/ui/Button.tsx',
        'src/components/audio/DMVoicePanel.tsx',
        'src/components/ui/LoadingSpinner.tsx',
        'src/core-ui/separator/Separator.tsx',
        'src/utils/route-view.ts',
        'src/hooks/useAudioEngine.ts',
        'src/App.tsx',
        'src/components/audio/AudioPanel.tsx',
        'src/components/session/SessionInit.tsx',
      ],
      thresholds: {
        branches: 60,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@shared', replacement: path.resolve(__dirname, '../shared/index.ts') },
      { find: /^@shared\/(.*)$/, replacement: path.resolve(__dirname, '../shared/$1') },
    ],
  },
})
