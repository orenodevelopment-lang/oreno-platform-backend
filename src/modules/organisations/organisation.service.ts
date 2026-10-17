import type { Prisma, RoleKey } from '@prisma/client';
import { loadConfig } from '../../config/index.js';
import { getPrisma } from '../../database/prisma.js';
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { generateToken, hashToken } from '../../common/security/tokens.js';
import { recordAudit } from '../../platform/audit/audit.service.js';
import { stageEmail } from '../../platform/email/email.service.js';
import { EMAIL_TEMPLATES } from '../../platform/email/email.types.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import { invalidateOrganisation, invalidateUser } from '../../platform/rbac/rbac.service.js';
import type { AuthContext } from '../auth/index.js';
import * as policy from './organisation.policy.js';
import * as repository from './organisation.repository.js';
import type {
  CreateAddressInput,
  CreateInvitationInput,
  InvitationListQuery,
  MemberListQuery,
  OnboardingUpdateInput,
  OrganisationUpdateInput,
  UpdateAddressInput,
} from './organisation.schema.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function listMine(auth: AuthContext) {
  return repository.listForUser(auth.userId);
}

export async function getOrganisation(auth: AuthContext, organisationId: string) {
  policy.assertOrganisationAccess(auth, organisationId, 'organisation:read');
  const organisation = await repository.findById(organisationId);
  if (!organisation) {
    throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'That organisation was not found.');
  }
  return organisation;
}

export async function updateOrganisation(
  auth: AuthContext,
  organisationId: string,
  input: OrganisationUpdateInput,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'organisation:update');
  const { expectedUpdatedAt, ...data } = input;
  const prisma = getPrisma();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.organisation.updateMany({
      where: { id: organisationId, updatedAt: expectedUpdatedAt },
      data,
    });
    if (updated.count === 0) {
      const exists = await tx.organisation.count({ where: { id: organisationId } });
      if (!exists) {
        throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'That organisation was not found.');
      }
      throw new ConflictError(
        ErrorCode.STALE_WRITE,
        'The organisation changed since you opened it. Refresh and try again.',
      );
    }
    const organisation = await tx.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: repository.ORGANISATION_VIEW_SELECT,
    });
    await recordAudit(
      {
        action: 'UPDATE',
        resourceType: 'Organisation',
        resourceId: organisationId,
        organisationId,
        actorId: auth.userId,
        summary: 'Organisation profile updated',
        changes: data,
      },
      tx,
    );
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.ORGANISATION_UPDATED,
      aggregateType: 'Organisation',
      aggregateId: organisationId,
      organisationId,
      payload: { organisationId },
    });
    return organisation;
  });
  invalidateOrganisation(organisationId);
  return result;
}

export async function getOnboarding(auth: AuthContext, organisationId: string) {
  policy.assertOrganisationAccess(auth, organisationId, 'organisation:read');
  const result = await getPrisma().organisation.findUnique({
    where: { id: organisationId },
    select: {
      ...repository.ORGANISATION_VIEW_SELECT,
      onboarding: true,
      addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
    },
  });
  if (!result) {
    throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'That organisation was not found.');
  }
  return result;
}

