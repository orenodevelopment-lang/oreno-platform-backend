import type { Prisma, ProfileVisibility } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { recordAudit } from '../../platform/audit/audit.service.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import { getStorage } from '../../platform/storage/storage.service.js';
import type { AuthContext } from '../auth/index.js';
import { isTwoFactorEnabled } from '../auth/auth.two-factor.js';
import * as policy from './talent.policy.js';
import * as repository from './talent.repository.js';
import type { DiscoveryQuery, UpdateAvailabilityInput, UpdateProfileInput } from './talent.schema.js';

const JOB_ALERT_EVENT = 'job.match_found';
const APPLICATION_UPDATE_EVENT = EVENT_KEYS.APPLICATION_STATUS_CHANGED;

async function ownProfileOrThrow(userId: string) {
  const profile = await repository.findOwnProfile(userId);
  if (!profile) {
    throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'Your talent profile was not found.');
  }
  return profile;
}

function decimal(value: { toString(): string } | null): string | null {
  return value?.toString() ?? null;
}

async function avatarUrl(fileId: string | null): Promise<string | null> {
  if (!fileId) return null;
  const file = await getPrisma().fileObject.findFirst({
    where: { id: fileId, category: 'PROFILE_PHOTO', status: 'READY' },
    select: { storageKey: true },
  });
  if (!file) return null;
  return getStorage().publicUrl(file.storageKey, 15 * 60);
}

function ownProfileView(profile: Awaited<ReturnType<typeof ownProfileOrThrow>>) {
  return {
    ...profile,
    expectedRateAmount: decimal(profile.expectedRateAmount),
    user: profile.user,
  };
}

export async function getMyProfile(auth: AuthContext) {
  const profile = await ownProfileOrThrow(auth.userId);
  const cvUsages = await getPrisma().fileUsage.findMany({
    where: { resourceType: 'TalentProfile', resourceId: profile.id, field: 'CV' },
    select: {
      id: true,
      createdAt: true,
      file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return {
    ...ownProfileView(profile),
    avatarUrl: await avatarUrl(profile.user.avatarFileId),
    documents: cvUsages.map((usage) => ({
      ...usage,
      file: { ...usage.file, sizeBytes: usage.file.sizeBytes.toString() },
    })),
  };
}

export async function getTalentAccount(auth: AuthContext) {
  const prisma = getPrisma();
  const [user, sessions, profile, preferences] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, email: true, phone: true, emailVerifiedAt: true, status: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.userSession.count({ where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.talentProfile.findUnique({ where: { userId: auth.userId }, select: { id: true, visibility: true } }),
    prisma.notificationPreference.findMany({
      where: { userId: auth.userId, eventKey: { in: [JOB_ALERT_EVENT, APPLICATION_UPDATE_EVENT] } },
      select: { eventKey: true, enabled: true },
    }),
  ]);
  if (!user || !profile) throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'Your talent account was not found.');
  const preferenceMap = new Map(preferences.map((item) => [item.eventKey, item.enabled]));
  const general = await prisma.userPreference.findUnique({ where: { userId: auth.userId } });
  return {
    id: user.id,
    profileId: profile.id,
    email: user.email,
    phone: user.phone,
    emailVerified: user.emailVerifiedAt !== null,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastSignedInAt: user.lastLoginAt?.toISOString() ?? null,
    security: { twoFactorEnabled: await isTwoFactorEnabled(auth.userId), activeSessions: sessions },
    preferences: {
      jobAlerts: preferenceMap.get(JOB_ALERT_EVENT) ?? true,
      applicationUpdates: preferenceMap.get(APPLICATION_UPDATE_EVENT) ?? true,
      profileVisibility: profile.visibility,
      marketingEmails: general?.marketingEmails ?? false,
    },
  };
}

export async function updateAccountPreferences(
  auth: AuthContext,
  input: { jobAlerts?: boolean; applicationUpdates?: boolean; marketingEmails?: boolean },
) {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    if (input.jobAlerts !== undefined) {
      await tx.notificationPreference.upsert({
        where: { userId_eventKey: { userId: auth.userId, eventKey: JOB_ALERT_EVENT } },
        create: { userId: auth.userId, eventKey: JOB_ALERT_EVENT, enabled: input.jobAlerts },
        update: { enabled: input.jobAlerts },
      });
    }
    if (input.applicationUpdates !== undefined) {
      await tx.notificationPreference.upsert({
        where: { userId_eventKey: { userId: auth.userId, eventKey: APPLICATION_UPDATE_EVENT } },
        create: { userId: auth.userId, eventKey: APPLICATION_UPDATE_EVENT, enabled: input.applicationUpdates },
        update: { enabled: input.applicationUpdates },
      });
    }
    if (input.marketingEmails !== undefined) {
      await tx.userPreference.upsert({
        where: { userId: auth.userId },
        create: { userId: auth.userId, marketingEmails: input.marketingEmails },
        update: { marketingEmails: input.marketingEmails },
      });
    }
  });
  return getTalentAccount(auth);
}

