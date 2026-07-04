import { spawn } from 'node:child_process'
import process from 'node:process'

import { Client } from 'pg'

const DEFAULT_WAIT_ATTEMPTS = 60
const DEFAULT_WAIT_MS = 2000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function waitForDatabase() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for container startup')
  }

  const maxAttempts = toInt(process.env.DB_WAIT_MAX_ATTEMPTS, DEFAULT_WAIT_ATTEMPTS)
  const delayMs = toInt(process.env.DB_WAIT_DELAY_MS, DEFAULT_WAIT_MS)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = new Client({ connectionString: databaseUrl })

    try {
      await client.connect()
      await client.query('SELECT 1')
      console.log(`[startup] Database is reachable (attempt ${attempt}/${maxAttempts}).`)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(
        `[startup] Database not ready yet (attempt ${attempt}/${maxAttempts}): ${message}`
      )

      if (attempt === maxAttempts) {
        throw new Error(`Database did not become ready after ${maxAttempts} attempts`)
      }

      await sleep(delayMs)
    } finally {
      try {
        await client.end()
      } catch {
        // Ignore shutdown errors from partial connections.
      }
    }
  }
}

function resolvePrismaCommand() {
  const mode = (process.env.PRISMA_SCHEMA_SYNC_MODE || '').toLowerCase()

  if (mode === 'deploy') {
    return ['migrate', 'deploy', '--config', 'prisma.config.ts']
  }

  if (mode === 'push') {
    return ['db', 'push', '--config', 'prisma.config.ts']
  }

  if (process.env.NODE_ENV === 'production') {
    return ['migrate', 'deploy', '--config', 'prisma.config.ts']
  }

  return ['db', 'push', '--config', 'prisma.config.ts']
}

async function runPrismaCommand() {
  const prismaArgs = resolvePrismaCommand()
  const commandLabel = `npx prisma ${prismaArgs.join(' ')}`
  console.log(`[startup] Running schema sync: ${commandLabel}`)

  await new Promise((resolve, reject) => {
    const child = spawn('npx', ['prisma', ...prismaArgs], {
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`Schema sync command failed with exit code ${code}`))
    })
  })
}

async function runPrismaGenerate() {
  console.log(
    '[startup] Running Prisma client generation: npx prisma generate --config prisma.config.ts'
  )

  await new Promise((resolve, reject) => {
    const child = spawn('npx', ['prisma', 'generate', '--config', 'prisma.config.ts'], {
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`Prisma client generation failed with exit code ${code}`))
    })
  })
}

async function main() {
  await waitForDatabase()
  await runPrismaCommand()
  await runPrismaGenerate()
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[startup] ${message}`)
  process.exit(1)
})
