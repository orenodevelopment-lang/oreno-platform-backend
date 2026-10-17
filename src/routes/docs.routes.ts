import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../openapi/index.js';

/**
 * Interactive API documentation.
 *
 * Mounted only outside production: the specification is still published as a
 * build artefact (`openapi/openapi.json`), but the running service does not
 * expose a browsable surface that a penetration test would flag. Both routes
 * are unauthenticated, so they are also mounted ahead of the rate limiter and
 * CSRF middleware in `app.ts`.
 */
export function createDocsRouter(): Router {
  const router = Router();

  // Built once at boot: the document is static and generation is not free.
  const document = buildOpenApiDocument();

  router.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'Oreno Platform API',
      swaggerOptions: { persistAuthorization: true, tryItOutEnabled: true },
    }),
  );

  router.get('/api/docs.json', (_req, res) => {
    res.json(document);
  });

  return router;
}
