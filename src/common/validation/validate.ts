import type { Request } from 'express';
import { z, type SafeParseReturnType, type ZodTypeAny } from 'zod';
import { ValidationError } from '../errors/app-error.js';

export interface ValidationTargets {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  headers?: ZodTypeAny;
}

export interface ValidatedRequest<T extends ValidationTargets> {
  body: T['body'] extends ZodTypeAny ? z.infer<T['body']> : unknown;
  query: T['query'] extends ZodTypeAny ? z.infer<T['query']> : unknown;
  params: T['params'] extends ZodTypeAny ? z.infer<T['params']> : unknown;
  headers: T['headers'] extends ZodTypeAny ? z.infer<T['headers']> : unknown;
}

function formatIssues(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Validate request parts against Zod schemas and return typed, parsed values.
 *
 * Schemas are strict by default (see `strictObject`), so unknown fields are
 * rejected rather than silently persisted — this prevents mass assignment.
 */
export function validate<T extends ValidationTargets>(
  req: Request,
  targets: T,
): ValidatedRequest<T> {
  const output: Record<string, unknown> = {};

  const parts = [
    ['body', targets.body, req.body],
    ['query', targets.query, req.query],
    ['params', targets.params, req.params],
    ['headers', targets.headers, req.headers],
  ] as const;

  for (const [name, schema, value] of parts) {
    if (!schema) {
      output[name] = undefined;
      continue;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError('The request could not be validated.', {
        fieldErrors: formatIssues(result.error),
        details: { target: name },
      });
    }
    output[name] = result.data;
  }

  return output as unknown as ValidatedRequest<T>;
}

/** Validate a value that is not part of the HTTP request (job payloads, config). */
export function validateValue<T extends ZodTypeAny>(
  schema: T,
  value: unknown,
  label = 'value',
): z.infer<T> {
  // Annotating the parse result keeps `result.data` typed as the schema output
  // instead of `any`, so the returned value is checked at the call site.
  const result: SafeParseReturnType<unknown, z.infer<T>> = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`The ${label} could not be validated.`, {
      fieldErrors: formatIssues(result.error),
      details: { target: label },
    });
  }
  return result.data;
}

/**
 * A Zod object that rejects unknown keys. Use this instead of `z.object` for
 * every request body so unexpected fields cannot reach a repository.
 */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}
