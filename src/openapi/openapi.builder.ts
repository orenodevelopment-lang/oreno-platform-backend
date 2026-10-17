import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { DocumentMeta, JsonSchema, OperationDoc, ResponseDoc } from './openapi.types.js';

/**
 * Assemble an OpenAPI 3.1 document from declarative operation definitions.
 *
 * The definitions in `*.operations.ts` reference the same Zod schemas the
 * controllers validate against, so the specification cannot drift from the
 * request shapes it documents without a type error.
 */

/** Textual OpenAPI version. 3.1 is used so nullable fields emit `type: [T, "null"]`. */
const OPENAPI_VERSION = '3.1.0';

/** Shared responses referenced by `ref` from every operation that can produce them. */
const SHARED_RESPONSES: Record<string, JsonSchema> = {
  BadRequest: {
    description: 'The request body or parameters failed validation.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  },
  Unauthorised: {
    description: 'No valid session, or the credentials were rejected.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  },
  Forbidden: {
    description: 'Authenticated, but not permitted to perform this action.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  },
  NotFound: {
    description: 'The addressed resource does not exist.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  },
  Conflict: {
    description: 'The request conflicts with the current state of the resource.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  },
  Unprocessable: {
    description: 'The request was well-formed but cannot be actioned.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  },
  TooManyRequests: {
    description: 'A rate limit was exceeded. Inspect the `Retry-After` header before retrying.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  },
  InternalError: {
    description: 'An unexpected server error. Report the `requestId` when contacting support.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  },
};

const ERROR_ENVELOPE: JsonSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', description: 'A stable `ErrorCode` value.' },
        message: { type: 'string', description: 'Human-readable, safe to display.' },
        requestId: { type: 'string', description: 'Correlates with the `X-Request-Id` header.' },
        details: { type: 'object', additionalProperties: true },
        fieldErrors: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const SUCCESS_ENVELOPE_PROPERTIES: Record<string, JsonSchema> = {
  data: { description: 'The operation payload.' },
  meta: {
    type: 'object',
    description:
      'Always present; `{}` when there is nothing to add. Paginated list responses add `page` fields.',
    additionalProperties: true,
  },
};

const SUCCESS_ENVELOPE: JsonSchema = {
  type: 'object',
  required: ['data', 'meta'],
  properties: SUCCESS_ENVELOPE_PROPERTIES,
};

/**
 * Convert a Zod schema to JSON Schema and strip the `$schema` marker, which is
 * only meaningful at the document root and confuses some consumers when it
 * appears on a nested subschema.
 */
function toJsonSchema(schema: ZodTypeAny): JsonSchema {
  // `zod-to-json-schema` publishes a slightly narrower Zod input type than
  // Zod's `ZodTypeAny`, even though this is the exact runtime contract it
  // accepts. Normalise the type at this single adapter boundary.
  const compatibleSchema = schema as Parameters<typeof zodToJsonSchema>[0];
  const converted = zodToJsonSchema(compatibleSchema, {
    target: 'jsonSchema2019-09',
    $refStrategy: 'none',
  }) as JsonSchema;
  delete converted['$schema'];
  return converted;
}

function isZodSchema(value: unknown): value is ZodTypeAny {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_def' in value &&
    typeof (value as { parse?: unknown }).parse === 'function'
  );
}

function renderSchema(schema: ZodTypeAny | JsonSchema): JsonSchema {
  return isZodSchema(schema) ? toJsonSchema(schema) : schema;
}

function renderResponse(response: ResponseDoc): JsonSchema {
  if (response.ref) {
    const name = response.ref.replace('#/components/responses/', '');
    const shared = SHARED_RESPONSES[name];
    if (!shared) {
      throw new Error(`Unknown shared response referenced by an operation: ${response.ref}`);
    }
    return { $ref: response.ref };
  }

  if (!response.schema) {
    return { description: response.description };
  }

  const dataSchema = renderSchema(response.schema);
  const body = response.envelope
    ? {
        ...SUCCESS_ENVELOPE,
        properties: { ...SUCCESS_ENVELOPE_PROPERTIES, data: dataSchema },
      }
    : dataSchema;

  return {
    description: response.description,
    content: { 'application/json': { schema: body } },
  };
}

/** Turn an operation's Zod inputs into `parameters` and `requestBody`. */
function renderInputs(operation: OperationDoc): {
  parameters: JsonSchema[];
  requestBody?: JsonSchema;
} {
  const parameters: JsonSchema[] = [];

  const pathParameterNames = [...operation.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);

  for (const name of pathParameterNames) {
    // A declared params schema would describe the value; without one the
    // parameter is still required, so it is emitted as a plain string.
    const declared = operation.request?.params
      ? (toJsonSchema(operation.request.params)['properties'] as
          | Record<string, JsonSchema>
          | undefined)
      : undefined;
    parameters.push({
      name,
      in: 'path',
      required: true,
      schema:
        declared?.[name] ??
        (name === 'id' || name.endsWith('Id')
          ? { type: 'string', format: 'uuid' }
          : { type: 'string' }),
    });
  }

  if (operation.request?.query) {
    const converted = toJsonSchema(operation.request.query);
    const properties = (converted['properties'] ?? {}) as Record<string, JsonSchema>;
    const required = new Set((converted['required'] as string[] | undefined) ?? []);
    for (const [name, schema] of Object.entries(properties)) {
      parameters.push({
        name,
        in: 'query',
        required: required.has(name),
        schema,
      });
    }
  }

  if (operation.request?.headers) {
    const converted = toJsonSchema(operation.request.headers);
    const properties = (converted['properties'] ?? {}) as Record<string, JsonSchema>;
    const required = new Set((converted['required'] as string[] | undefined) ?? []);
    for (const [name, schema] of Object.entries(properties)) {
      parameters.push({ name, in: 'header', required: required.has(name), schema });
    }
  }

  if (!operation.request?.body) return { parameters };

  return {
    parameters,
    requestBody: {
      required: true,
      content: {
        [operation.request.contentType ?? 'application/json']: {
          schema: toJsonSchema(operation.request.body),
        },
      },
    },
  };
}

export interface OpenApiDocument extends JsonSchema {
  openapi: string;
  info: JsonSchema;
  servers: JsonSchema[];
  tags: JsonSchema[];
  paths: Record<string, JsonSchema>;
  components: JsonSchema;
}

export function buildDocument(
  operations: OperationDoc[],
  meta: DocumentMeta,
  tags: { name: string; description: string }[],
): OpenApiDocument {
  const paths: Record<string, JsonSchema> = {};
  const seenOperationIds = new Set<string>();

  for (const operation of operations) {
    if (seenOperationIds.has(operation.operationId)) {
      throw new Error(`Duplicate operationId in the OpenAPI definition: ${operation.operationId}`);
    }
    seenOperationIds.add(operation.operationId);

    const { parameters, requestBody } = renderInputs(operation);
    const responses: Record<string, JsonSchema> = {};
    for (const response of operation.responses) {
      responses[String(response.status)] = renderResponse(response);
    }

    paths[operation.path] = {
      ...(paths[operation.path] ?? {}),
      [operation.method]: {
        operationId: operation.operationId,
        summary: operation.summary,
        ...(operation.description ? { description: operation.description } : {}),
        tags: operation.tags,
        ...(operation.security ? { security: operation.security } : {}),
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(requestBody ? { requestBody } : {}),
        responses,
      },
    };
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: meta.title,
      version: meta.version,
      description: meta.description,
    },
    servers: [{ url: meta.serverUrl, description: 'Configured deployment' }],
    tags,
    paths,
    components: {
      schemas: {
        ErrorEnvelope: ERROR_ENVELOPE,
      },
      responses: SHARED_RESPONSES,
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'oreno_session',
          description:
            'Opaque session cookie set by `POST /api/v1/auth/login`. State-changing requests must also send the CSRF header.',
        },
      },
    },
    // Default for every operation; individual operations override it with `security: []`.
    security: [{ sessionCookie: [] }],
  };
}