async function recalculateCompletion(tx: Prisma.TransactionClient, profileId: string): Promise<number> {
  const profile = await tx.talentProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: {
      headline: true,
      bio: true,
      countryCode: true,
      city: true,
      yearsExperience: true,
      availabilityStatus: true,
      expectedRateAmount: true,
      _count: { select: { experiences: true, education: true, skills: true, portfolioItems: true } },
    },
  });
  const checks = [
    Boolean(profile.headline),
    Boolean(profile.bio),
    Boolean(profile.countryCode && profile.city),
    profile.yearsExperience !== null,
    profile.availabilityStatus !== 'UNAVAILABLE',
    profile.expectedRateAmount !== null,
    profile._count.experiences > 0,
    profile._count.education > 0,
    profile._count.skills >= 3,
    profile._count.portfolioItems > 0,
  ];
  const completionPercent = checks.filter(Boolean).length * 10;
  await tx.talentProfile.update({ where: { id: profileId }, data: { completionPercent } });
  return completionPercent;
}

async function emitProfileUpdated(tx: Prisma.TransactionClient, profileId: string, userId: string) {
  await emitEvent(tx, {
    eventKey: EVENT_KEYS.TALENT_PROFILE_UPDATED,
    aggregateType: 'TalentProfile',
    aggregateId: profileId,
    payload: { talentProfileId: profileId, userId },
  });
}

export async function updateMyProfile(auth: AuthContext, input: UpdateProfileInput) {
  const profile = await ownProfileOrThrow(auth.userId);
  const { expectedUpdatedAt, ...data } = input;
  await getPrisma().$transaction(async (tx) => {
    const changed = await tx.talentProfile.updateMany({
      where: { id: profile.id, userId: auth.userId, updatedAt: expectedUpdatedAt },
      data,
    });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The profile changed. Refresh and try again.');
    await recalculateCompletion(tx, profile.id);
    await emitProfileUpdated(tx, profile.id, auth.userId);
    await recordAudit({ action: 'UPDATE', resourceType: 'TalentProfile', resourceId: profile.id, actorId: auth.userId, summary: 'Talent profile updated', changes: data }, tx);
  });
  return getMyProfile(auth);
}

export async function updateAvailability(auth: AuthContext, input: UpdateAvailabilityInput) {
  const profile = await ownProfileOrThrow(auth.userId);
  const { expectedUpdatedAt, expectedRateAmount, ...data } = input;
  await getPrisma().$transaction(async (tx) => {
    const changed = await tx.talentProfile.updateMany({
      where: { id: profile.id, userId: auth.userId, updatedAt: expectedUpdatedAt },
      data: { ...data, expectedRateAmount },
    });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The profile changed. Refresh and try again.');
    await recalculateCompletion(tx, profile.id);
    await emitProfileUpdated(tx, profile.id, auth.userId);
  });
  return getMyProfile(auth);
}

