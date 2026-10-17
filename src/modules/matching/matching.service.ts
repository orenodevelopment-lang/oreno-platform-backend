import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';
import {
  assertOrganisationAccess,
  assertOrganisationMutation,
} from '../organisations/organisation.policy.js';

const COMPONENT_KEYS = [
  'requiredSkill',
  'preferredSkill',
  'experience',
  'rate',
  'timeZone',
  'availability',
] as const;
type ComponentKey = (typeof COMPONENT_KEYS)[number];
type Weights = Record<ComponentKey, number>;

function parseWeights(value: Prisma.JsonValue): Weights {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnprocessableError(
      ErrorCode.CONFIG_VALUE_INVALID,
      'The active matching algorithm has invalid weights.',
    );
  }
  const object = value as Record<string, Prisma.JsonValue>;
  const weights = Object.fromEntries(
    COMPONENT_KEYS.map((key) => [key, typeof object[key] === 'number' ? object[key] : NaN]),
  ) as Weights;
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (Object.values(weights).some((weight) => !Number.isFinite(weight) || weight < 0) || total <= 0) {
    throw new UnprocessableError(
      ErrorCode.CONFIG_VALUE_INVALID,
      'The active matching algorithm has invalid weights.',
    );
  }
  return Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, weight / total]),
  ) as Weights;
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function weightedSkillScore(
  requirements: readonly { skillId: string | null; weight: number }[],
  talentSkills: ReadonlySet<string>,
): { score: number; matched: string[]; missing: string[] } {
  const scorable = requirements.filter((requirement) => requirement.skillId !== null);
  if (scorable.length === 0) return { score: 100, matched: [], missing: [] };
  const total = scorable.reduce((sum, requirement) => sum + requirement.weight, 0);
  const matchedRows = scorable.filter((requirement) => talentSkills.has(requirement.skillId!));
  const matchedWeight = matchedRows.reduce((sum, requirement) => sum + requirement.weight, 0);
  return {
    score: roundScore(total > 0 ? (matchedWeight / total) * 100 : 100),
    matched: matchedRows.map((row) => row.skillId!),
    missing: scorable
      .filter((requirement) => !talentSkills.has(requirement.skillId!))
      .map((row) => row.skillId!),
  };
}

interface CandidateForMatching {
  id: string;
  yearsExperience: number | null;
  expectedRateAmount: { toString(): string } | null;
  expectedRateCurrency: string | null;
  expectedRateUnit: string | null;
  timeZone: string;
  availabilityStatus: 'AVAILABLE_NOW' | 'AVAILABLE_FROM_DATE' | 'UNAVAILABLE';
  availableFrom: Date | null;
  skills: { skillId: string }[];
}

