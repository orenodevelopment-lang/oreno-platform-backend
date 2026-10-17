import type { Prisma, TaskPriority, TaskStatus, TimeEntryStatus } from '@prisma/client';
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

const TASK_INCLUDE = {
  assignees: {
    include: {
      talentProfile: {
        select: {
          id: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              displayName: true,
              avatarFileId: true,
            },
          },
        },
      },
    },
  },
  comments: {
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatarFileId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  attachments: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.TaskInclude;

interface TaskListQuery {
  page: number;
  pageSize: number;
  status?: TaskStatus;
  assigneeStaffAssignmentId?: string;
  departmentId?: string;
  teamId?: string;
}

interface TimeListQuery {
  page: number;
  pageSize: number;
  status?: TimeEntryStatus;
  staffAssignmentId?: string;
  from?: Date;
  to?: Date;
}

interface CreateTaskInput {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  startDate?: Date | null;
  dueDate?: Date | null;
  jobId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  assigneeStaffAssignmentIds: string[];
}

interface UpdateTaskInput {
  expectedUpdatedAt: Date;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  startDate?: Date | null;
  dueDate?: Date | null;
  departmentId?: string | null;
  teamId?: string | null;
  assigneeStaffAssignmentIds?: string[];
}

interface TimeEntryWriteInput {
  taskId?: string | null;
  workDate: Date;
  ordinaryMinutes: number;
  overtimeMinutes: number;
  description?: string | null;
}

function managerTaskScope(auth: AuthContext): Prisma.TaskWhereInput {
  if (auth.organisationRole !== 'MANAGER' || auth.scopedDepartmentIds.length === 0) return {};
  return {
    OR: [
      { departmentId: { in: [...auth.scopedDepartmentIds] } },
      {
        assignees: {
          some: {
            talentProfile: {
              staffAssignments: {
                some: {
                  organisationId: auth.organisationId,
                  managerAssignments: {
                    some: {
                      effectiveTo: null,
                      OR: [
                        ...(auth.membershipId
                          ? [{ managerMembershipId: auth.membershipId }]
                          : []),
                        {
                          managerStaffAssignment: {
                            talentProfile: { userId: auth.userId },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
      { createdById: auth.userId },
    ],
  };
}

function managerStaffScope(auth: AuthContext): Prisma.StaffAssignmentWhereInput {
  if (auth.organisationRole !== 'MANAGER' || auth.scopedDepartmentIds.length === 0) return {};
  return {
    OR: [
      { departmentId: { in: [...auth.scopedDepartmentIds] } },
      {
        managerAssignments: {
          some: {
            effectiveTo: null,
            OR: [
              ...(auth.membershipId ? [{ managerMembershipId: auth.membershipId }] : []),
              { managerStaffAssignment: { talentProfile: { userId: auth.userId } } },
            ],
          },
        },
      },
    ],
  };
}

async function talentIdsForStaff(organisationId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await getPrisma().staffAssignment.findMany({
    where: {
      id: { in: unique },
      organisationId,
      status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] },
    },
    select: { id: true, talentProfileId: true },
  });
  if (rows.length !== unique.length) {
    throw new NotFoundError(
      ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND,
      'One or more assignees were not found.',
    );
  }
  return [...new Set(rows.map((row) => row.talentProfileId))];
}

async function validateTaskReferences(
  organisationId: string,
  refs: { jobId?: string | null; departmentId?: string | null; teamId?: string | null },
): Promise<void> {
  const prisma = getPrisma();
  const checks: Promise<number>[] = [];
  const labels: string[] = [];
  if (refs.jobId) {
    checks.push(prisma.job.count({ where: { id: refs.jobId, organisationId } }));
    labels.push('job');
  }
  if (refs.departmentId) {
    checks.push(
      prisma.department.count({
        where: { id: refs.departmentId, organisationId, archivedAt: null },
      }),
    );
    labels.push('department');
  }
  if (refs.teamId) {
    checks.push(
      prisma.team.count({ where: { id: refs.teamId, organisationId, archivedAt: null } }),
    );
    labels.push('team');
  }
  const results = await Promise.all(checks);
  const missingIndex = results.findIndex((count) => count === 0);
  if (missingIndex >= 0) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, `That ${labels[missingIndex]} was not found.`);
  }
}

function assertDateOrder(startDate?: Date | null, dueDate?: Date | null): void {
  if (startDate && dueDate && startDate > dueDate) {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'The due date must be on or after the start date.',
    );
  }
}

export async function createTask(
  auth: AuthContext,
  organisationId: string,
  input: CreateTaskInput,
) {
  assertOrganisationMutation(auth, organisationId, 'task:create');
  assertDateOrder(input.startDate, input.dueDate);
  await validateTaskReferences(organisationId, input);
  const talentIds = await talentIdsForStaff(organisationId, input.assigneeStaffAssignmentIds);
  const { assigneeStaffAssignmentIds: _ids, ...data } = input;

  return getPrisma().$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        ...data,
        organisationId,
        createdById: auth.userId,
        assignees: {
          create: talentIds.map((talentProfileId) => ({
            talentProfileId,
            assignedById: auth.userId,
          })),
        },
        statusHistory: { create: { toStatus: 'TO_DO', changedById: auth.userId } },
      },
      include: TASK_INCLUDE,
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.TASK_CREATED,
      aggregateType: 'Task',
      aggregateId: task.id,
      organisationId,
      payload: { taskId: task.id, organisationId },
    });
    if (talentIds.length > 0) {
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.TASK_ASSIGNED,
        aggregateType: 'Task',
        aggregateId: task.id,
        organisationId,
        payload: { taskId: task.id, organisationId },
      });
    }
    return task;
  });
}