export async function updateOnboarding(
  auth: AuthContext,
  organisationId: string,
  input: OnboardingUpdateInput,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'organisation:manage_settings');
  const prisma = getPrisma();
  const result = await prisma.$transaction(async (tx) => {
    const progress = await tx.onboardingProgress.findUnique({ where: { organisationId } });
    if (!progress) {
      throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'Onboarding was not found.');
    }
    if (progress.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'Onboarding changed. Refresh and try again.');
    }

    const completed = new Set(
      Array.isArray(progress.completedSteps)
        ? progress.completedSteps.filter((item): item is string => typeof item === 'string')
        : [],
    );
    completed.add(input.step);

    let flag: Prisma.OnboardingProgressUpdateInput;
    switch (input.step) {
      case 'PERSONAL': {
        const { step: _step, expectedUpdatedAt: _revision, ...userData } = input;
        await tx.user.update({ where: { id: auth.userId }, data: userData });
        flag = { personalInfoDone: true, currentStep: Math.max(progress.currentStep, 2) };
        break;
      }
      case 'COMPANY': {
        const { step: _step, expectedUpdatedAt: _revision, ...organisationData } = input;
        await tx.organisation.update({ where: { id: organisationId }, data: organisationData });
        flag = { companyInfoDone: true, currentStep: Math.max(progress.currentStep, 3) };
        break;
      }
      case 'MANAGERS':
        flag = { businessInfoDone: true, currentStep: Math.max(progress.currentStep, 4) };
        break;
      case 'ACCOUNTS':
        flag = { accountInfoDone: true, currentStep: Math.max(progress.currentStep, 4) };
        break;
    }

    return tx.onboardingProgress.update({
      where: { organisationId },
      data: { ...flag, completedSteps: [...completed] },
    });
  });
  invalidateUser(auth.userId);
  invalidateOrganisation(organisationId);
  return result;
}

export async function completeOnboarding(auth: AuthContext, organisationId: string) {
  policy.assertOrganisationMutation(auth, organisationId, 'organisation:manage_settings');
  const prisma = getPrisma();
  const result = await prisma.$transaction(async (tx) => {
    const progress = await tx.onboardingProgress.findUnique({ where: { organisationId } });
    if (!progress) {
      throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'Onboarding was not found.');
    }
    if (!progress.personalInfoDone || !progress.companyInfoDone || !progress.accountInfoDone) {
      throw new UnprocessableError(
        ErrorCode.CONFLICT,
        'Complete the personal, company, and accounts steps before finishing onboarding.',
      );
    }
    const completed = await tx.onboardingProgress.update({
      where: { organisationId },
      data: { currentStep: 4, completedAt: progress.completedAt ?? new Date() },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.ORGANISATION_ONBOARDING_COMPLETED,
      aggregateType: 'Organisation',
      aggregateId: organisationId,
      organisationId,
      payload: { organisationId },
    });
    await recordAudit(
      {
        action: 'STATUS_CHANGE',
        resourceType: 'OnboardingProgress',
        resourceId: organisationId,
        organisationId,
        actorId: auth.userId,
        summary: 'Organisation onboarding completed',
      },
      tx,
    );
    return completed;
  });
  return result;
}

export async function listAddresses(auth: AuthContext, organisationId: string) {
  policy.assertOrganisationAccess(auth, organisationId, 'organisation:read');
  return getPrisma().organisationAddress.findMany({
    where: { organisationId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function createAddress(
  auth: AuthContext,
  organisationId: string,
  input: CreateAddressInput,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'organisation:update');
  return getPrisma().$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.organisationAddress.updateMany({
        where: { organisationId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    const address = await tx.organisationAddress.create({ data: { organisationId, ...input } });
    await recordAudit(
      {
        action: 'CREATE',
        resourceType: 'OrganisationAddress',
        resourceId: address.id,
        organisationId,
        actorId: auth.userId,
        summary: 'Organisation address created',
      },
      tx,
    );
    return address;
  });
}

export async function updateAddress(
  auth: AuthContext,
  organisationId: string,
  addressId: string,
  input: UpdateAddressInput,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'organisation:update');
  const { expectedUpdatedAt, ...data } = input;
  return getPrisma().$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.organisationAddress.updateMany({
        where: { organisationId, isPrimary: true, id: { not: addressId } },
        data: { isPrimary: false },
      });
    }
    const updated = await tx.organisationAddress.updateMany({
      where: { id: addressId, organisationId, updatedAt: expectedUpdatedAt },
      data,
    });
    if (!updated.count) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The address changed. Refresh and try again.');
    }
    return tx.organisationAddress.findUniqueOrThrow({ where: { id: addressId } });
  });
}

