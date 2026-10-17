import { z } from 'zod';
import { loadConfig } from '../../config/index.js';
import { getPrisma } from '../../database/prisma.js';
import { registerEventHandler } from '../events/event-bus.js';
import { EVENT_KEYS, type DomainEvent, type EventKey } from '../events/event-catalog.js';
import { enqueueEmail, enqueueStoredEmail } from './email.service.js';
import { EMAIL_TEMPLATES, type EmailTemplateKey, type TemplateVariables } from './email.types.js';

const identifiers = z.object({
  userId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  channel: z.enum(['IN_APP', 'EMAIL']).optional(),
}).passthrough();
const statusChange = z.object({
  toStatus: z.string().max(80),
  reason: z.string().max(1000).optional(),
}).passthrough();
const deliveryRequested = z.object({ deliveryId: z.string().uuid() }).strict();

type UserRecipient = { id: string; email: string; firstName: string | null; lastName: string | null; displayName: string | null };
const userSelect = { id: true, email: true, firstName: true, lastName: true, displayName: true } as const;
const appUrl = () => loadConfig().appUrl.replace(/\/$/, '');
const recipientName = (user: UserRecipient) => user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(' ') || 'there');

async function send(event: DomainEvent, user: UserRecipient, template: EmailTemplateKey, variables: TemplateVariables, organisationId?: string | null): Promise<void> {
  await enqueueEmail({
    to: user.email,
    toName: recipientName(user),
    template,
    variables,
    ...(organisationId ? { organisationId } : {}),
    dedupeKey: `${event.id}:${user.id}:${template}`,
  });
}

async function requestedEmail(event: DomainEvent): Promise<void> {
  const { deliveryId } = deliveryRequested.parse(event.payload);
  await enqueueStoredEmail(deliveryId);
}

async function organisationMembers(
  organisationId: string,
  roleKeys: Array<'COMPANY_OWNER' | 'HR_USER' | 'MANAGER'>,
): Promise<UserRecipient[]> {
  const memberships = await getPrisma().organisationMembership.findMany({
    where: {
      organisationId,
      status: 'ACTIVE',
      role: { key: { in: roleKeys } },
      user: { status: 'ACTIVE' },
    },
    select: { user: { select: userSelect } },
  });
  return memberships.map((membership) => membership.user);
}

async function welcomeEmail(event: DomainEvent): Promise<void> {
  const user = await getPrisma().user.findUnique({
    where: { id: event.aggregateId },
    select: {
      ...userSelect,
      memberships: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { organisation: { select: { id: true, name: true } } },
      },
    },
  });
  const membership = user?.memberships[0];
  if (!user || !membership) return;
  await send(event, user, EMAIL_TEMPLATES.WELCOME, {
    firstName: user.firstName ?? recipientName(user),
    organisationName: membership.organisation.name,
    appUrl: appUrl(),
  }, membership.organisation.id);
}

async function accountStatusEmail(event: DomainEvent): Promise<void> {
  const change = statusChange.parse(event.payload);
  if (change.toStatus !== 'SUSPENDED' && change.toStatus !== 'ACTIVE') return;
  const user = await getPrisma().user.findUnique({ where: { id: event.aggregateId }, select: userSelect });
  if (!user) return;
  await send(
    event,
    user,
    change.toStatus === 'SUSPENDED'
      ? EMAIL_TEMPLATES.ACCOUNT_SUSPENDED
      : EMAIL_TEMPLATES.ACCOUNT_REACTIVATED,
    change.toStatus === 'SUSPENDED'
      ? { reason: change.reason ?? 'An administrator suspended this account.' }
      : { appUrl: appUrl() },
  );
}

