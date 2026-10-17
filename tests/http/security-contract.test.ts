import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { getPrisma } from '../../src/database/prisma.js';
import { createSession } from '../../src/modules/auth/session.service.js';
import { hashToken } from '../../src/common/security/tokens.js';
import {
  createTestOrganisation,
  createTestUser,
  ensureOrganisationRole,
} from '../helpers/factories.js';

function containsKey(value: unknown, forbidden: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, forbidden));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, nested]) => forbidden.has(key) || containsKey(nested, forbidden),
  );
}

describe('HTTP security and projection contract', () => {
  const app = createApp();

  it('requires an explicit organisation for a multi-organisation account', async () => {
    const prisma = getPrisma();
    const user = await createTestUser('multi-org');
    const [first, second, role] = await Promise.all([
      createTestOrganisation('multi-a'),
      createTestOrganisation('multi-b'),
      ensureOrganisationRole('TALENT'),
    ]);
    await prisma.organisationMembership.createMany({
      data: [
        {
          organisationId: first.id,
          userId: user.id,
          roleId: role.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          organisationId: second.id,
          userId: user.id,
          roleId: role.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });
    const created = await createSession({ userId: user.id, mfaSatisfied: true });
    const authorization = `Bearer ${created.token}`;

    const unscoped = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(unscoped.body.data.context.organisationId).toBeNull();

    const firstScoped = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authorization)
      .set('X-Organisation-Id', first.id)
      .expect(200);
    const secondScoped = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authorization)
      .set('X-Organisation-Id', second.id)
      .expect(200);
    expect(firstScoped.body.data.context).toMatchObject({
      organisationId: first.id,
      organisationRole: 'TALENT',
    });
    expect(secondScoped.body.data.context).toMatchObject({
      organisationId: second.id,
      organisationRole: 'TALENT',
    });

    const stored = await prisma.userSession.findUniqueOrThrow({
      where: { id: created.session.id },
    });
    expect(stored.tokenHash).toBe(hashToken(created.token));
    expect(stored.tokenHash).not.toBe(created.token);
  });

  it('rejects revoked sessions and sessions belonging to suspended users immediately', async () => {
    const prisma = getPrisma();
    const revokedUser = await createTestUser('revoked-session');
    const revoked = await createSession({ userId: revokedUser.id, mfaSatisfied: true });
    await prisma.userSession.update({
      where: { id: revoked.session.id },
      data: { revokedAt: new Date(), revokedReason: 'HTTP security test' },
    });
    const revokedResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${revoked.token}`)
      .expect(401);
    expect(revokedResponse.body.error.code).toBe('SESSION_REVOKED');

    const suspendedUser = await createTestUser('suspended-session');
    const suspended = await createSession({ userId: suspendedUser.id, mfaSatisfied: true });
    await prisma.user.update({
      where: { id: suspendedUser.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: 'HTTP security test' },
    });
    const suspendedResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${suspended.token}`)
      .expect(401);
    expect(suspendedResponse.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('keeps contact, identity, and security fields out of public talent projections', async () => {
    const prisma = getPrisma();
    const talent = await createTestUser('public-projection');
    const profile = await prisma.talentProfile.create({
      data: {
        userId: talent.id,
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        headline: 'Public test profile',
        bio: 'Only explicitly public profile fields should be returned.',
      },
    });

    const response = await request(app)
      .get(`/api/v1/public/talents/${profile.id}`)
      .expect(200);
    expect(response.body.data.profile).toMatchObject({ id: profile.id, headline: profile.headline });
    expect(
      containsKey(
        response.body.data.profile,
        new Set([
          'email',
          'phone',
          'userId',
          'emailVerifiedAt',
          'isPlatformAdmin',
          'passwordHash',
          'tokenHash',
        ]),
      ),
    ).toBe(false);
  });

  it('does not expose a company mutation route for another talent global profile', async () => {
    const prisma = getPrisma();
    const companyUser = await createTestUser('company-profile-boundary');
    const company = await createTestOrganisation('profile-boundary');
    const companyRole = await ensureOrganisationRole('COMPANY_OWNER');
    await prisma.organisationMembership.create({
      data: {
        organisationId: company.id,
        userId: companyUser.id,
        roleId: companyRole.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    const talent = await createTestUser('protected-profile');
    const profile = await prisma.talentProfile.create({
      data: {
        userId: talent.id,
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        headline: 'Talent-authored headline',
      },
    });
    const session = await createSession({ userId: companyUser.id, mfaSatisfied: true });
    const config = loadConfig();

    await request(app)
      .patch(`/api/v1/talents/${profile.id}`)
      .set('Authorization', `Bearer ${session.token}`)
      .set('Origin', config.allowedOrigins[0] ?? 'http://localhost:3000')
      .send({ headline: 'Company-authored overwrite' })
      .expect(404);
    expect(
      (await prisma.talentProfile.findUniqueOrThrow({ where: { id: profile.id } })).headline,
    ).toBe('Talent-authored headline');
  });

  it('lets a talent update their own profile while keeping unrelated private profiles hidden', async () => {
    const prisma = getPrisma();
    const talent = await createTestUser('profile-owner');
    const ownProfile = await prisma.talentProfile.create({
      data: {
        userId: talent.id,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        headline: 'Original headline',
      },
    });
    const hiddenTalent = await createTestUser('private-profile');
    const hiddenProfile = await prisma.talentProfile.create({
      data: {
        userId: hiddenTalent.id,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        headline: 'Hidden headline',
      },
    });
    const session = await createSession({ userId: talent.id, mfaSatisfied: true });
    const config = loadConfig();
    const authorization = `Bearer ${session.token}`;

    const read = await request(app)
      .get('/api/v1/talents/me/profile')
      .set('Authorization', authorization)
      .expect(200);
    expect(read.body.data.profile.id).toBe(ownProfile.id);

    const updated = await request(app)
      .patch('/api/v1/talents/me/profile')
      .set('Authorization', authorization)
      .set('Origin', config.allowedOrigins[0] ?? 'http://localhost:3000')
      .send({ expectedUpdatedAt: ownProfile.updatedAt.toISOString(), headline: 'Updated by owner' })
      .expect(200);
    expect(updated.body.data.profile.headline).toBe('Updated by owner');

    await request(app)
      .get(`/api/v1/talents/${hiddenProfile.id}`)
      .set('Authorization', authorization)
      .expect(404);
    expect(
      (await prisma.talentProfile.findUniqueOrThrow({ where: { id: hiddenProfile.id } })).headline,
    ).toBe('Hidden headline');
  });

  it('never publishes companies-only profiles through public discovery', async () => {
    const prisma = getPrisma();
    const talent = await createTestUser('companies-only');
    const marker = `Companies only ${crypto.randomUUID()}`;
    const profile = await prisma.talentProfile.create({
      data: {
        userId: talent.id,
        status: 'ACTIVE',
        visibility: 'ORENO_COMPANIES_ONLY',
        headline: marker,
      },
    });

    await request(app).get(`/api/v1/public/talents/${profile.id}`).expect(404);
    const listing = await request(app)
      .get('/api/v1/public/talents')
      .query({ page: 1, pageSize: 20, q: marker })
      .expect(200);
    expect(listing.body.data.talents).toEqual([]);
  });
});
