#!/usr/bin/env node

import { execSync } from 'node:child_process'

function run(command) {
  execSync(command, { stdio: 'inherit' })
}

function hasWslInstalled() {
  try {
    execSync('where wsl', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function toWslPath(windowsPath) {
  const normalized = windowsPath.replace(/\\/g, '/')
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/)
  if (!match) {
    return normalized
  }

  const drive = match[1].toLowerCase()
  const rest = match[2]
  return `/mnt/${drive}/${rest}`
}

if (process.platform === 'win32') {
  if (!hasWslInstalled()) {
    console.error('WSL not installed; skipping ci:lint Linux gate.')
    process.exit(0)
  }

  const wslCwd = toWslPath(process.cwd())
  const lintCommand = `cd ${JSON.stringify(wslCwd)} && npm run lint:packages`

  try {
    run(`wsl -e bash -lc ${JSON.stringify(lintCommand)}`)
  } catch (error) {
    console.error(
      'WSL/Linux lint gate failed. Ensure WSL is installed and dependencies are installed in the repo.'
    )
    process.exit(error.status || 1)
  }
} else {
  run('npm run lint:packages')
}