async function organisationStatusEmail(event: DomainEvent): Promise<void> {
  const change = statusChange.parse(event.payload);
  if (change.toStatus !== 'SUSPENDED') return;
  const organisation = await getPrisma().organisation.findUnique({
    where: { id: event.aggregateId },
    select: { id: true, name: true, primaryContactEmail: true, primaryContactName: true },
  });
  if (!organisation) return;
  const recipients = new Map<string, UserRecipient>();
  for (const user of await organisationMembers(organisation.id, ['COMPANY_OWNER'])) {
    recipients.set(user.email.toLowerCase(), user);
  }
  if (organisation.primaryContactEmail) {
    recipients.set(organisation.primaryContactEmail.toLowerCase(), {
      id: organisation.id,
      email: organisation.primaryContactEmail,
      firstName: organisation.primaryContactName,
      lastName: null,
      displayName: organisation.primaryContactName,
    });
  }
  for (const user of recipients.values()) {
    await send(event, user, EMAIL_TEMPLATES.ORGANISATION_SUSPENDED, {
      organisationName: organisation.name,
      reason: change.reason ?? 'An administrator suspended this organisation.',
    }, organisation.id);
  }
}

async function organisationVerificationEmail(event: DomainEvent): Promise<void> {
  const change = statusChange.parse(event.payload);
  if (change.toStatus !== 'VERIFIED') return;
  const organisation = await getPrisma().organisation.findUnique({
    where: { id: event.aggregateId },
    select: { id: true, name: true, primaryContactEmail: true, primaryContactName: true },
  });
  if (!organisation) return;
  const recipients = new Map<string, UserRecipient>();
  for (const user of await organisationMembers(organisation.id, ['COMPANY_OWNER'])) {
    recipients.set(user.email.toLowerCase(), user);
  }
  if (organisation.primaryContactEmail) {
    recipients.set(organisation.primaryContactEmail.toLowerCase(), {
      id: organisation.id,
      email: organisation.primaryContactEmail,
      firstName: organisation.primaryContactName,
      lastName: null,
      displayName: organisation.primaryContactName,
    });
  }
  for (const user of recipients.values()) {
    await send(event, user, EMAIL_TEMPLATES.ORGANISATION_VERIFIED, {
      organisationName: organisation.name,
      appUrl: appUrl(),
    }, organisation.id);
  }
}

async function applicationEmail(event: DomainEvent): Promise<void> {
  const application = await getPrisma().application.findUnique({
    where: { id: event.aggregateId },
    include: { talentProfile: { select: { user: { select: userSelect } } }, job: { select: { title: true, organisation: { select: { name: true } } } } },
  });
  if (!application) return;
  const user = application.talentProfile.user;
  const received = event.key === EVENT_KEYS.APPLICATION_SUBMITTED;
  await send(event, user, received ? EMAIL_TEMPLATES.APPLICATION_RECEIVED : EMAIL_TEMPLATES.APPLICATION_STATUS_CHANGED, received ? {
    candidateName: recipientName(user), jobTitle: application.job.title, organisationName: application.job.organisation.name,
    applicationUrl: `${appUrl()}/talent/applications/${application.id}`,
  } : {
    candidateName: recipientName(user), jobTitle: application.job.title, statusLabel: application.status.replaceAll('_', ' ').toLowerCase(),
    applicationUrl: `${appUrl()}/talent/applications/${application.id}`,
  }, application.organisationId);
}

async function interviewEmail(event: DomainEvent): Promise<void> {
  const interview = await getPrisma().interview.findUnique({
    where: { id: event.aggregateId },
    include: { job: { select: { title: true, organisation: { select: { name: true } } } }, participants: { select: { userId: true, talentProfile: { select: { user: { select: userSelect } } } } } },
  });
  if (!interview) return;
  const directIds = interview.participants.flatMap((item) => item.userId ? [item.userId] : []);
  const directUsers = directIds.length ? await getPrisma().user.findMany({ where: { id: { in: directIds } }, select: userSelect }) : [];
  const recipients = new Map<string, UserRecipient>();
  for (const participant of interview.participants) if (participant.talentProfile?.user) recipients.set(participant.talentProfile.user.id, participant.talentProfile.user);
  for (const user of directUsers) recipients.set(user.id, user);
  const updated = event.key === EVENT_KEYS.INTERVIEW_UPDATED;
  for (const user of recipients.values()) await send(event, user, updated ? EMAIL_TEMPLATES.INTERVIEW_UPDATED : EMAIL_TEMPLATES.INTERVIEW_SCHEDULED, {
    participantName: recipientName(user), jobTitle: interview.job.title, organisationName: interview.job.organisation.name,
    scheduledAt: interview.scheduledStartAt.toISOString(), timeZone: interview.timeZone, mode: interview.mode,
    location: interview.location, interviewUrl: `${appUrl()}/talent/interviews/${interview.id}`,
  }, interview.organisationId);
}

