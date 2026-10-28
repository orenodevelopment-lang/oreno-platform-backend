import { describe, expect, it } from 'vitest';
import { createCorsOptions } from '../../src/common/middleware/security.js';

describe('credentialed browser CORS contract', () => {
  it('allows the organisation scope header for an exact configured origin', () => {
    const options = createCorsOptions();
    expect(options.credentials).toBe(true);
    expect(options.allowedHeaders).toContain('X-Organisation-Id');
  });
});
