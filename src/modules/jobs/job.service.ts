import { randomUUID } from 'node:crypto';
import type { ApplicationStatus, JobStatus, Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { recordAudit } from '../../platform/audit/audit.service.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';
import { assertOrganisationAccess, assertOrganisationMutation } from '../organisations/organisation.policy.js';
import type {
  CreateApplicationInput,
  CreateJobInput,
  OrganisationJobQuery,
  PublicJobQuery,
  UpdateJobInput,
} from './job.schema.js';

const COMPANY_JOB_INCLUDE = {
  organisation: { select: { id: true, name: true, slug: true, logoFileId: true } },
  requirements: { include: { skill: { select: { id: true, key: true, name: true } } }, orderBy: { position: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { applications: true, placements: true } },
} satisfies Prisma.JobInclude;

function assertRate(input: {
  rateMinAmount?: string | null;
  rateMaxAmount?: string | null;
  rateCurrency?: string | null;
  rateUnit?: string | null;
}): void {
  const parts = [input.rateMinAmount, input.rateMaxAmount, input.rateCurrency, input.rateUnit];
  const present = parts.filter((value) => value !== null && value !== undefined).length;
  if (present !== 0 && present < 3) {
    throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'A rate needs an amount, currency, and unit.');
  }
  if (input.rateMinAmount && input.rateMaxAmount && Number(input.rateMinAmount) > Number(input.rateMaxAmount)) {
    throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'The minimum rate cannot exceed the maximum rate.');
  }
}

async function validateHiringManager(organisationId: string, membershipId: string | null | undefined): Promise<void> {
  if (!membershipId) return;
  const exists = await getPrisma().organisationMembership.count({
    where: { id: membershipId, organisationId, status: 'ACTIVE', role: { key: { in: ['COMPANY_OWNER', 'HR_USER', 'MANAGER'] } } },
  });
  if (!exists) throw new NotFoundError(ErrorCode.MEMBERSHIP_NOT_FOUND, 'That hiring manager was not found.');
}

async function validateRequirementSkills(requirements: CreateJobInput['requirements']): Promise<void> {
  const ids = [...new Set(requirements.flatMap((item) => item.skillId ? [item.skillId] : []))];
  if (!ids.length) return;
  const count = await getPrisma().skill.count({ where: { id: { in: ids }, isApproved: true } });
  if (count !== ids.length) throw new NotFoundError(ErrorCode.SKILL_NOT_FOUND, 'One or more skills were not found.');
}

export async function createJob(auth: AuthContext, organisationId: string, input: CreateJobInput) {
  assertOrganisationMutation(auth, organisationId, 'job:create');
  assertRate(input);
  await Promise.all([
    validateHiringManager(organisationId, input.hiringManagerId),
    validateRequirementSkills(input.requirements),
  ]);
  const { requirements, ...jobData } = input;
  const baseSlug = input.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 190) || 'job';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  const reference = `ORJ-${new Date().getUTCFullYear()}-${suffix.toUpperCase()}`;
  return getPrisma().$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        ...jobData,
        organisationId,
        slug: `${baseSlug}-${suffix}`,
        reference,
        requirements: { create: requirements },
        statusHistory: { create: { toStatus: 'DRAFT', changedById: auth.userId } },
      },
      include: COMPANY_JOB_INCLUDE,
    });
    await recordAudit({ action: 'CREATE', resourceType: 'Job', resourceId: job.id, organisationId, actorId: auth.userId, summary: 'Job draft created' }, tx);
    return job;
  });
}

export async function listOrganisationJobs(auth: AuthContext, organisationId: string, query: OrganisationJobQuery) {
  assertOrganisationAccess(auth, organisationId, 'job:read');
  const where: Prisma.JobWhereInput = {
    organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { reference: { contains: query.q, mode: 'insensitive' } }] } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.job.findMany({ where, include: COMPANY_JOB_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.job.count({ where }),
  ]);
  return { items, total };
}

export async function getOrganisationJob(auth: AuthContext, organisationId: string, jobId: string) {
  assertOrganisationAccess(auth, organisationId, 'job:read');
  const job = await getPrisma().job.findFirst({ where: { id: jobId, organisationId }, include: COMPANY_JOB_INCLUDE });
  if (!job) throw new NotFoundError(ErrorCode.JOB_NOT_FOUND, 'That job was not found.');
  return job;
}

