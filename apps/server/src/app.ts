import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });

  app.setErrorHandler((err: FastifyError | ZodError, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "invalid_input", issues: err.issues });
    }
    const status = err.statusCode ?? 500;
    return reply.status(status).send({ error: status >= 500 ? "internal_error" : err.message });
  });

  app.get("/api/health", () => ({ ok: true }));

  return app;
}
