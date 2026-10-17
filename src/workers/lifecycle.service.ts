import { getPrisma } from '../database/prisma.js';
import { EVENT_KEYS } from '../platform/events/event-catalog.js';
import { emitEvent } from '../platform/outbox/outbox.service.js';
import { invalidateUser } from '../platform/rbac/rbac.service.js';

const BATCH_SIZE = 100;

/** Expire sent offers with a durable history row and follow-up event. */
export async function expireStaleOffers(now = new Date()): Promise<number> {
  const offers = await getPrisma().offer.findMany({
    where: { status: { in: ['SENT', 'VIEWED'] }, expiresAt: { lte: now } },
    select: { id: true, status: true, organisationId: true, applicationId: true, talentProfileId: true },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    take: BATCH_SIZE,
  });

  let expired = 0;
  for (const offer of offers) {
    const changed = await getPrisma().$transaction(async (tx) => {
      const result = await tx.offer.updateMany({
        where: { id: offer.id, status: offer.status, expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      if (result.count === 0) return false;
      await tx.offerStatusHistory.create({
        data: { offerId: offer.id, fromStatus: offer.status, toStatus: 'EXPIRED', reason: 'Offer validity period elapsed' },
      });
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.OFFER_EXPIRED,
        aggregateType: 'Offer',
        aggregateId: offer.id,
        organisationId: offer.organisationId,
        payload: { offerId: offer.id, applicationId: offer.applicationId, talentProfileId: offer.talentProfileId, organisationId: offer.organisationId },
      });
      return true;
    });
    if (changed) expired += 1;
  }
  return expired;
}

/** Activate accepted future-dated placements and their linked workforce/pay records. */
export async function activateDuePlacements(now = new Date()): Promise<number> {
  const placements = await getPrisma().placement.findMany({
    where: { status: 'PENDING', startDate: { lte: now }, organisation: { status: 'ACTIVE' } },
    select: {
      id: true,
      organisationId: true,
      talentProfileId: true,
      talentProfile: { select: { userId: true } },
      staffAssignment: {
        select: {
          id: true,
          status: true,
          payAgreements: {
            where: { status: 'DRAFT', effectiveFrom: { lte: now } },
            select: { id: true },
          },
        },
      },
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    take: BATCH_SIZE,
  });

  let activated = 0;
  for (const placement of placements) {
    const changed = await getPrisma().$transaction(async (tx) => {
      const result = await tx.placement.updateMany({
        where: { id: placement.id, status: 'PENDING', startDate: { lte: now } },
        data: { status: 'ACTIVE' },
      });
      if (result.count === 0) return false;
      await tx.placementStatusHistory.create({
        data: { placementId: placement.id, fromStatus: 'PENDING', toStatus: 'ACTIVE', reason: 'Placement start date reached' },
      });
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.PLACEMENT_UPDATED,
        aggregateType: 'Placement', aggregateId: placement.id, organisationId: placement.organisationId,
        payload: { placementId: placement.id, talentProfileId: placement.talentProfileId, organisationId: placement.organisationId },
      });

      if (placement.staffAssignment?.status === 'PENDING') {
        const assignment = await tx.staffAssignment.updateMany({
          where: { id: placement.staffAssignment.id, status: 'PENDING', effectiveFrom: { lte: now } },
          data: { status: 'ACTIVE' },
        });
        if (assignment.count > 0) {
          await emitEvent(tx, {
            eventKey: EVENT_KEYS.STAFF_ASSIGNMENT_STARTED,
            aggregateType: 'StaffAssignment', aggregateId: placement.staffAssignment.id, organisationId: placement.organisationId,
            payload: { staffAssignmentId: placement.staffAssignment.id, placementId: placement.id, organisationId: placement.organisationId },
          });
        }
      }

      for (const agreement of placement.staffAssignment?.payAgreements ?? []) {
        const pay = await tx.payAgreement.updateMany({
          where: { id: agreement.id, status: 'DRAFT', effectiveFrom: { lte: now } },
          data: { status: 'ACTIVE' },
        });
        if (pay.count > 0) {
          await emitEvent(tx, {
            eventKey: EVENT_KEYS.PAY_AGREEMENT_UPDATED,
            aggregateType: 'PayAgreement', aggregateId: agreement.id, organisationId: placement.organisationId,
            payload: { payAgreementId: agreement.id, staffAssignmentId: placement.staffAssignment?.id, organisationId: placement.organisationId },
          });
        }
      }
      return true;
    });
    if (changed) {
      activated += 1;
      invalidateUser(placement.talentProfile.userId);
    }
  }
  return activated;
}
