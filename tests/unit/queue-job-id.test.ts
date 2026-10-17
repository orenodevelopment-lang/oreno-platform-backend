import { describe, expect, it } from 'vitest';
import { stableJobId } from '../../src/platform/queue/queue.registry.js';

describe('stableJobId', () => {
  it('builds deterministic BullMQ-compatible ids without Redis separators', () => {
    expect(stableJobId('outbox', 'event:123')).toBe('outbox-event-123');
    expect(stableJobId('email', '550e8400-e29b-41d4-a716-446655440000')).not.toContain(':');
  });

  it('always has a non-numeric prefix and rejects empty parts', () => {
    expect(stableJobId('job', '123')).toBe('job-123');
    expect(() => stableJobId('', '123')).toThrow('must not be empty');
  });
});
