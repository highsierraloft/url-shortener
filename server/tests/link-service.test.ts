import { afterEach, describe, expect, it } from 'vitest'
import { openLinkRepository, StorageError } from '../src/link-repository.ts'
import type { LinkRepository } from '../src/link-repository.ts'
import { createLinkService, generateCode, ValidationError } from '../src/link-service.ts'
import type { CodeGenerator, LinkService } from '../src/link-service.ts'
import { fakeClock, fixedCodes } from './helpers.ts'

const open: LinkRepository[] = []

afterEach(() => {
  for (const repository of open.splice(0)) {
    try {
      repository.close()
    } catch {
      // already closed by the test
    }
  }
})

function setup(codes?: CodeGenerator): { service: LinkService; repository: LinkRepository } {
  const repository = openLinkRepository(':memory:')
  open.push(repository)
  const service = createLinkService({
    repository,
    clock: fakeClock(),
    generateCode: codes ?? generateCode,
    baseUrl: 'http://short.test',
  })
  return { service, repository }
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

const URL_REQUIRED = 'Enter a URL to shorten.'
const INVALID_URL = 'This is not a valid URL. Check it and try again.'
const MISSING_SCHEME = 'Add https:// to the start, for example https://example.com.'
const UNSUPPORTED_SCHEME = 'Only http:// and https:// URLs can be shortened.'
const URL_TOO_LONG = 'This URL is longer than 2,048 characters once encoded.'
const INVALID_REQUEST = 'Send a JSON object with a "url" field.'

describe('create: validation, in data-model order', () => {
  it.each([
    ['absent', {}],
    ['empty', { url: '' }],
    ['only whitespace', { url: '   \t ' }],
  ])('rejects a url that is %s with URL_REQUIRED', (_name, body) => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    expectValidation(() => service.create(body), 'URL_REQUIRED', URL_REQUIRED)
  })

  it.each([
    ['a number', { url: 42 }],
    ['null', { url: null }],
    ['an object', { url: {} }],
    ['an array', { url: ['https://example.com'] }],
  ])('rejects a url that is %s with INVALID_URL', (_name, body) => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    expectValidation(() => service.create(body), 'INVALID_URL', INVALID_URL)
  })

  it('rejects text that cannot be read as a URL with INVALID_URL', () => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    expectValidation(() => service.create({ url: 'not a url' }), 'INVALID_URL', INVALID_URL)
  })

  it.each(['example.com', 'example.com/some/path?q=1', ' example.com '])(
    'rejects %j with MISSING_SCHEME',
    (url) => {
      const { service } = setup(fixedCodes('AAAAAAAA'))
      expectValidation(() => service.create({ url }), 'MISSING_SCHEME', MISSING_SCHEME)
    },
  )

  it.each(['javascript:alert(1)', 'ftp://example.com/file', 'mailto:someone@example.com'])(
    'rejects %j with UNSUPPORTED_SCHEME',
    (url) => {
      const { service } = setup(fixedCodes('AAAAAAAA'))
      expectValidation(() => service.create({ url }), 'UNSUPPORTED_SCHEME', UNSUPPORTED_SCHEME)
    },
  )

  it('accepts a normalized URL of exactly 2,048 characters', () => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    const url = 'https://example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length)
    expect(url.length).toBe(2048)
    const created = service.create({ url })
    expect(service.resolve(created.code)).toBe(url)
  })

  it('rejects a normalized URL of 2,049 characters with URL_TOO_LONG', () => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    const url = 'https://example.com/' + 'a'.repeat(2049 - 'https://example.com/'.length)
    expect(url.length).toBe(2049)
    expectValidation(() => service.create({ url }), 'URL_TOO_LONG', URL_TOO_LONG)
  })

  it('measures length after normalization, so encoding can push a short input over the limit', () => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    const url = 'https://example.com/' + 'é'.repeat(700)
    expect(url.length).toBeLessThan(2048)
    expectValidation(() => service.create({ url }), 'URL_TOO_LONG', URL_TOO_LONG)
  })

  it.each([
    ['null', null],
    ['an array', ['https://example.com']],
    ['a string', 'https://example.com'],
    ['a number', 42],
  ])('rejects a body that is %s with INVALID_REQUEST', (_name, body) => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    expectValidation(() => service.create(body), 'INVALID_REQUEST', INVALID_REQUEST)
  })

  it('stores nothing when validation fails', () => {
    const { service, repository } = setup(fixedCodes('AAAAAAAA'))
    expect(caught(() => service.create({ url: 'example.com' }))).toBeInstanceOf(ValidationError)
    expect(repository.findByCode('AAAAAAAA')).toBeUndefined()
  })
})

describe('create: normalization', () => {
  it.each([
    ['trims, lowercases scheme and host', '  HTTPS://Example.COM  ', 'https://example.com/'],
    ['reads backslashes as slashes', 'https:\\\\example.com', 'https://example.com/'],
    ['drops newlines inside the URL', 'https://exa\nmple.com', 'https://example.com/'],
    ['drops tabs inside the URL', 'https://exa\tmple.com/a\tb', 'https://example.com/ab'],
    ['preserves percent-encoded reserved characters', 'https://example.com/a%2Fb?x=a%26b', 'https://example.com/a%2Fb?x=a%26b'],
    ['percent-encodes non-ASCII text in the path', 'https://example.com/café', 'https://example.com/caf%C3%A9'],
    [
      'keeps query string and fragment',
      'https://example.com/some/long/path?ref=mail#top',
      'https://example.com/some/long/path?ref=mail#top',
    ],
    ['accepts http', 'http://example.com/a', 'http://example.com/a'],
  ])('%s', (_name, input, stored) => {
    const { service, repository } = setup(fixedCodes('AAAAAAAA'))
    service.create({ url: input })
    expect(repository.findByCode('AAAAAAAA')?.url).toBe(stored)
  })
})

