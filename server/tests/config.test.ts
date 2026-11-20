import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/config.ts'

describe('loadConfig defaults', () => {
  it('uses port 3000, http://localhost:3000 and data/links.db when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      baseUrl: 'http://localhost:3000',
      dbPath: 'data/links.db',
    })
  })

  it('builds the default BASE_URL from PORT', () => {
    expect(loadConfig({ PORT: '4000' }).baseUrl).toBe('http://localhost:4000')
  })

  it('reads PORT as a number and DB_PATH as given', () => {
    const config = loadConfig({ PORT: '8080', DB_PATH: '/var/tmp/x.db' })
    expect(config.port).toBe(8080)
    expect(config.dbPath).toBe('/var/tmp/x.db')
  })
})

describe('loadConfig BASE_URL', () => {
  it('removes a trailing slash', () => {
    expect(loadConfig({ BASE_URL: 'https://sho.rt/' }).baseUrl).toBe('https://sho.rt')
  })

  it('keeps an explicit BASE_URL with a port', () => {
    expect(loadConfig({ BASE_URL: 'http://short.test:8080' }).baseUrl).toBe('http://short.test:8080')
  })

  it.each([
    ['a non-http(s) scheme', 'ftp://sho.rt'],
    ['a path', 'http://sho.rt/app'],
    ['a query', 'http://sho.rt?x=1'],
    ['a fragment', 'http://sho.rt#top'],
    ['something that is not a URL', 'not a url'],
  ])('rejects a BASE_URL with %s', (_label, value) => {
    expect(() => loadConfig({ BASE_URL: value })).toThrow(ConfigError)
    expect(() => loadConfig({ BASE_URL: value })).toThrow(/BASE_URL/)
  })
})

describe('loadConfig PORT', () => {
  it.each([1, 65535])('accepts the boundary PORT=%i and builds the default BASE_URL from it', (port) => {
    const config = loadConfig({ PORT: String(port) })
    expect(config.port).toBe(port)
    expect(config.baseUrl).toBe(`http://localhost:${port}`)
  })

  it.each(['0', '70000', 'abc', '3000.5'])('rejects PORT=%s', (value) => {
    expect(() => loadConfig({ PORT: value })).toThrow(ConfigError)
    expect(() => loadConfig({ PORT: value })).toThrow(/PORT/)
  })
})
