#!/usr/bin/env node

/**
 * Flaky Test Detection & Reporting Script
 *
 * Runs tests multiple times to detect flaky tests and generates a report.
 * Used in CI pipeline to track and enforce flaky test thresholds.
 *
 * Usage:
 *   node scripts/qa/flaky-tests.mjs [options]
 *
 * Options:
 *   --runs=N          Number of test runs (default: 3)
 *   --integration-only  Only run integration tests
 *   --json            Output JSON report
 *   --strict          Fail if any flakiness detected
 *   --verbose         Show detailed output for each run
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
const BACKEND_DIR = path.join(__dirname, '..', '..', 'apps', 'backend')
const TESTS_DIR = path.join(BACKEND_DIR, 'tests')

const THRESHOLDS = {
  integrationTests: 0.02,
  unitTests: 0.0,
  contractTests: 0.0,
  overall: 0.015,
}

const args = process.argv.slice(2)
const options = {
  runs: parseInt(args.find((a) => a.startsWith('--runs='))?.split('=')[1] || '3', 10),
  integrationOnly: args.includes('--integration-only'),
  json: args.includes('--json'),
  strict: args.includes('--strict'),
  verbose: args.includes('--verbose'),
}

const testResults = new Map()
const flakyTests = []
const failedTests = []

function getSuiteCategory(fileName) {
  if (fileName.includes('/contracts/')) return 'contractTests'
  if (fileName.endsWith('.integration.test.ts')) return 'integrationTests'
  return 'unitTests'
}

function listFilesRecursive(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath))
      continue
    }
    files.push(entryPath)
  }

  return files
}

function getIntegrationTestFiles() {
  return listFilesRecursive(TESTS_DIR)
    .filter((filePath) => filePath.endsWith('.integration.test.ts'))
    .map((filePath) => path.relative(BACKEND_DIR, filePath))
    .sort()
}

function runTests(run) {
  try {
    if (options.verbose) {
      console.log(`\nRun ${run + 1}/${options.runs}`)
    }

    const reportPath = path.join(os.tmpdir(), `vtt-chat-vitest-run-${process.pid}-${run}.json`)
    const vitestArgs = ['vitest', 'run']

    if (options.integrationOnly) {
      vitestArgs.push(...getIntegrationTestFiles())
    }

    vitestArgs.push('--reporter=json', '--outputFile', reportPath)

    const result = spawnSync('npx', vitestArgs, {
      cwd: BACKEND_DIR,
      encoding: 'utf-8',
      stdio: options.verbose ? 'inherit' : 'pipe',
    })

    if (result.error) {
      throw result.error
    }

    if (!fs.existsSync(reportPath)) {
      const stderr = result.stderr ? `\n${result.stderr}` : ''
      throw new Error(`Vitest did not produce JSON output.${stderr}`)
    }

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    fs.rmSync(reportPath, { force: true })

    for (const suite of report.testResults || []) {
      for (const assertion of suite.assertionResults || []) {
        const testName = assertion.fullName
        if (!testResults.has(testName)) {
          testResults.set(testName, { passed: 0, failed: 0, file: suite.name })
        }
        const testResult = testResults.get(testName)
        if (assertion.status === 'passed') {
          testResult.passed += 1
        } else if (assertion.status === 'failed') {
          testResult.failed += 1
        }
      }
    }

    if (options.verbose && report.success) {
      console.log(`Completed run ${run + 1}`)
    }
  } catch (err) {
    console.error(`Error running tests: ${err.message}`)
    process.exit(1)
  }
}

function analyzeResults() {
  let totalTests = 0
  let totalFlaky = 0

  testResults.forEach((result, testName) => {
    totalTests += 1

    const passRate = result.passed / options.runs
    const failRate = result.failed / options.runs
    const category = getSuiteCategory(result.file)

    if (passRate > 0 && passRate < 1) {
      flakyTests.push({
        name: testName,
        file: path.relative(BACKEND_DIR, result.file),
        category,
        passedRuns: result.passed,
        failedRuns: result.failed,
        passRate: (passRate * 100).toFixed(1),
      })
      totalFlaky += 1
    } else if (failRate === 1) {
      failedTests.push({
        name: testName,
        file: path.relative(BACKEND_DIR, result.file),
        category,
        failedRuns: result.failed,
      })
    }
  })

  const flakinessRate = totalTests === 0 ? 0 : totalFlaky / totalTests
  const thresholdBreaches = flakyTests.filter((test) => {
    const threshold = THRESHOLDS[test.category] ?? THRESHOLDS.overall
    return test.failedRuns / options.runs > threshold
  })

  return { totalTests, totalFlaky, flakinessRate, thresholdBreaches }
}

function generateReport(stats) {
  const { totalTests, totalFlaky, flakinessRate, thresholdBreaches } = stats

  return {
    timestamp: new Date().toISOString(),
    runs: options.runs,
    summary: {
      totalTests,
      totalFlaky,
      flakinessPercentage: (flakinessRate * 100).toFixed(2),
      thresholdBreaches: thresholdBreaches.length,
      status: thresholdBreaches.length > 0 ? 'EXCEEDS_THRESHOLD' : 'WITHIN_THRESHOLD',
    },
    flakyTests: flakyTests.sort((a, b) => b.failedRuns - a.failedRuns),
    failedTests,
    thresholdBreaches,
    thresholds: THRESHOLDS,
  }
}

function displayReport(report) {
  console.log('\nFlaky Test Report')
  console.log('='.repeat(60))
  console.log(`Runs: ${report.runs}`)
  console.log(`Timestamp: ${report.timestamp}`)
  console.log('-'.repeat(60))
  console.log(`Total Tests: ${report.summary.totalTests}`)
  console.log(`Flaky Tests: ${report.summary.totalFlaky} (${report.summary.flakinessPercentage}%)`)
  console.log(`Threshold Breaches: ${report.summary.thresholdBreaches}`)
  console.log(`Status: ${report.summary.status}`)
  console.log('-'.repeat(60))

  if (report.flakyTests.length > 0) {
    console.log('\nFlaky Tests Detected:')
    report.flakyTests.forEach((test) => {
      console.log(
        `  - ${test.name}`,
        `[${test.passedRuns}P/${test.failedRuns}F - ${test.passRate}% pass rate, ${test.category}]`
      )
    })
  } else {
    console.log('\nNo flaky tests detected.')
  }

  if (report.failedTests.length > 0) {
    console.log('\nConsistently Failing Tests:')
    report.failedTests.forEach((test) => {
      console.log(`  - ${test.name}`)
    })
  }

  console.log(`\n${'='.repeat(60)}`)
}

function main() {
  console.log('Starting flaky test detection')
  console.log(
    `Configuration: ${options.runs} runs, ${options.integrationOnly ? 'integration only' : 'all tests'}`
  )

  for (let i = 0; i < options.runs; i += 1) {
    runTests(i)
  }

  const stats = analyzeResults()
  const report = generateReport(stats)

  displayReport(report)

  if (options.json) {
    const reportPath = path.join(__dirname, '../../apps/backend/coverage/flaky-tests-report.json')
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`\nJSON report written to: ${reportPath}`)
  }

  if (report.failedTests.length > 0) {
    console.error('\nConsistently failing tests detected')
    process.exit(1)
  }

  if (options.strict && report.summary.thresholdBreaches > 0) {
    console.error('\nFlaky threshold exceeded and --strict mode enabled')
    process.exit(2)
  }

  console.log('\nFlaky test detection complete')
}

main()
