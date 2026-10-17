import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './compensation.controller.js';

export function createOrganisationCompensationRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get(
    '/compensation/agreements',
    authenticate(),
    asyncHandler(controller.listAgreements),
  );
  router.post(
    '/compensation/agreements',
    authenticate(),
    asyncHandler(controller.createAgreement),
  );
  router.patch(
    '/compensation/agreements/:agreementId',
    authenticate(),
    asyncHandler(controller.updateAgreement),
  );
  router.post(
    '/compensation/agreements/:agreementId/status',
    authenticate(),
    asyncHandler(controller.transitionAgreement),
  );
  router.post(
    '/compensation/adjustments',
    authenticate(),
    asyncHandler(controller.createAdjustment),
  );
  router.get('/payroll', authenticate(), asyncHandler(controller.listPayroll));
  router.post('/payroll', authenticate(), asyncHandler(controller.createPayroll));
  router.post(
    '/payroll/:payrollPeriodId/calculate',
    authenticate(),
    asyncHandler(controller.calculatePayroll),
  );
  router.post(
    '/payroll/:payrollPeriodId/submit',
    authenticate(),
    asyncHandler(controller.submitPayroll),
  );
  router.post(
    '/payroll/:payrollPeriodId/approve',
    authenticate(),
    asyncHandler(controller.approvePayroll),
  );
  router.post(
    '/payroll/:payrollPeriodId/lock',
    authenticate(),
    asyncHandler(controller.lockPayroll),
  );
  router.post(
    '/payroll/:payrollPeriodId/reopen',
    authenticate(),
    asyncHandler(controller.reopenPayroll),
  );
  router.post(
    '/payroll/:payrollPeriodId/void',
    authenticate(),
    asyncHandler(controller.voidPayroll),
  );
  router.get('/payments', authenticate(), asyncHandler(controller.listPayments));
  router.post('/payments', authenticate(), asyncHandler(controller.createPayment));
  router.post(
    '/payments/:paymentId/status',
    authenticate(),
    asyncHandler(controller.transitionPayment),
  );
  return router;
}

export function createTalentCompensationRouter(): Router {
  const router = Router();
  router.get('/compensation', authenticate(), asyncHandler(controller.listMyCompensation));
  return router;
}
