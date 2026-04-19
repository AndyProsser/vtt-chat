import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from '@/infra/config'

let prisma: PrismaClient

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const pool = new Pool({ connectionString: config.database.url })
    const adapter = new PrismaPg(pool)
    prisma = new PrismaClient({
      adapter,
      log: [{ emit: 'event', level: 'query' }],
    })
  }

  return prisma
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
  }
}