export async function deleteAddress(
  auth: AuthContext,
  organisationId: string,
  addressId: string,
): Promise<void> {
  policy.assertOrganisationMutation(auth, organisationId, 'organisation:update');
  const deleted = await getPrisma().organisationAddress.deleteMany({
    where: { id: addressId, organisationId, isPrimary: false },
  });
  if (!deleted.count) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'That non-primary address was not found.');
  }
}

export async function getSettings(auth: AuthContext, organisationId: string) {
  policy.assertOrganisationAccess(auth, organisationId, 'organisation:read');
  return getPrisma().organisationSetting.findMany({
    where: { organisationId },
    orderBy: { key: 'asc' },
  });
}

export async function updateSettings(
  auth: AuthContext,
  organisationId: string,
  values: Record<string, unknown>,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'organisation:manage_settings');
  const entries = Object.entries(values);
  await getPrisma().$transaction(async (tx) => {
    for (const [key, value] of entries) {
      const json = (value === undefined ? null : value) as Prisma.InputJsonValue;
      await tx.organisationSetting.upsert({
        where: { organisationId_key: { organisationId, key } },
        create: { organisationId, key, value: json },
        update: { value: json },
      });
    }
    await recordAudit(
      {
        action: 'CONFIGURE',
        resourceType: 'OrganisationSetting',
        organisationId,
        actorId: auth.userId,
        summary: 'Organisation settings updated',
        changes: Object.fromEntries(entries.map(([key]) => [key, { updated: true }])),
      },
      tx,
    );
  });
  return getSettings(auth, organisationId);
}

export async function listMembers(
  auth: AuthContext,
  organisationId: string,
  query: MemberListQuery,
) {
  policy.assertOrganisationAccess(auth, organisationId, 'membership:read');
  const where: Prisma.OrganisationMembershipWhereInput = {
    organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { role: { key: query.role } } : {}),
    ...(query.q
      ? {
          user: {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };
  const skip = (query.page - 1) * query.pageSize;
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.organisationMembership.findMany({
      where,
      select: {
        id: true,
        status: true,
        scopedDepartmentIds: true,
        joinedAt: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { key: true, name: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            email: true,
            avatarFileId: true,
            jobTitle: true,
          },
        },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      skip,
      take: query.pageSize,
    }),
    prisma.organisationMembership.count({ where }),
  ]);
  return { items, total };
}

async function roleId(role: RoleKey): Promise<string> {
  const record = await getPrisma().role.findFirst({
    where: { key: role, scope: 'ORGANISATION' },
    select: { id: true },
  });
  if (!record) throw new NotFoundError(ErrorCode.ROLE_NOT_FOUND, 'That role was not found.');
  return record.id;
}

