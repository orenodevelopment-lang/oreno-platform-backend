import type { Request, Response } from 'express';
import type { PayrollPeriodStatus } from '@prisma/client';
import { sendCreated, sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import {
  requestFingerprint,
  requireIdempotencyKey,
  withIdempotency,
} from '../../platform/idempotency/idempotency.service.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './compensation.service.js';
import {
  agreementParamsSchema,
  agreementStatusSchema,
  compensationListQuerySchema,
  createAdjustmentSchema,
  createAgreementSchema,
  createPaymentSchema,
  createPayrollSchema,
  organisationParamsSchema,
  paymentListQuerySchema,
  paymentParamsSchema,
  paymentStatusSchema,
  payrollCommandSchema,
  payrollListQuerySchema,
  payrollParamsSchema,
  updateAgreementSchema,
} from './compensation.schema.js';

export async function listAgreements(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: compensationListQuerySchema,
  });
  const result = await service.listAgreements(requireAuthContext(req), params.organisationId, query);
  sendSuccess(
    res,
    { agreements: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function createAgreement(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createAgreementSchema,
  });
  const result = await withIdempotency(
    {
      scope: `POST:/api/v1/organisations/${params.organisationId}/compensation/agreements`,
      key: requireIdempotencyKey(req),
      requestHash: requestFingerprint(req),
      userId: auth.userId,
      organisationId: params.organisationId,
    },
    async () => {
      const agreement = await service.createAgreement(auth, params.organisationId, body);
      return { data: { agreement }, statusCode: 201, resourceId: agreement.id };
    },
  );
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}

export async function updateAgreement(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: agreementParamsSchema,
    body: updateAgreementSchema,
  });
  sendSuccess(res, {
    agreement: await service.updateAgreement(
      requireAuthContext(req),
      params.organisationId,
      params.agreementId,
      body,
    ),
  });
}

export async function transitionAgreement(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: agreementParamsSchema,
    body: agreementStatusSchema,
  });
  sendSuccess(res, {
    agreement: await service.transitionAgreement(
      requireAuthContext(req),
      params.organisationId,
      params.agreementId,
      body.status,
      body.expectedUpdatedAt,
      body.reason,
    ),
  });
}

export async function createAdjustment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createAdjustmentSchema,
  });
  sendCreated(res, {
    adjustment: await service.createAdjustment(
      requireAuthContext(req),
      params.organisationId,
      body,
    ),
  });
}

export async function listPayroll(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: payrollListQuerySchema,
  });
  const result = await service.listPayroll(requireAuthContext(req), params.organisationId, query);
  sendSuccess(
    res,
    { payrollPeriods: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function createPayroll(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createPayrollSchema,
  });
  sendCreated(res, {
    payrollPeriod: await service.createPayroll(
      requireAuthContext(req),
      params.organisationId,
      body,
    ),
  });
}

export async function calculatePayroll(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: payrollParamsSchema,
    body: payrollCommandSchema,
  });
  sendSuccess(res, {
    payrollPeriod: await service.calculatePayroll(
      requireAuthContext(req),
      params.organisationId,
      params.payrollPeriodId,
      body.expectedUpdatedAt,
    ),
  });
}

async function commandPayroll(
  req: Request,
  res: Response,
  status: PayrollPeriodStatus,
): Promise<void> {
  const { params, body } = validate(req, {
    params: payrollParamsSchema,
    body: payrollCommandSchema,
  });
  sendSuccess(res, {
    payrollPeriod: await service.transitionPayroll(
      requireAuthContext(req),
      params.organisationId,
      params.payrollPeriodId,
      status,
      body.expectedUpdatedAt,
      body.reason,
    ),
  });
}

export const submitPayroll = (req: Request, res: Response) =>
  commandPayroll(req, res, 'PENDING_APPROVAL');
export const approvePayroll = (req: Request, res: Response) =>
  commandPayroll(req, res, 'APPROVED');
export const lockPayroll = (req: Request, res: Response) => commandPayroll(req, res, 'LOCKED');
export const reopenPayroll = (req: Request, res: Response) =>
  commandPayroll(req, res, 'CALCULATED');
export const voidPayroll = (req: Request, res: Response) => commandPayroll(req, res, 'VOID');

export async function listPayments(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: paymentListQuerySchema,
  });
  const result = await service.listPayments(requireAuthContext(req), params.organisationId, query);
  sendSuccess(
    res,
    { payments: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function createPayment(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createPaymentSchema,
  });
  const result = await withIdempotency(
    {
      scope: `POST:/api/v1/organisations/${params.organisationId}/payments`,
      key: requireIdempotencyKey(req),
      requestHash: requestFingerprint(req),
      userId: auth.userId,
      organisationId: params.organisationId,
    },
    async () => {
      const payment = await service.createPayment(auth, params.organisationId, body);
      return { data: { payment }, statusCode: 201, resourceId: payment.id };
    },
  );
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}

export async function transitionPayment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: paymentParamsSchema,
    body: paymentStatusSchema,
  });
  sendSuccess(res, {
    payment: await service.transitionPayment(
      requireAuthContext(req),
      params.organisationId,
      params.paymentId,
      body,
    ),
  });
}

export async function listMyCompensation(req: Request, res: Response): Promise<void> {
  sendSuccess(res, {
    compensation: await service.listMyCompensation(requireAuthContext(req)),
  });
}
