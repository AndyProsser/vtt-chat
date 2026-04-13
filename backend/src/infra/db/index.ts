import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { logger } from '@/utils/logger'
import { config } from '@/infra/config'

let prisma: PrismaClient

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const pool = new Pool({ connectionString: config.database.url })
    const adapter = new PrismaPg(pool)
    prisma = new PrismaClient({ adapter })

    prisma.$on('query', (e: any) => {
      logger.debug('prisma', 'Query', {
        query: e.query,
        duration: e.duration,
      })
    })
  }

  return prisma
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
  }
}
