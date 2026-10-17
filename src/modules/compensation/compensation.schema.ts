import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { currencySchema, moneyAmountSchema, uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

const positiveDecimalSchema = z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/);

export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const staffParamsSchema = strictObject({
  organisationId: uuidSchema,
  staffAssignmentId: uuidSchema,
});
export const agreementParamsSchema = strictObject({
  organisationId: uuidSchema,
  agreementId: uuidSchema,
});
export const payrollParamsSchema = strictObject({
  organisationId: uuidSchema,
  payrollPeriodId: uuidSchema,
});
export const paymentParamsSchema = strictObject({
  organisationId: uuidSchema,
  paymentId: uuidSchema,
});
export const compensationListQuerySchema = pagePaginationSchema.extend({
  staffAssignmentId: uuidSchema.optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED']).optional(),
});
export const createAgreementSchema = strictObject({
  staffAssignmentId: uuidSchema,
  basis: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL']),
  rateAmount: moneyAmountSchema,
  currency: currencySchema,
  overtimeMultiplier: z.string().regex(/^\d{1,2}(?:\.\d{1,2})?$/).default('1.5'),
  ordinaryHoursPerPeriod: positiveDecimalSchema.nullable().optional(),
  payDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const updateAgreementSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  rateAmount: moneyAmountSchema.optional(),
  overtimeMultiplier: z.string().regex(/^\d{1,2}(?:\.\d{1,2})?$/).optional(),
  ordinaryHoursPerPeriod: positiveDecimalSchema.nullable().optional(),
  payDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const agreementStatusSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ENDED']),
  reason: z.string().trim().max(1000).optional(),
});
export const createAdjustmentSchema = strictObject({
  payAgreementId: uuidSchema.nullable().optional(),
  staffAssignmentId: uuidSchema,
  kind: z.enum(['BONUS', 'INCENTIVE', 'DEDUCTION', 'REIMBURSEMENT', 'CORRECTION']),
  amount: positiveDecimalSchema,
  currency: currencySchema,
  description: z.string().trim().min(2).max(500),
  effectiveDate: z.coerce.date(),
});
export const payrollListQuerySchema = pagePaginationSchema.extend({
  status: z
    .enum(['DRAFT', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED', 'PAID', 'VOID'])
    .optional(),
});
export const createPayrollSchema = strictObject({
  name: z.string().trim().min(2).max(160),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  currency: currencySchema,
});
export const payrollCommandSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  reason: z.string().trim().max(1000).optional(),
});
export const paymentListQuerySchema = pagePaginationSchema.extend({
  status: z
    .enum(['PENDING', 'AUTHORISED', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'CANCELLED', 'RECONCILED'])
    .optional(),
  staffAssignmentId: uuidSchema.optional(),
  payrollPeriodId: uuidSchema.optional(),
});
export const createPaymentSchema = strictObject({
  payrollPeriodId: uuidSchema.nullable().optional(),
  staffAssignmentId: uuidSchema.nullable().optional(),
  methodDescription: z.string().trim().min(2).max(200),
  externalReference: z.string().trim().max(200).nullable().optional(),
  amount: positiveDecimalSchema,
  currency: currencySchema,
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const paymentStatusSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  status: z.enum(['AUTHORISED', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'CANCELLED', 'RECONCILED']),
  reason: z.string().trim().max(1000).optional(),
  paidAt: z.coerce.date().nullable().optional(),
});
