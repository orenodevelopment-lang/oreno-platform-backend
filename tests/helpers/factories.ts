import { randomUUID } from 'node:crypto';
import type { RoleKey } from '@prisma/client';
import { getPrisma } from '../../src/database/prisma.js';
import type { AuthContext } from '../../src/modules/auth/index.js';

export function suffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

export function authContext(
  userId: string,
  overrides: Partial<AuthContext> = {},
): AuthContext {
  return {
    userId,
    method: 'session',
    isPlatformAdmin: false,
    platformRoles: [],
    platformPermissions: new Set(),
    organisationPermissions: new Set(),
    scopedDepartmentIds: [],
    ...overrides,
  };
}

export async function createTestUser(label = 'user') {
  const id = suffix();
  return getPrisma().user.create({
    data: {
      email: `${label}-${id}@example.test`,
      firstName: 'Test',
      lastName: label,
      phone: '+2348000000000',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
}

export async function createTestOrganisation(label = 'organisation') {
  const id = suffix();
  return getPrisma().organisation.create({
    data: {
      name: `${label} ${id}`,
      slug: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id}`,
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
    },
  });
}

export async function ensureOrganisationRole(key: RoleKey) {
  return getPrisma().role.upsert({
    where: { key },
    update: {},
    create: {
      key,
      scope: 'ORGANISATION',
      name: `Test ${key}`,
      description: 'Created by the integration-test fixture.',
      isSystem: true,
    },
  });
}

export async function createStaffFixture(input: {
  organisationId: string;
  creatorId: string;
  employeeCode?: string;
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ENDED';
}) {
  const id = suffix();
  const prisma = getPrisma();
  const user = await createTestUser(`staff-${id}`);
  const profile = await prisma.talentProfile.create({
    data: { userId: user.id, status: 'ACTIVE', visibility: 'PRIVATE' },
  });
  const job = await prisma.job.create({
    data: {
      organisationId: input.organisationId,
      reference: `ORJ-${id}`,
      title: 'Integration role',
      slug: `integration-role-${id}`,
      status: 'PUBLISHED',
      moderationStatus: 'APPROVED',
      employmentType: 'FULL_TIME',
      workArrangement: 'REMOTE',
      description: 'Integration test role.',
      publishedAt: new Date(),
    },
  });
  const application = await prisma.application.create({
    data: {
      organisationId: input.organisationId,
      jobId: job.id,
      talentProfileId: profile.id,
      status: 'ACCEPTED',
    },
  });
  const offer = await prisma.offer.create({
    data: {
      organisationId: input.organisationId,
      jobId: job.id,
      applicationId: application.id,
      talentProfileId: profile.id,
      status: 'ACCEPTED',
      reference: `ORO-${id}`,
      title: job.title,
      employmentType: 'FULL_TIME',
      workArrangement: 'REMOTE',
      startDate: new Date(Date.now() - 86_400_000),
      createdById: input.creatorId,
    },
  });
  const placement = await prisma.placement.create({
    data: {
      organisationId: input.organisationId,
      offerId: offer.id,
      jobId: job.id,
      talentProfileId: profile.id,
      status: 'ACTIVE',
      reference: `ORP-${id}`,
      title: job.title,
      startDate: new Date(Date.now() - 86_400_000),
    },
  });
  const staffAssignment = await prisma.staffAssignment.create({
    data: {
      organisationId: input.organisationId,
      placementId: placement.id,
      talentProfileId: profile.id,
      employeeCode: input.employeeCode ?? `EMP-${id}`,
      status: input.status ?? 'ACTIVE',
      jobTitle: job.title,
      employmentType: 'FULL_TIME',
      workArrangement: 'REMOTE',
      effectiveFrom: new Date(Date.now() - 86_400_000),
    },
  });
  return { user, profile, job, application, offer, placement, staffAssignment };
}
