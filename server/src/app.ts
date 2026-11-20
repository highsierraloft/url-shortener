import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { StorageError } from './link-repository.ts'
import { ValidationError } from './link-service.ts'
import type { LinkService } from './link-service.ts'
import { registerRoutes } from './routes.ts'

const invalidRequest = 'Send a JSON object with a "url" field.'
const notFoundPage = '<!doctype html><title>Link not found</title><h1>Link not found</h1>'

export function buildApp(deps: { service: LinkService; logger?: boolean }): FastifyInstance {
  const app = Fastify({ bodyLimit: 16_384, logger: deps.logger ?? false })

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ValidationError) {
      reply.code(reply.statusCode >= 400 ? reply.statusCode : 400).send({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof StorageError) {
      reply.code(500).send({ error: { code: 'STORAGE_ERROR', message: "The link couldn't be saved. Try again." } })
      return
    }
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      reply.code(413).send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } })
      return
    }
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 400 || statusCode === 415) {
      reply.code(statusCode).send({ error: { code: 'INVALID_REQUEST', message: invalidRequest } })
      return
    }
    reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' } })
  })

  registerRoutes(app, deps.service)
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(notFoundPage)
  })
  return app
}
