import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { openLinkRepository } from '../src/link-repository.ts'
import type { LinkRepository } from '../src/link-repository.ts'
import { createLinkService, ValidationError } from '../src/link-service.ts'
import type { LinkService } from '../src/link-service.ts'
import { createTestApp, fakeClock, fixedCodes } from './helpers.ts'
import type { FakeClock } from './helpers.ts'

const T0 = Date.parse('2026-01-01T00:00:00.000Z')
const T0_WITH_MS = Date.parse('2026-01-01T00:00:00.700Z')
const TARGET = 'https://example.com/some/path'
const INVALID_LIFETIME = 'Lifetime must be one of: 1h, 24h, 7d, 30d, never.'
const MISSING_SCHEME = 'Add https:// to the start, for example https://example.com.'

const HOUR = 3_600_000
const DAY = 86_400_000
const DURATIONS: ReadonlyArray<readonly [string, number]> = [
  ['1h', HOUR],
  ['24h', DAY],
  ['7d', 7 * DAY],
  ['30d', 30 * DAY],
]
const BAD_LIFETIMES: ReadonlyArray<readonly [string, unknown]> = [
  ['null', null],
  ['an empty string', ''],
  ['"2h"', '2h'],
  ['"1H"', '1H'],
  ['the number 3600', 3600],
  ['true', true],
]

const repositories: LinkRepository[] = []
const apps: FastifyInstance[] = []

afterEach(async () => {
  for (const app of apps.splice(0)) {
    try {
      await app.close()
    } catch {
      // already closed by the test
    }
  }
  for (const repository of repositories.splice(0)) {
    try {
      repository.close()
    } catch {
      // already closed by the test
    }
  }
})

function serviceAt(
  start: number,
  codes: string[],
): { service: LinkService; repository: LinkRepository; clock: FakeClock } {
  const clock = fakeClock(start)
  const repository = openLinkRepository(':memory:')
  repositories.push(repository)
  const service = createLinkService({
    repository,
    clock,
    generateCode: fixedCodes(...codes),
    baseUrl: 'http://short.test',
  })
  return { service, repository, clock }
}

function appAt(start: number, codes: string[]): { app: FastifyInstance; clock: FakeClock } {
  const clock = fakeClock(start)
  const { app, repository } = createTestApp({ clock, codes })
  apps.push(app)
  repositories.push(repository)
  return { app, clock }
}

function caught(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

function expectInvalidLifetime(run: () => unknown): void {
  const error = caught(run)
  expect(error).toBeInstanceOf(ValidationError)
  expect((error as ValidationError).code).toBe('INVALID_LIFETIME')
  expect((error as ValidationError).message).toBe(INVALID_LIFETIME)
}

function post(app: FastifyInstance, body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/links',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  })
}

function visit(app: FastifyInstance, code: string) {
  return app.inject({ method: 'GET', url: `/${code}` })
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

describe('service: expiresAt from the lifetime', () => {
  it('defaults to 24 hours when lifetime is omitted', () => {
    const { service } = serviceAt(T0, ['AAAAAAAA'])
    expect(service.create({ url: TARGET }).expiresAt).toBe(iso(T0 + DAY))
  })

  it.each(DURATIONS)('lifetime %s expires exactly its duration after creation', (lifetime, duration) => {
    const { service } = serviceAt(T0, ['AAAAAAAA'])
    expect(service.create({ url: TARGET, lifetime }).expiresAt).toBe(iso(T0 + duration))
  })

  it('uses an exact 7-day duration across a daylight-saving change', () => {
    const previousTimeZone = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      const start = Date.parse('2026-03-02T17:00:00.000Z')
      const { service } = serviceAt(start, ['AAAAAAAA'])
      expect(service.create({ url: TARGET, lifetime: '7d' }).expiresAt).toBe(iso(start + 7 * DAY))
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = previousTimeZone
    }
  })

  it('keeps milliseconds: a creation at :00.700 expires at :00.700 plus the lifetime', () => {
    const { service } = serviceAt(T0_WITH_MS, ['AAAAAAAA'])
    expect(service.create({ url: TARGET, lifetime: '1h' }).expiresAt).toBe('2026-01-01T01:00:00.700Z')
  })

  it('never gives expiresAt null', () => {
    const { service } = serviceAt(T0, ['AAAAAAAA'])
    expect(service.create({ url: TARGET, lifetime: 'never' }).expiresAt).toBeNull()
  })
})

describe('service: invalid lifetimes', () => {
  it.each(BAD_LIFETIMES)('rejects %s with INVALID_LIFETIME and stores nothing', (_name, lifetime) => {
    const { service, repository } = serviceAt(T0, ['AAAAAAAA'])
    expectInvalidLifetime(() => service.create({ url: TARGET, lifetime }))
    expect(repository.findByCode('AAAAAAAA')).toBeUndefined()
  })

  it('reports a URL problem before a lifetime problem', () => {
    const { service } = serviceAt(T0, ['AAAAAAAA'])
    const error = caught(() => service.create({ url: 'example.com', lifetime: '2h' }))
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).code).toBe('MISSING_SCHEME')
    expect((error as ValidationError).message).toBe(MISSING_SCHEME)
  })
})

