import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers.ts'

const apps: FastifyInstance[] = []
const repositories: Array<{ close(): void }> = []

function appWith(options: Parameters<typeof createTestApp>[0] = {}): ReturnType<typeof createTestApp> {
  const test = createTestApp(options)
  apps.push(test.app)
  repositories.push(test.repository)
  return test
}

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close()
  }
  for (const repository of repositories.splice(0)) {
    try {
      repository.close()
    } catch {
      // already closed by the test
    }
  }
})

const messages = {
  URL_REQUIRED: 'Enter a URL to shorten.',
  INVALID_URL: 'This is not a valid URL. Check it and try again.',
  MISSING_SCHEME: 'Add https:// to the start, for example https://example.com.',
  UNSUPPORTED_SCHEME: 'Only http:// and https:// URLs can be shortened.',
  URL_TOO_LONG: 'This URL is longer than 2,048 characters once encoded.',
  INVALID_REQUEST: 'Send a JSON object with a "url" field.',
  PAYLOAD_TOO_LARGE: 'The request is too large.',
  STORAGE_ERROR: "The link couldn't be saved. Try again.",
  INTERNAL_ERROR: 'Something went wrong. Try again.',
}

async function post(app: FastifyInstance, payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/links', payload: payload as object })
}

function expectNotFoundPage(response: { statusCode: number; headers: Record<string, unknown>; body: string }): void {
  expect(response.statusCode).toBe(404)
  expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
  expect(response.body).toContain('Link not found')
  expect(String(response.headers['cache-control'])).toContain('no-store')
}

describe('US1-1: POST /api/links creates a short link', () => {
  it('returns 201 with code, shortUrl built from the base URL, and the 8-character code', async () => {
    const { app } = appWith({ codes: ['aB3dE9xQ'] })
    const response = await post(app, { url: 'https://example.com/some/long/path?ref=mail#top' })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ code: 'aB3dE9xQ', shortUrl: 'http://short.test/aB3dE9xQ' })
  })

  it('returns a real random code that matches the contract', async () => {
    const { app } = appWith()
    const body = (await post(app, { url: 'https://example.com' })).json()
    expect(body.code).toMatch(/^[A-Za-z0-9]{8}$/)
    expect(body.shortUrl).toBe(`http://short.test/${body.code}`)
  })

  it('resolves the link right after the 201 response', async () => {
    const { app, repository } = appWith({ codes: ['AAAAAAAA'] })
    await post(app, { url: 'https://example.com/a' })
    expect(repository.findByCode('AAAAAAAA')?.url).toBe('https://example.com/a')
  })
})

describe('US1-2: GET /{code} redirects', () => {
  it('answers 302 to the normalized URL, with query string and fragment, and no-store', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    await post(app, { url: '  HTTPS://Example.COM/some/long/path?ref=mail#top  ' })
    const response = await app.inject({ method: 'GET', url: '/AAAAAAAA' })
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('https://example.com/some/long/path?ref=mail#top')
    expect(String(response.headers['cache-control'])).toContain('no-store')
  })

  it('ignores a query string on the short link', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    await post(app, { url: 'https://example.com/target' })
    const response = await app.inject({ method: 'GET', url: '/AAAAAAAA?utm_source=x&url=https://evil.test' })
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('https://example.com/target')
  })
})

describe('US1-3: the same URL twice', () => {
  it('gives two different codes and both redirect', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA', 'BBBBBBBB'] })
    const first = (await post(app, { url: 'https://example.com/same' })).json()
    const second = (await post(app, { url: 'https://example.com/same' })).json()
    expect(first.code).toBe('AAAAAAAA')
    expect(second.code).toBe('BBBBBBBB')
    for (const code of ['AAAAAAAA', 'BBBBBBBB']) {
      const response = await app.inject({ method: 'GET', url: `/${code}` })
      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('https://example.com/same')
    }
  })
})

