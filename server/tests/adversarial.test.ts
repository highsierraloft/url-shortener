import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, expect, it } from 'vitest'
import { buildApp } from '../src/app.ts'
import { openLinkRepository, StorageError } from '../src/link-repository.ts'
import type { LinkRepository } from '../src/link-repository.ts'
import { createLinkService, generateCode, ValidationError } from '../src/link-service.ts'
import type { LinkService } from '../src/link-service.ts'
import { createTestApp, fakeClock, fixedCodes, itUnlessRoot } from './helpers.ts'

const serverDir = fileURLToPath(new URL('..', import.meta.url))
const T0 = Date.parse('2026-01-01T00:00:00.000Z')
const HOUR = 3_600_000
const DAY = 86_400_000
const TARGET = 'https://example.com/some/path'

const INVALID_URL = 'This is not a valid URL. Check it and try again.'
const UNSUPPORTED_SCHEME = 'Only http:// and https:// URLs can be shortened.'
const INVALID_LIFETIME = 'Lifetime must be one of: 1h, 24h, 7d, 30d, never.'

const apps: FastifyInstance[] = []
const repositories: LinkRepository[] = []
const children: ChildProcess[] = []
const restores: Array<() => void> = []
const roots: string[] = []

afterEach(async () => {
  for (const child of children.splice(0)) await stop(child)
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
  for (const undo of restores.splice(0)) undo()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'links-adversarial-'))
  roots.push(root)
  return root
}

function appWith(options: Parameters<typeof createTestApp>[0] = {}): ReturnType<typeof createTestApp> {
  const test = createTestApp(options)
  apps.push(test.app)
  repositories.push(test.repository)
  return test
}

function serviceWith(codes: string[]): { service: LinkService; repository: LinkRepository } {
  const repository = openLinkRepository(':memory:')
  repositories.push(repository)
  const service = createLinkService({
    repository,
    clock: fakeClock(T0),
    generateCode: fixedCodes(...codes),
    baseUrl: 'http://short.test',
  })
  return { service, repository }
}

function post(app: FastifyInstance, body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/links',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  })
}