export async function listTasks(
  auth: AuthContext,
  organisationId: string,
  query: TaskListQuery,
) {
  assertOrganisationAccess(auth, organisationId, 'task:read');
  let assigneeTalentId: string | undefined;
  if (query.assigneeStaffAssignmentId) {
    const staff = await getPrisma().staffAssignment.findFirst({
      where: { id: query.assigneeStaffAssignmentId, organisationId },
      select: { talentProfileId: true },
    });
    if (!staff) {
      throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That assignee was not found.');
    }
    assigneeTalentId = staff.talentProfileId;
  }
  const where: Prisma.TaskWhereInput = {
    organisationId,
    ...managerTaskScope(auth),
    ...(query.status ? { status: query.status } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.teamId ? { teamId: query.teamId } : {}),
    ...(assigneeTalentId
      ? { assignees: { some: { talentProfileId: assigneeTalentId } } }
      : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ position: 'asc' }, { dueDate: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.task.count({ where }),
  ]);
  return { items, total };
}

export async function getTask(auth: AuthContext, organisationId: string, taskId: string) {
  assertOrganisationAccess(auth, organisationId, 'task:read');
  const task = await getPrisma().task.findFirst({
    where: { id: taskId, organisationId, ...managerTaskScope(auth) },
    include: TASK_INCLUDE,
  });
  if (!task) throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'That task was not found.');
  return task;
}

export async function addTaskAttachment(auth: AuthContext, organisationId: string, taskId: string, fileId: string, label?: string | null) {
  assertOrganisationMutation(auth, organisationId, 'task:update');
  const [task, file] = await Promise.all([
    getPrisma().task.findFirst({ where: { id: taskId, organisationId, ...managerTaskScope(auth) }, select: { id: true } }),
    getPrisma().fileObject.findFirst({ where: { id: fileId, status: 'READY', OR: [{ organisationId }, { ownerId: auth.userId }] }, select: { id: true } }),
  ]);
  if (!task) throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'That task was not found.');
  if (!file) throw new NotFoundError(ErrorCode.FILE_NOT_READY, 'That ready file was not found.');
  return getPrisma().$transaction(async (tx) => {
    const attachment = await tx.taskAttachment.upsert({ where: { taskId_fileId: { taskId, fileId } }, create: { taskId, fileId, label }, update: { label } });
    await tx.fileUsage.upsert({ where: { fileId_resourceType_resourceId_field: { fileId, resourceType: 'Task', resourceId: taskId, field: 'attachment' } }, create: { fileId, resourceType: 'Task', resourceId: taskId, field: 'attachment' }, update: {} });
    return attachment;
  });
}

