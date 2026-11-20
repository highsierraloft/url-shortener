import type { FastifyInstance } from 'fastify'
import { ValidationError } from './link-service.ts'
import type { LinkService } from './link-service.ts'

const invalidRequest = 'Send a JSON object with a "url" field.'

export function registerRoutes(app: FastifyInstance, service: LinkService): void {
  app.post('/api/links', (request, reply) => {
    const contentType = request.headers['content-type']
    if (request.body !== undefined && request.body !== '' && contentType !== undefined && !/^application\/json(?:\s*;.*)?$/i.test(contentType)) {
      reply.code(415)
      throw new ValidationError('INVALID_REQUEST', invalidRequest)
    }
    if (contentType === undefined && request.body !== undefined) {
      reply.code(415)
      throw new ValidationError('INVALID_REQUEST', invalidRequest)
    }
    return reply.code(201).send(service.create(request.body))
  })

  app.route({
    method: ['GET', 'HEAD'],
    url: '/:code(^[A-Za-z0-9]{8}$)',
    handler(request, reply) {
      const code = (request.params as { code: string }).code
      const url = service.resolve(code)
      if (url === null) return reply.code(404).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send('<!doctype html><title>Link not found</title><h1>Link not found</h1>')
      return reply.code(302).header('Cache-Control', 'no-store').header('Location', url).send()
    },
  })
}
