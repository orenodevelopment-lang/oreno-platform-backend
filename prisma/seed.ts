import '../src/config/load-env.js';
import { PrismaClient, RoleKey } from '@prisma/client';
import { loadConfig } from '../src/config/index.js';
import { PERMISSION_DEFINITIONS } from '../src/platform/rbac/permission-catalog.js';
import { ROLE_DEFINITIONS } from '../src/platform/rbac/role-permissions.js';

/**
 * Database seed.
 *
 * Everything here derives from a catalogue in `src/`, so this script is a
 * projection of the code rather than a second source of truth: adding a
 * permission or changing a role's grants means editing the catalogue and
 * re-running the seed.
 *
 * The script is idempotent — every write is an upsert or a reconstruct of a
 * derived set — so it is safe to run on every deploy. It does not delete
 * user-created data.
 *
 * It deliberately does not seed a password for the bootstrap administrators.
 * A seeded default credential is a standing invitation; instead those accounts
 * are created verified and must set their own password through the reset flow.
 */
const prisma = new PrismaClient();

async function seedPermissions(): Promise<Map<string, string>> {
  for (const definition of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { key: definition.key },
      update: {
        resource: definition.resource,
        action: definition.action,
        description: definition.description,
      },
      create: {
        key: definition.key,
        resource: definition.resource,
        action: definition.action,
        description: definition.description,
      },
    });
  }

  const stored = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idsByKey = new Map(stored.map((permission) => [permission.key, permission.id]));

  console.log(`permissions: ${PERMISSION_DEFINITIONS.length} upserted`);
  return idsByKey;
}

async function seedRoles(permissionIds: Map<string, string>): Promise<Map<RoleKey, string>> {
  const roleIds = new Map<RoleKey, string>();

  for (const role of ROLE_DEFINITIONS) {
    // A role that references a permission which no longer exists would silently
    // grant nothing. Fail the seed instead of writing a partial role.
    const unknown = role.permissions.filter((key) => !permissionIds.has(key));
    if (unknown.length > 0) {
      throw new Error(
        `Role "${role.key}" references permissions absent from the catalogue: ${unknown.join(', ')}`,
      );
    }

    const record = await prisma.role.upsert({
      where: { key: role.key },
      update: {
        scope: role.scope,
        name: role.name,
        description: role.description,
        isSystem: true,
      },
      create: {
        key: role.key,
        scope: role.scope,
        name: role.name,
        description: role.description,
        isSystem: true,
      },
      select: { id: true },
    });

    roleIds.set(role.key, record.id);

    // Role grants are a derived set: rebuild rather than diff, so a permission
    // removed from the catalogue is actually revoked.
    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });
    await prisma.rolePermission.createMany({
      data: [...new Set(role.permissions)].flatMap((key) => {
        const permissionId = permissionIds.get(key);
        return permissionId ? [{ roleId: record.id, permissionId }] : [];
      }),
    });
  }

  console.log(`roles: ${ROLE_DEFINITIONS.length} upserted with grants`);
  return roleIds;
}

function nameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]+/).filter((part) => part.length > 0);
  const capitalise = (value: string): string =>
    value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

  const first = parts[0] ?? local;
  return {
    firstName: capitalise(first).slice(0, 120),
    lastName: parts.slice(1).map(capitalise).join(' ').slice(0, 120),
  };
}

async function seedBootstrapAdmins(roleIds: Map<RoleKey, string>): Promise<number> {
  const config = loadConfig();
  const emails = [...new Set(config.platform.bootstrapAdminEmails.map((e) => e.toLowerCase()))];

  if (emails.length === 0) {
    console.log('bootstrap admins: PLATFORM_ADMIN_EMAILS is empty, nothing to do');
    return 0;
  }

  const ownerRoleId = roleIds.get(RoleKey.PLATFORM_OWNER);
  if (!ownerRoleId) {
    throw new Error('PLATFORM_OWNER role was not seeded; cannot grant platform access.');
  }

  for (const email of emails) {
    const { firstName, lastName } = nameFromEmail(email);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        isPlatformAdmin: true,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
      create: {
        email,
        registrationIntent: 'TALENT',
        firstName,
        lastName,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        isPlatformAdmin: true,
        preferences: { create: {} },
      },
      select: { id: true },
    });

    const existingGrant = await prisma.platformRoleAssignment.findFirst({
      where: { userId: user.id, roleId: ownerRoleId, revokedAt: null },
      select: { id: true },
    });

    if (!existingGrant) {
      await prisma.platformRoleAssignment.create({
        data: { userId: user.id, roleId: ownerRoleId },
      });
    }

    console.log(`bootstrap admin ready: ${email} (set a password via the reset flow)`);
  }

  return emails.length;
}

