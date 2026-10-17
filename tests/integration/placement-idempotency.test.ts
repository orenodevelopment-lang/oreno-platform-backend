import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import { respondToOffer } from '../../src/modules/pipeline/pipeline.service.js';
import {
  authContext,
  createTestOrganisation,
  createTestUser,
  ensureOrganisationRole,
  suffix,
} from '../helpers/factories.js';

describe('offer acceptance placement creation', () => {
  it('reuses the account and profile and creates one placement on retries', async () => {
    const prisma = getPrisma();
    const creator = await createTestUser('offer-owner');
    const talent = await createTestUser('offer-talent');
    const organisation = await createTestOrganisation('offer-acceptance');
    const profile = await prisma.talentProfile.create({
      data: { userId: talent.id, status: 'ACTIVE', visibility: 'PRIVATE' },
    });
    await ensureOrganisationRole('TALENT');
    const id = suffix();
    const job = await prisma.job.create({
      data: {
        organisationId: organisation.id,
        reference: `ORJ-ACCEPT-${id}`,
        title: 'Accepted role',
        slug: `accepted-role-${id}`,
        status: 'PUBLISHED',
        moderationStatus: 'APPROVED',
        employmentType: 'FULL_TIME',
        workArrangement: 'REMOTE',
        description: 'Offer acceptance integration role.',
        publishedAt: new Date(),
      },
    });
    const application = await prisma.application.create({
      data: {
        organisationId: organisation.id,
        jobId: job.id,
        talentProfileId: profile.id,
        status: 'OFFER_PENDING',
      },
    });
    const offer = await prisma.offer.create({
      data: {
        organisationId: organisation.id,
        jobId: job.id,
        applicationId: application.id,
        talentProfileId: profile.id,
        status: 'SENT',
        reference: `ORO-ACCEPT-${id}`,
        title: job.title,
        employmentType: 'FULL_TIME',
        workArrangement: 'REMOTE',
        startDate: new Date(Date.now() - 86_400_000),
        sentAt: new Date(),
        createdById: creator.id,
        terms: {
          create: [
            {
              key: 'base_compensation',
              label: 'Base compensation',
              valueAmount: '5000',
              currency: 'USD',
              rateUnit: 'MONTHLY',
            },
            {
              key: 'ordinary_hours_per_period',
              label: 'Ordinary hours per period',
              valueAmount: '160',
            },
          ],
        },
      },
    });
    const talentAuth = authContext(talent.id);

    const first = await respondToOffer(talentAuth, offer.id, 'ACCEPT');
    const retry = await respondToOffer(talentAuth, offer.id, 'ACCEPT');

    expect(retry.placement?.id).toBe(first.placement?.id);
    expect(retry.staffAssignment?.id).toBe(first.staffAssignment?.id);
    expect(await prisma.user.count({ where: { id: talent.id } })).toBe(1);
    expect(await prisma.talentProfile.count({ where: { userId: talent.id } })).toBe(1);
    expect(await prisma.placement.count({ where: { offerId: offer.id } })).toBe(1);
    expect(await prisma.staffAssignment.count({ where: { placementId: first.placement?.id } })).toBe(1);
    expect(
      await prisma.organisationMembership.count({
        where: { organisationId: organisation.id, userId: talent.id },
      }),
    ).toBe(1);
  });
});
