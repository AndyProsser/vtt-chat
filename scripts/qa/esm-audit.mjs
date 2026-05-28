#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..', '..')

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage'])

const cjsFiles = []
const disallowedJsFiles = []

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      continue
    }

    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }

    const relativePath = path.relative(ROOT, fullPath).split(path.sep).join('/')

    if (relativePath.endsWith('.cjs')) {
      cjsFiles.push(relativePath)
      continue
    }

    if (!relativePath.endsWith('.js')) {
      continue
    }

    disallowedJsFiles.push(relativePath)
  }
}

function printList(title, items) {
  if (!items.length) {
    return
  }

  console.error(`\n${title}`)
  for (const item of items.sort()) {
    console.error(`- ${item}`)
  }
}

function main() {
  walk(ROOT)

  if (!cjsFiles.length && !disallowedJsFiles.length) {
    console.log('ESM audit passed: no committed .cjs or .js files found.')
    process.exit(0)
  }

  console.error('ESM audit failed.')
  printList('Disallowed .cjs files:', cjsFiles)
  printList('Disallowed committed .js files:', disallowedJsFiles)
  process.exit(1)
}

main()
