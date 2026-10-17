import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';
export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const taskParamsSchema = strictObject({ organisationId: uuidSchema, taskId: uuidSchema });
export const myTaskParamsSchema = strictObject({ taskId: uuidSchema });
export const timeParamsSchema = strictObject({ timeEntryId: uuidSchema });
export const organisationTimeParamsSchema = strictObject({ organisationId: uuidSchema, timeEntryId: uuidSchema });
export const taskListQuerySchema = pagePaginationSchema.extend({ status: z.enum(['TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED']).optional(), assigneeStaffAssignmentId: uuidSchema.optional(), departmentId: uuidSchema.optional(), teamId: uuidSchema.optional() });
export const createTaskSchema = strictObject({ title: z.string().trim().min(2).max(240), description: z.string().trim().max(8000).nullable().optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'), startDate: z.coerce.date().nullable().optional(), dueDate: z.coerce.date().nullable().optional(), jobId: uuidSchema.nullable().optional(), departmentId: uuidSchema.nullable().optional(), teamId: uuidSchema.nullable().optional(), assigneeStaffAssignmentIds: z.array(uuidSchema).max(100).default([]) });
export const updateTaskSchema = strictObject({ expectedUpdatedAt: z.coerce.date(), title: z.string().trim().min(2).max(240).optional(), description: z.string().trim().max(8000).nullable().optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(), startDate: z.coerce.date().nullable().optional(), dueDate: z.coerce.date().nullable().optional(), departmentId: uuidSchema.nullable().optional(), teamId: uuidSchema.nullable().optional(), assigneeStaffAssignmentIds: z.array(uuidSchema).max(100).optional() });
export const taskStatusSchema = strictObject({ expectedUpdatedAt: z.coerce.date(), status: z.enum(['TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED']), reason: z.string().trim().max(1000).optional() });
export const commentSchema = strictObject({ body: z.string().trim().min(1).max(8000) });
export const taskAttachmentSchema = strictObject({ fileId: uuidSchema, label: z.string().trim().max(200).nullable().optional() });
export const createTimeSchema = strictObject({ staffAssignmentId: uuidSchema, taskId: uuidSchema.nullable().optional(), workDate: z.coerce.date(), ordinaryMinutes: z.number().int().min(1).max(1440), overtimeMinutes: z.number().int().min(0).max(1440).default(0), description: z.string().trim().max(2000).nullable().optional() });
export const updateTimeSchema = strictObject({ expectedUpdatedAt: z.coerce.date(), taskId: uuidSchema.nullable().optional(), workDate: z.coerce.date().optional(), ordinaryMinutes: z.number().int().min(1).max(1440).optional(), overtimeMinutes: z.number().int().min(0).max(1440).optional(), description: z.string().trim().max(2000).nullable().optional() });
export const timeDecisionSchema = strictObject({ expectedUpdatedAt: z.coerce.date(), decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().trim().max(1000).optional() });
export const revisionCommandSchema = strictObject({ expectedUpdatedAt: z.coerce.date() });
export const timeListQuerySchema = pagePaginationSchema.extend({ status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CORRECTED']).optional(), staffAssignmentId: uuidSchema.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export const calendarEventParamsSchema = strictObject({
  organisationId: uuidSchema,
  eventId: uuidSchema,
});
export const myCalendarEventParamsSchema = strictObject({ eventId: uuidSchema });
export const calendarListQuerySchema = pagePaginationSchema.extend({
  from: z.coerce.date(),
  to: z.coerce.date(),
  type: z
    .enum(['TASK_DEADLINE', 'INTERVIEW', 'COMPANY_EVENT', 'TIME_OFF', 'REMINDER', 'OTHER'])
    .optional(),
});
const eventParticipantFields = {
  userIds: z.array(uuidSchema).max(200).default([]),
  staffAssignmentIds: z.array(uuidSchema).max(200).default([]),
};
const eventReminderSchema = strictObject({
  channel: z.enum(['IN_APP', 'EMAIL']).default('IN_APP'),
  minutesBefore: z.number().int().min(0).max(43_200),
});
export const createCalendarEventSchema = strictObject({
  type: z.enum(['COMPANY_EVENT', 'TIME_OFF', 'REMINDER', 'OTHER']).default('COMPANY_EVENT'),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  meetingUrl: z.string().url().max(2048).nullable().optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  timeZone: z.string().trim().min(1).max(64).default('UTC'),
  isAllDay: z.boolean().default(false),
  ...eventParticipantFields,
  reminders: z.array(eventReminderSchema).max(10).default([]),
});
export const updateCalendarEventSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  type: z.enum(['COMPANY_EVENT', 'TIME_OFF', 'REMINDER', 'OTHER']).optional(),
  title: z.string().trim().min(2).max(240).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  meetingUrl: z.string().url().max(2048).nullable().optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  timeZone: z.string().trim().min(1).max(64).optional(),
  isAllDay: z.boolean().optional(),
  userIds: z.array(uuidSchema).max(200).optional(),
  staffAssignmentIds: z.array(uuidSchema).max(200).optional(),
  reminders: z.array(eventReminderSchema).max(10).optional(),
});
export const calendarResponseSchema = strictObject({
  response: z.enum(['ACCEPTED', 'DECLINED', 'TENTATIVE']),
});
