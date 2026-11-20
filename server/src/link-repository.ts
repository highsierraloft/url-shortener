import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export interface LinkRecord {
  code: string
  url: string
  createdAt: number
  expiresAt: number | null
}

export interface LinkRepository {
  insert(link: LinkRecord): void
  findByCode(code: string): LinkRecord | undefined
  close(): void
}

export class DuplicateCodeError extends Error {}
export class StorageError extends Error {}

const createTable = `
CREATE TABLE IF NOT EXISTS links (
  code       TEXT    PRIMARY KEY,
  url        TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
`

function asStorageError(error: unknown): StorageError {
  const detail = error instanceof Error ? error.message : String(error)
  return new StorageError(`Storage error: ${detail}`)
}

function isSqliteError(error: unknown): error is { errcode: number } {
  return typeof error === 'object' && error !== null && 'errcode' in error && typeof error.errcode === 'number'
}

export function openLinkRepository(dbPath: string): LinkRepository {
  let database: DatabaseSync | undefined

  try {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true })
    }
    database = new DatabaseSync(dbPath)
    database.exec(createTable)
    database.exec('PRAGMA user_version = 1')
  } catch (error) {
    try {
      database?.close()
    } catch {
      // The startup error is the useful error to report.
    }
    throw asStorageError(error)
  }

  const insert = database.prepare(
    'INSERT INTO links (code, url, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
  const findByCode = database.prepare(
    'SELECT code, url, created_at AS createdAt, expires_at AS expiresAt FROM links WHERE code = ?',
  )

  return {
    insert(link: LinkRecord): void {
      try {
        insert.run(link.code, link.url, link.createdAt, link.expiresAt)
      } catch (error) {
        if (isSqliteError(error) && error.errcode === 1555) {
          throw new DuplicateCodeError('Link code already exists')
        }
        throw asStorageError(error)
      }
    },
    findByCode(code: string): LinkRecord | undefined {
      try {
        return findByCode.get(code) as LinkRecord | undefined
      } catch (error) {
        throw asStorageError(error)
      }
    },
    close(): void {
      database.close()
    },
  }
}