export async function addMyTaskAttachment(auth: AuthContext, taskId: string, fileId: string, label?: string | null) {
  await getMyTask(auth, taskId);
  const file = await getPrisma().fileObject.findFirst({ where: { id: fileId, ownerId: auth.userId, status: 'READY' }, select: { id: true } });
  if (!file) throw new NotFoundError(ErrorCode.FILE_NOT_READY, 'That ready file was not found.');
  return getPrisma().$transaction(async (tx) => {
    const attachment = await tx.taskAttachment.upsert({ where: { taskId_fileId: { taskId, fileId } }, create: { taskId, fileId, label }, update: { label } });
    await tx.fileUsage.upsert({ where: { fileId_resourceType_resourceId_field: { fileId, resourceType: 'Task', resourceId: taskId, field: 'attachment' } }, create: { fileId, resourceType: 'Task', resourceId: taskId, field: 'attachment' }, update: {} });
    return attachment;
  });
}

export async function updateTask(
  auth: AuthContext,
  organisationId: string,
  taskId: string,
  input: UpdateTaskInput,
) {
  assertOrganisationMutation(auth, organisationId, 'task:update');
  const current = await getPrisma().task.findFirst({
    where: { id: taskId, organisationId, ...managerTaskScope(auth) },
  });
  if (!current) throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'That task was not found.');
  assertDateOrder(input.startDate ?? current.startDate, input.dueDate ?? current.dueDate);
  await validateTaskReferences(organisationId, input);

  const { expectedUpdatedAt, assigneeStaffAssignmentIds, ...data } = input;
  const talentIds = assigneeStaffAssignmentIds
    ? await talentIdsForStaff(organisationId, assigneeStaffAssignmentIds)
    : undefined;
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.task.updateMany({
      where: { id: taskId, organisationId, updatedAt: expectedUpdatedAt },
      data: { ...data, ...(input.dueDate !== undefined ? { dueReminderSentAt: null } : {}) },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The task changed. Refresh and try again.');
    }
    if (talentIds) {
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      if (talentIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: talentIds.map((talentProfileId) => ({
            taskId,
            talentProfileId,
            assignedById: auth.userId,
          })),
        });
      }
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.TASK_ASSIGNED,
        aggregateType: 'Task',
        aggregateId: taskId,
        organisationId,
        payload: { taskId, organisationId },
      });
    }
    return tx.task.findUniqueOrThrow({ where: { id: taskId }, include: TASK_INCLUDE });
  });
}