async function offerEmail(event: DomainEvent): Promise<void> {
  const offer = await getPrisma().offer.findUnique({ where: { id: event.aggregateId }, include: { talentProfile: { select: { user: { select: userSelect } } }, organisation: { select: { name: true } } } });
  if (!offer) return;
  const user = offer.talentProfile.user;
  if (event.key === EVENT_KEYS.OFFER_SENT) await send(event, user, EMAIL_TEMPLATES.OFFER_SENT, {
    candidateName: recipientName(user), organisationName: offer.organisation.name, jobTitle: offer.title,
    expiresAt: offer.expiresAt?.toISOString() ?? '', offerUrl: `${appUrl()}/talent/offers/${offer.id}`,
  }, offer.organisationId);
  else await send(event, user, EMAIL_TEMPLATES.OFFER_EXPIRED, {
    organisationName: offer.organisation.name, jobTitle: offer.title, expiredAt: offer.expiresAt?.toISOString() ?? new Date().toISOString(),
    jobUrl: `${appUrl()}/jobs/${offer.jobId}`,
  }, offer.organisationId);
}

async function placementEmail(event: DomainEvent): Promise<void> {
  const placement = await getPrisma().placement.findUnique({ where: { id: event.aggregateId }, include: { talentProfile: { select: { user: { select: userSelect } } }, organisation: { select: { name: true } } } });
  if (!placement) return;
  const user = placement.talentProfile.user;
  if (event.key === EVENT_KEYS.PLACEMENT_ENDED) await send(event, user, EMAIL_TEMPLATES.PLACEMENT_ENDED, {
    jobTitle: placement.title, organisationName: placement.organisation.name, endDate: placement.endDate?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10), endReasonLabel: placement.endReason ?? 'Placement ended',
  }, placement.organisationId);
  else await send(event, user, EMAIL_TEMPLATES.PLACEMENT_STARTED, {
    participantName: recipientName(user), jobTitle: placement.title, organisationName: placement.organisation.name,
    startDate: placement.startDate.toISOString().slice(0, 10), managerName: 'Not assigned yet', placementUrl: `${appUrl()}/talent/workspace`,
  }, placement.organisationId);
}

async function taskEmail(event: DomainEvent): Promise<void> {
  const task = await getPrisma().task.findUnique({ where: { id: event.aggregateId }, include: { assignees: { select: { talentProfile: { select: { user: { select: userSelect } } } } } } });
  if (!task) return;
  if (event.key === EVENT_KEYS.TASK_DUE_SOON) {
    const parsed = identifiers.parse(event.payload);
    const users = parsed.userId ? task.assignees.map((item) => item.talentProfile.user).filter((user) => user.id === parsed.userId) : task.assignees.map((item) => item.talentProfile.user);
    for (const user of users) {
      const preference = await getPrisma().notificationPreference.findUnique({ where: { userId_eventKey: { userId: user.id, eventKey: event.key } } });
      if (!preference || !preference.enabled || preference.channel !== 'EMAIL') continue;
      await send(event, user, EMAIL_TEMPLATES.TASK_DUE_SOON, { taskTitle: task.title, dueDate: task.dueDate?.toISOString() ?? '', taskUrl: `${appUrl()}/talent/tasks/${task.id}` }, task.organisationId);
    }
    return;
  }
  const assigner = await getPrisma().user.findUnique({ where: { id: task.createdById }, select: userSelect });
  for (const assignee of task.assignees) await send(event, assignee.talentProfile.user, EMAIL_TEMPLATES.TASK_ASSIGNED, {
    assignedByName: assigner ? recipientName(assigner) : 'Your team', taskTitle: task.title, priority: task.priority,
    dueDate: task.dueDate?.toISOString(), description: task.description, taskUrl: `${appUrl()}/talent/tasks/${task.id}`,
  }, task.organisationId);
}

