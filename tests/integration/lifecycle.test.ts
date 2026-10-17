import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import { activateDuePlacements, expireStaleOffers } from '../../src/workers/lifecycle.service.js';

describe('scheduled business lifecycle', () => {
  it('expires offers and activates a due placement exactly once', async () => {
    const suffix = randomUUID().slice(0, 8);
    const prisma = getPrisma();
    const user = await prisma.user.create({ data: { email: `lifecycle-${suffix}@example.test`, firstName: 'Test', lastName: 'Talent', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const creator = await prisma.user.create({ data: { email: `creator-${suffix}@example.test`, firstName: 'Test', lastName: 'Owner', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const organisation = await prisma.organisation.create({ data: { name: `Lifecycle ${suffix}`, slug: `lifecycle-${suffix}`, status: 'ACTIVE', verificationStatus: 'VERIFIED' } });
    const profile = await prisma.talentProfile.create({ data: { userId: user.id, status: 'ACTIVE', visibility: 'PRIVATE' } });
    const job = await prisma.job.create({ data: { organisationId: organisation.id, reference: `ORJ-LIFE-${suffix}`, title: 'Lifecycle role', slug: `lifecycle-role-${suffix}`, status: 'PUBLISHED', moderationStatus: 'APPROVED', employmentType: 'FULL_TIME', workArrangement: 'REMOTE', description: 'Integration test role', publishedAt: new Date() } });
    const application = await prisma.application.create({ data: { organisationId: organisation.id, jobId: job.id, talentProfileId: profile.id, status: 'OFFER_PENDING' } });
    const expiredOffer = await prisma.offer.create({ data: { organisationId: organisation.id, jobId: job.id, applicationId: application.id, talentProfileId: profile.id, status: 'SENT', reference: `ORO-EXPIRE-${suffix}`, title: job.title, employmentType: 'FULL_TIME', workArrangement: 'REMOTE', startDate: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() - 60_000), sentAt: new Date(Date.now() - 86_400_000), createdById: creator.id } });

    await expireStaleOffers();
    await expireStaleOffers();
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: expiredOffer.id } })).status).toBe('EXPIRED');
    expect(await prisma.offerStatusHistory.count({ where: { offerId: expiredOffer.id, toStatus: 'EXPIRED' } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: expiredOffer.id, eventKey: 'offer.expired' } })).toBe(1);

    const secondApplication = await prisma.application.create({ data: { organisationId: organisation.id, jobId: job.id, talentProfileId: await prisma.talentProfile.create({ data: { user: { create: { email: `placed-${suffix}@example.test`, firstName: 'Placed', lastName: 'Talent', status: 'ACTIVE', emailVerifiedAt: new Date() } }, status: 'ACTIVE', visibility: 'PRIVATE' } }).then((item) => item.id), status: 'ACCEPTED' } });
    const secondProfileId = secondApplication.talentProfileId;
    const acceptedOffer = await prisma.offer.create({ data: { organisationId: organisation.id, jobId: job.id, applicationId: secondApplication.id, talentProfileId: secondProfileId, status: 'ACCEPTED', reference: `ORO-ACTIVE-${suffix}`, title: job.title, employmentType: 'FULL_TIME', workArrangement: 'REMOTE', startDate: new Date(Date.now() - 86_400_000), createdById: creator.id } });
    const placement = await prisma.placement.create({ data: { organisationId: organisation.id, offerId: acceptedOffer.id, jobId: job.id, talentProfileId: secondProfileId, status: 'PENDING', reference: `ORP-LIFE-${suffix}`, title: job.title, startDate: new Date(Date.now() - 86_400_000) } });
    const assignment = await prisma.staffAssignment.create({ data: { organisationId: organisation.id, placementId: placement.id, talentProfileId: secondProfileId, employeeCode: `LIFE-${suffix}`, status: 'PENDING', jobTitle: job.title, employmentType: 'FULL_TIME', workArrangement: 'REMOTE', effectiveFrom: new Date(Date.now() - 86_400_000) } });
    const agreement = await prisma.payAgreement.create({ data: { organisationId: organisation.id, staffAssignmentId: assignment.id, talentProfileId: secondProfileId, status: 'DRAFT', basis: 'MONTHLY', rateAmount: '5000', currency: 'USD', ordinaryHoursPerPeriod: '160', effectiveFrom: new Date(Date.now() - 86_400_000), createdById: creator.id } });

    await activateDuePlacements();
    await activateDuePlacements();
    expect((await prisma.placement.findUniqueOrThrow({ where: { id: placement.id } })).status).toBe('ACTIVE');
    expect((await prisma.staffAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe('ACTIVE');
    expect((await prisma.payAgreement.findUniqueOrThrow({ where: { id: agreement.id } })).status).toBe('ACTIVE');
    expect(await prisma.placementStatusHistory.count({ where: { placementId: placement.id, toStatus: 'ACTIVE' } })).toBe(1);
  });
});
