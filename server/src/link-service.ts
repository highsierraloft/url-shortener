import { randomInt } from 'node:crypto'
import { DuplicateCodeError, StorageError } from './link-repository.ts'
import type { LinkRepository } from './link-repository.ts'

export interface Clock {
  now(): number
}
export type CodeGenerator = () => string
export type Lifetime = '1h' | '24h' | '7d' | '30d' | 'never'
export type ValidationCode =
  | 'URL_REQUIRED'
  | 'INVALID_URL'
  | 'MISSING_SCHEME'
  | 'UNSUPPORTED_SCHEME'
  | 'URL_TOO_LONG'
  | 'INVALID_LIFETIME'
  | 'INVALID_REQUEST'

export class ValidationError extends Error {
  readonly code: ValidationCode

  constructor(code: ValidationCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface CreatedLink {
  code: string
  shortUrl: string
  expiresAt: string | null
}

export interface LinkService {
  create(body: unknown): CreatedLink
  resolve(code: string): string | null
}

export const systemClock: Clock = {
  now(): number {
    return Date.now()
  },
}

export const generateCode: CodeGenerator = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let index = 0; index < 8; index++) {
    code += alphabet[randomInt(alphabet.length)]
  }
  return code
}

const messages = {
  URL_REQUIRED: 'Enter a URL to shorten.',
  INVALID_URL: 'This is not a valid URL. Check it and try again.',
  MISSING_SCHEME: 'Add https:// to the start, for example https://example.com.',
  UNSUPPORTED_SCHEME: 'Only http:// and https:// URLs can be shortened.',
  URL_TOO_LONG: 'This URL is longer than 2,048 characters once encoded.',
  INVALID_LIFETIME: 'Lifetime must be one of: 1h, 24h, 7d, 30d, never.',
  INVALID_REQUEST: 'Send a JSON object with a "url" field.',
} as const

const lifetimeDurations: Record<Exclude<Lifetime, 'never'>, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
}

function validation(code: keyof typeof messages): ValidationError {
  return new ValidationError(code, messages[code])
}

function normalizeUrl(value: string): string {
  if (value.trim() === '') throw validation('URL_REQUIRED')

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    const trimmed = value.trim()
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) throw validation('INVALID_URL')

    try {
      new URL(`https://${trimmed}`)
    } catch {
      throw validation('INVALID_URL')
    }
    throw validation('MISSING_SCHEME')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw validation('UNSUPPORTED_SCHEME')
  }
  if (parsed.href.length > 2048) throw validation('URL_TOO_LONG')
  return parsed.href
}

export function createLinkService(deps: {
  repository: LinkRepository
  clock: Clock
  generateCode: CodeGenerator
  baseUrl: string
}): LinkService {
  return {
    create(body: unknown): CreatedLink {
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw validation('INVALID_REQUEST')
      }

      const value = (body as Record<string, unknown>).url
      if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
        throw validation('URL_REQUIRED')
      }
      if (typeof value !== 'string') throw validation('INVALID_URL')

      const url = normalizeUrl(value)
      const request = body as Record<string, unknown>
      const lifetimeValue = Object.prototype.hasOwnProperty.call(request, 'lifetime')
        ? request.lifetime
        : '24h'
      if (
        typeof lifetimeValue !== 'string' ||
        (lifetimeValue !== 'never' && !Object.prototype.hasOwnProperty.call(lifetimeDurations, lifetimeValue))
      ) {
        throw validation('INVALID_LIFETIME')
      }

      const lifetime = lifetimeValue as Lifetime
      const createdAt = deps.clock.now()
      const expiresAt =
        lifetime === 'never' ? null : createdAt + lifetimeDurations[lifetime as Exclude<Lifetime, 'never'>]
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = deps.generateCode()
        try {
          deps.repository.insert({ code, url, createdAt, expiresAt })
          return {
            code,
            shortUrl: `${deps.baseUrl}/${code}`,
            expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
          }
        } catch (error) {
          if (error instanceof DuplicateCodeError && attempt < 4) continue
          if (error instanceof DuplicateCodeError) throw new StorageError('Could not allocate link code')
          if (error instanceof StorageError) throw error
          throw new StorageError('Could not save link')
        }
      }
      throw new StorageError('Could not allocate link code')
    },
    resolve(code: string): string | null {
      const link = deps.repository.findByCode(code)
      if (link === undefined) return null
      if (link.expiresAt !== null && deps.clock.now() >= link.expiresAt) return null
      return link.url
    },
  }
}
