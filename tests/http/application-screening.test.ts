import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getPrisma } from '../../src/database/prisma.js';
import { createSession } from '../../src/modules/auth/session.service.js';
import { createTestOrganisation, createTestUser, ensureOrganisationRole, suffix } from '../helpers/factories.js';

const screeningPermissions = [
  'screening:read', 'screening:assign', 'screening:cv_review', 'screening:interview_manage',
  'screening:interview_decide', 'screening:final_decide', 'screening:release', 'screening:audit_read',
];

async function grantScreeningOwner(userId: string) {
  const prisma = getPrisma();
  const role = await prisma.role.upsert({ where: { key: 'PLATFORM_OWNER' }, update: {}, create: { key: 'PLATFORM_OWNER', scope: 'PLATFORM', name: 'Platform Owner', isSystem: true } });
  for (const key of screeningPermissions) {
    const [resource, action] = key.split(':');
    const permission = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, resource: resource!, action: action! } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  await prisma.user.update({ where: { id: userId }, data: { isPlatformAdmin: true } });
  await prisma.platformRoleAssignment.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, update: { revokedAt: null }, create: { userId, roleId: role.id } });
}

describe('mandatory Oreno application screening', () => {
  const app = createApp();

  it('hides a CV-backed application until separate human approval and release', async () => {
    const prisma = getPrisma();
    const [owner, talent, admin, organisation, ownerRole] = await Promise.all([
      createTestUser('screen-company-owner'), createTestUser('screen-talent'), createTestUser('screen-admin'),
      createTestOrganisation('screen-company'), ensureOrganisationRole('COMPANY_OWNER'),
    ]);
    await grantScreeningOwner(admin.id);
    await prisma.organisationMembership.create({ data: { organisationId: organisation.id, userId: owner.id, roleId: ownerRole.id, status: 'ACTIVE', joinedAt: new Date() } });
    const profile = await prisma.talentProfile.create({ data: { userId: talent.id, status: 'ACTIVE', visibility: 'PUBLIC', headline: 'Screening test engineer' } });
    const job = await prisma.job.create({ data: { organisationId: organisation.id, reference: `ORJ-${suffix()}`, slug: `screening-${suffix()}`, title: 'Screened API Engineer', status: 'PUBLISHED', moderationStatus: 'APPROVED', employmentType: 'FULL_TIME', workArrangement: 'REMOTE', description: 'A vacancy that requires managed screening.', publishedAt: new Date(), requirements: { create: { kind: 'OTHER', label: 'Relevant API delivery', weight: 1, isMandatory: true, position: 0 } } } });
    const cv = await prisma.fileObject.create({ data: { ownerId: talent.id, category: 'CV', visibility: 'PRIVATE', status: 'READY', bucket: 'private', storageKey: `tests/cv-${suffix()}.pdf`, originalName: 'fictional-candidate-cv.pdf', mimeType: 'application/pdf', sizeBytes: 1024, scannedAt: new Date(), readyAt: new Date() } });
    const [ownerSession, talentSession, adminSession] = await Promise.all([
      createSession({ userId: owner.id, mfaSatisfied: true }), createSession({ userId: talent.id, mfaSatisfied: true }), createSession({ userId: admin.id, mfaSatisfied: true }),
    ]);
    const companyHeaders = { Authorization: `Bearer ${ownerSession.token}`, 'X-Organisation-Id': organisation.id };
    const talentHeaders = { Authorization: `Bearer ${talentSession.token}` };
    const adminHeaders = { Authorization: `Bearer ${adminSession.token}` };

    const submitted = await request(app).post(`/api/v1/public/jobs/${job.id}/applications`).set(talentHeaders).set('Idempotency-Key', randomUUID()).send({ coverLetter: 'Human review requested.', answers: [], attachments: [{ fileId: cv.id, kind: 'CV', label: cv.originalName }] }).expect(201);
    const application = submitted.body.data.application;
    expect(application.talentProfileId).toBe(profile.id);
    expect(application.screening.status).toBe('PENDING_CV_REVIEW');
    await request(app).get(`/api/v1/organisations/${organisation.id}/applications/${application.id}`).set(companyHeaders).expect(404);
    const hidden = await request(app).get(`/api/v1/organisations/${organisation.id}/applications`).set(companyHeaders).expect(200);
    expect(hidden.body.data.applications).toHaveLength(0);

    let screening = (await request(app).post(`/api/v1/admin/screening/applications/${application.id}/assign`).set(adminHeaders).send({ reviewerId: admin.id, expectedUpdatedAt: application.screening.updatedAt, reason: 'Assigned to an authorized human reviewer.' }).expect(200)).body.data.screening;
    screening = (await request(app).post(`/api/v1/admin/screening/applications/${application.id}/cv-review`).set(adminHeaders).send({ expectedUpdatedAt: screening.updatedAt, reason: 'The submitted CV meets the published role criteria.', decision: 'APPROVED', rubric: { roleEvidenceReviewed: true }, candidateVisibleFeedback: 'Your CV is advancing to an Oreno interview.', employerSafeSummary: 'Relevant evidence was verified by Oreno.' }).expect(200)).body.data.screening;
    const start = new Date(Date.now() + 86_400_000);
    screening = (await request(app).post(`/api/v1/admin/screening/applications/${application.id}/interviews`).set(adminHeaders).send({ expectedUpdatedAt: screening.updatedAt, reason: 'Schedule the required human screening interview.', interviewerId: admin.id, mode: 'VIDEO', scheduledStartAt: start.toISOString(), scheduledEndAt: new Date(start.getTime() + 3_600_000).toISOString(), timeZone: 'Africa/Lagos', meetingUrl: 'https://meet.example.test/oreno-screening' }).expect(201)).body.data.screening;
    const interview = screening.interviews[0];
    screening = (await request(app).post(`/api/v1/admin/screening/interviews/${interview.id}/outcome`).set(adminHeaders).send({ expectedUpdatedAt: interview.updatedAt, reason: 'Human interviewer verified the role evidence.', outcome: 'PASSED', rubric: { communicationReviewed: true }, candidateVisibleFeedback: 'Your Oreno interview was completed successfully.' }).expect(200)).body.data.screening;
    screening = (await request(app).post(`/api/v1/admin/screening/applications/${application.id}/final-decision`).set(adminHeaders).send({ expectedUpdatedAt: screening.updatedAt, reason: 'CV and interview evidence support company submission.', decision: 'APPROVED', candidateMessage: 'Oreno approved this application for forwarding.', employerSummary: 'Oreno reviewed the submitted CV and completed a human role interview.' }).expect(200)).body.data.screening;
    expect(screening.status).toBe('APPROVED_FOR_SUBMISSION');
    await request(app).get(`/api/v1/organisations/${organisation.id}/applications/${application.id}`).set(companyHeaders).expect(404);

    const releaseKey = randomUUID();
    const released = await request(app).post(`/api/v1/admin/screening/applications/${application.id}/release`).set(adminHeaders).set('Idempotency-Key', releaseKey).send({ expectedUpdatedAt: screening.updatedAt, reason: 'Explicitly forwarding the approved candidate to the named company.', organisationId: organisation.id, confirmation: true }).expect(200);
    expect(released.body.data.screening.status).toBe('RELEASED_TO_COMPANY');
    const replay = await request(app).post(`/api/v1/admin/screening/applications/${application.id}/release`).set(adminHeaders).set('Idempotency-Key', releaseKey).send({ expectedUpdatedAt: screening.updatedAt, reason: 'Explicitly forwarding the approved candidate to the named company.', organisationId: organisation.id, confirmation: true }).expect(200);
    expect(replay.body.meta.replayed).toBe(true);

    const visible = await request(app).get(`/api/v1/organisations/${organisation.id}/applications/${application.id}`).set(companyHeaders).expect(200);
    expect(visible.body.data.application.screening).toMatchObject({ employerSummary: 'Oreno reviewed the submitted CV and completed a human role interview.' });
    expect(await prisma.shortlistCandidate.count({ where: { applicationId: application.id } })).toBe(1);
  });
});