export async function updateVisibility(
  auth: AuthContext,
  input: { expectedUpdatedAt: Date; visibility: ProfileVisibility },
) {
  const profile = await ownProfileOrThrow(auth.userId);
  await getPrisma().$transaction(async (tx) => {
    const updated = await tx.talentProfile.updateMany({
      where: { id: profile.id, userId: auth.userId, updatedAt: input.expectedUpdatedAt },
      data: { visibility: input.visibility },
    });
    if (!updated.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The profile changed. Refresh and try again.');
    await emitProfileUpdated(tx, profile.id, auth.userId);
  });
  return getMyProfile(auth);
}

export async function completeOnboarding(auth: AuthContext) {
  const profile = await ownProfileOrThrow(auth.userId);
  const completion = await getPrisma().$transaction(async (tx) => recalculateCompletion(tx, profile.id));
  if (completion < 60) {
    throw new UnprocessableError(ErrorCode.TALENT_PROFILE_INCOMPLETE, 'Complete at least 60% of the profile before finishing onboarding.');
  }
  await getPrisma().$transaction(async (tx) => {
    await tx.talentProfile.update({ where: { id: profile.id }, data: { status: 'ACTIVE' } });
    await emitProfileUpdated(tx, profile.id, auth.userId);
  });
  return getMyProfile(auth);
}

type OwnedTable = 'talentExperience' | 'talentEducation' | 'talentCertification' | 'portfolioItem' | 'talentSkill';

async function ensureFile(auth: AuthContext, fileId: string | null | undefined, category: 'CERTIFICATION' | 'PORTFOLIO'): Promise<void> {
  if (!fileId) return;
  const file = await getPrisma().fileObject.findFirst({ where: { id: fileId, ownerId: auth.userId, category, status: 'READY' }, select: { id: true } });
  if (!file) throw new NotFoundError(ErrorCode.FILE_NOT_READY, 'That ready file was not found.');
}

async function afterItemMutation(profileId: string, userId: string): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await recalculateCompletion(tx, profileId);
    await emitProfileUpdated(tx, profileId, userId);
  });
}