describe('service: resolve around the expiry instant', () => {
  it('returns the URL one second before expiry, then null at expiry and 1 ms after', () => {
    const { service, clock } = serviceAt(T0, ['AAAAAAAA'])
    service.create({ url: TARGET, lifetime: '1h' })
    const expiry = T0 + HOUR

    clock.set(expiry - 1000)
    expect(service.resolve('AAAAAAAA')).toBe(TARGET)
    clock.set(expiry)
    expect(service.resolve('AAAAAAAA')).toBeNull()
    clock.set(expiry + 1)
    expect(service.resolve('AAAAAAAA')).toBeNull()
  })

  it.each(DURATIONS)('lifetime %s: URL before its duration elapses, null at it', (lifetime, duration) => {
    const { service, clock } = serviceAt(T0, ['AAAAAAAA'])
    service.create({ url: TARGET, lifetime })
    clock.set(T0 + duration - 1)
    expect(service.resolve('AAAAAAAA')).toBe(TARGET)
    clock.set(T0 + duration)
    expect(service.resolve('AAAAAAAA')).toBeNull()
  })

  it('lands on the exact millisecond when creation time has milliseconds', () => {
    const { service, clock } = serviceAt(T0_WITH_MS, ['AAAAAAAA'])
    service.create({ url: TARGET, lifetime: '1h' })
    const expiry = T0_WITH_MS + HOUR

    clock.set(expiry - 1)
    expect(service.resolve('AAAAAAAA')).toBe(TARGET)
    clock.set(expiry)
    expect(service.resolve('AAAAAAAA')).toBeNull()
  })

  it('a never link still resolves 100 years later', () => {
    const { service, clock } = serviceAt(T0, ['AAAAAAAA'])
    service.create({ url: TARGET, lifetime: 'never' })
    clock.advance(100 * 365 * DAY)
    expect(service.resolve('AAAAAAAA')).toBe(TARGET)
  })
})

describe('HTTP: expiresAt from the lifetime', () => {
  it('defaults to 24 hours when lifetime is omitted', async () => {
    const { app } = appAt(T0, ['AAAAAAAA'])
    const response = await post(app, { url: TARGET })
    expect(response.statusCode).toBe(201)
    expect(response.json().expiresAt).toBe(iso(T0 + DAY))
  })

  it.each(DURATIONS)('lifetime %s expires exactly its duration after creation', async (lifetime, duration) => {
    const { app } = appAt(T0, ['AAAAAAAA'])
    const response = await post(app, { url: TARGET, lifetime })
    expect(response.statusCode).toBe(201)
    expect(response.json().expiresAt).toBe(iso(T0 + duration))
  })

  it('keeps milliseconds: a creation at :00.700 expires at :00.700 plus the lifetime', async () => {
    const { app } = appAt(T0_WITH_MS, ['AAAAAAAA'])
    const response = await post(app, { url: TARGET, lifetime: '1h' })
    expect(response.json().expiresAt).toBe('2026-01-01T01:00:00.700Z')
  })

  it('never gives expiresAt null', async () => {
    const { app } = appAt(T0, ['AAAAAAAA'])
    const response = await post(app, { url: TARGET, lifetime: 'never' })
    expect(response.statusCode).toBe(201)
    expect(response.json().expiresAt).toBeNull()
  })
})

