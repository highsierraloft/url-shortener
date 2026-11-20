export interface Config {
  port: number
  baseUrl: string
  dbPath: string
}

export class ConfigError extends Error {}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const portValue = env.PORT ?? '3000'
  if (!/^\d+$/.test(portValue)) {
    throw new ConfigError('Invalid PORT')
  }

  const port = Number(portValue)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError('Invalid PORT')
  }

  const baseUrlValue = env.BASE_URL ?? `http://localhost:${port}`
  let baseUrl: URL
  try {
    baseUrl = new URL(baseUrlValue)
  } catch {
    throw new ConfigError('Invalid BASE_URL')
  }

  if (
    (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') ||
    baseUrl.pathname !== '/' ||
    baseUrl.search !== '' ||
    baseUrl.hash !== ''
  ) {
    throw new ConfigError('Invalid BASE_URL')
  }

  return {
    port,
    baseUrl: baseUrl.toString().slice(0, -1),
    dbPath: env.DB_PATH ?? 'data/links.db',
  }
}
