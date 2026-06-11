#!/usr/bin/env node
/**
 * scripts/qa/coverage-report.mjs
 *
 * W2: Workspace test report — per-package test and coverage delta
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..', '..')
const JSON_MODE = process.argv.includes('--json')

const THRESHOLDS = {
  backend: { statements: 60, branches: 51, functions: 60, lines: 61 },
  frontend: { statements: 25, branches: 20, functions: 25, lines: 25 },
  admin: { statements: 80, branches: 70, functions: 80, lines: 80 },
}

const PACKAGES = ['backend', 'frontend', 'admin']

function pct(covered, total) {
  if (!total) return 0
  return parseFloat(((covered / total) * 100).toFixed(2))
}

function readSummary(pkg) {
  const summaryPath = path.join(ROOT, 'apps', pkg, 'coverage', 'coverage-summary.json')
  if (!fs.existsSync(summaryPath)) return null
  try {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
  } catch {
    return null
  }
}

function extractTotals(summary) {
  if (!summary || !summary.total) return null
  const t = summary.total
  return {
    statements: pct(t.statements.covered, t.statements.total),
    branches: pct(t.branches.covered, t.branches.total),
    functions: pct(t.functions.covered, t.functions.total),
    lines: pct(t.lines.covered, t.lines.total),
    statementsCount: { covered: t.statements.covered, total: t.statements.total },
    branchesCount: { covered: t.branches.covered, total: t.branches.total },
    functionsCount: { covered: t.functions.covered, total: t.functions.total },
    linesCount: { covered: t.lines.covered, total: t.lines.total },
  }
}

let anyFail = false
const report = {}

for (const pkg of PACKAGES) {
  const summary = readSummary(pkg)
  const totals = extractTotals(summary)
  const thresholds = THRESHOLDS[pkg]

  if (!totals) {
    report[pkg] = { error: `coverage-summary.json not found — run npm run test:coverage in ${pkg}` }
    if (!JSON_MODE) {
      console.log(`\n${pkg.toUpperCase()}`)
      console.log(`  No coverage data found. Run: npm --workspace=apps/${pkg} run test:coverage`)
    }
    continue
  }

  const metrics = ['statements', 'branches', 'functions', 'lines']
  const checks = {}
  let pkgFail = false

  for (const metric of metrics) {
    const actual = totals[metric]
    const threshold = thresholds[metric]
    const delta = parseFloat((actual - threshold).toFixed(2))
    const pass = actual >= threshold
    if (!pass) {
      pkgFail = true
      anyFail = true
    }
    checks[metric] = { actual, threshold, delta, pass }
  }

  report[pkg] = { totals, thresholds, checks, pass: !pkgFail }

  if (!JSON_MODE) {
    const status = pkgFail ? 'FAIL' : 'PASS'
    console.log(`\n${pkg.toUpperCase()}  ${status}`)
    console.log(
      `  ${'METRIC'.padEnd(12)} ${'ACTUAL'.padStart(7)} ${'THRESHOLD'.padStart(10)} ${'DELTA'.padStart(8)} STATUS`
    )
    console.log(`  ${'-'.repeat(52)}`)
    for (const metric of metrics) {
      const check = checks[metric]
      const sign = check.delta >= 0 ? '+' : ''
      const statusIcon = check.pass ? 'PASS' : 'FAIL'
      console.log(
        `  ${metric.padEnd(12)} ${String(check.actual).padStart(6)}% ${String(check.threshold).padStart(9)}%` +
          ` ${(sign + check.delta).padStart(7)}%  ${statusIcon}`
      )
    }
    if (pkgFail) {
      const failing = metrics.filter((metric) => !checks[metric].pass)
      console.log(`\n  Failing: ${failing.join(', ')}`)
    }
  }
}

if (!JSON_MODE) {
  console.log(`\n${'═'.repeat(56)}`)
  const passCount = PACKAGES.filter((pkg) => report[pkg]?.pass).length
  const total = PACKAGES.filter((pkg) => report[pkg] && !report[pkg].error).length
  console.log(`Workspace gate: ${passCount}/${total} packages passing all thresholds`)
  if (anyFail) {
    console.log('Result: GATE FAILED — one or more packages below threshold')
  } else {
    console.log('Result: GATE PASSED — all packages meet release thresholds')
  }
  console.log()
} else {
  const gateResult = {
    pass: !anyFail,
    packagesTotal: PACKAGES.length,
    packagesPassing: PACKAGES.filter((pkg) => report[pkg]?.pass).length,
    thresholds: THRESHOLDS,
    packages: report,
  }
  console.log(JSON.stringify(gateResult, null, 2))
}

process.exit(anyFail ? 1 : 0)
