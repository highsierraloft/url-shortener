import { chmodSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DuplicateCodeError, openLinkRepository, StorageError } from '../src/link-repository.ts'
import type { LinkRecord } from '../src/link-repository.ts'
import { itUnlessRoot } from './helpers.ts'

const link: LinkRecord = {
  code: 'aB3dE5gH',
  url: 'https://example.com/path?q=1',
  createdAt: 1767225600000,
  expiresAt: 1767229200000,
}

let root: string
let restore: Array<() => void>

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'links-repo-'))
  restore = []
})

afterEach(() => {
  for (const undo of restore) undo()
  rmSync(root, { recursive: true, force: true })
})

describe('in-memory repository', () => {
  it('returns all four fields unchanged after insert and findByCode', () => {
    const repository = openLinkRepository(':memory:')
    repository.insert(link)
    expect(repository.findByCode(link.code)).toEqual(link)
    repository.close()
  })

  it('keeps expiresAt null for a link that never expires', () => {
    const repository = openLinkRepository(':memory:')
    const forever = { ...link, expiresAt: null }
    repository.insert(forever)
    expect(repository.findByCode(forever.code)).toEqual(forever)
    repository.close()
  })

  it('returns undefined for an unknown code', () => {
    const repository = openLinkRepository(':memory:')
    expect(repository.findByCode('missing1')).toBeUndefined()
    repository.close()
  })

  it('treats codes as case-sensitive', () => {
    const repository = openLinkRepository(':memory:')
    repository.insert(link)
    expect(repository.findByCode(link.code.toUpperCase())).toBeUndefined()
    expect(repository.findByCode(link.code.toLowerCase())).toBeUndefined()
    repository.close()
  })

  it('throws DuplicateCodeError when a code is inserted twice', () => {
    const repository = openLinkRepository(':memory:')
    repository.insert(link)
    expect(() => repository.insert({ ...link, url: 'https://other.example' })).toThrow(DuplicateCodeError)
    expect(repository.findByCode(link.code)?.url).toBe(link.url)
    repository.close()
  })
})

describe('file repository', () => {
  it('keeps links after close and reopen (FR-017)', () => {
    const path = join(root, 'links.db')
    const first = openLinkRepository(path)
    first.insert(link)
    first.insert({ ...link, code: 'neverEnd', expiresAt: null })
    first.close()

    const second = openLinkRepository(path)
    expect(second.findByCode(link.code)).toEqual(link)
    expect(second.findByCode('neverEnd')).toEqual({ ...link, code: 'neverEnd', expiresAt: null })
    second.close()
  })

  it('creates a missing parent folder', () => {
    const path = join(root, 'nested', 'deeper', 'links.db')
    const repository = openLinkRepository(path)
    repository.close()
    expect(existsSync(path)).toBe(true)
  })

  itUnlessRoot('throws StorageError for an existing write-protected database that already has the table (FR-022, R12)', () => {
    const path = join(root, 'links.db')
    openLinkRepository(path).close()
    chmodSync(path, 0o444)
    restore.push(() => chmodSync(path, 0o644))

    expect(() => openLinkRepository(path)).toThrow(StorageError)
  })

  itUnlessRoot('throws StorageError when the folder is not writable (FR-022)', () => {
    const folder = join(root, 'readonly')
    openLinkRepository(join(folder, 'seed.db')).close()
    chmodSync(folder, 0o555)
    restore.push(() => chmodSync(folder, 0o755))

    expect(() => openLinkRepository(join(folder, 'links.db'))).toThrow(StorageError)
  })
})
