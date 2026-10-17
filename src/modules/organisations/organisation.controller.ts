import type { Request, Response } from 'express';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/http/response.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './organisation.service.js';
import {
  addressParamsSchema,
  changeMemberRoleSchema,
  createAddressSchema,
  createInvitationSchema,
  invitationListQuerySchema,
  invitationParamsSchema,
  invitationTokenParamsSchema,
  memberListQuerySchema,
  memberParamsSchema,
  memberReasonSchema,
  onboardingUpdateSchema,
  organisationParamsSchema,
  organisationUpdateSchema,
  reactivateMemberSchema,
  resendInvitationSchema,
  revokeInvitationSchema,
  settingsUpdateSchema,
  updateAddressSchema,
} from './organisation.schema.js';

export async function listMine(req: Request, res: Response): Promise<void> {
  sendSuccess(res, { organisations: await service.listMine(requireAuthContext(req)) });
}

export async function getOrganisation(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationParamsSchema });
  sendSuccess(res, { organisation: await service.getOrganisation(requireAuthContext(req), params.organisationId) });
}

export async function updateOrganisation(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationParamsSchema, body: organisationUpdateSchema });
  sendSuccess(res, { organisation: await service.updateOrganisation(requireAuthContext(req), params.organisationId, body) });
}

export async function getOnboarding(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationParamsSchema });
  sendSuccess(res, { onboarding: await service.getOnboarding(requireAuthContext(req), params.organisationId) });
}

export async function updateOnboarding(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationParamsSchema, body: onboardingUpdateSchema });
  sendSuccess(res, { onboarding: await service.updateOnboarding(requireAuthContext(req), params.organisationId, body) });
}

export async function completeOnboarding(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationParamsSchema });
  sendSuccess(res, { onboarding: await service.completeOnboarding(requireAuthContext(req), params.organisationId) });
}

export async function listAddresses(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationParamsSchema });
  sendSuccess(res, { addresses: await service.listAddresses(requireAuthContext(req), params.organisationId) });
}

export async function createAddress(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationParamsSchema, body: createAddressSchema });
  const address = await service.createAddress(requireAuthContext(req), params.organisationId, body);
  sendCreated(res, { address }, { location: `/api/v1/organisations/${params.organisationId}/addresses/${address.id}` });
}

export async function updateAddress(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: addressParamsSchema, body: updateAddressSchema });
  sendSuccess(res, { address: await service.updateAddress(requireAuthContext(req), params.organisationId, params.addressId, body) });
}

export async function deleteAddress(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: addressParamsSchema });
  await service.deleteAddress(requireAuthContext(req), params.organisationId, params.addressId);
  sendNoContent(res);
}

export async function getSettings(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationParamsSchema });
  sendSuccess(res, { settings: await service.getSettings(requireAuthContext(req), params.organisationId) });
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationParamsSchema, body: settingsUpdateSchema });
  sendSuccess(res, { settings: await service.updateSettings(requireAuthContext(req), params.organisationId, body.settings) });
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, { params: organisationParamsSchema, query: memberListQuerySchema });
  const result = await service.listMembers(requireAuthContext(req), params.organisationId, query);
  sendSuccess(res, { members: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function changeMemberRole(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: memberParamsSchema, body: changeMemberRoleSchema });
  sendSuccess(res, { member: await service.changeMemberRole(requireAuthContext(req), params.organisationId, params.membershipId, body.role, body.expectedUpdatedAt) });
}

export async function suspendMember(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: memberParamsSchema, body: memberReasonSchema });
  sendSuccess(res, { member: await service.setMemberStatus(requireAuthContext(req), params.organisationId, params.membershipId, 'SUSPEND', body.expectedUpdatedAt, body.reason) });
}

export async function reactivateMember(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: memberParamsSchema, body: reactivateMemberSchema });
  sendSuccess(res, { member: await service.setMemberStatus(requireAuthContext(req), params.organisationId, params.membershipId, 'REACTIVATE', body.expectedUpdatedAt) });
}

export async function revokeMember(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: memberParamsSchema, body: memberReasonSchema });
  sendSuccess(res, { member: await service.setMemberStatus(requireAuthContext(req), params.organisationId, params.membershipId, 'REVOKE', body.expectedUpdatedAt, body.reason) });
}

export async function createInvitation(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationParamsSchema, body: createInvitationSchema });
  const invitation = await service.createInvitation(requireAuthContext(req), params.organisationId, body);
  sendCreated(res, { invitation }, { location: `/api/v1/organisations/${params.organisationId}/invitations/${invitation.id}` });
}

export async function listInvitations(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, { params: organisationParamsSchema, query: invitationListQuerySchema });
  const result = await service.listInvitations(requireAuthContext(req), params.organisationId, query);
  sendSuccess(res, { invitations: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function revokeInvitation(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: invitationParamsSchema, body: revokeInvitationSchema });
  sendSuccess(res, { invitation: await service.revokeInvitation(requireAuthContext(req), params.organisationId, params.invitationId, body.reason) });
}

export async function resendInvitation(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: invitationParamsSchema, body: resendInvitationSchema });
  sendSuccess(res, { invitation: await service.resendInvitation(requireAuthContext(req), params.organisationId, params.invitationId, body.reason) });
}

export async function listRoles(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationParamsSchema });
  sendSuccess(res, { roles: await service.listOrganisationRoles(requireAuthContext(req), params.organisationId) });
}

export async function previewInvitation(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: invitationTokenParamsSchema });
  sendSuccess(res, { invitation: await service.previewInvitation(params.token) });
}

export async function acceptInvitation(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: invitationTokenParamsSchema });
  sendSuccess(res, { membership: await service.acceptInvitation(requireAuthContext(req), params.token) });
}