export async function updateJob(auth: AuthContext, organisationId: string, jobId: string, input: UpdateJobInput) {
  assertOrganisationMutation(auth, organisationId, 'job:update');
  assertRate(input);
  if (input.hiringManagerId !== undefined) await validateHiringManager(organisationId, input.hiringManagerId);
  if (input.requirements) await validateRequirementSkills(input.requirements);
  const { expectedUpdatedAt, requirements, ...data } = input;
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.job.findFirst({ where: { id: jobId, organisationId } });
    if (!current) throw new NotFoundError(ErrorCode.JOB_NOT_FOUND, 'That job was not found.');
    if (!['DRAFT', 'PAUSED'].includes(current.status)) {
      throw new UnprocessableError(ErrorCode.JOB_INVALID_TRANSITION, 'Only draft or paused jobs can be edited.');
    }
    const changed = await tx.job.updateMany({ where: { id: jobId, organisationId, updatedAt: expectedUpdatedAt }, data });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The job changed. Refresh and try again.');
    if (requirements) {
      await tx.jobRequirement.deleteMany({ where: { jobId } });
      if (requirements.length) await tx.jobRequirement.createMany({ data: requirements.map((item) => ({ ...item, jobId })) });
    }
    await emitEvent(tx, { eventKey: EVENT_KEYS.JOB_UPDATED, aggregateType: 'Job', aggregateId: jobId, organisationId, payload: { jobId, organisationId } });
    return tx.job.findUniqueOrThrow({ where: { id: jobId }, include: COMPANY_JOB_INCLUDE });
  });
}

const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['PAUSED', 'CLOSED', 'FILLED'],
  PAUSED: ['PUBLISHED', 'CLOSED', 'ARCHIVED'],
  CLOSED: ['ARCHIVED'],
  FILLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export async function transitionJob(
  auth: AuthContext,
  organisationId: string,
  jobId: string,
  toStatus: JobStatus,
  expectedUpdatedAt: Date,
  reason?: string,
) {
  const permission = toStatus === 'PUBLISHED' ? 'job:publish' : toStatus === 'ARCHIVED' ? 'job:archive' : 'job:close';
  assertOrganisationMutation(auth, organisationId, permission);
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.job.findFirst({ where: { id: jobId, organisationId }, include: { requirements: true, organisation: { select: { status: true, verificationStatus: true } } } });
    if (!current) throw new NotFoundError(ErrorCode.JOB_NOT_FOUND, 'That job was not found.');
    if (!JOB_TRANSITIONS[current.status].includes(toStatus)) {
      throw new UnprocessableError(ErrorCode.JOB_INVALID_TRANSITION, `A ${current.status} job cannot move to ${toStatus}.`);
    }
    if (toStatus === 'PUBLISHED') {
      if (current.organisation.status !== 'ACTIVE' || current.organisation.verificationStatus !== 'VERIFIED') {
        throw new UnprocessableError(ErrorCode.ORGANISATION_INACTIVE, 'The organisation must be active and verified before publishing.');
      }
      if (!current.requirements.length || !current.applicationDeadline || current.applicationDeadline <= new Date()) {
        throw new UnprocessableError(ErrorCode.JOB_PUBLICATION_REQUIREMENTS_UNMET, 'Add at least one requirement and a future application deadline before publishing.');
      }
    }
    const now = new Date();
    const data: Prisma.JobUpdateManyMutationInput = {
      status: toStatus,
      ...(toStatus === 'PUBLISHED' ? { publishedAt: current.publishedAt ?? now, closedAt: null } : {}),
      ...(toStatus === 'CLOSED' ? { closedAt: now } : {}),
      ...(toStatus === 'FILLED' ? { filledAt: now, closedAt: now } : {}),
      ...(toStatus === 'ARCHIVED' ? { archivedAt: now } : {}),
    };
    const changed = await tx.job.updateMany({ where: { id: jobId, organisationId, updatedAt: expectedUpdatedAt }, data });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The job changed. Refresh and try again.');
    await tx.jobStatusHistory.create({ data: { jobId, fromStatus: current.status, toStatus, changedById: auth.userId, reason } });
    const eventKey = toStatus === 'PUBLISHED' ? EVENT_KEYS.JOB_PUBLISHED : toStatus === 'ARCHIVED' ? EVENT_KEYS.JOB_ARCHIVED : EVENT_KEYS.JOB_CLOSED;
    await emitEvent(tx, { eventKey, aggregateType: 'Job', aggregateId: jobId, organisationId, payload: { jobId, organisationId } });
    return tx.job.findUniqueOrThrow({ where: { id: jobId }, include: COMPANY_JOB_INCLUDE });
  });
}

