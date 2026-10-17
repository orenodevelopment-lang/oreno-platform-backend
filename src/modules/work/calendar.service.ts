import type { CalendarEventType, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';
import {
  assertOrganisationAccess,
  assertOrganisationMutation,
} from '../organisations/organisation.policy.js';

const EVENT_INCLUDE = {
  participants: true,
  reminders: { orderBy: { minutesBefore: 'desc' as const } },
  createdBy: { select: { id: true, firstName: true, lastName: true, displayName: true } },
} satisfies Prisma.CalendarEventInclude;

interface CalendarQuery {
  page: number;
  pageSize: number;
  from: Date;
  to: Date;
  type?: CalendarEventType;
}

interface CalendarWrite {
  type: 'COMPANY_EVENT' | 'TIME_OFF' | 'REMINDER' | 'OTHER';
  title: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  isAllDay: boolean;
  userIds: string[];
  staffAssignmentIds: string[];
  reminders: { channel: 'IN_APP' | 'EMAIL'; minutesBefore: number }[];
}

function assertRange(from: Date, to: Date): void {
  if (to <= from) {
    throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'The end must be after the start.');
  }
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'Calendar ranges cannot exceed 366 days.',
    );
  }
}

async function participantsForWrite(
  organisationId: string,
  userIds: string[],
  staffAssignmentIds: string[],
) {
  const uniqueUsers = [...new Set(userIds)];
  const uniqueStaff = [...new Set(staffAssignmentIds)];
  const prisma = getPrisma();
  const [members, staff] = await Promise.all([
    prisma.organisationMembership.findMany({
      where: { organisationId, userId: { in: uniqueUsers }, status: 'ACTIVE' },
      select: { userId: true },
    }),
    prisma.staffAssignment.findMany({
      where: {
        organisationId,
        id: { in: uniqueStaff },
        status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] },
      },
      select: { id: true, talentProfileId: true },
    }),
  ]);
  if (members.length !== uniqueUsers.length || staff.length !== uniqueStaff.length) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'One or more event participants were not found.');
  }
  return [
    ...members.map((member) => ({ userId: member.userId })),
    ...staff.map((assignment) => ({ talentProfileId: assignment.talentProfileId })),
  ];
}

export async function listEvents(
  auth: AuthContext,
  organisationId: string,
  query: CalendarQuery,
) {
  assertOrganisationAccess(auth, organisationId, 'calendar:read');
  assertRange(query.from, query.to);
  const where: Prisma.CalendarEventWhereInput = {
    organisationId,
    startAt: { lt: query.to },
    endAt: { gt: query.from },
    ...(query.type ? { type: query.type } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.calendarEvent.findMany({
      where,
      include: EVENT_INCLUDE,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.calendarEvent.count({ where }),
  ]);
  return { items, total };
}

export async function getEvent(auth: AuthContext, organisationId: string, eventId: string) {
  assertOrganisationAccess(auth, organisationId, 'calendar:read');
  const event = await getPrisma().calendarEvent.findFirst({
    where: { id: eventId, organisationId },
    include: EVENT_INCLUDE,
  });
  if (!event) {
    throw new NotFoundError(ErrorCode.CALENDAR_EVENT_NOT_FOUND, 'That event was not found.');
  }
  return event;
}

export async function createEvent(
  auth: AuthContext,
  organisationId: string,
  input: CalendarWrite,
) {
  assertOrganisationMutation(auth, organisationId, 'calendar:create');
  assertRange(input.startAt, input.endAt);
  const participants = await participantsForWrite(
    organisationId,
    input.userIds,
    input.staffAssignmentIds,
  );
  const { userIds: _users, staffAssignmentIds: _staff, reminders, ...data } = input;
  return getPrisma().$transaction(async (tx) => {
    const event = await tx.calendarEvent.create({
      data: {
        ...data,
        organisationId,
        createdById: auth.userId,
        participants: { create: participants },
        reminders: { create: reminders },
      },
      include: EVENT_INCLUDE,
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.CALENDAR_EVENT_CREATED,
      aggregateType: 'CalendarEvent',
      aggregateId: event.id,
      organisationId,
      payload: { eventId: event.id, organisationId },
    });
    return event;
  });
}

export async function updateEvent(
  auth: AuthContext,
  organisationId: string,
  eventId: string,
  input: Partial<CalendarWrite> & { expectedUpdatedAt: Date },
) {
  assertOrganisationMutation(auth, organisationId, 'calendar:update');
  const current = await getPrisma().calendarEvent.findFirst({
    where: { id: eventId, organisationId },
  });
  if (!current) {
    throw new NotFoundError(ErrorCode.CALENDAR_EVENT_NOT_FOUND, 'That event was not found.');
  }
  if (current.cancelledAt) {
    throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'A cancelled event cannot be edited.');
  }
  assertRange(input.startAt ?? current.startAt, input.endAt ?? current.endAt);
  const participants =
    input.userIds || input.staffAssignmentIds
      ? await participantsForWrite(
          organisationId,
          input.userIds ?? [],
          input.staffAssignmentIds ?? [],
        )
      : undefined;
  const { expectedUpdatedAt, userIds: _users, staffAssignmentIds: _staff, reminders, ...data } =
    input;
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.calendarEvent.updateMany({
      where: { id: eventId, organisationId, updatedAt: expectedUpdatedAt, cancelledAt: null },
      data,
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The event changed. Refresh and try again.');
    }
    if (participants) {
      await tx.eventParticipant.deleteMany({ where: { eventId } });
      if (participants.length > 0) {
        await tx.eventParticipant.createMany({
          data: participants.map((participant) => ({ eventId, ...participant })),
        });
      }
    }
    if (reminders) {
      await tx.eventReminder.deleteMany({ where: { eventId, sentAt: null } });
      if (reminders.length > 0) {
        await tx.eventReminder.createMany({
          data: reminders.map((reminder) => ({ eventId, ...reminder })),
        });
      }
    }
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.CALENDAR_EVENT_UPDATED,
      aggregateType: 'CalendarEvent',
      aggregateId: eventId,
      organisationId,
      payload: { eventId, organisationId },
    });
    return tx.calendarEvent.findUniqueOrThrow({ where: { id: eventId }, include: EVENT_INCLUDE });
  });
}

