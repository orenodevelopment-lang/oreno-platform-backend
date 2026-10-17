import type { ZodTypeAny } from 'zod';

/**
 * A small, dependency-free subset of the OpenAPI 3.1 object model.
 *
 * Only the pieces the generator actually emits are modelled. Everything is
 * optional-by-construction rather than `any`, so a typo in an operation
 * definition is a compile error instead of a silently missing field.
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type JsonSchema = Record<string, unknown>;

export interface ResponseDoc {
  status: number;
  description: string;
  /**
   * A Zod schema, or a ready-made JSON Schema, describing the `data` payload.
   * Ignored when `ref` is set.
   */
  schema?: ZodTypeAny | JsonSchema;
  /** Wrap `schema` in the standard `{ data, meta }` success envelope. */
  envelope?: boolean;
  /** Reference a shared component response, e.g. `#/components/responses/Unauthorised`. */
  ref?: string;
}

export interface OperationDoc {
  method: HttpMethod;
  /** Full path including the `/api/v1` prefix, e.g. `/api/v1/auth/login`. */
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  /**
   * `[]` marks the endpoint public. When omitted the global security default
   * (an authenticated cookie session) applies.
   */
  security?: Record<string, string[]>[];
  request?: {
    body?: ZodTypeAny;
    query?: ZodTypeAny;
    params?: ZodTypeAny;
    /** Request headers represented as an object schema. */
    headers?: ZodTypeAny;
    /** Content type for the request body. Defaults to `application/json`. */
    contentType?: string;
  };
  responses: ResponseDoc[];
}

export interface DocumentMeta {
  title: string;
  version: string;
  description: string;
  serverUrl: string;
}
