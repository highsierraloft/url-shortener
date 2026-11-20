import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'
import { openLinkRepository, StorageError } from './link-repository.ts'
import { createLinkService, generateCode, systemClock } from './link-service.ts'

try {
  const config = loadConfig(process.env)
  const serverDir = fileURLToPath(new URL('../', import.meta.url))
  const dbPath = isAbsolute(config.dbPath) ? config.dbPath : resolve(serverDir, config.dbPath)
  const repository = openLinkRepository(dbPath)
  const service = createLinkService({
    repository,
    clock: systemClock,
    generateCode,
    baseUrl: config.baseUrl,
  })
  const app = buildApp({ service, logger: true })

  await app.listen({ port: config.port, host: 'localhost' })
} catch (error) {
  if (error instanceof ConfigError || error instanceof StorageError) {
    console.error(error.message)
    process.exitCode = 1
  } else {
    throw error
  }
}
