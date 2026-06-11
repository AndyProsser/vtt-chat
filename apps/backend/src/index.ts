import { bootstrap, setupGracefulShutdown } from './bootstrap'
import { logger } from '@/utils'

async function main() {
  try {
    logger.info('main', 'Starting VTT-Chat backend baseline')

    const { server, start, stop } = await bootstrap()

    setupGracefulShutdown(server, stop)

    await start()

    logger.info('main', 'VTT-Chat backend baseline ready')
  } catch (error) {
    logger.error('main', 'Failed to start application', error as Error)
    process.exit(1)
  }
}

main()
