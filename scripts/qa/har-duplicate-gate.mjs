#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const out = {
    har: null,
    maxDuplicates: 0,
    includePrefix: '/api/',
    json: false,
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--har') {
      out.har = argv[i + 1] || null
      i += 1
      continue
    }

    if (arg === '--max-duplicates') {
      const value = Number(argv[i + 1])
      if (Number.isFinite(value) && value >= 0) {
        out.maxDuplicates = Math.floor(value)
      }
      i += 1
      continue
    }

    if (arg === '--include-prefix') {
      out.includePrefix = argv[i + 1] || out.includePrefix
      i += 1
      continue
    }

    if (arg === '--json') {
      out.json = true
      continue
    }

    if (!arg.startsWith('--') && !out.har) {
      out.har = arg
    }
  }

  return out
}

function toPathname(urlString) {
  try {
    return new URL(urlString).pathname
  } catch {
    return urlString
  }
}

function analyzeHar(filePath, includePrefix) {
  const absolutePath = path.resolve(process.cwd(), filePath)
  const content = fs.readFileSync(absolutePath, 'utf8')
  const parsed = JSON.parse(content)
  const entries = Array.isArray(parsed?.log?.entries) ? parsed.log.entries : []

  const apiEntries = entries
    .map((entry) => {
      const method = String(entry?.request?.method || 'GET').toUpperCase()
      const pathname = toPathname(String(entry?.request?.url || ''))
      const status = Number(entry?.response?.status || 0)
      const started = String(entry?.startedDateTime || '')
      return { method, pathname, status, started }
    })
    .filter((entry) => entry.pathname.startsWith(includePrefix))

  const counts = new Map()
  for (const entry of apiEntries) {
    const key = `${entry.method} ${entry.pathname}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

  const duplicateCalls = duplicates.reduce((sum, item) => sum + (item.count - 1), 0)

  return {
    filePath,
    includePrefix,
    endpointCount: counts.size,
    requestCount: apiEntries.length,
    duplicateCalls,
    duplicateSharePct: apiEntries.length
      ? +((duplicateCalls / apiEntries.length) * 100).toFixed(1)
      : 0,
    duplicates,
  }
}

function printReport(report, maxDuplicates) {
  console.log(`HAR: ${report.filePath}`)
  console.log(`Filter prefix: ${report.includePrefix}`)
  console.log(`Requests considered: ${report.requestCount}`)
  console.log(`Unique method+path: ${report.endpointCount}`)
  console.log(`Duplicate calls: ${report.duplicateCalls}`)
  console.log(`Duplicate share: ${report.duplicateSharePct}%`)

  if (report.duplicates.length > 0) {
    console.log('\nDuplicate endpoints:')
    for (const item of report.duplicates) {
      console.log(`- ${item.key} (count=${item.count})`)
    }
  }

  if (report.duplicateCalls > maxDuplicates) {
    console.error(
      `\nFAIL: duplicateCalls=${report.duplicateCalls} exceeds maxDuplicates=${maxDuplicates}`
    )
    process.exit(1)
  }

  console.log(`\nPASS: duplicateCalls=${report.duplicateCalls} <= maxDuplicates=${maxDuplicates}`)
}

function main() {
  const args = parseArgs(process.argv)

  if (!args.har) {
    console.error(
      'Usage: node scripts/qa/har-duplicate-gate.mjs --har <file.har> [--max-duplicates 0] [--include-prefix /api/] [--json]'
    )
    process.exit(1)
  }

  const report = analyzeHar(args.har, args.includePrefix)

  if (args.json) {
    console.log(JSON.stringify({ ...report, maxDuplicates: args.maxDuplicates }, null, 2))
  } else {
    printReport(report, args.maxDuplicates)
    return
  }

  if (report.duplicateCalls > args.maxDuplicates) {
    process.exit(1)
  }
}

main()
