#!/usr/bin/env node

const { execSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

function readPeerRange() {
  const command = 'npm view eslint-plugin-react peerDependencies --json'
  const output = execSync(command, { encoding: 'utf8' }).trim()

  if (!output) {
    throw new Error('No peer dependency metadata returned for eslint-plugin-react.')
  }

  const parsed = JSON.parse(output)
  return parsed.eslint || ''
}

function peerRangeSupportsEslint10(range) {
  if (!range) {
    return false
  }

  return range
    .split('||')
    .map((segment) => segment.trim())
    .some((segment) => /^(\^|~)?10(\.|$)/.test(segment) || /^>=\s*10(\.|$)/.test(segment))
}

function hasLegacyPeerDepsWorkaround(repoRoot) {
  const npmrcPath = join(repoRoot, '.npmrc')
  if (!existsSync(npmrcPath)) {
    return false
  }

  const npmrc = readFileSync(npmrcPath, 'utf8')
  return /(^|\n)\s*legacy-peer-deps\s*=\s*true\s*($|\n)/m.test(npmrc)
}

function main() {
  const repoRoot = process.cwd()

  let peerRange = ''
  try {
    peerRange = readPeerRange()
  } catch (error) {
    console.error('[eslint-react-peer-check] Failed to query npm registry.')
    console.error(String(error && error.message ? error.message : error))
    process.exit(1)
  }

  const supportsEslint10 = peerRangeSupportsEslint10(peerRange)
  const hasWorkaround = hasLegacyPeerDepsWorkaround(repoRoot)

  console.log(`[eslint-react-peer-check] eslint-plugin-react peer range: ${peerRange || '(none)'}`)
  console.log(`[eslint-react-peer-check] supports ESLint 10: ${supportsEslint10 ? 'yes' : 'no'}`)
  console.log(
    `[eslint-react-peer-check] workaround (.npmrc legacy-peer-deps=true): ${hasWorkaround ? 'present' : 'absent'}`
  )

  if (!supportsEslint10 && hasWorkaround) {
    console.log(
      '[eslint-react-peer-check] OK: keep workaround until eslint-plugin-react declares ESLint 10 support.'
    )
    process.exit(0)
  }

  if (supportsEslint10 && hasWorkaround) {
    console.error(
      '[eslint-react-peer-check] ACTION REQUIRED: eslint-plugin-react now supports ESLint 10. Remove .npmrc legacy-peer-deps workaround and reinstall lockfile.'
    )
    process.exit(1)
  }

  if (!supportsEslint10 && !hasWorkaround) {
    console.error(
      '[eslint-react-peer-check] ACTION REQUIRED: eslint-plugin-react does not yet support ESLint 10, but workaround is missing. Add .npmrc legacy-peer-deps=true or installs may fail.'
    )
    process.exit(1)
  }

  console.log('[eslint-react-peer-check] OK: plugin support and repo config are aligned.')
  process.exit(0)
}

main()
