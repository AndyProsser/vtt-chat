export default {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },

          // Allow patch releases for scoped docs updates that change product guidance.
          { type: 'docs', scope: 'roadmap', release: 'patch' },
          { type: 'docs', scope: 'architecture', release: 'patch' },
          { type: 'docs', scope: 'extension', release: 'patch' },
          { type: 'docs', scope: 'api', release: 'patch' },
          { type: 'docs', scope: 'permissions', release: 'patch' },
          { type: 'docs', scope: 'readme', release: 'patch' },
          { type: 'docs', scope: 'release', release: 'patch' },

          // Infra/backend refactors can warrant patch releases when behavior changes.
          { type: 'refactor', scope: 'backend', release: 'patch' },
          { type: 'refactor', scope: 'infra', release: 'patch' },

          { type: 'test', release: false },
          { type: 'chore', release: false },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: 'Features' },
            { type: 'fix', section: 'Fixes' },
            { type: 'perf', section: 'Performance' },
            { type: 'refactor', section: 'Refactors' },
            { type: 'docs', section: 'Documentation' },
            { type: 'test', section: 'Tests' },
            { type: 'chore', section: 'Chores' },
          ],
        },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version}\n\n${nextRelease.notes}',
      },
    ],
    '@semantic-release/github',
  ],
}