describe('US1-4: invalid input is rejected and no link is created', () => {
  it.each([
    ['absent url', {}, 'URL_REQUIRED'],
    ['empty url', { url: '' }, 'URL_REQUIRED'],
    ['whitespace url', { url: '   ' }, 'URL_REQUIRED'],
    ['null url', { url: null }, 'INVALID_URL'],
    ['numeric url', { url: 42 }, 'INVALID_URL'],
    ['unreadable url', { url: 'not a url' }, 'INVALID_URL'],
    ['no scheme', { url: 'example.com' }, 'MISSING_SCHEME'],
    ['javascript scheme', { url: 'javascript:alert(1)' }, 'UNSUPPORTED_SCHEME'],
    ['ftp scheme', { url: 'ftp://example.com/file' }, 'UNSUPPORTED_SCHEME'],
    ['mailto scheme', { url: 'mailto:someone@example.com' }, 'UNSUPPORTED_SCHEME'],
    ['too long', { url: 'https://example.com/' + 'a'.repeat(2049) }, 'URL_TOO_LONG'],
    ['null body', null, 'INVALID_REQUEST'],
    ['array body', ['https://example.com'], 'INVALID_REQUEST'],
    ['string body', 'https://example.com', 'INVALID_REQUEST'],
  ] as Array<[string, unknown, keyof typeof messages]>)('%s gives 400', async (_name, payload, code) => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const body = typeof payload === 'string' || payload === null ? JSON.stringify(payload) : payload
    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'content-type': 'application/json' },
      payload: body as string | object,
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code, message: messages[code] } })

    const lookup = await app.inject({ method: 'GET', url: '/AAAAAAAA' })
    expect(lookup.statusCode).toBe(404)
  })
})

describe('request-level errors', () => {
  it('answers malformed JSON with 400 INVALID_REQUEST', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'content-type': 'application/json' },
      payload: '{"url": ',
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: messages.INVALID_REQUEST } })
    expect((await app.inject({ method: 'GET', url: '/AAAAAAAA' })).statusCode).toBe(404)
  })

  it('answers a text/plain body with 415 INVALID_REQUEST', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'content-type': 'text/plain' },
      payload: 'https://example.com',
    })
    expect(response.statusCode).toBe(415)
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: messages.INVALID_REQUEST } })
    expect((await app.inject({ method: 'GET', url: '/AAAAAAAA' })).statusCode).toBe(404)
  })

  it('answers no body with text/plain content type with 400 INVALID_REQUEST', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'content-type': 'text/plain' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: messages.INVALID_REQUEST } })
    expect((await app.inject({ method: 'GET', url: '/AAAAAAAA' })).statusCode).toBe(404)
  })

  it('answers a body over 16 KiB with 413 PAYLOAD_TOO_LARGE', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const payload = JSON.stringify({ url: 'https://example.com/', padding: 'x'.repeat(16_384) })
    expect(Buffer.byteLength(payload)).toBeGreaterThan(16_384)
    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'content-type': 'application/json' },
      payload,
    })
    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: messages.PAYLOAD_TOO_LARGE } })
    expect((await app.inject({ method: 'GET', url: '/AAAAAAAA' })).statusCode).toBe(404)
  })

  it('accepts a 16 KiB JSON object and ignores extra fields', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const body = { url: 'https://example.com/', extra: '' }
    const overhead = Buffer.byteLength(JSON.stringify(body))
    body.extra = 'x'.repeat(16_384 - overhead)
    const payload = JSON.stringify(body)
    expect(Buffer.byteLength(payload)).toBe(16_384)

    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'content-type': 'application/json' },
      payload,
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      code: 'AAAAAAAA',
      shortUrl: 'http://short.test/AAAAAAAA',
    })
    expect(Object.keys(response.json()).sort()).toEqual(['code', 'expiresAt', 'shortUrl'])
  })

  it('answers JSON content type with an empty body with 400 INVALID_REQUEST', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'content-type': 'application/json' },
      payload: '',
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: messages.INVALID_REQUEST } })
    expect((await app.inject({ method: 'GET', url: '/AAAAAAAA' })).statusCode).toBe(404)
  })

  it('answers a JSON body sent without a content type with 415 INVALID_REQUEST', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    // a string payload makes light-my-request send no content-type header
    const response = await app.inject({
      method: 'POST',
      url: '/api/links',
      payload: JSON.stringify({ url: 'https://example.com' }),
    })
    expect(response.statusCode).toBe(415)
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: messages.INVALID_REQUEST } })
    expect((await app.inject({ method: 'GET', url: '/AAAAAAAA' })).statusCode).toBe(404)
  })

  it('answers no body and no content type with 400 INVALID_REQUEST', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    const response = await app.inject({ method: 'POST', url: '/api/links' })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: messages.INVALID_REQUEST } })
    expect((await app.inject({ method: 'GET', url: '/AAAAAAAA' })).statusCode).toBe(404)
  })

  it('answers a storage failure with 500 STORAGE_ERROR and no shortUrl', async () => {
    const { app, repository } = appWith()
    repository.close()
    const response = await post(app, { url: 'https://example.com' })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: { code: 'STORAGE_ERROR', message: messages.STORAGE_ERROR } })
    expect(response.body).not.toContain('shortUrl')
  })

  it('answers an unexpected service failure with the generic INTERNAL_ERROR body', async () => {
    const { app, service } = appWith()
    vi.spyOn(service, 'create').mockImplementation(() => {
      throw new Error('sensitive internal detail')
    })

    const response = await post(app, { url: 'https://example.com' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: messages.INTERNAL_ERROR },
    })
    expect(response.body).not.toContain('sensitive internal detail')
  })
})

