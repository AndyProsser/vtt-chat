import { createClient, RedisClientType } from 'redis'
import { REDIS_URL } from '@/infra/config/constants'
import { logger } from '@/utils/logger'

let redisClient: RedisClientType

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      url: REDIS_URL,
    })

    redisClient.on('connect', () => {
      logger.info('redis', 'Connected to Redis')
    })

    redisClient.on('error', (error) => {
      logger.error('redis', 'Redis error', error)
    })

    redisClient.on('disconnect', () => {
      logger.info('redis', 'Disconnected from Redis')
    })

    await redisClient.connect()
  }

  return redisClient
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.disconnect()
  }
}
