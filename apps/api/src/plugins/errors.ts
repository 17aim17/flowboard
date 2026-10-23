import type { ErrorBody } from '@flowboard/contracts';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.ts';

/** Every error leaves the API as { error: { code, message, details? } }. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError | AppError>((error, request, reply) => {
    const send = (status: number, body: ErrorBody['error']) => reply.status(status).send({ error: body });

    if (error instanceof AppError) {
      return send(error.statusCode, { code: error.code, message: error.message, details: error.details });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const context = error.validationContext ?? 'body';
      const details = error.validation.map((issue) => {
        const segments = issue.instancePath.split('/').filter(Boolean);
        // Body paths read like the payload ("customFields.estimate"); others say where they came from ("query.limit").
        const path = (context === 'body' ? segments : [context, ...segments]).join('.') || context;
        return { path, code: String(issue.keyword), message: issue.message ?? 'Invalid value' };
      });
      return send(400, { code: 'VALIDATION_FAILED', message: 'Invalid input', details });
    }
    if (error.statusCode && error.statusCode < 500) {
      // Fastify's own client errors: malformed JSON, wrong content type, body too large.
      return send(error.statusCode, { code: error.code ?? 'BAD_REQUEST', message: error.message });
    }

    request.log.error({ err: error }, 'unhandled error');
    return send(500, { code: 'INTERNAL', message: `Something went wrong. Request id: ${request.id}` });
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send({ error: { code: 'NOT_FOUND', message: `No route ${request.method} ${request.url}` } }),
  );
}