describe('HTTP: invalid lifetimes', () => {
  it.each(BAD_LIFETIMES)('answers %s with 400 INVALID_LIFETIME and stores nothing', async (_name, lifetime) => {
    const { app } = appAt(T0, ['AAAAAAAA'])
    const response = await post(app, { url: TARGET, lifetime })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code: 'INVALID_LIFETIME', message: INVALID_LIFETIME } })
    expect((await visit(app, 'AAAAAAAA')).statusCode).toBe(404)
  })
})

describe('HTTP: redirect around the expiry instant', () => {
  it('redirects one second before expiry, then 404 at expiry and 1 ms after', async () => {
    const { app, clock } = appAt(T0, ['AAAAAAAA'])
    await post(app, { url: TARGET, lifetime: '1h' })
    const expiry = T0 + HOUR

    clock.set(expiry - 1000)
    const before = await visit(app, 'AAAAAAAA')
    expect(before.statusCode).toBe(302)
    expect(before.headers.location).toBe(TARGET)
    clock.set(expiry)
    expect((await visit(app, 'AAAAAAAA')).statusCode).toBe(404)
    clock.set(expiry + 1)
    expect((await visit(app, 'AAAAAAAA')).statusCode).toBe(404)
  })

  it('lands on the exact millisecond when creation time has milliseconds', async () => {
    const { app, clock } = appAt(T0_WITH_MS, ['AAAAAAAA'])
    await post(app, { url: TARGET, lifetime: '1h' })
    const expiry = T0_WITH_MS + HOUR

    clock.set(expiry - 1)
    expect((await visit(app, 'AAAAAAAA')).statusCode).toBe(302)
    clock.set(expiry)
    expect((await visit(app, 'AAAAAAAA')).statusCode).toBe(404)
  })

  it('a never link still redirects 100 years later', async () => {
    const { app, clock } = appAt(T0, ['AAAAAAAA'])
    await post(app, { url: TARGET, lifetime: 'never' })
    clock.advance(100 * 365 * DAY)
    const response = await visit(app, 'AAAAAAAA')
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe(TARGET)
  })

  it('US2-4: a visit before expiry gets 302 with no-store, a visit after expiry gets 404', async () => {
    const { app, clock } = appAt(T0, ['AAAAAAAA'])
    await post(app, { url: TARGET, lifetime: '1h' })

    clock.advance(HOUR - 1000)
    const before = await visit(app, 'AAAAAAAA')
    expect(before.statusCode).toBe(302)
    expect(String(before.headers['cache-control'])).toContain('no-store')

    clock.advance(2000)
    expect((await visit(app, 'AAAAAAAA')).statusCode).toBe(404)
  })

  it('an expired link answers exactly like an unknown code', async () => {
    const { app, clock } = appAt(T0, ['AAAAAAAA'])
    await post(app, { url: TARGET, lifetime: '1h' })
    clock.set(T0 + HOUR)

    const expired = await visit(app, 'AAAAAAAA')
    const unknown = await visit(app, 'zzzzzzzz')
    expect(expired.statusCode).toBe(404)
    expect(expired.statusCode).toBe(unknown.statusCode)
    expect(expired.headers['content-type']).toBe(unknown.headers['content-type'])
    expect(expired.headers['cache-control']).toBe(unknown.headers['cache-control'])
    expect(expired.body).toBe(unknown.body)
  })
})
