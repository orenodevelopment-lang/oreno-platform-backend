import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';

export const ORGANISATION_VIEW_SELECT = {
  id: true,
  name: true,
  slug: true,
  legalName: true,
  status: true,
  verificationStatus: true,
  industry: true,
  companySize: true,
  websiteUrl: true,
  description: true,
  primaryContactName: true,
  primaryContactEmail: true,
  primaryContactPhone: true,
  logoFileId: true,
  timeZone: true,
  countryCode: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganisationSelect;

export async function listForUser(userId: string) {
  return getPrisma().organisationMembership.findMany({
    where: { userId, status: { not: 'REVOKED' } },
    select: {
      id: true,
      status: true,
      joinedAt: true,
      role: { select: { key: true, name: true } },
      organisation: { select: ORGANISATION_VIEW_SELECT },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findById(organisationId: string) {
  return getPrisma().organisation.findUnique({
    where: { id: organisationId },
    select: ORGANISATION_VIEW_SELECT,
  });
}

export async function countActiveOwners(organisationId: string): Promise<number> {
  return getPrisma().organisationMembership.count({
    where: { organisationId, status: 'ACTIVE', role: { key: 'COMPANY_OWNER' } },
  });
}