export async function changeMemberRole(
  auth: AuthContext,
  organisationId: string,
  membershipId: string,
  role: RoleKey,
  expectedUpdatedAt: Date,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'membership:update_role');
  const current = await getPrisma().organisationMembership.findFirst({
    where: { id: membershipId, organisationId },
    include: { role: { select: { key: true } } },
  });
  if (!current) throw new NotFoundError(ErrorCode.MEMBERSHIP_NOT_FOUND, 'That member was not found.');
  if (current.role.key === 'COMPANY_OWNER' && role !== 'COMPANY_OWNER') {
    if ((await repository.countActiveOwners(organisationId)) <= 1) {
      throw new ConflictError(ErrorCode.LAST_OWNER_REQUIRED, 'An organisation must retain an active owner.');
    }
  }
  const nextRoleId = await roleId(role);
  const updated = await getPrisma().organisationMembership.updateMany({
    where: { id: membershipId, organisationId, updatedAt: expectedUpdatedAt },
    data: { roleId: nextRoleId },
  });
  if (!updated.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The membership changed. Refresh and try again.');
  invalidateUser(current.userId);
  invalidateOrganisation(organisationId);
  return getPrisma().organisationMembership.findUnique({
    where: { id: membershipId },
    include: { role: { select: { key: true, name: true } }, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
}

export async function setMemberStatus(
  auth: AuthContext,
  organisationId: string,
  membershipId: string,
  command: 'SUSPEND' | 'REACTIVATE' | 'REVOKE',
  expectedUpdatedAt: Date,
  reason?: string,
) {
  const permission = command === 'REVOKE' ? 'membership:revoke' : 'membership:suspend';
  policy.assertOrganisationMutation(auth, organisationId, permission);
  const current = await getPrisma().organisationMembership.findFirst({
    where: { id: membershipId, organisationId },
    include: { role: { select: { key: true } } },
  });
  if (!current) throw new NotFoundError(ErrorCode.MEMBERSHIP_NOT_FOUND, 'That member was not found.');
  policy.assertNotSelfMembership(auth, current.userId);
  if (current.role.key === 'COMPANY_OWNER' && current.status === 'ACTIVE' && command !== 'REACTIVATE') {
    if ((await repository.countActiveOwners(organisationId)) <= 1) {
      throw new ConflictError(ErrorCode.LAST_OWNER_REQUIRED, 'An organisation must retain an active owner.');
    }
  }
  const data: Prisma.OrganisationMembershipUpdateManyMutationInput =
    command === 'SUSPEND'
      ? { status: 'SUSPENDED', suspendedAt: new Date(), revokedAt: null, revokedReason: null }
      : command === 'REVOKE'
        ? { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason ?? null }
        : { status: 'ACTIVE', suspendedAt: null, revokedAt: null, revokedReason: null };
  const updated = await getPrisma().organisationMembership.updateMany({
    where: { id: membershipId, organisationId, updatedAt: expectedUpdatedAt },
    data,
  });
  if (!updated.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The membership changed. Refresh and try again.');
  invalidateUser(current.userId);
  invalidateOrganisation(organisationId);
  return getPrisma().organisationMembership.findUniqueOrThrow({ where: { id: membershipId } });
}

export async function createInvitation(
  auth: AuthContext,
  organisationId: string,
  input: CreateInvitationInput,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'membership:invite');
  const prisma = getPrisma();
  const [organisation, inviter, targetRole] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: auth.userId }, select: { firstName: true, lastName: true } }),
    prisma.role.findFirst({ where: { key: input.role, scope: 'ORGANISATION' }, select: { id: true, name: true } }),
  ]);
  if (!organisation) throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'That organisation was not found.');
  if (!inviter || !targetRole) throw new NotFoundError(ErrorCode.ROLE_NOT_FOUND, 'That role was not found.');

  const existingMember = await prisma.organisationMembership.findFirst({
    where: { organisationId, user: { email: input.email }, status: { not: 'REVOKED' } },
  });
  if (existingMember) {
    throw new ConflictError(ErrorCode.MEMBERSHIP_ALREADY_EXISTS, 'That person already belongs to this organisation.');
  }

  const pending = await prisma.invitation.findFirst({
    where: { organisationId, email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (pending) {
    throw new ConflictError(ErrorCode.INVITATION_ALREADY_PENDING, 'An active invitation already exists for this email.');
  }

  const { token, hash } = generateToken(32);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const invitationUrl = `${loadConfig().appUrl.replace(/\/$/, '')}/auth/accept-invitation?token=${encodeURIComponent(token)}`;
  const invitation = await prisma.$transaction(async (tx) => {
    const existing = await tx.invitation.findUnique({
      where: { organisationId_email_roleId: { organisationId, email: input.email, roleId: targetRole.id } },
    });
    const record = existing
      ? await tx.invitation.update({
          where: { id: existing.id },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            tokenHash: hash,
            invitedById: auth.userId,
            message: input.message ?? null,
            expiresAt,
            acceptedAt: null,
            revokedAt: null,
            revokedReason: null,
            reminderCount: 0,
            lastRemindedAt: null,
          },
        })
      : await tx.invitation.create({
          data: {
            organisationId,
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            roleId: targetRole.id,
            tokenHash: hash,
            invitedById: auth.userId,
            message: input.message ?? null,
            expiresAt,
          },
        });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.INVITATION_CREATED,
      aggregateType: 'Invitation',
      aggregateId: record.id,
      organisationId,
      payload: { invitationId: record.id, organisationId },
    });
    await stageEmail(tx, {
      to: input.email,
      toName: input.firstName,
      template: EMAIL_TEMPLATES.ORGANISATION_INVITATION,
      variables: {
        inviterName: `${inviter.firstName} ${inviter.lastName}`,
        organisationName: organisation.name,
        roleName: targetRole.name,
        message: input.message ?? '',
        expiresAt: expiresAt.toISOString(),
        invitationUrl,
      },
      organisationId,
      dedupeKey: `invitation:${hash}`,
    });
    return record;
  });
  return invitation;
}

