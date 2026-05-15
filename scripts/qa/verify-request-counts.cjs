#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

function parseArgs(argv) {
  const out = {
    before: null,
    after: null,
    json: false,
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--before') {
      out.before = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg === '--after') {
      out.after = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg === '--json') {
      out.json = true
      continue
    }
  }

  return out
}

function endpointGroupFor(urlString) {
  let pathname = ''
  try {
    const url = new URL(urlString)
    pathname = url.pathname
  } catch {
    pathname = urlString
  }

  if (/^\/api\/campaigns$/.test(pathname)) return 'campaigns.list'
  if (/^\/api\/campaigns\/[^/]+\/settings$/.test(pathname)) return 'campaigns.settings'
  if (/^\/api\/campaigns\/[^/]+\/settings\/dm-voice-targeting$/.test(pathname)) {
    return 'campaigns.dmVoiceTargeting'
  }
  if (/^\/api\/notes\/[^/]+$/.test(pathname)) return 'notes.session'
  if (/^\/api\/presence\/[^/]+$/.test(pathname)) return 'presence.session'
  if (/^\/api\/audio\/sessions\/[^/]+\/state$/.test(pathname)) return 'audio.sessionState'
  if (/^\/api\/rooms\/session\/[^/]+$/.test(pathname)) return 'rooms.session'
  if (/^\/api\/dev\/mock-players\/simulation\/status\/[^/]+$/.test(pathname)) {
    return 'dev.mockSimulationStatus'
  }
  return 'other'
}

function ensureFlow(bucket, flow) {
  if (!bucket[flow]) {
    bucket[flow] = {}
  }
  return bucket[flow]
}

function ensureGroup(flowBucket, group) {
  if (!flowBucket[group]) {
    flowBucket[group] = {
      starts: 0,
      responses: 0,
    }
  }
  return flowBucket[group]
}

function parseLogContent(content) {
  const lines = content.split(/\r?\n/)
  const flows = {}
  let currentFlow = 'unscoped'

  let pendingType = null
  let pendingMethod = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const flowMatch = line.match(/^===\s*FLOW:\s*(.+?)\s*===\s*$/i)
    if (flowMatch) {
      currentFlow = flowMatch[1]
      continue
    }

    if (line.includes('[http.client] Request start')) {
      pendingType = 'start'
      pendingMethod = null
      const methodMatch = line.match(/method:\s*"([A-Z]+)"/)
      if (methodMatch) pendingMethod = methodMatch[1]
    } else if (line.includes('[http.client] Response received')) {
      pendingType = 'response'
      pendingMethod = null
      const methodMatch = line.match(/method:\s*"([A-Z]+)"/)
      if (methodMatch) pendingMethod = methodMatch[1]
    }

    const methodMatch = line.match(/method:\s*"([A-Z]+)"/)
    if (methodMatch) {
      pendingMethod = methodMatch[1]
    }

    const urlMatch = line.match(/url:\s*"([^"]+)"/)
    if (!urlMatch || !pendingType) {
      continue
    }

    const method = pendingMethod || 'GET'
    if (method !== 'GET') {
      pendingType = null
      pendingMethod = null
      continue
    }

    const group = endpointGroupFor(urlMatch[1])
    const flowBucket = ensureFlow(flows, currentFlow)
    const groupBucket = ensureGroup(flowBucket, group)

    if (pendingType === 'start') {
      groupBucket.starts += 1
    } else {
      groupBucket.responses += 1
    }

    pendingType = null
    pendingMethod = null
  }

  return flows
}

function readCounts(filePath) {
  if (!filePath) return {}
  const abs = path.resolve(process.cwd(), filePath)
  const content = fs.readFileSync(abs, 'utf8')
  return parseLogContent(content)
}

function mergeFlows(before, after) {
  const out = new Set()
  Object.keys(before).forEach((k) => out.add(k))
  Object.keys(after).forEach((k) => out.add(k))
  return [...out].sort()
}

function mergeGroups(beforeFlow, afterFlow) {
  const out = new Set()
  Object.keys(beforeFlow || {}).forEach((k) => out.add(k))
  Object.keys(afterFlow || {}).forEach((k) => out.add(k))
  return [...out].sort()
}

function printTable(before, after) {
  const flows = mergeFlows(before, after)
  if (!flows.length) {
    console.log('No request events found.')
    return
  }

  for (const flow of flows) {
    console.log(`\nFlow: ${flow}`)
    console.log(
      'endpoint | before starts | before responses | after starts | after responses | delta starts'
    )
    console.log('---|---:|---:|---:|---:|---:')

    const beforeFlow = before[flow] || {}
    const afterFlow = after[flow] || {}
    const groups = mergeGroups(beforeFlow, afterFlow)

    for (const group of groups) {
      const b = beforeFlow[group] || { starts: 0, responses: 0 }
      const a = afterFlow[group] || { starts: 0, responses: 0 }
      const delta = a.starts - b.starts
      console.log(
        `${group} | ${b.starts} | ${b.responses} | ${a.starts} | ${a.responses} | ${delta}`
      )
    }
  }
}

function main() {
  const args = parseArgs(process.argv)
  if (!args.before && !args.after) {
    console.error(
      'Usage: node scripts/qa/verify-request-counts.cjs --before <before.log> --after <after.log> [--json]'
    )
    process.exit(1)
  }

  const before = readCounts(args.before)
  const after = readCounts(args.after)

  if (args.json) {
    console.log(JSON.stringify({ before, after }, null, 2))
    return
  }

  printTable(before, after)
}

main()
