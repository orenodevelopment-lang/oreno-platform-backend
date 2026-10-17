import { authOperations } from './auth.operations.js';
import { healthOperations } from './health.operations.js';
import { usersOperations } from './users.operations.js';
import { catalogOperations } from './catalog.operations.js';
import { buildDocument, type OpenApiDocument } from './openapi.builder.js';
import type { OperationDoc } from './openapi.types.js';

/**
 * The published API contract.
 *
 * `operationDefinitions` is the single list of every documented endpoint: the
 * generator, the drift test and any future client SDK all read from it. New
 * routes are added here when they are added to a router.
 */

/** Bumped when the published contract changes shape. Not the package version. */
const CONTRACT_VERSION = '1.0.0';

export const API_TAGS = [
  {
    name: 'auth',
    description:
      'Identity, sessions, federated sign-in and two-factor authentication. Mounted at `/api/v1/auth`.',
  },
  {
    name: 'health',
    description: 'Liveness, readiness and metrics. Unauthenticated and outside `/api`.',
  },
  {
    name: 'users',
    description: 'User directory and profile reads. Mounted at `/api/v1/users`.',
  },
  ...['public','organisations','invitations','talents','jobs','applications','hiring','workforce','performance','matching','placements','compensation','exports','reporting','files','notifications','messaging','support','search','admin'].map((name) => ({ name, description: `${name[0]!.toUpperCase()}${name.slice(1)} API operations.` })),
];

export function operationDefinitions(): OperationDoc[] {
  const detailed = [...healthOperations, ...authOperations, ...usersOperations];
  const defined = new Set(detailed.map((operation) => `${operation.method} ${operation.path}`));
  return [...detailed, ...catalogOperations.filter((operation) => !defined.has(`${operation.method} ${operation.path}`))];
}

/**
 * The server URL is documentation metadata, not configuration the API acts on,
 * so it is read directly from the environment rather than through `loadConfig`.
 * Generating the specification therefore needs no database URL, no secrets and
 * no running dependencies — it works in CI on a bare checkout.
 */
function documentedServerUrl(): string {
  return process.env['API_URL']?.trim() || 'http://localhost:4000';
}

export function buildOpenApiDocument(serverUrl?: string): OpenApiDocument {
  return buildDocument(operationDefinitions(), {
    title: 'Oreno Platform API',
    version: CONTRACT_VERSION,
    description: [
      'The multi-tenant hiring and workforce-management platform API.',
      '',
      'Authentication uses an opaque session cookie set by `POST /api/v1/auth/login`.',
      'Requests that change state must also echo the CSRF token from the `oreno_csrf` cookie',
      'in the header named by `csrfHeaderName` in the login response.',
      '',
      'Every response uses one of two envelopes: `{ data, meta }` on success, and',
      '`{ error: { code, message, requestId } }` on failure. `code` is stable and safe to',
      'switch on; `message` is safe to display.',
    ].join('\n'),
    serverUrl: serverUrl ?? documentedServerUrl(),
  }, API_TAGS);
}

export type { OpenApiDocument } from './openapi.builder.js';
export type { OperationDoc } from './openapi.types.js';