function publicJobSelect() {
  return {
    id: true, reference: true, title: true, slug: true, category: true, employmentType: true,
    workArrangement: true, description: true, responsibilities: true, requirementsText: true,
    openings: true, countryCode: true, city: true, timeZone: true, isRemoteFriendly: true,
    rateMinAmount: true, rateMaxAmount: true, rateCurrency: true, rateUnit: true,
    minYearsExperience: true, seniority: true, businessLocation: true, applicationDeadline: true,
    publishedAt: true, updatedAt: true,
    organisation: { select: { id: true, name: true, slug: true, logoFileId: true } },
    requirements: { select: { id: true, kind: true, label: true, description: true, weight: true, isMandatory: true, minYears: true, position: true, skill: { select: { id: true, key: true, name: true } } }, orderBy: { position: 'asc' as const } },
  } satisfies Prisma.JobSelect;
}

function mapPublicJob<T extends { rateMinAmount: { toString(): string } | null; rateMaxAmount: { toString(): string } | null }>(job: T) {
  return { ...job, rateMinAmount: job.rateMinAmount?.toString() ?? null, rateMaxAmount: job.rateMaxAmount?.toString() ?? null };
}

export async function listPublicJobs(query: PublicJobQuery) {
  const where: Prisma.JobWhereInput = {
    status: 'PUBLISHED', moderationStatus: { not: 'REMOVED' },
    OR: [{ applicationDeadline: null }, { applicationDeadline: { gt: new Date() } }],
    ...(query.q ? { AND: [{ OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }, { requirements: { some: { label: { contains: query.q, mode: 'insensitive' } } } }] }] } : {}),
    ...(query.employmentType ? { employmentType: query.employmentType } : {}),
    ...(query.workArrangement ? { workArrangement: query.workArrangement } : {}),
    ...(query.countryCode ? { countryCode: query.countryCode } : {}),
    ...(query.skillId ? { requirements: { some: { skillId: query.skillId } } } : {}),
  };
  const orderBy: Prisma.JobOrderByWithRelationInput[] = query.sort === 'deadline' ? [{ applicationDeadline: 'asc' }, { id: 'asc' }] : query.sort === 'rate_asc' ? [{ rateMinAmount: 'asc' }, { id: 'asc' }] : query.sort === 'rate_desc' ? [{ rateMaxAmount: 'desc' }, { id: 'asc' }] : [{ publishedAt: 'desc' }, { id: 'asc' }];
  const prisma = getPrisma();
  const [rows, total] = await Promise.all([
    prisma.job.findMany({ where, select: publicJobSelect(), orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.job.count({ where }),
  ]);
  return { items: rows.map(mapPublicJob), total };
}

export async function getPublicJob(jobId: string) {
  const job = await getPrisma().job.findFirst({ where: { id: jobId, status: 'PUBLISHED', moderationStatus: { not: 'REMOVED' } }, select: publicJobSelect() });
  if (!job) throw new NotFoundError(ErrorCode.JOB_NOT_FOUND, 'That job was not found.');
  return mapPublicJob(job);
}

export async function submitApplication(auth: AuthContext, jobId: string, input: CreateApplicationInput) {
  const prisma = getPrisma();
  const [job, profile] = await Promise.all([
    prisma.job.findFirst({ where: { id: jobId, status: 'PUBLISHED', moderationStatus: { not: 'REMOVED' } }, select: { id: true, organisationId: true, applicationDeadline: true } }),
    prisma.talentProfile.findUnique({ where: { userId: auth.userId }, select: { id: true, status: true, availabilityStatus: true } }),
  ]);
  if (!job) throw new NotFoundError(ErrorCode.JOB_NOT_FOUND, 'That job was not found.');
  if (job.applicationDeadline && job.applicationDeadline <= new Date()) throw new UnprocessableError(ErrorCode.JOB_DEADLINE_PASSED, 'The application deadline has passed.');
  if (!profile || profile.status !== 'ACTIVE') throw new UnprocessableError(ErrorCode.TALENT_PROFILE_INCOMPLETE, 'Complete your talent profile before applying.');
  const files = input.attachments.map((item) => item.fileId);
  if (files.length) {
    const count = await prisma.fileObject.count({ where: { id: { in: files }, ownerId: auth.userId, status: 'READY' } });
    if (count !== new Set(files).size) throw new NotFoundError(ErrorCode.FILE_NOT_READY, 'One or more attachments are not ready.');
  }
  const { answers, attachments, ...applicationData } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: {
          ...applicationData,
          organisationId: job.organisationId,
          jobId,
          talentProfileId: profile.id,
          statusHistory: { create: { toStatus: 'SUBMITTED', changedById: auth.userId } },
          answers: { create: answers },
          attachments: { create: attachments },
        },
        include: { job: { select: { id: true, title: true, reference: true, organisation: { select: { id: true, name: true } } } }, answers: true, attachments: true, statusHistory: true },
      });
      await emitEvent(tx, { eventKey: EVENT_KEYS.APPLICATION_SUBMITTED, aggregateType: 'Application', aggregateId: application.id, organisationId: job.organisationId, payload: { applicationId: application.id, jobId, talentProfileId: profile.id, organisationId: job.organisationId } });
      return application;
    });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new ConflictError(ErrorCode.APPLICATION_ALREADY_EXISTS, 'You already applied to this job.');
    throw error;
  }
}