export async function createExperience(auth: AuthContext, data: Prisma.TalentExperienceUncheckedCreateWithoutTalentProfileInput) {
  const profile = await ownProfileOrThrow(auth.userId);
  const item = await getPrisma().talentExperience.create({ data: { ...data, talentProfileId: profile.id } });
  await afterItemMutation(profile.id, auth.userId);
  return item;
}
export async function updateExperience(auth: AuthContext, itemId: string, input: Prisma.TalentExperienceUpdateManyMutationInput & { expectedUpdatedAt: Date }) {
  const profile = await ownProfileOrThrow(auth.userId); const { expectedUpdatedAt, ...data } = input;
  const result = await getPrisma().talentExperience.updateMany({ where: { id: itemId, talentProfileId: profile.id, updatedAt: expectedUpdatedAt }, data });
  if (!result.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The experience changed or was not found.');
  await afterItemMutation(profile.id, auth.userId); return getPrisma().talentExperience.findUniqueOrThrow({ where: { id: itemId } });
}
export async function deleteExperience(auth: AuthContext, itemId: string) { return deleteOwnedItem(auth, 'talentExperience', itemId); }

export async function createEducation(auth: AuthContext, data: Prisma.TalentEducationUncheckedCreateWithoutTalentProfileInput) {
  const profile = await ownProfileOrThrow(auth.userId); const item = await getPrisma().talentEducation.create({ data: { ...data, talentProfileId: profile.id } }); await afterItemMutation(profile.id, auth.userId); return item;
}
export async function updateEducation(auth: AuthContext, itemId: string, input: Prisma.TalentEducationUpdateManyMutationInput & { expectedUpdatedAt: Date }) {
  const profile = await ownProfileOrThrow(auth.userId); const { expectedUpdatedAt, ...data } = input; const result = await getPrisma().talentEducation.updateMany({ where: { id: itemId, talentProfileId: profile.id, updatedAt: expectedUpdatedAt }, data }); if (!result.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The education record changed or was not found.'); await afterItemMutation(profile.id, auth.userId); return getPrisma().talentEducation.findUniqueOrThrow({ where: { id: itemId } });
}
export async function deleteEducation(auth: AuthContext, itemId: string) { return deleteOwnedItem(auth, 'talentEducation', itemId); }

export async function createCertification(auth: AuthContext, data: Prisma.TalentCertificationUncheckedCreateWithoutTalentProfileInput) {
  await ensureFile(auth, data.documentFileId, 'CERTIFICATION'); const profile = await ownProfileOrThrow(auth.userId); const item = await getPrisma().talentCertification.create({ data: { ...data, talentProfileId: profile.id } }); await afterItemMutation(profile.id, auth.userId); return item;
}
export async function updateCertification(auth: AuthContext, itemId: string, input: Prisma.TalentCertificationUpdateManyMutationInput & { expectedUpdatedAt: Date; documentFileId?: string | null }) {
  await ensureFile(auth, input.documentFileId, 'CERTIFICATION'); const profile = await ownProfileOrThrow(auth.userId); const { expectedUpdatedAt, ...data } = input; const result = await getPrisma().talentCertification.updateMany({ where: { id: itemId, talentProfileId: profile.id, updatedAt: expectedUpdatedAt }, data }); if (!result.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The certification changed or was not found.'); await afterItemMutation(profile.id, auth.userId); return getPrisma().talentCertification.findUniqueOrThrow({ where: { id: itemId } });
}
export async function deleteCertification(auth: AuthContext, itemId: string) { return deleteOwnedItem(auth, 'talentCertification', itemId); }

export async function createPortfolioItem(auth: AuthContext, data: Prisma.PortfolioItemUncheckedCreateWithoutTalentProfileInput) {
  await ensureFile(auth, data.fileId, 'PORTFOLIO'); const profile = await ownProfileOrThrow(auth.userId); const item = await getPrisma().portfolioItem.create({ data: { ...data, talentProfileId: profile.id } }); await afterItemMutation(profile.id, auth.userId); return item;
}
export async function updatePortfolioItem(auth: AuthContext, itemId: string, input: Prisma.PortfolioItemUpdateManyMutationInput & { expectedUpdatedAt: Date; fileId?: string | null }) {
  await ensureFile(auth, input.fileId, 'PORTFOLIO'); const profile = await ownProfileOrThrow(auth.userId); const { expectedUpdatedAt, ...data } = input; const result = await getPrisma().portfolioItem.updateMany({ where: { id: itemId, talentProfileId: profile.id, updatedAt: expectedUpdatedAt }, data }); if (!result.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The portfolio item changed or was not found.'); await afterItemMutation(profile.id, auth.userId); return getPrisma().portfolioItem.findUniqueOrThrow({ where: { id: itemId } });
}
export async function deletePortfolioItem(auth: AuthContext, itemId: string) { return deleteOwnedItem(auth, 'portfolioItem', itemId); }

export async function createSkill(auth: AuthContext, data: Prisma.TalentSkillUncheckedCreateWithoutTalentProfileInput) {
  const profile = await ownProfileOrThrow(auth.userId); const skill = await getPrisma().skill.findFirst({ where: { id: data.skillId, isApproved: true }, select: { id: true } }); if (!skill) throw new NotFoundError(ErrorCode.SKILL_NOT_FOUND, 'That skill was not found.');
  try { const item = await getPrisma().talentSkill.create({ data: { ...data, talentProfileId: profile.id }, include: { skill: true } }); await getPrisma().skill.update({ where: { id: data.skillId }, data: { usageCount: { increment: 1 } } }); await afterItemMutation(profile.id, auth.userId); return item; } catch (error) { if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new ConflictError(ErrorCode.CONFLICT, 'That skill is already on the profile.'); throw error; }
}
export async function updateSkill(auth: AuthContext, itemId: string, input: Prisma.TalentSkillUpdateManyMutationInput & { expectedUpdatedAt: Date }) {
  const profile = await ownProfileOrThrow(auth.userId); const { expectedUpdatedAt, ...data } = input; const result = await getPrisma().talentSkill.updateMany({ where: { id: itemId, talentProfileId: profile.id, updatedAt: expectedUpdatedAt }, data }); if (!result.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The skill changed or was not found.'); await afterItemMutation(profile.id, auth.userId); return getPrisma().talentSkill.findUniqueOrThrow({ where: { id: itemId }, include: { skill: true } });
}
export async function deleteSkill(auth: AuthContext, itemId: string) { return deleteOwnedItem(auth, 'talentSkill', itemId); }

async function deleteOwnedItem(auth: AuthContext, table: OwnedTable, itemId: string): Promise<void> {
  const profile = await ownProfileOrThrow(auth.userId);
  const prisma = getPrisma();
  let count = 0;
  switch (table) {
    case 'talentExperience': count = (await prisma.talentExperience.deleteMany({ where: { id: itemId, talentProfileId: profile.id } })).count; break;
    case 'talentEducation': count = (await prisma.talentEducation.deleteMany({ where: { id: itemId, talentProfileId: profile.id } })).count; break;
    case 'talentCertification': count = (await prisma.talentCertification.deleteMany({ where: { id: itemId, talentProfileId: profile.id } })).count; break;
    case 'portfolioItem': count = (await prisma.portfolioItem.deleteMany({ where: { id: itemId, talentProfileId: profile.id } })).count; break;
    case 'talentSkill': count = (await prisma.talentSkill.deleteMany({ where: { id: itemId, talentProfileId: profile.id } })).count; break;
  }
  if (!count) throw new NotFoundError(ErrorCode.NOT_FOUND, 'That profile item was not found.');
  await afterItemMutation(profile.id, auth.userId);
}

export async function linkProfileFile(auth: AuthContext, fileId: string, field: 'PROFILE_PHOTO' | 'CV') {
  const profile = await ownProfileOrThrow(auth.userId);
  const file = await getPrisma().fileObject.findFirst({ where: { id: fileId, ownerId: auth.userId, category: field, status: 'READY' }, select: { id: true, originalName: true, status: true } });
  if (!file) throw new NotFoundError(ErrorCode.FILE_NOT_READY, 'That ready file was not found.');
  if (field === 'PROFILE_PHOTO') {
    await getPrisma().user.update({ where: { id: auth.userId }, data: { avatarFileId: fileId } });
  } else {
    await getPrisma().fileUsage.upsert({
      where: { fileId_resourceType_resourceId_field: { fileId, resourceType: 'TalentProfile', resourceId: profile.id, field: 'CV' } },
      create: { fileId, resourceType: 'TalentProfile', resourceId: profile.id, field: 'CV' },
      update: {},
    });
  }
  return file;
}

function publicSelect() {
  return {
    id: true, headline: true, bio: true, countryCode: true, city: true, timeZone: true,
    yearsExperience: true, seniority: true, currentTitle: true, expectedRateAmount: true,
    expectedRateCurrency: true, expectedRateUnit: true, availabilityStatus: true, availableFrom: true,
    preferredEmploymentTypes: true, preferredWorkArrangement: true, hoursPerWeek: true,
    portfolioUrl: true, linkedinUrl: true, githubUrl: true, websiteUrl: true, visibility: true,
    vettingStatus: true, vettingApprovedAt: true, updatedAt: true,
    user: { select: { firstName: true, lastName: true, displayName: true, avatarFileId: true } },
    skills: { select: { proficiency: true, yearsExperience: true, isPrimary: true, skill: { select: { id: true, key: true, name: true } } }, orderBy: { isPrimary: 'desc' as const } },
  } satisfies Prisma.TalentProfileSelect;
}

function discoveryWhere(auth: AuthContext | undefined, query: DiscoveryQuery): Prisma.TalentProfileWhereInput {
  const company = policy.canUseCompanyDiscovery(auth);
  const organisationId = company ? auth?.organisationId : undefined;
  const visible: Prisma.TalentProfileWhereInput[] = [{ visibility: 'PUBLIC' }];
  if (company) visible.push({ visibility: 'ORENO_COMPANIES_ONLY' });
  if (organisationId) {
    visible.push({ applications: { some: { organisationId, screening: { is: { status: 'RELEASED_TO_COMPANY', releasedToCompanyAt: { not: null } } } } } }, { offers: { some: { organisationId } } }, { placements: { some: { organisationId } } }, { staffAssignments: { some: { organisationId } } });
  }
  const skillIds = typeof query.skillIds === 'string' ? [query.skillIds] : query.skillIds;
  return {
    status: 'ACTIVE',
    OR: visible,
    ...(query.q ? { OR: visible.map((visibility) => ({ AND: [visibility, { OR: [{ headline: { contains: query.q, mode: 'insensitive' } }, { currentTitle: { contains: query.q, mode: 'insensitive' } }, { skills: { some: { skill: { name: { contains: query.q, mode: 'insensitive' } } } } }] }] })) } : {}),
    ...(skillIds?.length ? { skills: { some: { skillId: { in: skillIds } } } } : {}),
    ...(query.seniority ? { seniority: query.seniority } : {}),
    ...(query.countryCode ? { countryCode: query.countryCode } : {}),
    ...(query.timeZone ? { timeZone: query.timeZone } : {}),
    ...(query.availabilityStatus ? { availabilityStatus: query.availabilityStatus } : {}),
    ...(query.workArrangement ? { preferredWorkArrangement: query.workArrangement } : {}),
    ...(query.employmentType ? { preferredEmploymentTypes: { has: query.employmentType } } : {}),
    ...(query.currency ? { expectedRateCurrency: query.currency } : {}),
    ...(query.minRate || query.maxRate ? { expectedRateAmount: { ...(query.minRate ? { gte: query.minRate } : {}), ...(query.maxRate ? { lte: query.maxRate } : {}) } } : {}),
  };
}

function discoveryOrder(sort: DiscoveryQuery['sort']): Prisma.TalentProfileOrderByWithRelationInput[] {
  switch (sort) {
    case 'experience_desc': return [{ yearsExperience: 'desc' }, { id: 'asc' }];
    case 'rate_asc': return [{ expectedRateAmount: 'asc' }, { id: 'asc' }];
    case 'rate_desc': return [{ expectedRateAmount: 'desc' }, { id: 'asc' }];
    case 'newest': return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}

type DiscoveryProfile = Prisma.TalentProfileGetPayload<{ select: ReturnType<typeof publicSelect> }>;

async function mapDiscoveryProfile(profile: DiscoveryProfile) {
  return {
    ...profile,
    expectedRateAmount: decimal(profile.expectedRateAmount ?? null),
    avatarUrl: await avatarUrl(profile.user.avatarFileId),
    user: { firstName: profile.user.firstName, lastName: profile.user.lastName, displayName: profile.user.displayName },
  };
}

export async function discover(auth: AuthContext | undefined, query: DiscoveryQuery) {
  const prisma = getPrisma(); const where = discoveryWhere(auth, query); const skip = (query.page - 1) * query.pageSize;
  const [rows, total] = await Promise.all([
    prisma.talentProfile.findMany({ where, select: publicSelect(), orderBy: discoveryOrder(query.sort), skip, take: query.pageSize }),
    prisma.talentProfile.count({ where }),
  ]);
  return { items: await Promise.all(rows.map(mapDiscoveryProfile)), total };
}

export async function getDiscoverableProfile(auth: AuthContext | undefined, profileId: string) {
  const where = { ...discoveryWhere(auth, { page: 1, pageSize: 1, sort: 'newest' }), id: profileId };
  const profile = await getPrisma().talentProfile.findFirst({
    where,
    select: {
      ...publicSelect(),
      experiences: { select: { id: true, title: true, company: true, location: true, employmentType: true, startDate: true, endDate: true, isCurrent: true, description: true }, orderBy: { startDate: 'desc' } },
      education: { select: { id: true, institution: true, degree: true, fieldOfStudy: true, startDate: true, endDate: true, grade: true, description: true }, orderBy: { endDate: 'desc' } },
      certifications: { select: { id: true, name: true, issuer: true, credentialId: true, credentialUrl: true, issuedAt: true, expiresAt: true }, orderBy: { issuedAt: 'desc' } },
      portfolioItems: { select: { id: true, title: true, description: true, category: true, url: true, position: true }, orderBy: { position: 'asc' } },
    },
  });
  if (!profile) throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'That talent profile was not found.');
  return mapDiscoveryProfile(profile);
}

export async function searchSkills(query: { q?: string; category?: string; page: number; pageSize: number }) {
  const where: Prisma.SkillWhereInput = {
    isApproved: true,
    ...(query.category ? { category: { key: query.category } } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { key: { contains: query.q, mode: 'insensitive' } },
            { aliases: { some: { alias: { contains: query.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      select: { id: true, key: true, name: true, description: true, usageCount: true, category: { select: { key: true, name: true } }, aliases: { select: { alias: true } } },
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.skill.count({ where }),
  ]);
  return { items, total };
}

export async function listSkillCategories() {
  return getPrisma().skillCategory.findMany({
    select: { id: true, key: true, name: true, description: true, position: true, _count: { select: { skills: { where: { isApproved: true } } } } },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  });
}
