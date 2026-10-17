import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import { createSession, resolveSession } from '../../src/modules/auth/session.service.js';
import {
  updateOrganisationStatus,
  updateOrganisationVerification,
  updateUserStatus,
} from '../../src/modules/admin/admin.service.js';
import { dispatchDomainEvent } from '../../src/platform/events/event-bus.js';
import { EVENT_KEYS } from '../../src/platform/events/event-catalog.js';
import { registerEmailEventHandlers } from '../../src/platform/email/email.events.js';
import {
  authContext,
  createTestOrganisation,
  createTestUser,
} from '../helpers/factories.js';

describe('administrative transition reliability', () => {
  it('atomically audits status changes, emits events, and revokes affected sessions', async () => {
    registerEmailEventHandlers();
    const prisma = getPrisma();
    const admin = await createTestUser('admin-actor');
    const target = await createTestUser('admin-target');
    const targetSession = await createSession({ userId: target.id, mfaSatisfied: true });
    const adminAuth = authContext(admin.id, {
      isPlatformAdmin: true,
      platformPermissions: new Set(['admin:manage_user', 'admin:manage_organisation']),
    });

    await updateUserStatus(
      adminAuth,
      target.id,
      'SUSPENDED',
      target.updatedAt,
      'Integration-test suspension.',
    );

    expect(await resolveSession(targetSession.token)).toMatchObject({ outcome: 'revoked' });
    const [userEvent, userAudit] = await Promise.all([
      prisma.outboxEvent.findFirst({
        where: { eventKey: 'user.status_changed', aggregateId: target.id },
      }),
      prisma.auditEvent.findFirst({ where: { resourceType: 'User', resourceId: target.id } }),
    ]);
    expect(userEvent?.payload).toMatchObject({
      fromStatus: 'ACTIVE',
      toStatus: 'SUSPENDED',
    });
    expect(userAudit).not.toBeNull();
    const userEmail = await dispatchDomainEvent({
      id: userEvent!.id,
      key: EVENT_KEYS.USER_STATUS_CHANGED,
      aggregateType: userEvent!.aggregateType,
      aggregateId: userEvent!.aggregateId,
      payload: userEvent!.payload,
      occurredAt: userEvent!.createdAt,
      attempts: userEvent!.attempts,
    });
    expect(userEmail.failures).toEqual([]);
    expect(
      await prisma.emailDelivery.count({
        where: { recipientEmail: target.email, templateKey: 'account-suspended' },
      }),
    ).toBe(1);

    const createdOrganisation = await createTestOrganisation('admin-transition');
    let organisation = await prisma.organisation.update({
      where: { id: createdOrganisation.id },
      data: {
        verificationStatus: 'UNVERIFIED',
        verifiedAt: null,
        primaryContactEmail: `primary-${createdOrganisation.id}@example.test`,
        primaryContactName: 'Primary Contact',
      },
    });
    await updateOrganisationVerification(
      adminAuth,
      organisation.id,
      'IN_REVIEW',
      organisation.updatedAt,
      'Documents received.',
    );
    organisation = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id } });
    await updateOrganisationStatus(
      adminAuth,
      organisation.id,
      'SUSPENDED',
      organisation.updatedAt,
      'Compliance review.',
    );

    const organisationEvents = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: organisation.id,
        eventKey: {
          in: ['organisation.verification_changed', 'organisation.status_changed'],
        },
      },
    });
    expect(organisationEvents.map((event) => event.eventKey).sort()).toEqual([
      'organisation.status_changed',
      'organisation.verification_changed',
    ]);
    const suspension = organisationEvents.find(
      (event) => event.eventKey === EVENT_KEYS.ORGANISATION_STATUS_CHANGED,
    );
    const organisationEmail = await dispatchDomainEvent({
      id: suspension!.id,
      key: EVENT_KEYS.ORGANISATION_STATUS_CHANGED,
      aggregateType: suspension!.aggregateType,
      aggregateId: suspension!.aggregateId,
      organisationId: organisation.id,
      payload: suspension!.payload,
      occurredAt: suspension!.createdAt,
      attempts: suspension!.attempts,
    });
    expect(organisationEmail.failures).toEqual([]);
    expect(
      await prisma.emailDelivery.count({
        where: {
          recipientEmail: organisation.primaryContactEmail!,
          templateKey: 'organisation-suspended',
        },
      }),
    ).toBe(1);
  });
});
