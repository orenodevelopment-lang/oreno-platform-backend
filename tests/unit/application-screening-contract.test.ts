import { describe, expect, it } from 'vitest';
import { ROLE_DEFINITIONS } from '../../src/platform/rbac/role-permissions.js';
import { releasedToOrganisationWhere } from '../../src/modules/application-screening/screening.policy.js';
import { canTransitionScreening } from '../../src/modules/application-screening/screening.transitions.js';
import { cvReviewSchema, releaseScreeningSchema, screeningQueueQuerySchema } from '../../src/modules/application-screening/application-screening.schema.js';

describe('managed recruitment screening contract', () => {
  it('keeps company roles and read-only platform roles out of private screening', () => {
    for (const role of ROLE_DEFINITIONS.filter((item) => item.scope === 'ORGANISATION')) {
      expect(role.permissions.some((permission) => permission.startsWith('screening:'))).toBe(false);
    }
    expect(ROLE_DEFINITIONS.find((item) => item.key === 'READ_ONLY_ANALYST')?.permissions).not.toContain('screening:read');
    expect(ROLE_DEFINITIONS.find((item) => item.key === 'SUPPORT_AGENT')?.permissions).not.toContain('screening:read');
    expect(ROLE_DEFINITIONS.find((item) => item.key === 'TALENT_REVIEWER')?.permissions).not.toContain('screening:release');
    expect(ROLE_DEFINITIONS.find((item) => item.key === 'OPERATIONS_ADMIN')?.permissions).toContain('screening:release');
  });

  it('requires the exact organisation and an explicit released screening state', () => {
    expect(releasedToOrganisationWhere('org-1')).toEqual({
      organisationId: 'org-1',
      screening: { is: { status: 'RELEASED_TO_COMPANY', releasedToCompanyAt: { not: null } } },
    });
  });

  it('separates approval from release and rejects terminal reopening', () => {
    expect(canTransitionScreening('FINAL_REVIEW_PENDING', 'APPROVED_FOR_SUBMISSION')).toBe(true);
    expect(canTransitionScreening('APPROVED_FOR_SUBMISSION', 'RELEASED_TO_COMPANY')).toBe(true);
    expect(canTransitionScreening('CV_APPROVED', 'RELEASED_TO_COMPANY')).toBe(false);
    expect(canTransitionScreening('NOT_SELECTED', 'APPROVED_FOR_SUBMISSION')).toBe(false);
    expect(canTransitionScreening('WITHDRAWN', 'CV_APPROVED')).toBe(false);
  });

  it('validates human decisions, optimistic concurrency, and release confirmation', () => {
    const updatedAt = new Date().toISOString();
    expect(cvReviewSchema.safeParse({ expectedUpdatedAt: updatedAt, reason: 'Human reviewer checked role evidence.', decision: 'APPROVED', rubric: { relevantExperience: true } }).success).toBe(true);
    expect(cvReviewSchema.safeParse({ expectedUpdatedAt: updatedAt, reason: 'ok', decision: 'AUTOMATIC_APPROVAL', rubric: {} }).success).toBe(false);
    expect(releaseScreeningSchema.safeParse({ expectedUpdatedAt: updatedAt, reason: 'Approved human screening is complete.', organisationId: '22222222-2222-4222-8222-222222222222', confirmation: false }).success).toBe(false);
    expect(screeningQueueQuerySchema.safeParse({ page: 1, pageSize: 50, status: 'PENDING_CV_REVIEW' }).success).toBe(true);
  });
});