function caught(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

function expectValidation(run: () => unknown, code: string, message: string): void {
  const error = caught(run)
  expect(error).toBeInstanceOf(ValidationError)
  expect((error as ValidationError).code).toBe(code)
  expect((error as ValidationError).message).toBe(message)
}

function expectNotFoundPage(response: { statusCode: number; headers: Record<string, unknown>; body: string }): void {
  expect(response.statusCode).toBe(404)
  expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
  expect(response.body).toContain('Link not found')
  expect(String(response.headers['cache-control'])).toContain('no-store')
}

function startEnv(overrides: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.BASE_URL
  delete env.DB_PATH
  delete env.PORT
  return { ...env, ...overrides }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function canConnect(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const done = (connected: boolean) => {
      socket.destroy()
      resolve(connected)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  const force = setTimeout(() => child.kill('SIGKILL'), 3000)
  await exited
  clearTimeout(force)
}

// B4: a plain-object lookup (`lifetime in DURATIONS`, `DURATIONS[lifetime]`), Fastify's default
// schema coercion, or a trim would accept these. None is in the suite's BAD_LIFETIMES list.
const LENIENT_LIFETIMES: Array<[string, unknown]> = [
  ['"constructor"', 'constructor'],
  ['"toString"', 'toString'],
  ['"__proto__"', '__proto__'],
  ['"hasOwnProperty"', 'hasOwnProperty'],
  ['["7d"]', ['7d']],
  ['["never"]', ['never']],
  ['" 7d"', ' 7d'],
  ['"7d\\n"', '7d\n'],
]

it.each(LENIENT_LIFETIMES)('Bug B4: the service rejects lifetime %s with INVALID_LIFETIME and stores nothing', (_name, lifetime) => {
  const { service, repository } = serviceWith(['AAAAAAAA'])
  expectValidation(() => service.create({ url: TARGET, lifetime }), 'INVALID_LIFETIME', INVALID_LIFETIME)
  expect(repository.findByCode('AAAAAAAA')).toBeUndefined()
})

it.each(LENIENT_LIFETIMES)('Bug B4: POST /api/links answers lifetime %s with 400 INVALID_LIFETIME and creates no link', async (_name, lifetime) => {
  const { app } = appWith({ codes: ['AAAAAAAA'] })
  const response = await post(app, { url: TARGET, lifetime })
  expect(response.statusCode).toBe(400)
  expect(response.json()).toEqual({ error: { code: 'INVALID_LIFETIME', message: INVALID_LIFETIME } })
  expect((await app.inject({ method: 'GET', url: '/AAAAAAAA' })).statusCode).toBe(404)
})

it('Bug B5: accepts input whose normalized form is exactly 2,048 characters although the raw text is longer', () => {
  const tail = 'a'.repeat(2048 - 'https://example.com/'.length)
  const normalized = 'https://example.com/' + tail
  const raw = '  HTTPS://EXAMPLE.COM:443/./' + tail + '\t\n '
  expect(normalized.length).toBe(2048)
  expect(raw.trim().length).toBeGreaterThan(2048)

  const { service, repository } = serviceWith(['AAAAAAAA'])
  expect(service.create({ url: raw }).code).toBe('AAAAAAAA')
  expect(repository.findByCode('AAAAAAAA')?.url).toBe(normalized)
})

it.each([
  ['"https://" with nothing after it', 'https://'],
  ['"http://" with nothing after it', 'http://'],
  ['a space inside the host', 'https://exa mple.com'],
  ['a leading non-breaking space', ' https://example.com'],
])('Bug B6: rejects %s with INVALID_URL, not with the "Add https://" hint', (_name, url) => {
  const { service } = serviceWith(['AAAAAAAA'])
  expectValidation(() => service.create({ url }), 'INVALID_URL', INVALID_URL)
})

it('Bug B6: POST /api/links answers "https://" with 400 INVALID_URL', async () => {
  const { app } = appWith({ codes: ['AAAAAAAA'] })
  const response = await post(app, { url: 'https://' })
  expect(response.statusCode).toBe(400)
  expect(response.json()).toEqual({ error: { code: 'INVALID_URL', message: INVALID_URL } })
})

it.each(['httpx://example.com', 'http+unix://example.com', 'https-proxy://example.com'])(
  'Bug B7: rejects the look-alike scheme in %j with UNSUPPORTED_SCHEME',
  (url) => {
    const { service, repository } = serviceWith(['AAAAAAAA'])
    expectValidation(() => service.create({ url }), 'UNSUPPORTED_SCHEME', UNSUPPORTED_SCHEME)
    expect(repository.findByCode('AAAAAAAA')).toBeUndefined()
  },
)

it.each([
  ['http://localhost', 'http://localhost/'],
  ['http://192.168.1.1/admin', 'http://192.168.1.1/admin'],
  ['http://127.0.0.1:3000/x', 'http://127.0.0.1:3000/x'],
  ['http://[::1]:8080/', 'http://[::1]:8080/'],
])('Bug B8: accepts %j and redirects to %j, like any http URL with a host', async (input, location) => {
  const { app } = appWith({ codes: ['AAAAAAAA'] })
  const created = await post(app, { url: input })
  expect(created.statusCode).toBe(201)
  const response = await app.inject({ method: 'GET', url: '/AAAAAAAA' })
  expect(response.statusCode).toBe(302)
  expect(response.headers.location).toBe(location)
})

it.each(['/AAAAAAAA/', '/AAAAAAAA.', '/AAAAAAAAB'])(
  'Bug B9: %s, built on the issued code AAAAAAAA, gives the not-found page and no redirect',
  async (path) => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    await post(app, { url: TARGET })
    const response = await app.inject({ method: 'GET', url: path })
    expect(response.headers.location).toBeUndefined()
    expectNotFoundPage(response)
  },
)

it('Bug B10: HEAD on an active link answers like GET (302, Location, no-store) with no body', async () => {
  const { app } = appWith({ codes: ['AAAAAAAA'] })
  await post(app, { url: TARGET })
  const get = await app.inject({ method: 'GET', url: '/AAAAAAAA' })
  const head = await app.inject({ method: 'HEAD', url: '/AAAAAAAA' })
  expect(head.statusCode).toBe(302)
  expect(head.statusCode).toBe(get.statusCode)
  expect(head.headers.location).toBe(TARGET)
  expect(head.headers['cache-control']).toBe(get.headers['cache-control'])
  expect(head.body).toBe('')
})

it('Bug B10: HEAD on an expired link and on an unknown code answers like GET (404 page headers) with no body', async () => {
  const { app, clock } = appWith({ codes: ['AAAAAAAA'] })
  await post(app, { url: TARGET, lifetime: '1h' })
  clock.advance(HOUR)
  for (const url of ['/AAAAAAAA', '/zzzzzzzz']) {
    const get = await app.inject({ method: 'GET', url })
    const head = await app.inject({ method: 'HEAD', url })
    expect(head.statusCode).toBe(404)
    expect(head.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(head.headers['content-type']).toBe(get.headers['content-type'])
    expect(head.headers['cache-control']).toBe(get.headers['cache-control'])
    expect(head.headers.location).toBeUndefined()
    expect(head.body).toBe('')
  }
})

it.each(['application/json; charset=utf-8', 'Application/JSON'])(
  'Bug B11: accepts a JSON body sent with content type %j',
  async (contentType) => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'content-type': contentType },
      payload: JSON.stringify({ url: TARGET }),
    })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ code: 'AAAAAAAA', shortUrl: 'http://short.test/AAAAAAAA' })
  },
)

it('Bug B12: an unexpected failure answers 500 with a contract error body and no internal details', async () => {
  // fixedCodes() with no codes throws 'fixedCodes: out of codes' on its first call
  const { app } = appWith({ codes: [] })
  const response = await post(app, { url: TARGET })
  expect(response.statusCode).toBe(500)
  expect([
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' } },
    { error: { code: 'STORAGE_ERROR', message: "The link couldn't be saved. Try again." } },
  ]).toContainEqual(response.json())
  expect(response.body).not.toContain('fixedCodes')
})