export async function listInvitations(
  auth: AuthContext,
  organisationId: string,
  query: InvitationListQuery,
) {
  policy.assertOrganisationAccess(auth, organisationId, 'membership:read');
  const now = new Date();
  const where: Prisma.InvitationWhereInput = {
    organisationId,
    ...(query.state === 'PENDING' ? { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } : {}),
    ...(query.state === 'ACCEPTED' ? { acceptedAt: { not: null } } : {}),
    ...(query.state === 'REVOKED' ? { revokedAt: { not: null } } : {}),
    ...(query.state === 'EXPIRED' ? { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } } : {}),
  };
  const skip = (query.page - 1) * query.pageSize;
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.invitation.findMany({
      where,
      select: { id: true, email: true, firstName: true, lastName: true, message: true, expiresAt: true, acceptedAt: true, revokedAt: true, reminderCount: true, createdAt: true, role: { select: { key: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.pageSize,
    }),
    prisma.invitation.count({ where }),
  ]);
  return { items, total };
}

export async function revokeInvitation(
  auth: AuthContext,
  organisationId: string,
  invitationId: string,
  reason: string,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'membership:revoke_invitation');
  const invitation = await getPrisma().invitation.findFirst({
    where: { id: invitationId, organisationId },
  });
  if (!invitation) throw new NotFoundError(ErrorCode.INVITATION_NOT_FOUND, 'That invitation was not found.');
  if (invitation.acceptedAt) throw new ConflictError(ErrorCode.INVITATION_ALREADY_ACCEPTED, 'That invitation was already accepted.');
  if (invitation.revokedAt) return invitation;
  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.INVITATION_REVOKED,
      aggregateType: 'Invitation',
      aggregateId: invitationId,
      organisationId,
      payload: { invitationId, organisationId },
    });
    return updated;
  });
}