export async function listMyApplications(auth: AuthContext, query: { page: number; pageSize: number; status?: ApplicationStatus }) {
  const profile = await getPrisma().talentProfile.findUnique({ where: { userId: auth.userId }, select: { id: true } });
  if (!profile) throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'Your talent profile was not found.');
  const where: Prisma.ApplicationWhereInput = { talentProfileId: profile.id, ...(query.status ? { status: query.status } : {}) };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.application.findMany({ where, include: { job: { select: { id: true, title: true, reference: true, status: true, organisation: { select: { id: true, name: true, slug: true } } } }, statusHistory: { orderBy: { createdAt: 'asc' } } }, orderBy: { submittedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.application.count({ where }),
  ]);
  return { items, total };
}

export async function withdrawApplication(auth: AuthContext, applicationId: string, expectedUpdatedAt: Date, reason?: string) {
  const profile = await getPrisma().talentProfile.findUnique({ where: { userId: auth.userId }, select: { id: true } });
  if (!profile) throw new NotFoundError(ErrorCode.APPLICATION_NOT_FOUND, 'That application was not found.');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.application.findFirst({ where: { id: applicationId, talentProfileId: profile.id } });
    if (!current) throw new NotFoundError(ErrorCode.APPLICATION_NOT_FOUND, 'That application was not found.');
    if (['ACCEPTED', 'REJECTED', 'WITHDRAWN'].includes(current.status)) throw new UnprocessableError(ErrorCode.APPLICATION_NOT_WITHDRAWABLE, 'That application can no longer be withdrawn.');
    const changed = await tx.application.updateMany({ where: { id: applicationId, talentProfileId: profile.id, updatedAt: expectedUpdatedAt }, data: { status: 'WITHDRAWN', withdrawnAt: new Date() } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The application changed. Refresh and try again.');
    await tx.applicationStatusHistory.create({ data: { applicationId, fromStatus: current.status, toStatus: 'WITHDRAWN', changedById: auth.userId, reason } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.APPLICATION_WITHDRAWN, aggregateType: 'Application', aggregateId: applicationId, organisationId: current.organisationId, payload: { applicationId, jobId: current.jobId, talentProfileId: profile.id, organisationId: current.organisationId } });
    return tx.application.findUniqueOrThrow({ where: { id: applicationId }, include: { statusHistory: { orderBy: { createdAt: 'asc' } } } });
  });
}

