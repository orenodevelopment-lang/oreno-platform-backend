import { describe, expect, it } from 'vitest';
import { organisationStatusCommand, organisationVerificationCommand, operationsQuery, userStatusCommand } from '../../src/modules/admin/admin.schema.js';

const command = { reason: 'Verified against the case evidence.', expectedUpdatedAt: '2026-10-16T10:00:00.000Z' };

describe('admin command validation', () => {
  it('rejects arbitrary user and organisation statuses at the HTTP boundary', () => {
    expect(userStatusCommand.safeParse({ ...command, status: 'ROOT' }).success).toBe(false);
    expect(organisationStatusCommand.safeParse({ ...command, status: 'VERIFIED' }).success).toBe(false);
  });

  it('keeps lifecycle status separate from verification status', () => {
    expect(organisationVerificationCommand.safeParse({ ...command, status: 'VERIFIED' }).success).toBe(true);
    expect(organisationVerificationCommand.safeParse({ ...command, status: 'ACTIVE' }).success).toBe(false);
  });

  it('accepts only real background job statuses', () => {
    expect(operationsQuery.safeParse({ page: 1, pageSize: 20, status: 'DEAD_LETTERED' }).success).toBe(true);
    expect(operationsQuery.safeParse({ page: 1, pageSize: 20, status: 'BROKEN' }).success).toBe(false);
  });
});