async function calendarReminderEmail(event: DomainEvent): Promise<void> {
  const parsed = identifiers.parse(event.payload);
  if (parsed.channel !== 'EMAIL' || !parsed.userId) return;
  const [user, reminder] = await Promise.all([
    getPrisma().user.findUnique({ where: { id: parsed.userId }, select: userSelect }),
    getPrisma().eventReminder.findUnique({
      where: { id: event.aggregateId },
      select: {
        event: {
          select: { title: true, startAt: true, timeZone: true, location: true },
        },
      },
    }),
  ]);
  if (!user || !reminder) return;
  await send(event, user, EMAIL_TEMPLATES.CALENDAR_REMINDER, {
    eventTitle: reminder.event.title,
    startsAt: reminder.event.startAt.toISOString(),
    timeZone: reminder.event.timeZone,
    location: reminder.event.location,
    eventUrl: `${appUrl()}/talent/calendar`,
  }, event.organisationId);
}

async function timesheetEmail(event: DomainEvent): Promise<void> {
  const entry = await getPrisma().timeEntry.findUnique({ where: { id: event.aggregateId }, include: { talentProfile: { select: { user: { select: userSelect } } }, timesheetPeriod: { select: { name: true } } } });
  if (!entry) return;
  const approved = event.key === EVENT_KEYS.TIMESHEET_APPROVED;
  await send(event, entry.talentProfile.user, approved ? EMAIL_TEMPLATES.TIMESHEET_APPROVED : EMAIL_TEMPLATES.TIMESHEET_REJECTED, approved ? {
    periodLabel: entry.timesheetPeriod?.name ?? entry.workDate.toISOString().slice(0, 10), hours: ((entry.ordinaryMinutes + entry.overtimeMinutes) / 60).toFixed(2), timesheetUrl: `${appUrl()}/talent/time`,
  } : {
    periodLabel: entry.timesheetPeriod?.name ?? entry.workDate.toISOString().slice(0, 10), reason: entry.rejectionReason ?? 'Changes are required.', timesheetUrl: `${appUrl()}/talent/time`,
  }, entry.organisationId);
}

async function timesheetSubmittedEmail(event: DomainEvent): Promise<void> {
  const entry = await getPrisma().timeEntry.findUnique({
    where: { id: event.aggregateId },
    include: {
      talentProfile: { select: { user: { select: userSelect } } },
      timesheetPeriod: { select: { name: true } },
      staffAssignment: {
        select: {
          managerAssignments: {
            where: { effectiveTo: null },
            select: {
              managerMembership: { select: { user: { select: userSelect } } },
              managerStaffAssignment: {
                select: { talentProfile: { select: { user: { select: userSelect } } } },
              },
            },
          },
        },
      },
    },
  });
  if (!entry) return;
  const recipients = new Map<string, UserRecipient>();
  for (const manager of entry.staffAssignment.managerAssignments) {
    const user = manager.managerMembership?.user ?? manager.managerStaffAssignment?.talentProfile.user;
    if (user) recipients.set(user.id, user);
  }
  if (recipients.size === 0) {
    for (const user of await organisationMembers(entry.organisationId, ['COMPANY_OWNER', 'HR_USER'])) {
      recipients.set(user.id, user);
    }
  }
  for (const user of recipients.values()) {
    await send(event, user, EMAIL_TEMPLATES.TIMESHEET_SUBMITTED, {
      memberName: recipientName(entry.talentProfile.user),
      periodLabel: entry.timesheetPeriod?.name ?? entry.workDate.toISOString().slice(0, 10),
      hours: ((entry.ordinaryMinutes + entry.overtimeMinutes) / 60).toFixed(2),
      timesheetUrl: `${appUrl()}/organisations/${entry.organisationId}/time-entries`,
    }, entry.organisationId);
  }
}