export async function resendInvitation(
  auth: AuthContext,
  organisationId: string,
  invitationId: string,
  reason: string,
) {
  policy.assertOrganisationMutation(auth, organisationId, 'membership:invite');
  const current = await getPrisma().invitation.findFirst({
    where: { id: invitationId, organisationId },
    include: {
      organisation: { select: { name: true } },
      role: { select: { name: true } },
      invitedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!current || current.revokedAt) throw new NotFoundError(ErrorCode.INVITATION_NOT_FOUND, 'That invitation was not found.');
  if (current.acceptedAt) throw new ConflictError(ErrorCode.INVITATION_ALREADY_ACCEPTED, 'That invitation was already accepted.');
  const generated = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const invitationUrl = `${loadConfig().appUrl.replace(/\/$/, '')}/auth/accept-invitation?token=${encodeURIComponent(generated.token)}`;
  const updated = await getPrisma().$transaction(async (tx) => {
    const invitation = await tx.invitation.update({ where: { id: current.id }, data: { tokenHash: generated.hash, expiresAt, reminderCount: { increment: 1 }, lastRemindedAt: new Date() } });
    await recordAudit({ action: 'UPDATE', resourceType: 'Invitation', resourceId: current.id, organisationId, summary: 'Resent organisation invitation', reason }, tx);
    await stageEmail(tx, { to: current.email, toName: current.firstName, template: EMAIL_TEMPLATES.INVITATION_REMINDER, variables: { organisationName: current.organisation.name, expiresAt: expiresAt.toISOString(), invitationUrl }, organisationId, dedupeKey: `invitation-reminder:${generated.hash}` });
    return invitation;
  });
  return updated;
}

export async function listOrganisationRoles(auth: AuthContext, organisationId: string) {
  policy.assertOrganisationAccess(auth, organisationId, 'role:read');
  return getPrisma().role.findMany({
    where: { scope: 'ORGANISATION' },
    select: { key: true, name: true, description: true, permissions: { select: { permission: { select: { key: true, resource: true, action: true, description: true } } } } },
    orderBy: { key: 'asc' },
  });
}

export async function previewInvitation(token: string) {
  const invitation = await getPrisma().invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      message: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organisation: { select: { id: true, name: true, logoFileId: true } },
      role: { select: { key: true, name: true } },
    },
  });
  if (!invitation || invitation.revokedAt) {
    throw new NotFoundError(ErrorCode.INVITATION_NOT_FOUND, 'That invitation was not found.');
  }
  if (invitation.expiresAt <= new Date()) {
    throw new UnprocessableError(ErrorCode.INVITATION_EXPIRED, 'That invitation has expired.');
  }
  return invitation;
}

export async function acceptInvitation(auth: AuthContext, token: string) {
  const prisma = getPrisma();
  const tokenHash = hashToken(token);
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { email: true } });
  if (!user) throw new NotFoundError(ErrorCode.NOT_FOUND, 'That user was not found.');
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { role: { select: { id: true, key: true } } },
  });
  if (!invitation || invitation.revokedAt) throw new NotFoundError(ErrorCode.INVITATION_NOT_FOUND, 'That invitation was not found.');
  if (invitation.acceptedAt) throw new ConflictError(ErrorCode.INVITATION_ALREADY_ACCEPTED, 'That invitation was already accepted.');
  if (invitation.expiresAt <= new Date()) throw new UnprocessableError(ErrorCode.INVITATION_EXPIRED, 'That invitation has expired.');
  if (invitation.email !== user.email.toLowerCase()) {
    throw new UnprocessableError(ErrorCode.INVITATION_EMAIL_MISMATCH, 'Sign in with the email address that received this invitation.');
  }

  const membership = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (!claimed.count) throw new ConflictError(ErrorCode.INVITATION_ALREADY_ACCEPTED, 'That invitation is no longer available.');
    const existing = await tx.organisationMembership.findUnique({
      where: { organisationId_userId: { organisationId: invitation.organisationId, userId: auth.userId } },
    });
    const record = existing
      ? await tx.organisationMembership.update({
          where: { id: existing.id },
          data: { roleId: invitation.role.id, status: 'ACTIVE', joinedAt: new Date(), invitedById: invitation.invitedById, suspendedAt: null, revokedAt: null, revokedReason: null },
        })
      : await tx.organisationMembership.create({
          data: { organisationId: invitation.organisationId, userId: auth.userId, roleId: invitation.role.id, status: 'ACTIVE', joinedAt: new Date(), invitedById: invitation.invitedById },
        });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.INVITATION_ACCEPTED,
      aggregateType: 'Invitation',
      aggregateId: invitation.id,
      organisationId: invitation.organisationId,
      payload: { invitationId: invitation.id, organisationId: invitation.organisationId, membershipId: record.id, userId: auth.userId },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.MEMBERSHIP_GRANTED,
      aggregateType: 'OrganisationMembership',
      aggregateId: record.id,
      organisationId: invitation.organisationId,
      payload: { membershipId: record.id, organisationId: invitation.organisationId, userId: auth.userId },
    });
    return record;
  });
  invalidateUser(auth.userId);
  invalidateOrganisation(invitation.organisationId);
  return membership;
}