it('Bug B13: after a restart on the same database file, expired links stay 404 and active ones still redirect (SC-006)', async () => {
  const dbPath = join(tempRoot(), 'links.db')
  const before = openLinkRepository(dbPath)
  repositories.push(before)
  const first = createLinkService({
    repository: before,
    clock: fakeClock(T0),
    generateCode: fixedCodes('EXPIRES1', 'FOREVER1', 'MONTHLY1'),
    baseUrl: 'http://short.test',
  })
  first.create({ url: 'https://example.com/hour', lifetime: '1h' })
  first.create({ url: 'https://example.com/forever', lifetime: 'never' })
  first.create({ url: 'https://example.com/month', lifetime: '30d' })
  before.close()

  const clock = fakeClock(T0 + 2 * HOUR)
  const after = openLinkRepository(dbPath)
  repositories.push(after)
  const app = buildApp({
    service: createLinkService({ repository: after, clock, generateCode: fixedCodes(), baseUrl: 'http://short.test' }),
  })
  apps.push(app)

  expectNotFoundPage(await app.inject({ method: 'GET', url: '/EXPIRES1' }))
  const forever = await app.inject({ method: 'GET', url: '/FOREVER1' })
  expect(forever.statusCode).toBe(302)
  expect(forever.headers.location).toBe('https://example.com/forever')
  const month = await app.inject({ method: 'GET', url: '/MONTHLY1' })
  expect(month.statusCode).toBe(302)
  expect(month.headers.location).toBe('https://example.com/month')

  clock.advance(100 * 365 * DAY)
  expect((await app.inject({ method: 'GET', url: '/FOREVER1' })).statusCode).toBe(302)
  expectNotFoundPage(await app.inject({ method: 'GET', url: '/MONTHLY1' }))
})

it('Bug B14: opening a file that is not a SQLite database throws StorageError', () => {
  const path = join(tempRoot(), 'links.db')
  writeFileSync(path, 'this is not a SQLite database\n'.repeat(100))
  expect(() => openLinkRepository(path)).toThrow(StorageError)
})

itUnlessRoot('Bug B14: a read-only parent folder throws StorageError', () => {
  const root = tempRoot()
  const readOnly = join(root, 'readonly')
  mkdirSync(readOnly)
  chmodSync(readOnly, 0o555)
  restores.push(() => chmodSync(readOnly, 0o755))
  expect(() => openLinkRepository(join(readOnly, 'nested', 'links.db'))).toThrow(StorageError)
})

it('Bug B14: a parent path that is a file throws StorageError', () => {
  const root = tempRoot()
  const plainFile = join(root, 'plain-file')
  writeFileSync(plainFile, 'x')
  expect(() => openLinkRepository(join(plainFile, 'links.db'))).toThrow(StorageError)
})

it.each(['corrupt', 'uncreatable'] as const)(
  'Bug B14: startup exits with code 1 and mentions storage when the database file is %s',
  (kind) => {
    const root = tempRoot()
    let dbPath: string
    if (kind === 'corrupt') {
      dbPath = join(root, 'links.db')
      writeFileSync(dbPath, 'this is not a SQLite database\n'.repeat(100))
    } else {
      const parentFile = join(root, 'not-a-folder')
      writeFileSync(parentFile, 'x')
      dbPath = join(parentFile, 'nested', 'links.db')
    }

    const result = spawnSync(process.execPath, ['src/main.ts'], {
      cwd: serverDir,
      env: startEnv({ PORT: '39124', DB_PATH: dbPath }),
      encoding: 'utf8',
      timeout: 10_000,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/storage/i)
  },
)

it('Bug B15: generated codes use all 62 letters and digits in every position (FR-006, about 2×10^14 codes)', () => {
  const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].sort().join('')
  const seen = Array.from({ length: 8 }, () => new Set<string>())
  for (let i = 0; i < 2000; i++) {
    const code = generateCode()
    expect(code).toMatch(/^[A-Za-z0-9]{8}$/)
    for (let position = 0; position < 8; position++) seen[position]!.add(code[position]!)
  }
  for (const symbols of seen) expect([...symbols].sort().join('')).toBe(alphabet)
})

it('Bug B16: the started service listens on both loopback addresses and on no other interface', async () => {
  const port = await freePort()
  const child = spawn(process.execPath, ['src/main.ts'], {
    cwd: serverDir,
    env: startEnv({ PORT: String(port), DB_PATH: join(tempRoot(), 'links.db') }),
    stdio: 'ignore',
  })
  children.push(child)
  let exited = false
  child.once('exit', () => {
    exited = true
  })

  let ready = false
  for (let attempt = 0; attempt < 80 && !exited && !ready; attempt++) {
    ready = await canConnect('127.0.0.1', port, 500)
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 100))
  }

  expect(ready).toBe(true)
  expect(await canConnect('::1', port)).toBe(true)
  const external = Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => !address.internal && address.family === 'IPv4')
    .map((address) => address.address)
  for (const address of external) {
    expect(await canConnect(address, port)).toBe(false)
  }
}, 20_000)
