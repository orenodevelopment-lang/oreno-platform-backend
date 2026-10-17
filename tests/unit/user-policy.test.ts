import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../src/modules/auth/index.js';
import {
  canViewAnyProfile,
  canViewProfile,
  searchScope,
} from '../../src/modules/users/user.policy.js';

function actor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    method: 'session',
    isPlatformAdmin: false,
    platformRoles: [],
    platformPermissions: new Set(),
    organisationPermissions: new Set(),
    scopedDepartmentIds: [],
    ...overrides,
  };
}

describe('user profile policy', () => {
  it('does not turn an organisation membership grant into global profile access', () => {
    const auth = actor({ organisationPermissions: new Set(['membership:read']) });
    expect(canViewAnyProfile(auth)).toBe(false);
    expect(canViewProfile(auth, '00000000-0000-4000-8000-000000000002', false)).toBe(false);
  });

  it('allows a tenant-safe summary only when an active relationship was established', () => {
    const auth = actor({ organisationPermissions: new Set(['membership:read']) });
    expect(canViewProfile(auth, '00000000-0000-4000-8000-000000000002', true)).toBe(true);
  });

  it('allows platform-wide profile reads only through platform permissions', () => {
    const auth = actor({ platformPermissions: new Set(['admin:read']) });
    expect(canViewAnyProfile(auth)).toBe(true);
  });

  it('keeps a tenant directory query scoped to active organisations', () => {
    const auth = actor({ organisationPermissions: new Set(['membership:read']) });
    expect(searchScope(auth, ['org-a', 'org-b'])).toEqual({
      organisationIds: ['org-a', 'org-b'],
    });
  });
});