async function payrollApprovedEmail(event: DomainEvent): Promise<void> {
  const payroll = await getPrisma().payrollPeriod.findUnique({
    where: { id: event.aggregateId },
    include: {
      organisation: { select: { name: true } },
      approvals: {
        where: { toStatus: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      lineItems: { select: { staffAssignmentId: true } },
    },
  });
  if (!payroll) return;
  const latestApproval = payroll.approvals[0];
  const approver = latestApproval
    ? await getPrisma().user.findUnique({ where: { id: latestApproval.approvedById }, select: userSelect })
    : null;
  const recipients = new Map<string, UserRecipient>();
  for (const user of await organisationMembers(payroll.organisationId, ['COMPANY_OWNER'])) {
    recipients.set(user.id, user);
  }
  if (approver) recipients.set(approver.id, approver);
  const memberCount = new Set(payroll.lineItems.map((line) => line.staffAssignmentId)).size;
  for (const user of recipients.values()) {
    await send(event, user, EMAIL_TEMPLATES.PAYROLL_PERIOD_APPROVED, {
      periodLabel: payroll.name,
      memberCount,
      approvedBy: approver ? recipientName(approver) : 'an authorised administrator',
      totalAmount: `${payroll.currency} ${payroll.totalNet.toFixed(2)}`,
      payrollUrl: `${appUrl()}/organisations/${payroll.organisationId}/payroll/${payroll.id}`,
    }, payroll.organisationId);
  }
}

async function vettingDecisionEmail(event: DomainEvent): Promise<void> {
  const vettingCase = await getPrisma().vettingCase.findUnique({
    where: { id: event.aggregateId },
    include: {
      talentProfile: { select: { user: { select: userSelect } } },
      reviews: {
        where: { candidateVisibleNotes: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { candidateVisibleNotes: true },
      },
    },
  });
  if (!vettingCase || !['APPROVED', 'REJECTED'].includes(vettingCase.status)) return;
  const user = vettingCase.talentProfile.user;
  await send(event, user, EMAIL_TEMPLATES.VETTING_DECISION, {
    talentName: recipientName(user),
    decisionLabel: vettingCase.status.replaceAll('_', ' ').toLowerCase(),
    decidedAt: vettingCase.decidedAt?.toISOString() ?? event.occurredAt.toISOString(),
    rationale: vettingCase.reviews[0]?.candidateVisibleNotes,
    vettingUrl: `${appUrl()}/talent/vetting`,
  }, vettingCase.organisationId);
}

async function announcementEmail(event: DomainEvent): Promise<void> {
  const announcement = await getPrisma().announcement.findUnique({ where: { id: event.aggregateId } });
  if (!announcement?.publishedAt || (announcement.expiresAt && announcement.expiresAt <= new Date())) return;
  const preferences = await getPrisma().notificationPreference.findMany({
    where: {
      eventKey: EVENT_KEYS.ANNOUNCEMENT_PUBLISHED,
      channel: 'EMAIL',
      enabled: true,
      user: {
        status: 'ACTIVE',
        ...(announcement.organisationId
          ? { memberships: { some: { organisationId: announcement.organisationId, status: 'ACTIVE' } } }
          : announcement.audience === 'TALENT'
            ? { talentProfile: { isNot: null } }
            : {}),
      },
    },
    select: { user: { select: userSelect } },
  });
  for (const preference of preferences) {
    await send(event, preference.user, EMAIL_TEMPLATES.ANNOUNCEMENT, {
      announcementTitle: announcement.title,
      announcementBody: announcement.body,
    }, announcement.organisationId);
  }
}

async function exportEmail(event: DomainEvent): Promise<void> {
  const item = await getPrisma().exportRequest.findUnique({ where: { id: event.aggregateId }, include: { requestedBy: { select: userSelect } } });
  if (!item) return;
  const ready = event.key === EVENT_KEYS.EXPORT_COMPLETED;
  await send(event, item.requestedBy, ready ? EMAIL_TEMPLATES.EXPORT_READY : EMAIL_TEMPLATES.EXPORT_FAILED, ready ? {
    exportLabel: item.type.replaceAll('_', ' ').toLowerCase(), expiresAt: item.expiresAt?.toISOString() ?? '', downloadUrl: `${appUrl()}/exports/${item.id}`,
  } : { exportLabel: item.type.replaceAll('_', ' ').toLowerCase(), reason: item.failureReason ?? 'Export generation failed.', exportsUrl: `${appUrl()}/exports` }, item.organisationId);
}

async function supportEmail(event: DomainEvent): Promise<void> {
  const item = await getPrisma().supportCase.findUnique({ where: { id: event.aggregateId } });
  if (!item?.raisedByEmail) return;
  const user = item.raisedById ? await getPrisma().user.findUnique({ where: { id: item.raisedById }, select: userSelect }) : null;
  const recipient: UserRecipient = user ?? { id: item.id, email: item.raisedByEmail, firstName: null, lastName: null, displayName: null };
  const created = event.key === EVENT_KEYS.SUPPORT_CASE_CREATED;
  await send(event, recipient, created ? EMAIL_TEMPLATES.SUPPORT_CASE_ACKNOWLEDGED : EMAIL_TEMPLATES.SUPPORT_CASE_UPDATED, created ? {
    reference: item.reference, subject: item.subject, caseUrl: `${appUrl()}/support/${item.id}`,
  } : { reference: item.reference, statusLabel: item.status.replaceAll('_', ' ').toLowerCase(), note: item.resolutionNote, caseUrl: `${appUrl()}/support/${item.id}` }, item.organisationId);
}

const handlers = new Map<EventKey, (event: DomainEvent) => Promise<void>>([
  [EVENT_KEYS.EMAIL_DELIVERY_REQUESTED, requestedEmail],
  [EVENT_KEYS.USER_EMAIL_VERIFIED, welcomeEmail],
  [EVENT_KEYS.USER_STATUS_CHANGED, accountStatusEmail],
  [EVENT_KEYS.ORGANISATION_STATUS_CHANGED, organisationStatusEmail],
  [EVENT_KEYS.ORGANISATION_VERIFICATION_CHANGED, organisationVerificationEmail],
  [EVENT_KEYS.APPLICATION_SUBMITTED, applicationEmail], [EVENT_KEYS.APPLICATION_STATUS_CHANGED, applicationEmail],
  [EVENT_KEYS.INTERVIEW_SCHEDULED, interviewEmail], [EVENT_KEYS.INTERVIEW_UPDATED, interviewEmail],
  [EVENT_KEYS.OFFER_SENT, offerEmail], [EVENT_KEYS.OFFER_EXPIRED, offerEmail],
  [EVENT_KEYS.PLACEMENT_CREATED, placementEmail], [EVENT_KEYS.PLACEMENT_ENDED, placementEmail],
  [EVENT_KEYS.TASK_ASSIGNED, taskEmail], [EVENT_KEYS.TASK_DUE_SOON, taskEmail],
  [EVENT_KEYS.CALENDAR_REMINDER_DUE, calendarReminderEmail],
  [EVENT_KEYS.TIME_ENTRY_SUBMITTED, timesheetSubmittedEmail],
  [EVENT_KEYS.TIMESHEET_APPROVED, timesheetEmail], [EVENT_KEYS.TIMESHEET_REJECTED, timesheetEmail],
  [EVENT_KEYS.PAYROLL_PERIOD_APPROVED, payrollApprovedEmail],
  [EVENT_KEYS.VETTING_DECIDED, vettingDecisionEmail],
  [EVENT_KEYS.EXPORT_COMPLETED, exportEmail], [EVENT_KEYS.EXPORT_FAILED, exportEmail],
  [EVENT_KEYS.SUPPORT_CASE_CREATED, supportEmail], [EVENT_KEYS.SUPPORT_CASE_UPDATED, supportEmail],
  [EVENT_KEYS.ANNOUNCEMENT_PUBLISHED, announcementEmail],
]);

export function registerEmailEventHandlers(): void {
  for (const [key, handler] of handlers) registerEventHandler(key, 'transactional-email', handler);
}
