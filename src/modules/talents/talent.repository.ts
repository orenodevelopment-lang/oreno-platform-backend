import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';

export const OWN_PROFILE_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatarFileId: true,
      timeZone: true,
      countryCode: true,
    },
  },
  experiences: { orderBy: [{ startDate: 'desc' as const }, { createdAt: 'desc' as const }] },
  education: { orderBy: [{ endDate: 'desc' as const }, { createdAt: 'desc' as const }] },
  certifications: { orderBy: { issuedAt: 'desc' as const } },
  portfolioItems: { orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] },
  skills: {
    include: { skill: { include: { category: { select: { key: true, name: true } } } } },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.TalentProfileInclude;

export async function findOwnProfile(userId: string) {
  return getPrisma().talentProfile.findUnique({
    where: { userId },
    include: OWN_PROFILE_INCLUDE,
  });
}

export async function findProfileOwner(profileId: string) {
  return getPrisma().talentProfile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true },
  });
}