export async function cancelEvent(
  auth: AuthContext,
  organisationId: string,
  eventId: string,
  expectedUpdatedAt: Date,
) {
  assertOrganisationMutation(auth, organisationId, 'calendar:cancel');
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.calendarEvent.updateMany({
      where: { id: eventId, organisationId, updatedAt: expectedUpdatedAt, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    if (changed.count === 0) {
      throw new ConflictError(
        ErrorCode.STALE_WRITE,
        'The event changed, was cancelled, or was not found.',
      );
    }
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.CALENDAR_EVENT_CANCELLED,
      aggregateType: 'CalendarEvent',
      aggregateId: eventId,
      organisationId,
      payload: { eventId, organisationId },
    });
    return tx.calendarEvent.findUniqueOrThrow({ where: { id: eventId }, include: EVENT_INCLUDE });
  });
}

export async function listMyCalendar(auth: AuthContext, query: CalendarQuery) {
  assertRange(query.from, query.to);
  const profile = await getPrisma().talentProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  const memberships = await getPrisma().organisationMembership.findMany({
    where: { userId: auth.userId, status: 'ACTIVE' },
    select: { organisationId: true },
  });
  const organisationIds = memberships.map((membership) => membership.organisationId);
  const prisma = getPrisma();
  const [events, tasks, interviews] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        startAt: { lt: query.to },
        endAt: { gt: query.from },
        ...(query.type ? { type: query.type } : {}),
        OR: [
          { organisationId: { in: organisationIds }, type: 'COMPANY_EVENT' },
          { participants: { some: { userId: auth.userId } } },
          ...(profile
            ? [{ participants: { some: { talentProfileId: profile.id } } }]
            : []),
        ],
      },
      include: EVENT_INCLUDE,
    }),
    !query.type || query.type === 'TASK_DEADLINE'
      ? prisma.task.findMany({
          where: {
            dueDate: { gte: query.from, lt: query.to },
            ...(profile ? { assignees: { some: { talentProfileId: profile.id } } } : { id: '' }),
          },
          select: { id: true, organisationId: true, title: true, dueDate: true, status: true },
        })
      : [],
    !query.type || query.type === 'INTERVIEW'
      ? prisma.interview.findMany({
          where: {
            scheduledStartAt: { lt: query.to },
            scheduledEndAt: { gt: query.from },
            OR: [
              { participants: { some: { userId: auth.userId } } },
              ...(profile
                ? [{ participants: { some: { talentProfileId: profile.id } } }]
                : []),
            ],
          },
          select: {
            id: true,
            organisationId: true,
            scheduledStartAt: true,
            scheduledEndAt: true,
            timeZone: true,
            status: true,
            stage: true,
            job: { select: { title: true } },
          },
        })
      : [],
  ]);
  const projected = [
    ...events.map((event) => ({
      type: event.type,
      id: event.id,
      organisationId: event.organisationId,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      timeZone: event.timeZone,
      status: event.cancelledAt ? 'CANCELLED' : 'ACTIVE',
      event,
    })),
    ...tasks.map((task) => ({
      type: 'TASK_DEADLINE' as const,
      id: task.id,
      organisationId: task.organisationId,
      title: task.title,
      startAt: task.dueDate!,
      endAt: task.dueDate!,
      timeZone: 'UTC',
      status: task.status,
      task,
    })),
    ...interviews.map((interview) => ({
      type: 'INTERVIEW' as const,
      id: interview.id,
      organisationId: interview.organisationId,
      title: `${interview.stage}: ${interview.job.title}`,
      startAt: interview.scheduledStartAt,
      endAt: interview.scheduledEndAt,
      timeZone: interview.timeZone,
      status: interview.status,
      interview,
    })),
  ].sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id));
  const start = (query.page - 1) * query.pageSize;
  return { items: projected.slice(start, start + query.pageSize), total: projected.length };
}

export async function respondToEvent(
  auth: AuthContext,
  eventId: string,
  response: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE',
) {
  const profile = await getPrisma().talentProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  const changed = await getPrisma().eventParticipant.updateMany({
    where: {
      eventId,
      OR: [
        { userId: auth.userId },
        ...(profile ? [{ talentProfileId: profile.id }] : []),
      ],
    },
    data: { responseStatus: response },
  });
  if (changed.count === 0) {
    throw new NotFoundError(ErrorCode.CALENDAR_EVENT_NOT_FOUND, 'That event was not found.');
  }
  return getPrisma().calendarEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: EVENT_INCLUDE,
  });
}
