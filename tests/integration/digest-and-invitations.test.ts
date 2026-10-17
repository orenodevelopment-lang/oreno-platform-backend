import { describe, expect, it } from 'vitest';
import { generateToken } from '../../src/common/security/tokens.js';
import { getPrisma } from '../../src/database/prisma.js';
import {
  sendExpiringInvitationReminders,
  sendWeeklyDigests,
} from '../../src/workers/digest.service.js';
import {
  createTestOrganisation,
  createTestUser,
  ensureOrganisationRole,
} from '../helpers/factories.js';

describe('scheduled email workflows', () => {
  it('deduplicates weekly digests for enabled active organisation members', async () => {
    const prisma = getPrisma();
    const [user, organisation, role] = await Promise.all([
      createTestUser('digest-user'),
      createTestOrganisation('digest-org'),
      ensureOrganisationRole('COMPANY_OWNER'),
    ]);
    await prisma.userPreference.create({
      data: { userId: user.id, emailNotifications: true, weeklyDigest: true },
    });
    await prisma.organisationMembership.create({
      data: {
        organisationId: organisation.id,
        userId: user.id,
        roleId: role.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    const reference = new Date('2026-10-19T07:00:00.000Z');
    await prisma.notification.create({
      data: {
        userId: user.id,
        organisationId: organisation.id,
        eventKey: 'test.digest',
        title: 'Weekly update',
        body: 'A useful update.',
        createdAt: new Date('2026-10-16T12:00:00.000Z'),
      },
    });

    await sendWeeklyDigests(reference);
    await sendWeeklyDigests(reference);

    const deliveries = await prisma.emailDelivery.findMany({
      where: {
        recipientEmail: user.email,
        templateKey: 'weekly-digest',
        organisationId: organisation.id,
      },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.payloadEncrypted).toBeTruthy();
  });

  it('rotates and hashes a soon-to-expire invitation token only once', async () => {
    const prisma = getPrisma();
    const [inviter, organisation, role] = await Promise.all([
      createTestUser('reminder-inviter'),
      createTestOrganisation('reminder-org'),
      ensureOrganisationRole('MANAGER'),
    ]);
    const original = generateToken();
    const reference = new Date('2026-10-16T08:17:00.000Z');
    const invitation = await prisma.invitation.create({
      data: {
        organisationId: organisation.id,
        email: `invite-${organisation.id}@example.test`,
        firstName: 'Invitee',
        lastName: 'Person',
        roleId: role.id,
        tokenHash: original.hash,
        invitedById: inviter.id,
        expiresAt: new Date(reference.getTime() + 2 * 24 * 60 * 60 * 1000),
      },
    });

    // The sweep may also claim other fixtures created by concurrently running
    // integration files; this invitation must be among the claimed rows.
    expect(await sendExpiringInvitationReminders(reference)).toBeGreaterThanOrEqual(1);
    await sendExpiringInvitationReminders(reference);

    const updated = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(updated.tokenHash).not.toBe(original.hash);
    expect(updated.reminderCount).toBe(1);
    expect(updated.lastRemindedAt).toEqual(reference);

    const delivery = await prisma.emailDelivery.findFirstOrThrow({
      where: {
        recipientEmail: invitation.email,
        templateKey: 'invitation-reminder',
        organisationId: organisation.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(delivery.payloadEncrypted).toBeTruthy();
    expect(JSON.stringify(delivery)).not.toContain(original.token);
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventKey: 'email.delivery_requested', aggregateId: delivery.id },
    });
    expect(event.payload).toEqual({ deliveryId: delivery.id });
  });
});
