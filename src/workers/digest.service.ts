import { generateToken } from '../common/security/tokens.js';
import { loadConfig } from '../config/index.js';
import { getPrisma } from '../database/prisma.js';
import { EMAIL_TEMPLATES } from '../platform/email/email.types.js';
import { enqueueEmail, stageEmail } from '../platform/email/email.service.js';

const INVITATION_REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function utcWeek(reference: Date): { start: Date; end: Date; key: string; label: string } {
  const end = new Date(reference);
  end.setUTCHours(0, 0, 0, 0);
  const day = end.getUTCDay();
  end.setUTCDate(end.getUTCDate() - (day === 0 ? 6 : day - 1));
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const key = start.toISOString().slice(0, 10);
  const label = `${key} to ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}`;
  return { start, end, key, label };
}

/**
 * Stage one weekly summary per active user and organisation. The stable week
 * key makes overlapping workers and manual re-runs harmless.
 */
export async function sendWeeklyDigests(reference = new Date()): Promise<number> {
  const prisma = getPrisma();
  const period = utcWeek(reference);
  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      preferences: { emailNotifications: true, weeklyDigest: true },
      memberships: { some: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      displayName: true,
      memberships: {
        where: { status: 'ACTIVE', organisation: { status: 'ACTIVE' } },
        select: { organisation: { select: { id: true, name: true } } },
      },
    },
  });
  let staged = 0;
  for (const user of users) {
    for (const membership of user.memberships) {
      const [total, unread] = await Promise.all([
        prisma.notification.count({
          where: {
            userId: user.id,
            organisationId: membership.organisation.id,
            createdAt: { gte: period.start, lt: period.end },
            dismissedAt: null,
          },
        }),
        prisma.notification.count({
          where: {
            userId: user.id,
            organisationId: membership.organisation.id,
            createdAt: { gte: period.start, lt: period.end },
            readAt: null,
            dismissedAt: null,
          },
        }),
      ]);
      if (total === 0) continue;
      await enqueueEmail({
        to: user.email,
        toName: user.displayName ?? user.firstName ?? undefined,
        template: EMAIL_TEMPLATES.WEEKLY_DIGEST,
        variables: {
          periodLabel: period.label,
          organisationName: membership.organisation.name,
          summaryLines: `${total} update${total === 1 ? '' : 's'}, ${unread} unread.`,
          appUrl: loadConfig().appUrl.replace(/\/$/, ''),
        },
        organisationId: membership.organisation.id,
        dedupeKey: `weekly-digest:${period.key}:${user.id}:${membership.organisation.id}`,
      });
      staged += 1;
    }
  }
  return staged;
}

/**
 * Replace a soon-to-expire invitation token with a fresh raw token in the
 * reminder email while preserving the original expiry. Only the hash is kept.
 */
export async function sendExpiringInvitationReminders(reference = new Date()): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date(reference.getTime() + INVITATION_REMINDER_WINDOW_MS);
  const invitations = await prisma.invitation.findMany({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: reference, lte: cutoff },
      reminderCount: 0,
    },
    include: { organisation: { select: { name: true } } },
    take: 500,
    orderBy: { expiresAt: 'asc' },
  });
  let staged = 0;
  for (const invitation of invitations) {
    const token = generateToken();
    const invitationUrl = `${loadConfig().appUrl.replace(/\/$/, '')}/auth/accept-invitation?token=${encodeURIComponent(token.token)}`;
    const changed = await prisma.$transaction(async (tx) => {
      const claim = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash: invitation.tokenHash,
          reminderCount: 0,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: reference },
        },
        data: {
          tokenHash: token.hash,
          reminderCount: { increment: 1 },
          lastRemindedAt: reference,
        },
      });
      if (claim.count === 0) return false;
      await stageEmail(tx, {
        to: invitation.email,
        toName: invitation.firstName,
        template: EMAIL_TEMPLATES.INVITATION_REMINDER,
        variables: {
          organisationName: invitation.organisation.name,
          expiresAt: invitation.expiresAt.toISOString(),
          invitationUrl,
        },
        organisationId: invitation.organisationId,
        dedupeKey: `invitation-reminder:${token.hash}`,
      });
      return true;
    });
    if (changed) staged += 1;
  }
  return staged;
}