function computeComponents(
  job: {
    minYearsExperience: number | null;
    rateMaxAmount: { toString(): string } | null;
    rateCurrency: string | null;
    rateUnit: string | null;
    timeZone: string | null;
    requirements: { kind: string; skillId: string | null; weight: number }[];
  },
  candidate: CandidateForMatching,
) {
  const skillIds = new Set(candidate.skills.map((skill) => skill.skillId));
  const required = weightedSkillScore(
    job.requirements.filter((item) => item.kind === 'REQUIRED_SKILL'),
    skillIds,
  );
  const preferred = weightedSkillScore(
    job.requirements.filter((item) => item.kind === 'PREFERRED_SKILL'),
    skillIds,
  );
  const experience =
    job.minYearsExperience === null || job.minYearsExperience === 0
      ? 100
      : roundScore(((candidate.yearsExperience ?? 0) / job.minYearsExperience) * 100);
  let rate = 100;
  let rateReason = 'The job does not define a maximum rate.';
  if (job.rateMaxAmount !== null) {
    if (
      candidate.expectedRateAmount === null ||
      candidate.expectedRateCurrency !== job.rateCurrency ||
      candidate.expectedRateUnit !== job.rateUnit
    ) {
      rate = 0;
      rateReason = 'The candidate rate is missing or uses a different currency or unit.';
    } else {
      const maximum = Number(job.rateMaxAmount);
      const expected = Number(candidate.expectedRateAmount);
      rate = expected <= maximum ? 100 : roundScore((maximum / expected) * 100);
      rateReason = expected <= maximum ? 'The expected rate is within range.' : 'The expected rate exceeds the range.';
    }
  }
  const timeZone = !job.timeZone || candidate.timeZone === job.timeZone ? 100 : 0;
  const availability =
    candidate.availabilityStatus === 'AVAILABLE_NOW'
      ? 100
      : candidate.availabilityStatus === 'AVAILABLE_FROM_DATE'
        ? 50
        : 0;
  return {
    scores: {
      requiredSkill: required.score,
      preferredSkill: preferred.score,
      experience,
      rate,
      timeZone,
      availability,
    },
    explanation: {
      requiredSkills: required,
      preferredSkills: preferred,
      experience: {
        score: experience,
        requiredYears: job.minYearsExperience,
        candidateYears: candidate.yearsExperience,
      },
      rate: { score: rate, reason: rateReason },
      timeZone: {
        score: timeZone,
        required: job.timeZone,
        candidate: candidate.timeZone,
      },
      availability: {
        score: availability,
        status: candidate.availabilityStatus,
        availableFrom: candidate.availableFrom?.toISOString() ?? null,
      },
    },
  };
}