async function seedDevelopmentMatchingPolicy(): Promise<void> {
  const config = loadConfig();
  await prisma.matchingAlgorithmVersion.upsert({
    where: { version: 'development-baseline-v1' },
    update: {
      description:
        'Development-only explainable baseline. Production must activate a client-approved version.',
      weights: {
        requiredSkill: 0.35,
        preferredSkill: 0.15,
        experience: 0.2,
        rate: 0.1,
        timeZone: 0.05,
        availability: 0.15,
      },
      isActive: !config.isProduction,
    },
    create: {
      version: 'development-baseline-v1',
      description:
        'Development-only explainable baseline. Production must activate a client-approved version.',
      weights: {
        requiredSkill: 0.35,
        preferredSkill: 0.15,
        experience: 0.2,
        rate: 0.1,
        timeZone: 0.05,
        availability: 0.15,
      },
      isActive: !config.isProduction,
    },
  });
  console.log(
    config.isProduction
      ? 'matching: development baseline seeded inactive'
      : 'matching: development baseline active',
  );
}

async function seedDevelopmentJourney(roleIds: Map<RoleKey, string>): Promise<void> {
  const config = loadConfig();
  if (config.isProduction) {
    console.log('development journey: skipped in production');
    return;
  }
  const ownerRoleId = roleIds.get(RoleKey.COMPANY_OWNER);
  if (!ownerRoleId) throw new Error('COMPANY_OWNER role was not seeded.');

  const owner = await prisma.user.upsert({
    where: { email: 'owner@acme.example.test' },
    update: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    create: { email: 'owner@acme.example.test', registrationIntent: 'COMPANY_OWNER', firstName: 'Amara', lastName: 'Okafor', displayName: 'Amara Okafor', status: 'ACTIVE', emailVerifiedAt: new Date(), timeZone: 'Africa/Lagos' },
  });
  const talent = await prisma.user.upsert({
    where: { email: 'talent@example.test' },
    update: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    create: { email: 'talent@example.test', registrationIntent: 'TALENT', firstName: 'Tobi', lastName: 'Adeyemi', displayName: 'Tobi Adeyemi', status: 'ACTIVE', emailVerifiedAt: new Date(), timeZone: 'Africa/Lagos' },
  });
  await Promise.all([
    prisma.userPreference.upsert({ where: { userId: owner.id }, create: { userId: owner.id }, update: {} }),
    prisma.userPreference.upsert({ where: { userId: talent.id }, create: { userId: talent.id }, update: {} }),
  ]);

  const organisation = await prisma.organisation.upsert({
    where: { slug: 'acme-demo' },
    update: { name: 'Acme Demo Ltd', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
    create: { name: 'Acme Demo Ltd', legalName: 'Acme Demo Limited', slug: 'acme-demo', status: 'ACTIVE', verificationStatus: 'VERIFIED', verifiedAt: new Date(), industry: 'Technology', companySize: '51-200', countryCode: 'NG', timeZone: 'Africa/Lagos' },
  });
  await prisma.organisationMembership.upsert({
    where: { organisationId_userId: { organisationId: organisation.id, userId: owner.id } },
    create: { organisationId: organisation.id, userId: owner.id, roleId: ownerRoleId, status: 'ACTIVE', joinedAt: new Date() },
    update: { roleId: ownerRoleId, status: 'ACTIVE', joinedAt: new Date(), revokedAt: null },
  });

  const profile = await prisma.talentProfile.upsert({
    where: { userId: talent.id },
    update: { status: 'ACTIVE', visibility: 'PUBLIC', availabilityStatus: 'AVAILABLE_NOW' },
    create: { userId: talent.id, headline: 'Senior TypeScript Engineer', bio: 'Fictional seeded profile for local product journeys.', status: 'ACTIVE', visibility: 'PUBLIC', availabilityStatus: 'AVAILABLE_NOW', countryCode: 'NG', city: 'Lagos', timeZone: 'Africa/Lagos', yearsExperience: 7, seniority: 'SENIOR', expectedRateAmount: '45.00', expectedRateCurrency: 'USD', expectedRateUnit: 'HOURLY', preferredEmploymentTypes: ['FULL_TIME', 'CONTRACT'], preferredWorkArrangement: 'REMOTE', completionPercent: 90 },
  });
  const category = await prisma.skillCategory.upsert({ where: { key: 'software-engineering' }, create: { key: 'software-engineering', name: 'Software Engineering' }, update: { name: 'Software Engineering' } });
  const skill = await prisma.skill.upsert({ where: { key: 'typescript' }, create: { key: 'typescript', name: 'TypeScript', categoryId: category.id }, update: { name: 'TypeScript', categoryId: category.id, isApproved: true } });
  await prisma.talentSkill.upsert({ where: { talentProfileId_skillId: { talentProfileId: profile.id, skillId: skill.id } }, create: { talentProfileId: profile.id, skillId: skill.id, proficiency: 'EXPERT', yearsExperience: 7, isPrimary: true }, update: { proficiency: 'EXPERT', yearsExperience: 7, isPrimary: true } });

  const job = await prisma.job.upsert({
    where: { organisationId_slug: { organisationId: organisation.id, slug: 'senior-typescript-engineer' } },
    create: { organisationId: organisation.id, reference: 'ORJ-DEMO-TYPESCRIPT', title: 'Senior TypeScript Engineer', slug: 'senior-typescript-engineer', status: 'PUBLISHED', moderationStatus: 'APPROVED', employmentType: 'FULL_TIME', workArrangement: 'REMOTE', description: 'Build reliable hiring and workforce services in TypeScript.', requirementsText: 'Strong TypeScript, PostgreSQL, and API design experience.', countryCode: 'NG', timeZone: 'Africa/Lagos', isRemoteFriendly: true, rateMinAmount: '35.00', rateMaxAmount: '55.00', rateCurrency: 'USD', rateUnit: 'HOURLY', minYearsExperience: 5, seniority: 'SENIOR', publishedAt: new Date(), contactEmail: owner.email },
    update: { status: 'PUBLISHED', moderationStatus: 'APPROVED', publishedAt: new Date(), archivedAt: null, closedAt: null },
  });
  const history = await prisma.jobStatusHistory.count({ where: { jobId: job.id } });
  if (!history) await prisma.jobStatusHistory.create({ data: { jobId: job.id, toStatus: 'PUBLISHED', changedById: owner.id, reason: 'Development seed' } });
  const requirementId = '00000000-0000-4000-8000-000000000101';
  await prisma.jobRequirement.upsert({ where: { id: requirementId }, create: { id: requirementId, jobId: job.id, kind: 'REQUIRED_SKILL', skillId: skill.id, label: 'TypeScript', isMandatory: true, minYears: 4 }, update: { skillId: skill.id, label: 'TypeScript', isMandatory: true, minYears: 4 } });

  const application = await prisma.application.upsert({
    where: { jobId_talentProfileId: { jobId: job.id, talentProfileId: profile.id } },
    create: { organisationId: organisation.id, jobId: job.id, talentProfileId: profile.id, status: 'SUBMITTED', source: 'DIRECT', coverLetter: 'Fictional application used for local end-to-end testing.', expectedRateAmount: '45.00', expectedRateCurrency: 'USD', expectedRateUnit: 'HOURLY' },
    update: {},
  });
  const appHistory = await prisma.applicationStatusHistory.count({ where: { applicationId: application.id } });
  if (!appHistory) await prisma.applicationStatusHistory.create({ data: { applicationId: application.id, toStatus: application.status, changedById: talent.id, reason: 'Development seed' } });
  console.log('development journey: organisation, owner, public talent, job and application ready');
}

async function main(): Promise<void> {
  const permissionIds = await seedPermissions();
  const roleIds = await seedRoles(permissionIds);
  const adminCount = await seedBootstrapAdmins(roleIds);
  await seedDevelopmentMatchingPolicy();
  await seedDevelopmentJourney(roleIds);

  console.log(`seed complete: ${adminCount} bootstrap admin(s)`);
}

void main()
  .catch((error: unknown) => {
    console.error('seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
