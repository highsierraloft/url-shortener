import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { itUnlessRoot } from './helpers.ts'

const serverDir = fileURLToPath(new URL('..', import.meta.url))
const unusedPort = '39123'

let root: string
let restore: Array<() => void>

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'links-startup-'))
  restore = []
})

afterEach(() => {
  for (const undo of restore) undo()
  rmSync(root, { recursive: true, force: true })
})

function startService(overrides: Record<string, string>) {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.BASE_URL
  delete env.DB_PATH
  delete env.PORT
  return spawnSync(process.execPath, ['src/main.ts'], {
    cwd: serverDir,
    env: { ...env, PORT: unusedPort, ...overrides },
    encoding: 'utf8',
    timeout: 10_000,
  })
}

describe('service startup', () => {
  it('exits with code 1 and names BASE_URL when BASE_URL is invalid', () => {
    const result = startService({ BASE_URL: 'ftp://sho.rt/nope', DB_PATH: join(root, 'links.db') })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/BASE_URL/)
  })

  itUnlessRoot('exits with code 1 and mentions storage when the database folder is read-only (FR-022)', () => {
    const readOnly = mkdtempSync(join(root, 'ro-'))
    chmodSync(readOnly, 0o555)
    restore.push(() => chmodSync(readOnly, 0o755))

    const result = startService({ DB_PATH: join(readOnly, 'links.db') })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/storage/i)
  })
})
