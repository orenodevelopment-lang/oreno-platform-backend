import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import {
  beginIdempotent,
  completeIdempotent,
  hashRequest,
} from '../../src/platform/idempotency/idempotency.service.js';
import { suffix } from '../helpers/factories.js';

describe('idempotency claims', () => {
  it('replays completed work, rejects changed input, and allows one stale-lock reclaimer', async () => {
    const scope = `integration:${suffix()}`;
    const key = `key-${suffix()}`;
    const requestHash = hashRequest({ value: 1 });
    const first = await beginIdempotent({ scope, key, requestHash });
    expect(first.state).toBe('acquired');
    if (first.state !== 'acquired') throw new Error('Expected an acquired idempotency claim.');
    await completeIdempotent(first.recordId, 201, { id: 'created-once' });
    expect(await beginIdempotent({ scope, key, requestHash })).toMatchObject({
      state: 'replayed',
      statusCode: 201,
      body: { id: 'created-once' },
    });
    expect(
      await beginIdempotent({ scope, key, requestHash: hashRequest({ value: 2 }) }),
    ).toEqual({ state: 'mismatch' });

    const staleScope = `stale:${suffix()}`;
    const staleKey = `key-${suffix()}`;
    const stale = await beginIdempotent({ scope: staleScope, key: staleKey, requestHash });
    if (stale.state !== 'acquired') throw new Error('Expected a stale test claim.');
    await getPrisma().idempotencyRecord.update({
      where: { id: stale.recordId },
      data: { lockedAt: new Date(Date.now() - 3 * 60_000) },
    });
    const contenders = await Promise.all([
      beginIdempotent({ scope: staleScope, key: staleKey, requestHash }),
      beginIdempotent({ scope: staleScope, key: staleKey, requestHash }),
    ]);
    expect(contenders.filter((item) => item.state === 'acquired')).toHaveLength(1);
    expect(contenders.filter((item) => item.state === 'in_progress')).toHaveLength(1);
  });

  it('allows a key to be reused after its retention window expires', async () => {
    const scope = `expired:${suffix()}`;
    const key = `key-${suffix()}`;
    const requestHash = hashRequest({ value: 1 });
    const first = await beginIdempotent({ scope, key, requestHash });
    if (first.state !== 'acquired') throw new Error('Expected an acquired idempotency claim.');
    await getPrisma().idempotencyRecord.update({
      where: { id: first.recordId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect((await beginIdempotent({ scope, key, requestHash })).state).toBe('acquired');
  });
});
