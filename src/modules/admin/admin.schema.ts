import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { reasonSchema, searchQuerySchema, uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

const userStatuses = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
const organisationStatuses = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
const organisationVerificationStatuses = ['UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED'] as const;
const leadStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISQUALIFIED', 'CLOSED'] as const;
const jobStatuses = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTERED'] as const;

export const idParams = strictObject({ id: uuidSchema });
export const leadParams = strictObject({ kind: z.enum(['demo', 'contact']), id: uuidSchema });
const listBase = pagePaginationSchema.extend({ q: searchQuerySchema.optional() });
export const userListQuery = listBase.extend({ status: z.enum(userStatuses).optional() });
export const organisationListQuery = listBase.extend({ status: z.enum(organisationStatuses).optional() });
export const leadListQuery = listBase.extend({ status: z.enum(leadStatuses).optional() });
export const operationsQuery = pagePaginationSchema.extend({ status: z.enum(jobStatuses).optional() });
export const applicationReviewQuery = pagePaginationSchema.extend({ organisationId: uuidSchema.optional(), status: z.enum(['SUBMITTED','UNDER_REVIEW','SHORTLISTED','INTERVIEWING','OFFER_PENDING','ACCEPTED','REJECTED','WITHDRAWN']).optional() });
export const placementReviewQuery = pagePaginationSchema.extend({ organisationId: uuidSchema.optional(), status: z.enum(['PENDING','ACTIVE','SUSPENDED','ENDED','REPLACED','CANCELLED']).optional() });
export const payrollReviewQuery = pagePaginationSchema.extend({ organisationId: uuidSchema.optional(), status: z.enum(['DRAFT','CALCULATED','PENDING_APPROVAL','APPROVED','LOCKED','PAID','VOID']).optional() });
export const paymentReviewQuery = pagePaginationSchema.extend({ organisationId: uuidSchema.optional(), status: z.enum(['PENDING','AUTHORISED','PAID','PARTIALLY_PAID','FAILED','CANCELLED','RECONCILED']).optional() });

export const auditQuery = pagePaginationSchema.extend({
  organisationId: uuidSchema.optional(), actorId: uuidSchema.optional(),
  action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'PERMISSION_CHANGE', 'LOGIN', 'LOGOUT', 'EXPORT', 'ACCESS', 'SUSPEND', 'REACTIVATE', 'DEACTIVATE', 'APPROVE', 'REJECT', 'RETRY', 'IMPERSONATE', 'CONFIGURE']).optional(),
  resourceType: z.string().trim().max(80).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(),
});
export const userStatusCommand = strictObject({ status: z.enum(userStatuses), reason: reasonSchema, expectedUpdatedAt: z.coerce.date() });
export const organisationStatusCommand = strictObject({ status: z.enum(organisationStatuses), reason: reasonSchema, expectedUpdatedAt: z.coerce.date() });
export const organisationVerificationCommand = strictObject({ status: z.enum(organisationVerificationStatuses), reason: reasonSchema, expectedUpdatedAt: z.coerce.date() });
export const moderationCommand = strictObject({ status: z.enum(['APPROVED', 'FLAGGED', 'REMOVED']), reason: reasonSchema, expectedUpdatedAt: z.coerce.date() });
export const roleCommand = strictObject({ userId: uuidSchema, roleKey: z.enum(['PLATFORM_OWNER', 'OPERATIONS_ADMIN', 'TALENT_REVIEWER', 'SUPPORT_AGENT', 'FINANCE_ADMIN', 'READ_ONLY_ANALYST']), reason: reasonSchema });
export const leadStatusCommand = strictObject({ status: z.enum(leadStatuses), assignedToId: uuidSchema.nullable().optional(), reason: reasonSchema });

const jsonValue: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]));
export const featureFlagSchema = strictObject({ key: z.string().trim().regex(/^[a-z0-9_.-]+$/).max(120), scope: z.enum(['GLOBAL', 'ORGANISATION']).default('GLOBAL'), organisationId: uuidSchema.nullable().optional(), enabled: z.boolean(), description: z.string().trim().max(500).nullable().optional(), rolloutPercentage: z.number().int().min(0).max(100).default(100), reason: reasonSchema });
export const policySchema = strictObject({ key: z.string().trim().regex(/^[a-z0-9_.-]+$/).max(120), organisationId: uuidSchema.nullable().optional(), value: jsonValue.refine((value) => value !== undefined, 'A policy value is required.'), description: z.string().trim().max(500).nullable().optional(), reason: reasonSchema });
export const announcementSchema = strictObject({ organisationId: uuidSchema.nullable().optional(), title: z.string().trim().min(2).max(240), body: z.string().trim().min(2).max(8000), audience: z.enum(['ALL', 'TALENT', 'ORGANISATION_MEMBERS']).default('ALL'), expiresAt: z.coerce.date().nullable().optional(), publish: z.boolean().default(false), reason: reasonSchema });
