import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { EVENT_KEYS, type DomainEvent, type EventKey } from '../../platform/events/event-catalog.js';
import { registerEventHandler } from '../../platform/events/event-bus.js';

const payloadSchema = z.object({ userId: z.string().uuid().optional(), talentProfileId: z.string().uuid().optional(), organisationId: z.string().uuid().optional(), applicationId: z.string().uuid().optional(), offerId: z.string().uuid().optional(), interviewId: z.string().uuid().optional(), placementId: z.string().uuid().optional(), channel: z.enum(['IN_APP', 'EMAIL']).optional() }).passthrough();
const definitions: Partial<Record<EventKey, { title: string; body: string; link: string }>> = {
  [EVENT_KEYS.APPLICATION_STATUS_CHANGED]: { title: 'Application updated', body: 'An employer updated your application.', link: '/talent/applications' },
  [EVENT_KEYS.INTERVIEW_SCHEDULED]: { title: 'Interview scheduled', body: 'A new interview has been scheduled.', link: '/talent/interviews' },
  [EVENT_KEYS.INTERVIEW_UPDATED]: { title: 'Interview updated', body: 'An interview schedule was updated.', link: '/talent/interviews' },
  [EVENT_KEYS.INTERVIEW_CANCELLED]: { title: 'Interview cancelled', body: 'An interview was cancelled.', link: '/talent/interviews' },
  [EVENT_KEYS.OFFER_SENT]: { title: 'New offer', body: 'You received a new offer.', link: '/talent/offers' },
  [EVENT_KEYS.PLACEMENT_CREATED]: { title: 'Placement created', body: 'Your placement is ready.', link: '/talent/workspace' },
  [EVENT_KEYS.TASK_DUE_SOON]: { title: 'Task due soon', body: 'One of your assigned tasks is due soon.', link: '/talent/tasks' },
  [EVENT_KEYS.CALENDAR_REMINDER_DUE]: { title: 'Calendar reminder', body: 'An upcoming calendar event is about to start.', link: '/talent/calendar' },
};

async function createNotification(event: DomainEvent): Promise<void> {
  const definition = definitions[event.key];
  if (!definition) return;
  const parsed = payloadSchema.parse(event.payload);
  if (event.key === EVENT_KEYS.CALENDAR_REMINDER_DUE && parsed.channel === 'EMAIL') return;
  let userId = parsed.userId;
  if (!userId && parsed.talentProfileId) {
    const profile = await getPrisma().talentProfile.findUnique({ where: { id: parsed.talentProfileId }, select: { userId: true } });
    userId = profile?.userId;
  }
  if (!userId) return;
  const preference = await getPrisma().notificationPreference.findUnique({ where: { userId_eventKey: { userId, eventKey: event.key } } });
  if (preference && (!preference.enabled || preference.channel !== 'IN_APP')) return;
  await getPrisma().notification.upsert({
    where: { sourceEventId: event.id },
    create: { sourceEventId: event.id, userId, organisationId: parsed.organisationId ?? event.organisationId ?? null, eventKey: event.key, title: definition.title, body: definition.body, linkUrl: definition.link, payload: parsed as Prisma.InputJsonValue },
    update: {},
  });
}

export function registerNotificationEventHandlers(): void {
  for (const key of Object.keys(definitions) as EventKey[]) {
    registerEventHandler(key, 'create-in-app-notification', createNotification);
  }
}