export async function listOrganisationApplications(auth: AuthContext, organisationId: string, query: { page: number; pageSize: number; status?: ApplicationStatus; jobId?: string }) {
  assertOrganisationAccess(auth, organisationId, 'application:read');
  const where: Prisma.ApplicationWhereInput = { organisationId, ...(query.status ? { status: query.status } : {}), ...(query.jobId ? { jobId: query.jobId } : {}) };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.application.findMany({ where, select: { id: true, status: true, source: true, submittedAt: true, reviewedAt: true, decidedAt: true, updatedAt: true, expectedRateAmount: true, expectedRateCurrency: true, expectedRateUnit: true, availableFrom: true, job: { select: { id: true, title: true, reference: true } }, talentProfile: { select: { id: true, headline: true, yearsExperience: true, availabilityStatus: true, user: { select: { firstName: true, lastName: true, displayName: true, avatarFileId: true } }, skills: { select: { proficiency: true, skill: { select: { id: true, name: true, key: true } } } } } } }, orderBy: { submittedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.application.count({ where }),
  ]);
  return { items: items.map((item) => ({ ...item, expectedRateAmount: item.expectedRateAmount?.toString() ?? null })), total };
}

export async function getOrganisationApplication(auth: AuthContext, organisationId: string, applicationId: string) {
  assertOrganisationAccess(auth, organisationId, 'application:read');
  const item = await getPrisma().application.findFirst({
    where: { id: applicationId, organisationId },
    include: {
      job: { select: { id: true, title: true, reference: true } },
      answers: true,
      attachments: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
      talentProfile: {
        select: {
          id: true,
          headline: true,
          bio: true,
          yearsExperience: true,
          availabilityStatus: true,
          availableFrom: true,
          portfolioUrl: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              displayName: true,
              avatarFileId: true,
            },
          },
          skills: { include: { skill: { select: { id: true, key: true, name: true } } } },
          experiences: true,
          education: true,
          certifications: {
            select: { id: true, name: true, issuer: true, issuedAt: true, expiresAt: true },
          },
          portfolioItems: {
            select: {
              id: true,
              title: true,
              description: true,
              category: true,
              url: true,
              position: true,
            },
          },
        },
      },
    },
  });
  if (!item) throw new NotFoundError(ErrorCode.APPLICATION_NOT_FOUND, 'That application was not found.');
  return { ...item, expectedRateAmount: item.expectedRateAmount?.toString() ?? null };
}

const APPLICATION_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SHORTLISTED', 'INTERVIEWING', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEWING', 'OFFER_PENDING', 'REJECTED', 'WITHDRAWN'],
  INTERVIEWING: ['OFFER_PENDING', 'REJECTED', 'WITHDRAWN'],
  OFFER_PENDING: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: [], REJECTED: [], WITHDRAWN: [],
};

export async function updateApplicationStatus(auth: AuthContext, organisationId: string, applicationId: string, toStatus: ApplicationStatus, expectedUpdatedAt: Date, reason?: string) {
  assertOrganisationMutation(auth, organisationId, 'application:update_status');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.application.findFirst({ where: { id: applicationId, organisationId } });
    if (!current) throw new NotFoundError(ErrorCode.APPLICATION_NOT_FOUND, 'That application was not found.');
    if (!APPLICATION_TRANSITIONS[current.status].includes(toStatus)) throw new UnprocessableError(ErrorCode.APPLICATION_INVALID_TRANSITION, `An application in ${current.status} cannot move to ${toStatus}.`);
    const now = new Date();
    const changed = await tx.application.updateMany({ where: { id: applicationId, organisationId, updatedAt: expectedUpdatedAt }, data: { status: toStatus, ...(toStatus === 'UNDER_REVIEW' ? { reviewedAt: now } : {}), ...(['ACCEPTED', 'REJECTED'].includes(toStatus) ? { decidedAt: now } : {}), ...(toStatus === 'REJECTED' ? { rejectionReason: reason ?? null } : {}) } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The application changed. Refresh and try again.');
    await tx.applicationStatusHistory.create({ data: { applicationId, fromStatus: current.status, toStatus, changedById: auth.userId, reason } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.APPLICATION_STATUS_CHANGED, aggregateType: 'Application', aggregateId: applicationId, organisationId, payload: { applicationId, jobId: current.jobId, talentProfileId: current.talentProfileId, organisationId } });
    return tx.application.findUniqueOrThrow({ where: { id: applicationId }, include: { statusHistory: { orderBy: { createdAt: 'asc' } } } });
  });
}
