import type { Job } from 'bullmq';
import { getPrisma } from '../database/prisma.js';
import { EVENT_KEYS } from '../platform/events/event-catalog.js';
import { emitEvent } from '../platform/outbox/outbox.service.js';
import { enqueue, JOB_NAMES, QUEUE_NAMES, stableJobId } from '../platform/queue/queue.registry.js';

interface DueReminderRow { id: string }
interface ReminderPayload { kind: 'calendar' | 'task'; id: string }
const TASK_NOTICE_MS = 24 * 60 * 60 * 1000;

export async function scanDueReminders(now = new Date()): Promise<{ calendar: number; tasks: number }> {
  const calendar = await getPrisma().$queryRaw<DueReminderRow[]>`
    SELECT reminder.id
      FROM event_reminders reminder
      JOIN calendar_events event ON event.id = reminder.event_id
     WHERE reminder.sent_at IS NULL
       AND reminder.failed_at IS NULL
       AND event.cancelled_at IS NULL
       AND event.start_at > ${now}
       AND event.start_at - (reminder.minutes_before * INTERVAL '1 minute') <= ${now}
     ORDER BY event.start_at ASC, reminder.id ASC
     LIMIT 100
  `;
  const tasks = await getPrisma().task.findMany({
    where: {
      dueReminderSentAt: null,
      dueDate: { gt: now, lte: new Date(now.getTime() + TASK_NOTICE_MS) },
      status: { in: ['TO_DO', 'IN_PROGRESS', 'IN_REVIEW'] },
      assignees: { some: {} },
    },
    select: { id: true, dueDate: true },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: 100,
  });
  await Promise.all([
    ...calendar.map((item) => enqueue(QUEUE_NAMES.REMINDERS, JOB_NAMES.SEND_REMINDER, { kind: 'calendar', id: item.id } satisfies ReminderPayload, { jobId: stableJobId('calendar-reminder', item.id) })),
    ...tasks.map((item) => enqueue(QUEUE_NAMES.REMINDERS, JOB_NAMES.SEND_REMINDER, { kind: 'task', id: item.id } satisfies ReminderPayload, { jobId: stableJobId('task-reminder', `${item.id}-${item.dueDate?.getTime() ?? 0}`) })),
  ]);
  return { calendar: calendar.length, tasks: tasks.length };
}

async function processCalendarReminder(id: string): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const reminder = await tx.eventReminder.findUnique({
      where: { id },
      include: { event: { include: { participants: { include: { talentProfile: { select: { userId: true } } } } } } },
    });
    if (!reminder || reminder.sentAt || reminder.failedAt) return;
    if (reminder.event.cancelledAt) {
      await tx.eventReminder.update({ where: { id }, data: { failedAt: new Date(), failureReason: 'Event was cancelled.' } });
      return;
    }
    const userIds = new Set<string>([reminder.event.createdById]);
    for (const participant of reminder.event.participants) {
      if (participant.userId) userIds.add(participant.userId);
      if (participant.talentProfile?.userId) userIds.add(participant.talentProfile.userId);
    }
    for (const userId of userIds) {
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.CALENDAR_REMINDER_DUE,
        aggregateType: 'EventReminder', aggregateId: reminder.id, organisationId: reminder.event.organisationId,
        payload: { reminderId: reminder.id, eventId: reminder.event.id, userId, organisationId: reminder.event.organisationId, channel: reminder.channel },
      });
    }
    await tx.eventReminder.update({ where: { id }, data: { sentAt: new Date(), failedAt: null, failureReason: null } });
  });
}

async function processTaskReminder(id: string): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id }, include: { assignees: { include: { talentProfile: { select: { userId: true } } } } } });
    if (!task || task.dueReminderSentAt) return;
    if (!task.dueDate || ['COMPLETED', 'CANCELLED'].includes(task.status)) {
      await tx.task.update({ where: { id }, data: { dueReminderSentAt: new Date() } });
      return;
    }
    for (const assignee of task.assignees) {
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.TASK_DUE_SOON,
        aggregateType: 'Task', aggregateId: task.id, organisationId: task.organisationId,
        payload: { taskId: task.id, userId: assignee.talentProfile.userId, organisationId: task.organisationId },
      });
    }
    await tx.task.update({ where: { id }, data: { dueReminderSentAt: new Date() } });
  });
}

export async function processReminder(job: Job): Promise<void> {
  if (job.name !== JOB_NAMES.SEND_REMINDER) throw new Error(`No reminder handler for job: ${job.name}`);
  const payload = job.data as Partial<ReminderPayload>;
  if ((payload.kind !== 'calendar' && payload.kind !== 'task') || typeof payload.id !== 'string') throw new Error('Reminder job payload is invalid.');
  if (payload.kind === 'calendar') await processCalendarReminder(payload.id);
  else await processTaskReminder(payload.id);
}