const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  TO_DO: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['IN_REVIEW', 'COMPLETED', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export async function transitionTask(
  auth: AuthContext,
  organisationId: string,
  taskId: string,
  toStatus: TaskStatus,
  expectedUpdatedAt: Date,
  reason?: string,
) {
  const self = await getPrisma().task.count({
    where: {
      id: taskId,
      organisationId,
      assignees: { some: { talentProfile: { userId: auth.userId } } },
    },
  });
  if (self === 0) {
    assertOrganisationMutation(
      auth,
      organisationId,
      toStatus === 'COMPLETED' ? 'task:complete_any' : 'task:update',
    );
  }

  return getPrisma().$transaction(async (tx) => {
    const current = await tx.task.findFirst({
      where: { id: taskId, organisationId, ...(self === 0 ? managerTaskScope(auth) : {}) },
    });
    if (!current) throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'That task was not found.');
    if (!TASK_TRANSITIONS[current.status].includes(toStatus)) {
      throw new UnprocessableError(
        ErrorCode.TASK_INVALID_TRANSITION,
        `A ${current.status} task cannot move to ${toStatus}.`,
      );
    }
    const now = new Date();
    const changed = await tx.task.updateMany({
      where: { id: taskId, organisationId, updatedAt: expectedUpdatedAt },
      data: {
        status: toStatus,
        ...(toStatus === 'COMPLETED' ? { completedAt: now } : {}),
        ...(toStatus === 'CANCELLED'
          ? { cancelledAt: now, cancelReason: reason ?? null }
          : {}),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The task changed. Refresh and try again.');
    }
    await tx.taskStatusHistory.create({
      data: { taskId, fromStatus: current.status, toStatus, changedById: auth.userId, reason },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.TASK_STATUS_CHANGED,
      aggregateType: 'Task',
      aggregateId: taskId,
      organisationId,
      payload: { taskId, organisationId },
    });
    return tx.task.findUniqueOrThrow({ where: { id: taskId }, include: TASK_INCLUDE });
  });
}

export async function addComment(
  auth: AuthContext,
  organisationId: string,
  taskId: string,
  body: string,
) {
  const task = await getPrisma().task.findFirst({
    where: { id: taskId, organisationId, ...managerTaskScope(auth) },
    select: { id: true },
  });
  if (!task) throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'That task was not found.');
  const isAssignee = await getPrisma().task.count({
    where: { id: taskId, assignees: { some: { talentProfile: { userId: auth.userId } } } },
  });
  if (!auth.organisationPermissions.has('task:comment') && isAssignee === 0) {
    throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'That task was not found.');
  }
  return getPrisma().$transaction(async (tx) => {
    const comment = await tx.taskComment.create({
      data: { taskId, authorId: auth.userId, body },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.TASK_COMMENTED,
      aggregateType: 'Task',
      aggregateId: taskId,
      organisationId,
      payload: { taskId, commentId: comment.id, organisationId },
    });
    return comment;
  });
}

export async function listMyTasks(auth: AuthContext, query: TaskListQuery) {
  const where: Prisma.TaskWhereInput = {
    assignees: { some: { talentProfile: { userId: auth.userId } } },
    ...(query.status ? { status: query.status } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.task.count({ where }),
  ]);
  return { items, total };
}

export async function getMyTask(auth: AuthContext, taskId: string) {
  const task = await getPrisma().task.findFirst({
    where: { id: taskId, assignees: { some: { talentProfile: { userId: auth.userId } } } },
    include: TASK_INCLUDE,
  });
  if (!task) throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'That task was not found.');
  return task;
}

export async function transitionMyTask(
  auth: AuthContext,
  taskId: string,
  toStatus: TaskStatus,
  expectedUpdatedAt: Date,
  reason?: string,
) {
  const task = await getMyTask(auth, taskId);
  return transitionTask(auth, task.organisationId, taskId, toStatus, expectedUpdatedAt, reason);
}

export async function addMyTaskComment(auth: AuthContext, taskId: string, body: string) {
  const task = await getMyTask(auth, taskId);
  return addComment(auth, task.organisationId, taskId, body);
}

async function validateTimeTask(organisationId: string, taskId?: string | null): Promise<void> {
  if (!taskId) return;
  const exists = await getPrisma().task.count({ where: { id: taskId, organisationId } });
  if (exists === 0) throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'That task was not found.');
}

