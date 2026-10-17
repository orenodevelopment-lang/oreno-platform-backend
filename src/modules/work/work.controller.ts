import type { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './work.service.js';
import * as calendarService from './calendar.service.js';
import {
  calendarEventParamsSchema,
  calendarListQuerySchema,
  calendarResponseSchema,
  commentSchema,
  createCalendarEventSchema,
  createTaskSchema,
  createTimeSchema,
  myCalendarEventParamsSchema,
  myTaskParamsSchema,
  organisationParamsSchema,
  organisationTimeParamsSchema,
  revisionCommandSchema,
  taskListQuerySchema,
  taskParamsSchema,
  taskStatusSchema,
  taskAttachmentSchema,
  timeDecisionSchema,
  timeListQuerySchema,
  timeParamsSchema,
  updateTaskSchema,
  updateTimeSchema,
  updateCalendarEventSchema,
} from './work.schema.js';

export async function listCalendarEvents(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: calendarListQuerySchema,
  });
  const result = await calendarService.listEvents(
    requireAuthContext(req),
    params.organisationId,
    query,
  );
  sendSuccess(res, { events: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function getCalendarEvent(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: calendarEventParamsSchema });
  sendSuccess(res, {
    event: await calendarService.getEvent(
      requireAuthContext(req),
      params.organisationId,
      params.eventId,
    ),
  });
}

export async function createCalendarEvent(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createCalendarEventSchema,
  });
  sendCreated(res, {
    event: await calendarService.createEvent(
      requireAuthContext(req),
      params.organisationId,
      body,
    ),
  });
}

export async function updateCalendarEvent(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: calendarEventParamsSchema,
    body: updateCalendarEventSchema,
  });
  sendSuccess(res, {
    event: await calendarService.updateEvent(
      requireAuthContext(req),
      params.organisationId,
      params.eventId,
      body,
    ),
  });
}

export async function cancelCalendarEvent(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: calendarEventParamsSchema,
    body: revisionCommandSchema,
  });
  sendSuccess(res, {
    event: await calendarService.cancelEvent(
      requireAuthContext(req),
      params.organisationId,
      params.eventId,
      body.expectedUpdatedAt,
    ),
  });
}

export async function listMyCalendar(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: calendarListQuerySchema });
  const result = await calendarService.listMyCalendar(requireAuthContext(req), query);
  sendSuccess(res, { events: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function respondToCalendarEvent(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: myCalendarEventParamsSchema,
    body: calendarResponseSchema,
  });
  sendSuccess(res, {
    event: await calendarService.respondToEvent(
      requireAuthContext(req),
      params.eventId,
      body.response,
    ),
  });
}

export async function createTask(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createTaskSchema,
  });
  sendCreated(res, {
    task: await service.createTask(requireAuthContext(req), params.organisationId, body),
  });
}

export async function listTasks(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: taskListQuerySchema,
  });
  const result = await service.listTasks(requireAuthContext(req), params.organisationId, query);
  sendSuccess(res, { tasks: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function getTask(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: taskParamsSchema });
  sendSuccess(res, {
    task: await service.getTask(requireAuthContext(req), params.organisationId, params.taskId),
  });
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: taskParamsSchema, body: updateTaskSchema });
  sendSuccess(res, {
    task: await service.updateTask(
      requireAuthContext(req),
      params.organisationId,
      params.taskId,
      body,
    ),
  });
}

export async function transitionTask(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: taskParamsSchema, body: taskStatusSchema });
  sendSuccess(res, {
    task: await service.transitionTask(
      requireAuthContext(req),
      params.organisationId,
      params.taskId,
      body.status,
      body.expectedUpdatedAt,
      body.reason,
    ),
  });
}

export async function addComment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: taskParamsSchema, body: commentSchema });
  sendCreated(res, {
    comment: await service.addComment(
      requireAuthContext(req),
      params.organisationId,
      params.taskId,
      body.body,
    ),
  });
}

export async function addTaskAttachment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: taskParamsSchema, body: taskAttachmentSchema });
  sendCreated(res, { attachment: await service.addTaskAttachment(requireAuthContext(req), params.organisationId, params.taskId, body.fileId, body.label) });
}

export async function addMyTaskAttachment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: myTaskParamsSchema, body: taskAttachmentSchema });
  sendCreated(res, { attachment: await service.addMyTaskAttachment(requireAuthContext(req), params.taskId, body.fileId, body.label) });
}

export async function listMyTasks(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: taskListQuerySchema });
  const result = await service.listMyTasks(requireAuthContext(req), query);
  sendSuccess(res, { tasks: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function getMyTask(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: myTaskParamsSchema });
  sendSuccess(res, { task: await service.getMyTask(requireAuthContext(req), params.taskId) });
}

export async function transitionMyTask(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: myTaskParamsSchema, body: taskStatusSchema });
  sendSuccess(res, {
    task: await service.transitionMyTask(
      requireAuthContext(req),
      params.taskId,
      body.status,
      body.expectedUpdatedAt,
      body.reason,
    ),
  });
}

export async function addMyTaskComment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: myTaskParamsSchema, body: commentSchema });
  sendCreated(res, {
    comment: await service.addMyTaskComment(requireAuthContext(req), params.taskId, body.body),
  });
}

export async function createTimeEntry(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: createTimeSchema });
  sendCreated(res, { timeEntry: await service.createTimeEntry(requireAuthContext(req), body) });
}

export async function updateTimeEntry(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: timeParamsSchema, body: updateTimeSchema });
  sendSuccess(res, {
    timeEntry: await service.updateTimeEntry(requireAuthContext(req), params.timeEntryId, body),
  });
}

export async function submitTimeEntry(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: timeParamsSchema,
    body: revisionCommandSchema,
  });
  sendSuccess(res, {
    timeEntry: await service.submitTimeEntry(
      requireAuthContext(req),
      params.timeEntryId,
      body.expectedUpdatedAt,
    ),
  });
}

export async function listMyTime(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: timeListQuerySchema });
  const result = await service.listMyTime(requireAuthContext(req), query);
  sendSuccess(
    res,
    { timeEntries: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function listOrganisationTime(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: timeListQuerySchema,
  });
  const result = await service.listOrganisationTime(
    requireAuthContext(req),
    params.organisationId,
    query,
  );
  sendSuccess(
    res,
    { timeEntries: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function decideTime(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: organisationTimeParamsSchema,
    body: timeDecisionSchema,
  });
  sendSuccess(res, {
    timeEntry: await service.decideTime(
      requireAuthContext(req),
      params.organisationId,
      params.timeEntryId,
      body,
    ),
  });
}
