import { describe, expect, it } from 'vitest';
import {
  buildCursorMeta,
  buildPageMeta,
  cursorPaginationSchema,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  encodeCursor,
  MAX_PAGE_SIZE,
  pagePaginationSchema,
  toSkipTake,
} from '../../src/common/pagination/pagination.js';

describe('pagination', () => {
  describe('pagePaginationSchema', () => {
    it('coerces query strings and applies defaults', () => {
      expect(pagePaginationSchema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
      expect(pagePaginationSchema.parse({ page: '3', pageSize: '50' })).toEqual({
        page: 3,
        pageSize: 50,
      });
    });

    it('rejects a page below one', () => {
      expect(pagePaginationSchema.safeParse({ page: '0' }).success).toBe(false);
    });

    it('caps the page size', () => {
      expect(pagePaginationSchema.safeParse({ pageSize: String(MAX_PAGE_SIZE + 1) }).success).toBe(
        false,
      );
      expect(pagePaginationSchema.safeParse({ pageSize: String(MAX_PAGE_SIZE) }).success).toBe(true);
    });

    it('rejects non-integers', () => {
      expect(pagePaginationSchema.safeParse({ page: '1.5' }).success).toBe(false);
    });
  });

  describe('toSkipTake', () => {
    it('converts to offset and limit', () => {
      expect(toSkipTake({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
      expect(toSkipTake({ page: 3, pageSize: 25 })).toEqual({ skip: 50, take: 25 });
    });
  });

  describe('buildPageMeta', () => {
    it('computes page count and navigation flags', () => {
      const meta = buildPageMeta({ page: 2, pageSize: 20 }, 55);
      expect(meta).toEqual({
        page: 2,
        pageSize: 20,
        total: 55,
        pageCount: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('reports no next page on the last page', () => {
      const meta = buildPageMeta({ page: 3, pageSize: 20 }, 55);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(true);
    });

    it('handles an empty result set', () => {
      const meta = buildPageMeta({ page: 1, pageSize: 20 }, 0);
      expect(meta.pageCount).toBe(0);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(false);
    });

    it('handles a page beyond the end without claiming a next page', () => {
      const meta = buildPageMeta({ page: 9, pageSize: 20 }, 10);
      expect(meta.pageCount).toBe(1);
      expect(meta.hasNextPage).toBe(false);
    });
  });

  describe('cursorPaginationSchema', () => {
    it('defaults the limit and accepts an optional cursor', () => {
      expect(cursorPaginationSchema.parse({})).toEqual({
        cursor: undefined,
        limit: DEFAULT_PAGE_SIZE,
      });
    });

    it('caps the limit', () => {
      expect(cursorPaginationSchema.safeParse({ limit: String(MAX_PAGE_SIZE + 1) }).success).toBe(
        false,
      );
    });
  });

  describe('encodeCursor / decodeCursor', () => {
    it('round-trips a payload', () => {
      const payload = { createdAt: '2026-01-01T00:00:00.000Z', id: 'abc' };
      expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
    });

    it('normalises Date values to ISO strings', () => {
      const encoded = encodeCursor({ createdAt: new Date('2026-03-04T05:06:07.000Z') });
      expect(decodeCursor(encoded)).toEqual({ createdAt: '2026-03-04T05:06:07.000Z' });
    });

    it('produces a URL-safe value', () => {
      const encoded = encodeCursor({ id: 'a+b/c=d' });
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it('returns undefined for malformed input rather than throwing', () => {
      expect(decodeCursor('not-a-cursor!!')).toBeUndefined();
      expect(decodeCursor(Buffer.from('[1,2,3]', 'utf8').toString('base64url'))).toBeUndefined();
      expect(decodeCursor(Buffer.from('"a string"', 'utf8').toString('base64url'))).toBeUndefined();
    });
  });

  describe('buildCursorMeta', () => {
    it('reports more results only when a cursor is present', () => {
      expect(buildCursorMeta(20, 'next')).toEqual({ limit: 20, nextCursor: 'next', hasMore: true });
      expect(buildCursorMeta(20, null)).toEqual({ limit: 20, nextCursor: null, hasMore: false });
    });
  });
});