async function assertDailyLimit(
  staffAssignmentId: string,
  input: Pick<TimeEntryWriteInput, 'workDate' | 'ordinaryMinutes' | 'overtimeMinutes'>,
  excludedId?: string,
): Promise<void> {
  const existing = await getPrisma().timeEntry.aggregate({
    where: {
      staffAssignmentId,
      workDate: input.workDate,
      status: { not: 'CORRECTED' },
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    _sum: { ordinaryMinutes: true, overtimeMinutes: true },
  });
  const total =
    (existing._sum.ordinaryMinutes ?? 0) +
    (existing._sum.overtimeMinutes ?? 0) +
    input.ordinaryMinutes +
    input.overtimeMinutes;
  if (total > 1440) {
    throw new UnprocessableError(
      ErrorCode.TIME_ENTRY_OVERLAP,
      'Total logged time for a day cannot exceed 24 hours.',
    );
  }
}

export async function createTimeEntry(
  auth: AuthContext,
  input: TimeEntryWriteInput & { staffAssignmentId: string },
) {
  const staff = await getPrisma().staffAssignment.findFirst({
    where: {
      id: input.staffAssignmentId,
      talentProfile: { userId: auth.userId },
      status: 'ACTIVE',
    },
    select: { id: true, organisationId: true, talentProfileId: true },
  });
  if (!staff) {
    throw new NotFoundError(
      ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND,
      'That active assignment was not found.',
    );
  }
  await validateTimeTask(staff.organisationId, input.taskId);
  await assertDailyLimit(staff.id, input);
  return getPrisma().timeEntry.create({
    data: {
      ...input,
      organisationId: staff.organisationId,
      talentProfileId: staff.talentProfileId,
    },
  });
}

export async function updateTimeEntry(
  auth: AuthContext,
  timeEntryId: string,
  input: Partial<TimeEntryWriteInput> & { expectedUpdatedAt: Date },
) {
  const current = await getPrisma().timeEntry.findFirst({
    where: { id: timeEntryId, talentProfile: { userId: auth.userId } },
    include: { timesheetPeriod: { select: { status: true } } },
  });
  if (!current) {
    throw new NotFoundError(ErrorCode.TIME_ENTRY_NOT_FOUND, 'That time entry was not found.');
  }
  if (!['DRAFT', 'REJECTED'].includes(current.status)) {
    throw new UnprocessableError(
      ErrorCode.TIME_ENTRY_INVALID_TRANSITION,
      'Only draft or rejected time can be edited.',
    );
  }
  if (current.timesheetPeriod?.status === 'LOCKED') {
    throw new UnprocessableError(
      ErrorCode.TIME_ENTRY_PERIOD_LOCKED,
      'This time entry belongs to a locked period.',
    );
  }
  const next = {
    workDate: input.workDate ?? current.workDate,
    ordinaryMinutes: input.ordinaryMinutes ?? current.ordinaryMinutes,
    overtimeMinutes: input.overtimeMinutes ?? current.overtimeMinutes,
  };
  await validateTimeTask(current.organisationId, input.taskId);
  await assertDailyLimit(current.staffAssignmentId, next, current.id);
  const { expectedUpdatedAt, ...data } = input;
  const changed = await getPrisma().timeEntry.updateMany({
    where: { id: timeEntryId, updatedAt: expectedUpdatedAt },
    data: { ...data, status: 'DRAFT', rejectedAt: null, rejectionReason: null },
  });
  if (changed.count === 0) {
    throw new ConflictError(ErrorCode.STALE_WRITE, 'The time entry changed. Refresh and try again.');
  }
  return getPrisma().timeEntry.findUniqueOrThrow({ where: { id: timeEntryId } });
}

export async function submitTimeEntry(
  auth: AuthContext,
  timeEntryId: string,
  expectedUpdatedAt: Date,
) {
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.timeEntry.findFirst({
      where: { id: timeEntryId, talentProfile: { userId: auth.userId } },
      include: { timesheetPeriod: { select: { status: true } } },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.TIME_ENTRY_NOT_FOUND, 'That time entry was not found.');
    }
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new UnprocessableError(
        ErrorCode.TIME_ENTRY_INVALID_TRANSITION,
        'That time entry cannot be submitted.',
      );
    }
    if (current.timesheetPeriod?.status === 'LOCKED') {
      throw new UnprocessableError(
        ErrorCode.TIME_ENTRY_PERIOD_LOCKED,
        'This time entry belongs to a locked period.',
      );
    }
    const changed = await tx.timeEntry.updateMany({
      where: { id: timeEntryId, updatedAt: expectedUpdatedAt },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The time entry changed. Refresh and try again.');
    }
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.TIME_ENTRY_SUBMITTED,
      aggregateType: 'TimeEntry',
      aggregateId: timeEntryId,
      organisationId: current.organisationId,
      payload: {
        timeEntryId,
        staffAssignmentId: current.staffAssignmentId,
        organisationId: current.organisationId,
      },
    });
    return tx.timeEntry.findUniqueOrThrow({ where: { id: timeEntryId } });
  });
}