describe('create: codes and short URLs', () => {
  it('builds shortUrl as baseUrl + "/" + code', () => {
    const { service } = setup(fixedCodes('aB3dE9xQ'))
    const created = service.create({ url: 'https://example.com' })
    expect(created.code).toBe('aB3dE9xQ')
    expect(created.shortUrl).toBe('http://short.test/aB3dE9xQ')
  })

  it('persists the link so it resolves to the normalized URL', () => {
    const { service, repository } = setup(fixedCodes('AAAAAAAA'))
    service.create({ url: ' HTTPS://Example.COM/x?y=1#z ' })
    expect(repository.findByCode('AAAAAAAA')).toMatchObject({ code: 'AAAAAAAA', url: 'https://example.com/x?y=1#z' })
    expect(service.resolve('AAAAAAAA')).toBe('https://example.com/x?y=1#z')
  })

  it('generateCode returns 8 letters and digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^[A-Za-z0-9]{8}$/)
    }
  })

  it('gives the same URL submitted twice two different codes, and both resolve', () => {
    const { service } = setup()
    const first = service.create({ url: 'https://example.com/same' })
    const second = service.create({ url: 'https://example.com/same' })
    expect(second.code).not.toBe(first.code)
    expect(service.resolve(first.code)).toBe('https://example.com/same')
    expect(service.resolve(second.code)).toBe('https://example.com/same')
  })

  it('SC-005: 10,000 links created with the real generator all get different codes', () => {
    const { service } = setup()
    const codes = new Set<string>()
    for (let i = 0; i < 10_000; i++) {
      const { code } = service.create({ url: `https://example.com/${i}` })
      expect(code).toMatch(/^[A-Za-z0-9]{8}$/)
      codes.add(code)
    }
    expect(codes.size).toBe(10_000)
  }, 30_000)

  it('retries with the next code when the first one is taken', () => {
    const { service, repository } = setup(fixedCodes('AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB'))
    const first = service.create({ url: 'https://example.com/one' })
    const second = service.create({ url: 'https://example.com/two' })
    expect(first.code).toBe('AAAAAAAA')
    expect(second.code).toBe('BBBBBBBB')
    expect(repository.findByCode('AAAAAAAA')?.url).toBe('https://example.com/one')
    expect(repository.findByCode('BBBBBBBB')?.url).toBe('https://example.com/two')
  })

  it('never reuses a code after its link expires', () => {
    const clock = fakeClock()
    const repository = openLinkRepository(':memory:')
    open.push(repository)
    const service = createLinkService({
      repository,
      clock,
      generateCode: fixedCodes('AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB'),
      baseUrl: 'http://short.test',
    })

    const expired = service.create({ url: 'https://example.com/old', lifetime: '1h' })
    clock.advance(3_600_001)
    const active = service.create({ url: 'https://example.com/new' })

    expect(active.code).toBe('BBBBBBBB')
    expect(repository.findByCode('AAAAAAAA')).toMatchObject({
      code: 'AAAAAAAA',
      url: 'https://example.com/old',
    })
    expect(service.resolve(expired.code)).toBeNull()
    expect(service.resolve(active.code)).toBe('https://example.com/new')
  })

  it('succeeds on the 5th attempt after 4 collisions in a row', () => {
    const codes = fixedCodes('AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'CCCCCCCC')
    const { service, repository } = setup(codes)
    service.create({ url: 'https://example.com/original' })

    const created = service.create({ url: 'https://example.com/new' })

    expect(created.code).toBe('CCCCCCCC')
    expect(repository.findByCode('CCCCCCCC')?.url).toBe('https://example.com/new')
    expect(repository.findByCode('AAAAAAAA')?.url).toBe('https://example.com/original')
  })

  it('throws StorageError after 5 collisions in a row, makes no 6th attempt and stores nothing', () => {
    const codes = fixedCodes('AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB')
    const { service, repository } = setup(codes)
    service.create({ url: 'https://example.com/original' })

    expect(() => service.create({ url: 'https://example.com/other' })).toThrow(StorageError)

    expect(repository.findByCode('AAAAAAAA')?.url).toBe('https://example.com/original')
    expect(repository.findByCode('BBBBBBBB')).toBeUndefined()
  })

  it('throws StorageError when the insert fails because the repository is closed', () => {
    const { service, repository } = setup(fixedCodes('AAAAAAAA'))
    repository.close()
    expect(() => service.create({ url: 'https://example.com' })).toThrow(StorageError)
  })
})

describe('resolve', () => {
  it('returns null for a code that was never issued', () => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    expect(service.resolve('zzzzzzzz')).toBeNull()
  })

  it('treats codes as case-sensitive', () => {
    const { service } = setup(fixedCodes('AAAAAAAA'))
    service.create({ url: 'https://example.com' })
    expect(service.resolve('aaaaaaaa')).toBeNull()
    expect(service.resolve('AAAAAAAA')).toBe('https://example.com/')
  })
})
