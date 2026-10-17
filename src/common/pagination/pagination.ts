import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Offset pagination is used for admin tables, exports and stable reference
 * lists. Cursor pagination is used for high-volume, append-only feeds
 * (messages, audit events, notifications) where offsets drift under writes.
 */
export const pagePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PagePagination = z.infer<typeof pagePaginationSchema>;
export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface CursorMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export function toSkipTake(pagination: PagePagination): { skip: number; take: number } {
  return {
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  };
}

export function buildPageMeta(pagination: PagePagination, total: number): PageMeta {
  const pageCount = total === 0 ? 0 : Math.ceil(total / pagination.pageSize);
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    pageCount,
    hasNextPage: pagination.page < pageCount,
    hasPreviousPage: pagination.page > 1 && total > 0,
  };
}

export function buildCursorMeta(limit: number, nextCursor: string | null): CursorMeta {
  return { limit, nextCursor, hasMore: nextCursor !== null };
}

/**
 * Opaque cursor encoding. The payload is base64url-encoded JSON containing the
 * sort key of the last returned row. It is deliberately not encrypted: cursors
 * are not authorisation tokens, and every query still applies tenant scoping.
 */
export function encodeCursor(payload: Record<string, string | number | Date>): string {
  const normalised: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(payload)) {
    normalised[key] = value instanceof Date ? value.toISOString() : value;
  }
  return Buffer.from(JSON.stringify(normalised), 'utf8').toString('base64url');
}

export function decodeCursor<T extends Record<string, string | number>>(
  cursor: string,
): T | undefined {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    return parsed as T;
  } catch {
    return undefined;
  }
}