function timeDateFilter(query: TimeListQuery): Prisma.DateTimeFilter | undefined {
  if (!query.from && !query.to) return undefined;
  return { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
}

export async function listMyTime(auth: AuthContext, query: TimeListQuery) {
  const workDate = timeDateFilter(query);
  const where: Prisma.TimeEntryWhereInput = {
    talentProfile: { userId: auth.userId },
    ...(query.status ? { status: query.status } : {}),
    ...(workDate ? { workDate } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.timeEntry.count({ where }),
  ]);
  return { items, total };
}

export async function listOrganisationTime(
  auth: AuthContext,
  organisationId: string,
  query: TimeListQuery,
) {
  assertOrganisationAccess(auth, organisationId, 'time:read');
  const workDate = timeDateFilter(query);
  const where: Prisma.TimeEntryWhereInput = {
    organisationId,
    staffAssignment: managerStaffScope(auth),
    ...(query.status ? { status: query.status } : {}),
    ...(query.staffAssignmentId ? { staffAssignmentId: query.staffAssignmentId } : {}),
    ...(workDate ? { workDate } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: {
        staffAssignment: {
          select: {
            id: true,
            employeeCode: true,
            jobTitle: true,
            talentProfile: {
              select: {
                user: { select: { firstName: true, lastName: true, displayName: true } },
              },
            },
          },
        },
        approvals: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ workDate: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.timeEntry.count({ where }),
  ]);
  return { items, total };
}

export async function decideTime(
  auth: AuthContext,
  organisationId: string,
  timeEntryId: string,
  input: { expectedUpdatedAt: Date; decision: 'APPROVE' | 'REJECT'; reason?: string },
) {
  assertOrganisationMutation(auth, organisationId, 'time:approve');
  if (input.decision === 'REJECT' && !input.reason) {
    throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'A rejection reason is required.');
  }
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.timeEntry.findFirst({
      where: {
        id: timeEntryId,
        organisationId,
        staffAssignment: managerStaffScope(auth),
      },
      include: { timesheetPeriod: { select: { status: true } } },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.TIME_ENTRY_NOT_FOUND, 'That time entry was not found.');
    }
    if (current.timesheetPeriod?.status === 'LOCKED') {
      throw new UnprocessableError(
        ErrorCode.TIME_ENTRY_PERIOD_LOCKED,
        'This time entry belongs to a locked period.',
      );
    }
    if (current.status !== 'SUBMITTED') {
      throw new UnprocessableError(
        ErrorCode.TIME_ENTRY_INVALID_TRANSITION,
        'Only submitted time can be decided.',
      );
    }
    const toStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const now = new Date();
    const changed = await tx.timeEntry.updateMany({
      where: { id: timeEntryId, updatedAt: input.expectedUpdatedAt },
      data: {
        status: toStatus,
        ...(toStatus === 'APPROVED'
          ? { approvedAt: now, rejectedAt: null, rejectionReason: null }
          : { rejectedAt: now, rejectionReason: input.reason ?? null }),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The time entry changed. Refresh and try again.');
    }
    await tx.timeEntryApproval.create({
      data: {
        timeEntryId,
        fromStatus: current.status,
        toStatus,
        decidedById: auth.userId,
        reason: input.reason,
      },
    });
    await emitEvent(tx, {
      eventKey:
        toStatus === 'APPROVED' ? EVENT_KEYS.TIMESHEET_APPROVED : EVENT_KEYS.TIMESHEET_REJECTED,
      aggregateType: 'TimeEntry',
      aggregateId: timeEntryId,
      organisationId,
      payload: { timeEntryId, staffAssignmentId: current.staffAssignmentId, organisationId },
    });
    return tx.timeEntry.findUniqueOrThrow({
      where: { id: timeEntryId },
      include: { approvals: true },
    });
  });
}
