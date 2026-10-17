import { describe, expect, it } from 'vitest';
import { RoleScope } from '@prisma/client';
import { isPlatformOnlyPermission, ROLE_DEFINITIONS } from '../../src/platform/rbac/role-permissions.js';

describe('role permission boundaries', () => {
  it('never grants platform-only powers to an organisation role', () => {
    const violations = ROLE_DEFINITIONS
      .filter((role) => role.scope === RoleScope.ORGANISATION)
      .flatMap((role) => role.permissions.filter(isPlatformOnlyPermission).map((permission) => `${role.key}:${permission}`));
    expect(violations).toEqual([]);
  });

  it('does not let tenant roles mutate global talent profiles or decide vetting', () => {
    for (const role of ROLE_DEFINITIONS.filter((item) => item.scope === RoleScope.ORGANISATION)) {
      expect(role.permissions).not.toContain('talent:update');
      expect(role.permissions).not.toContain('vetting:decide');
    }
  });
});
