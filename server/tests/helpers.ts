import type { FastifyInstance } from 'fastify'
import { it } from 'vitest'
import { buildApp } from '../src/app.ts'
import { openLinkRepository } from '../src/link-repository.ts'
import type { LinkRepository } from '../src/link-repository.ts'
import { createLinkService, generateCode } from '../src/link-service.ts'
import type { Clock, CodeGenerator, LinkService } from '../src/link-service.ts'

export const itUnlessRoot = it.skipIf(process.getuid?.() === 0)

export interface FakeClock extends Clock {
  set(ms: number): void
  advance(ms: number): void
}

export function fakeClock(startMs: number = Date.parse('2026-01-01T00:00:00.000Z')): FakeClock {
  let current = startMs
  return {
    now: () => current,
    set(ms) {
      current = ms
    },
    advance(ms) {
      current += ms
    },
  }
}

export function fixedCodes(...codes: string[]): CodeGenerator {
  let index = 0
  return () => {
    if (index >= codes.length) {
      throw new Error('fixedCodes: out of codes')
    }
    return codes[index++]!
  }
}

export function createTestApp(options: { clock?: FakeClock; codes?: string[]; baseUrl?: string } = {}): {
  app: FastifyInstance
  clock: FakeClock
  repository: LinkRepository
  service: LinkService
} {
  const clock = options.clock ?? fakeClock()
  const repository = openLinkRepository(':memory:')
  const service = createLinkService({
    repository,
    clock,
    generateCode: options.codes ? fixedCodes(...options.codes) : generateCode,
    baseUrl: options.baseUrl ?? 'http://short.test',
  })
  const app = buildApp({ service })
  return { app, clock, repository, service }
}
