import type { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as admin from './admin.service.js';
import * as config from './admin.config.service.js';
import * as review from './admin.review.service.js';
import {
  announcementSchema, applicationReviewQuery, auditQuery, featureFlagSchema, idParams, leadListQuery, leadParams,
  leadStatusCommand, moderationCommand, operationsQuery, organisationListQuery,
  organisationStatusCommand, organisationVerificationCommand, paymentReviewQuery, placementReviewQuery, policySchema, payrollReviewQuery, roleCommand, userListQuery, userStatusCommand,
} from './admin.schema.js';

export async function users(req: Request, res: Response) {
  const { query } = validate(req, { query: userListQuery });
  const result = await admin.listUsers(requireAuthContext(req), query);
  sendSuccess(res, { users: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}
export async function userStatus(req: Request, res: Response) {
  const { params, body } = validate(req, { params: idParams, body: userStatusCommand });
  sendSuccess(res, { user: await admin.updateUserStatus(requireAuthContext(req), params.id, body.status, body.expectedUpdatedAt, body.reason) });
}
export async function userDetail(req: Request, res: Response) { const { params } = validate(req, { params: idParams }); sendSuccess(res, { user: await review.getUser(requireAuthContext(req), params.id) }); }
export async function organisations(req: Request, res: Response) {
  const { query } = validate(req, { query: organisationListQuery });
  const result = await admin.listOrganisations(requireAuthContext(req), query);
  sendSuccess(res, { organisations: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}
export async function organisationStatus(req: Request, res: Response) {
  const { params, body } = validate(req, { params: idParams, body: organisationStatusCommand });
  sendSuccess(res, { organisation: await admin.updateOrganisationStatus(requireAuthContext(req), params.id, body.status, body.expectedUpdatedAt, body.reason) });
}
export async function organisationVerification(req: Request, res: Response) {
  const { params, body } = validate(req, { params: idParams, body: organisationVerificationCommand });
  sendSuccess(res, { organisation: await admin.updateOrganisationVerification(requireAuthContext(req), params.id, body.status, body.expectedUpdatedAt, body.reason) });
}
export async function organisationDetail(req: Request, res: Response) { const { params } = validate(req, { params: idParams }); sendSuccess(res, { organisation: await review.getOrganisation(requireAuthContext(req), params.id) }); }
export async function moderate(req: Request, res: Response) { const { params, body } = validate(req, { params: idParams, body: moderationCommand }); sendSuccess(res, { job: await admin.moderateJob(requireAuthContext(req), params.id, body.status, body.expectedUpdatedAt, body.reason) }); }
export async function roles(req: Request, res: Response) { sendSuccess(res, { roles: await admin.roles(requireAuthContext(req)) }); }
export async function grantRole(req: Request, res: Response) { const { body } = validate(req, { body: roleCommand }); sendCreated(res, { assignment: await admin.grantRole(requireAuthContext(req), body.userId, body.roleKey, body.reason) }); }
export async function revokeRole(req: Request, res: Response) { const { body } = validate(req, { body: roleCommand }); sendSuccess(res, { assignment: await admin.revokeRole(requireAuthContext(req), body.userId, body.roleKey, body.reason) }); }
export async function leads(req: Request, res: Response) { const { params, query } = validate(req, { params: leadParams.pick({ kind: true }), query: leadListQuery }); const result = await admin.listLeads(requireAuthContext(req), params.kind, query); sendSuccess(res, { leads: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function leadUpdate(req: Request, res: Response) { const { params, body } = validate(req, { params: leadParams, body: leadStatusCommand }); sendSuccess(res, { lead: await admin.updateLead(requireAuthContext(req), params.kind, params.id, body.status, body.assignedToId, body.reason) }); }
export async function audit(req: Request, res: Response) { const { query } = validate(req, { query: auditQuery }); const result = await admin.audit(requireAuthContext(req), query); sendSuccess(res, { events: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function configuration(req: Request, res: Response) { sendSuccess(res, await config.listConfiguration(requireAuthContext(req))); }
export async function flag(req: Request, res: Response) { const { body } = validate(req, { body: featureFlagSchema }); sendSuccess(res, { featureFlag: await config.setFeatureFlag(requireAuthContext(req), body) }); }
export async function policy(req: Request, res: Response) { const { body } = validate(req, { body: policySchema }); sendSuccess(res, { policy: await config.setPolicy(requireAuthContext(req), body) }); }
export async function announcement(req: Request, res: Response) { const { body } = validate(req, { body: announcementSchema }); sendCreated(res, { announcement: await config.createAnnouncement(requireAuthContext(req), body) }); }
export async function operations(req: Request, res: Response) { const { query } = validate(req, { query: operationsQuery }); const result = await config.operations(requireAuthContext(req), query); sendSuccess(res, { outcomes: result.outcomes, queues: result.queues, failures: result.failures }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function retry(req: Request, res: Response) { const { params, body } = validate(req, { params: idParams, body: userStatusCommand.pick({ reason: true }) }); sendSuccess(res, { job: await config.retryJob(requireAuthContext(req), params.id, body.reason) }); }
export async function applicationReviews(req: Request, res: Response) { const { query } = validate(req, { query: applicationReviewQuery }); const result = await review.applications(requireAuthContext(req), query); sendSuccess(res, { applications: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function placementReviews(req: Request, res: Response) { const { query } = validate(req, { query: placementReviewQuery }); const result = await review.placements(requireAuthContext(req), query); sendSuccess(res, { placements: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function payrollReviews(req: Request, res: Response) { const { query } = validate(req, { query: payrollReviewQuery }); const result = await review.payroll(requireAuthContext(req), query); sendSuccess(res, { payrollPeriods: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function paymentReviews(req: Request, res: Response) { const { query } = validate(req, { query: paymentReviewQuery }); const result = await review.payments(requireAuthContext(req), query); sendSuccess(res, { payments: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