export async function recomputeMatches(
  auth: AuthContext,
  organisationId: string,
  jobId: string,
  talentProfileIds?: string[],
) {
  assertOrganisationMutation(auth, organisationId, 'matching:recompute');
  const prisma = getPrisma();
  const [job, algorithm] = await Promise.all([
    prisma.job.findFirst({
      where: { id: jobId, organisationId },
      include: { requirements: true },
    }),
    prisma.matchingAlgorithmVersion.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  if (!job) throw new NotFoundError(ErrorCode.JOB_NOT_FOUND, 'That job was not found.');
  if (!algorithm) {
    throw new UnprocessableError(
      ErrorCode.MATCHING_ALGORITHM_NOT_CONFIGURED,
      'No active matching algorithm is configured.',
    );
  }
  const weights = parseWeights(algorithm.weights);
  const explicitIds = talentProfileIds ? [...new Set(talentProfileIds)] : undefined;
  const candidates = await prisma.talentProfile.findMany({
    where: {
      status: 'ACTIVE',
      ...(explicitIds
        ? { id: { in: explicitIds } }
        : {
            OR: [
              { visibility: { in: ['PUBLIC', 'ORENO_COMPANIES_ONLY'] } },
              { applications: { some: { organisationId } } },
            ],
          }),
    },
    select: {
      id: true,
      yearsExperience: true,
      expectedRateAmount: true,
      expectedRateCurrency: true,
      expectedRateUnit: true,
      timeZone: true,
      availabilityStatus: true,
      availableFrom: true,
      skills: { select: { skillId: true } },
    },
    orderBy: { id: 'asc' },
    take: 500,
  });
  if (explicitIds && candidates.length !== explicitIds.length) {
    throw new NotFoundError(
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
      'One or more eligible talent profiles were not found.',
    );
  }
  const results = candidates.map((candidate) => {
    const computed = computeComponents(job, candidate);
    const score = roundScore(
      COMPONENT_KEYS.reduce(
        (sum, key) => sum + computed.scores[key] * weights[key],
        0,
      ),
    );
    return { candidate, computed, score };
  });
  await prisma.$transaction(async (tx) => {
    for (const result of results) {
      await tx.matchResult.upsert({
        where: {
          jobId_talentProfileId_algorithmId: {
            jobId,
            talentProfileId: result.candidate.id,
            algorithmId: algorithm.id,
          },
        },
        create: {
          jobId,
          talentProfileId: result.candidate.id,
          organisationId,
          algorithmId: algorithm.id,
          score: result.score,
          requiredSkillScore: result.computed.scores.requiredSkill,
          preferredSkillScore: result.computed.scores.preferredSkill,
          experienceScore: result.computed.scores.experience,
          rateScore: result.computed.scores.rate,
          timeZoneScore: result.computed.scores.timeZone,
          availabilityScore: result.computed.scores.availability,
          explanation: {
            ...result.computed.explanation,
            algorithmVersion: algorithm.version,
            weights,
          },
        },
        update: {
          score: result.score,
          requiredSkillScore: result.computed.scores.requiredSkill,
          preferredSkillScore: result.computed.scores.preferredSkill,
          experienceScore: result.computed.scores.experience,
          rateScore: result.computed.scores.rate,
          timeZoneScore: result.computed.scores.timeZone,
          availabilityScore: result.computed.scores.availability,
          explanation: {
            ...result.computed.explanation,
            algorithmVersion: algorithm.version,
            weights,
          },
          computedAt: new Date(),
        },
      });
    }
  });
  return { algorithmVersion: algorithm.version, computed: results.length };
}

export async function listMatches(
  auth: AuthContext,
  organisationId: string,
  jobId: string,
  query: { page: number; pageSize: number; minimumScore: number; sort: string },
) {
  assertOrganisationAccess(auth, organisationId, 'matching:read');
  const job = await getPrisma().job.count({ where: { id: jobId, organisationId } });
  if (job === 0) throw new NotFoundError(ErrorCode.JOB_NOT_FOUND, 'That job was not found.');
  const algorithm = await getPrisma().matchingAlgorithmVersion.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!algorithm) {
    throw new UnprocessableError(
      ErrorCode.MATCHING_ALGORITHM_NOT_CONFIGURED,
      'No active matching algorithm is configured.',
    );
  }
  const where: Prisma.MatchResultWhereInput = {
    organisationId,
    jobId,
    algorithmId: algorithm.id,
    score: { gte: query.minimumScore },
  };
  const orderBy: Prisma.MatchResultOrderByWithRelationInput[] =
    query.sort === 'score_asc'
      ? [{ score: 'asc' }, { talentProfileId: 'asc' }]
      : query.sort === 'newest'
        ? [{ computedAt: 'desc' }, { talentProfileId: 'asc' }]
        : [{ score: 'desc' }, { talentProfileId: 'asc' }];
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.matchResult.findMany({
      where,
      include: {
        algorithm: { select: { version: true, description: true } },
        talentProfile: {
          select: {
            id: true,
            headline: true,
            countryCode: true,
            city: true,
            timeZone: true,
            yearsExperience: true,
            seniority: true,
            availabilityStatus: true,
            availableFrom: true,
            preferredEmploymentTypes: true,
            preferredWorkArrangement: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                displayName: true,
                avatarFileId: true,
              },
            },
            skills: {
              select: {
                proficiency: true,
                yearsExperience: true,
                skill: { select: { id: true, key: true, name: true } },
              },
            },
          },
        },
      },
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.matchResult.count({ where }),
  ]);
  return { items, total };
}

const SHORTLIST_INCLUDE = {
  job: { select: { id: true, title: true, reference: true } },
  candidates: {
    where: { removedAt: null },
    orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      talentProfile: {
        select: {
          id: true,
          headline: true,
          seniority: true,
          availabilityStatus: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              displayName: true,
              avatarFileId: true,
            },
          },
        },
      },
      application: { select: { id: true, status: true, jobId: true } },
    },
  },
  notes: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ShortlistInclude;

async function shortlistOrThrow(organisationId: string, shortlistId: string) {
  const shortlist = await getPrisma().shortlist.findFirst({
    where: { id: shortlistId, organisationId },
    include: SHORTLIST_INCLUDE,
  });
  if (!shortlist) {
    throw new NotFoundError(ErrorCode.SHORTLIST_NOT_FOUND, 'That shortlist was not found.');
  }
  return shortlist;
}

