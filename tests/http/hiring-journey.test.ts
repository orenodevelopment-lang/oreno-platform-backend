import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getPrisma } from '../../src/database/prisma.js';
import { createSession } from '../../src/modules/auth/session.service.js';
import {
  createTestOrganisation,
  createTestUser,
  ensureOrganisationRole,
} from '../helpers/factories.js';

describe('company-to-candidate hiring API journey', () => {
  const app = createApp();

  it('publishes a job and reuses the candidate identity through offer acceptance', async () => {
    const prisma = getPrisma();
    const [owner, talent, organisation, ownerRole] = await Promise.all([
      createTestUser('journey-owner'),
      createTestUser('journey-talent'),
      createTestOrganisation('journey-company'),
      ensureOrganisationRole('COMPANY_OWNER'),
    ]);
    await prisma.organisationMembership.create({
      data: {
        organisationId: organisation.id,
        userId: owner.id,
        roleId: ownerRole.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    const profile = await prisma.talentProfile.create({
      data: {
        userId: talent.id,
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        headline: 'API journey engineer',
        availabilityStatus: 'AVAILABLE_NOW',
      },
    });
    const cv = await prisma.fileObject.create({
      data: {
        ownerId: talent.id,
        category: 'CV',
        visibility: 'PRIVATE',
        status: 'READY',
        bucket: 'private',
        storageKey: `tests/hiring-journey-${randomUUID()}.pdf`,
        originalName: 'hiring-journey-cv.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        scannedAt: new Date(),
        readyAt: new Date(),
      },
    });
    const [ownerSession, talentSession] = await Promise.all([
      createSession({ userId: owner.id, mfaSatisfied: true }),
      createSession({ userId: talent.id, mfaSatisfied: true }),
    ]);
    const companyHeaders = {
      Authorization: `Bearer ${ownerSession.token}`,
      'X-Organisation-Id': organisation.id,
    };
    const talentHeaders = { Authorization: `Bearer ${talentSession.token}` };

    const createdJob = await request(app)
      .post(`/api/v1/organisations/${organisation.id}/jobs`)
      .set(companyHeaders)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'Senior API Engineer',
        employmentType: 'FULL_TIME',
        workArrangement: 'REMOTE',
        description: 'Build reliable APIs for a multi-tenant workforce platform.',
        applicationDeadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        requirements: [
          {
            kind: 'OTHER',
            label: 'Production API experience',
            weight: 1,
            isMandatory: true,
            position: 0,
          },
        ],
      })
      .expect(201);
    const job = createdJob.body.data.job;
    expect(createdJob.body.meta.replayed).toBe(false);

    const published = await request(app)
      .post(`/api/v1/organisations/${organisation.id}/jobs/${job.id}/publish`)
      .set(companyHeaders)
      .send({ expectedUpdatedAt: job.updatedAt, reason: 'Ready for candidates.' })
      .expect(200);
    expect(published.body.data.job.status).toBe('PUBLISHED');

    const publicJob = await request(app).get(`/api/v1/public/jobs/${job.id}`).expect(200);
    expect(publicJob.body.data.job).toMatchObject({ id: job.id, title: 'Senior API Engineer' });

    const applicationResponse = await request(app)
      .post(`/api/v1/jobs/${job.id}/applications`)
      .set(talentHeaders)
      .set('Idempotency-Key', randomUUID())
      .send({
        coverLetter: 'I have built and operated multi-tenant TypeScript services.',
        answers: [],
        attachments: [{ fileId: cv.id, kind: 'CV', label: cv.originalName }],
      })
      .expect(201);
    let application = applicationResponse.body.data.application;
    expect(application.talentProfileId).toBe(profile.id);

    await prisma.applicationScreening.update({
      where: { applicationId: application.id },
      data: {
        status: 'RELEASED_TO_COMPANY',
        finalDecision: 'APPROVED',
        finalDecidedAt: new Date(),
        approvedAt: new Date(),
        releasedToCompanyAt: new Date(),
        employerSummary: 'Legacy hiring journey fixture explicitly classified as released.',
      },
    });

    for (const status of ['UNDER_REVIEW', 'SHORTLISTED'] as const) {
      const transition = await request(app)
        .post(`/api/v1/organisations/${organisation.id}/applications/${application.id}/status`)
        .set(companyHeaders)
        .send({
          status,
          expectedUpdatedAt: application.updatedAt,
          reason: `Moved to ${status}.`,
        })
        .expect(200);
      application = transition.body.data.application;
      expect(application.status).toBe(status);
    }

    const offerResponse = await request(app)
      .post(`/api/v1/organisations/${organisation.id}/offers`)
      .set(companyHeaders)
      .send({
        applicationId: application.id,
        title: 'Senior API Engineer',
        employmentType: 'FULL_TIME',
        workArrangement: 'REMOTE',
        startDate: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        terms: [
          {
            key: 'base_compensation',
            label: 'Base hourly compensation',
            valueAmount: '45.00',
            currency: 'USD',
            rateUnit: 'HOURLY',
            position: 0,
          },
        ],
      })
      .expect(201);
    const draftOffer = offerResponse.body.data.offer;

    const sentOfferResponse = await request(app)
      .post(`/api/v1/organisations/${organisation.id}/offers/${draftOffer.id}/send`)
      .set(companyHeaders)
      .send({ expectedUpdatedAt: draftOffer.updatedAt })
      .expect(200);
    expect(sentOfferResponse.body.data.offer.status).toBe('SENT');

    const visibleOffers = await request(app)
      .get('/api/v1/talents/me/offers')
      .set(talentHeaders)
      .expect(200);
    expect(visibleOffers.body.data.offers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: draftOffer.id, status: 'SENT' })]),
    );

    const acceptanceKey = randomUUID();
    const accepted = await request(app)
      .post(`/api/v1/talents/me/offers/${draftOffer.id}/respond`)
      .set(talentHeaders)
      .set('Idempotency-Key', acceptanceKey)
      .send({ response: 'ACCEPT' })
      .expect(200);
    const replay = await request(app)
      .post(`/api/v1/talents/me/offers/${draftOffer.id}/respond`)
      .set(talentHeaders)
      .set('Idempotency-Key', acceptanceKey)
      .send({ response: 'ACCEPT' })
      .expect(200);

    expect(accepted.body.data.offer.status).toBe('ACCEPTED');
    expect(accepted.body.data.placement.talentProfileId).toBe(profile.id);
    expect(accepted.body.data.staffAssignment.talentProfileId).toBe(profile.id);
    expect(replay.body.meta.replayed).toBe(true);
    expect(replay.body.data.placement.id).toBe(accepted.body.data.placement.id);

    const stored = await prisma.placement.findUniqueOrThrow({
      where: { id: accepted.body.data.placement.id },
      include: { staffAssignment: { include: { payAgreements: true } } },
    });
    expect(stored.talentProfileId).toBe(profile.id);
    expect(stored.staffAssignment?.talentProfileId).toBe(profile.id);
    expect(stored.staffAssignment?.payAgreements).toHaveLength(1);
    expect(await prisma.talentProfile.count({ where: { userId: talent.id } })).toBe(1);
  });
});