describe('US1-5 and unknown addresses: 404 page', () => {
  it.each([
    ['a code that was never issued', '/zzzzzzzz'],
    ['a path shorter than 8 characters', '/abc'],
    ['a code with a trailing slash', '/abc12345/'],
    ['GET on the API collection', '/api/links'],
  ])('%s gives the same not-found page', async (_name, url) => {
    const { app } = appWith()
    expectNotFoundPage(await app.inject({ method: 'GET', url }))
  })

  it('serves one identical 404 page for every kind of miss', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    await post(app, { url: 'https://example.com/keep' })
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/zzzzzzzz' }),
      app.inject({ method: 'GET', url: '/abc' }),
      app.inject({ method: 'GET', url: '/abc12345/' }),
      app.inject({ method: 'GET', url: '/api/links' }),
      app.inject({ method: 'PUT', url: '/AAAAAAAA', payload: { url: 'https://evil.test' } }),
      app.inject({ method: 'DELETE', url: '/api/links/AAAAAAAA' }),
    ])
    for (const response of responses) expectNotFoundPage(response)
    const [first, ...rest] = responses
    for (const response of rest) {
      expect(response.body).toBe(first!.body)
      expect(response.headers['content-type']).toBe(first!.headers['content-type'])
      expect(response.headers['cache-control']).toBe(first!.headers['cache-control'])
    }
  })

  it('does not redirect for a code that was never issued', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    await post(app, { url: 'https://example.com' })
    const response = await app.inject({ method: 'GET', url: '/AAAAAAAB' })
    expect(response.headers.location).toBeUndefined()
    expect(response.statusCode).toBe(404)
  })
})

describe('FR-015: links are read-only after creation', () => {
  it.each(['PUT', 'PATCH', 'DELETE'] as const)('%s on /api/links/{code} and /{code} answers 404 and the link still redirects', async (method) => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    await post(app, { url: 'https://example.com/keep' })

    for (const url of ['/api/links/AAAAAAAA', '/AAAAAAAA']) {
      const response = await app.inject({ method, url, payload: { url: 'https://evil.test' } })
      expect(response.statusCode).toBe(404)
    }

    const after = await app.inject({ method: 'GET', url: '/AAAAAAAA' })
    expect(after.statusCode).toBe(302)
    expect(after.headers.location).toBe('https://example.com/keep')
  })
})

describe('SC-007: redirect speed', () => {
  it('the 95th percentile of 100 redirects is under 500 ms', async () => {
    const { app } = appWith({ codes: ['AAAAAAAA'] })
    await post(app, { url: 'https://example.com/fast' })
    const timings: number[] = []
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      const response = await app.inject({ method: 'GET', url: '/AAAAAAAA' })
      timings.push(performance.now() - start)
      expect(response.statusCode).toBe(302)
    }
    timings.sort((a, b) => a - b)
    expect(timings[94]).toBeLessThan(500)
  })
})