export async function listShortlists(
  auth: AuthContext,
  organisationId: string,
  query: { page: number; pageSize: number; jobId?: string; archived: boolean },
) {
  assertOrganisationAccess(auth, organisationId, 'shortlist:read');
  const where: Prisma.ShortlistWhereInput = {
    organisationId,
    archivedAt: query.archived ? { not: null } : null,
    ...(query.jobId ? { jobId: query.jobId } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.shortlist.findMany({
      where,
      include: SHORTLIST_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.shortlist.count({ where }),
  ]);
  return { items, total };
}

export async function getShortlist(
  auth: AuthContext,
  organisationId: string,
  shortlistId: string,
) {
  assertOrganisationAccess(auth, organisationId, 'shortlist:read');
  return shortlistOrThrow(organisationId, shortlistId);
}

export async function createShortlist(
  auth: AuthContext,
  organisationId: string,
  input: { jobId?: string | null; name: string; description?: string | null },
) {
  assertOrganisationMutation(auth, organisationId, 'shortlist:create');
  if (input.jobId) {
    const job = await getPrisma().job.count({ where: { id: input.jobId, organisationId } });
    if (job === 0) throw new NotFoundError(ErrorCode.JOB_NOT_FOUND, 'That job was not found.');
  }
  return getPrisma().$transaction(async (tx) => {
    const shortlist = await tx.shortlist.create({
      data: { ...input, organisationId, kind: 'EMPLOYER', createdById: auth.userId },
      include: SHORTLIST_INCLUDE,
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.SHORTLIST_CREATED,
      aggregateType: 'Shortlist',
      aggregateId: shortlist.id,
      organisationId,
      payload: { shortlistId: shortlist.id, organisationId },
    });
    return shortlist;
  });
}

export async function updateShortlist(
  auth: AuthContext,
  organisationId: string,
  shortlistId: string,
  input: { expectedUpdatedAt: Date; name?: string; description?: string | null },
) {
  assertOrganisationMutation(auth, organisationId, 'shortlist:update');
  const { expectedUpdatedAt, ...data } = input;
  const changed = await getPrisma().shortlist.updateMany({
    where: { id: shortlistId, organisationId, archivedAt: null, updatedAt: expectedUpdatedAt },
    data,
  });
  if (changed.count === 0) {
    throw new ConflictError(ErrorCode.STALE_WRITE, 'The shortlist changed. Refresh and try again.');
  }
  return shortlistOrThrow(organisationId, shortlistId);
}

export async function archiveShortlist(
  auth: AuthContext,
  organisationId: string,
  shortlistId: string,
  expectedUpdatedAt: Date,
) {
  assertOrganisationMutation(auth, organisationId, 'shortlist:delete');
  const changed = await getPrisma().shortlist.updateMany({
    where: { id: shortlistId, organisationId, archivedAt: null, updatedAt: expectedUpdatedAt },
    data: { archivedAt: new Date() },
  });
  if (changed.count === 0) {
    throw new ConflictError(ErrorCode.STALE_WRITE, 'The shortlist changed. Refresh and try again.');
  }
}

async function validateCandidateRelationship(
  organisationId: string,
  shortlistJobId: string | null,
  talentProfileId: string,
  applicationId?: string | null,
) {
  if (applicationId) {
    const application = await getPrisma().application.findFirst({
      where: {
        id: applicationId,
        organisationId,
        talentProfileId,
        ...(shortlistJobId ? { jobId: shortlistJobId } : {}),
      },
    });
    if (!application) {
      throw new NotFoundError(ErrorCode.APPLICATION_NOT_FOUND, 'That application was not found.');
    }
    return application;
  }
  const profile = await getPrisma().talentProfile.findFirst({
    where: {
      id: talentProfileId,
      status: 'ACTIVE',
      OR: [
        { visibility: { in: ['PUBLIC', 'ORENO_COMPANIES_ONLY'] } },
        { applications: { some: { organisationId } } },
        { offers: { some: { organisationId } } },
        { placements: { some: { organisationId } } },
      ],
    },
    select: { id: true },
  });
  if (!profile) {
    throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'That talent profile was not found.');
  }
  return null;
}

export async function addCandidate(
  auth: AuthContext,
  organisationId: string,
  shortlistId: string,
  input: { talentProfileId: string; applicationId?: string | null; position: number },
) {
  assertOrganisationMutation(auth, organisationId, 'shortlist:add_candidate');
  const shortlist = await shortlistOrThrow(organisationId, shortlistId);
  if (shortlist.archivedAt) {
    throw new UnprocessableError(ErrorCode.SHORTLIST_NOT_FOUND, 'That shortlist is archived.');
  }
  const application = await validateCandidateRelationship(
    organisationId,
    shortlist.jobId,
    input.talentProfileId,
    input.applicationId,
  );
  try {
    return await getPrisma().$transaction(async (tx) => {
      const existing = await tx.shortlistCandidate.findUnique({
        where: {
          shortlistId_talentProfileId: {
            shortlistId,
            talentProfileId: input.talentProfileId,
          },
        },
      });
      const candidate = existing
        ? await tx.shortlistCandidate.update({
            where: { id: existing.id },
            data: {
              removedAt: null,
              applicationId: application?.id ?? input.applicationId ?? null,
              position: input.position,
              addedById: auth.userId,
            },
          })
        : await tx.shortlistCandidate.create({
            data: {
              shortlistId,
              talentProfileId: input.talentProfileId,
              applicationId: application?.id ?? input.applicationId ?? null,
              position: input.position,
              addedById: auth.userId,
            },
          });
      if (application && !['SHORTLISTED', 'INTERVIEWING', 'OFFER_PENDING', 'ACCEPTED'].includes(application.status)) {
        await tx.application.update({
          where: { id: application.id },
          data: { status: 'SHORTLISTED' },
        });
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: application.status,
            toStatus: 'SHORTLISTED',
            changedById: auth.userId,
            reason: 'Added to shortlist',
          },
        });
      }
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.SHORTLIST_CANDIDATE_ADDED,
        aggregateType: 'Shortlist',
        aggregateId: shortlistId,
        organisationId,
        payload: { shortlistId, candidateId: candidate.id, organisationId },
      });
      return candidate;
    });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      throw new ConflictError(
        ErrorCode.SHORTLIST_CANDIDATE_ALREADY_PRESENT,
        'That candidate is already on the shortlist.',
      );
    }
    throw error;
  }
}

export async function removeCandidate(
  auth: AuthContext,
  organisationId: string,
  shortlistId: string,
  candidateId: string,
) {
  assertOrganisationMutation(auth, organisationId, 'shortlist:remove_candidate');
  const changed = await getPrisma().shortlistCandidate.updateMany({
    where: {
      id: candidateId,
      shortlistId,
      shortlist: { organisationId, archivedAt: null },
      removedAt: null,
    },
    data: { removedAt: new Date() },
  });
  if (changed.count === 0) {
    throw new NotFoundError(ErrorCode.SHORTLIST_NOT_FOUND, 'That shortlist candidate was not found.');
  }
}

export async function addNote(
  auth: AuthContext,
  organisationId: string,
  shortlistId: string,
  body: string,
) {
  assertOrganisationMutation(auth, organisationId, 'shortlist:update');
  const shortlist = await shortlistOrThrow(organisationId, shortlistId);
  if (shortlist.archivedAt) {
    throw new UnprocessableError(ErrorCode.SHORTLIST_NOT_FOUND, 'That shortlist is archived.');
  }
  return getPrisma().shortlistNote.create({
    data: { shortlistId, authorId: auth.userId, body },
  });
}
