import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './work.controller.js';

export function createOrganisationWorkRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/tasks', authenticate(), asyncHandler(controller.listTasks));
  router.post('/tasks', authenticate(), asyncHandler(controller.createTask));
  router.get('/tasks/:taskId', authenticate(), asyncHandler(controller.getTask));
  router.patch('/tasks/:taskId', authenticate(), asyncHandler(controller.updateTask));
  router.post('/tasks/:taskId/status', authenticate(), asyncHandler(controller.transitionTask));
  router.post('/tasks/:taskId/comments', authenticate(), asyncHandler(controller.addComment));
  router.post('/tasks/:taskId/attachments', authenticate(), asyncHandler(controller.addTaskAttachment));

  router.get('/time-entries', authenticate(), asyncHandler(controller.listOrganisationTime));
  router.post(
    '/time-entries/:timeEntryId/decision',
    authenticate(),
    asyncHandler(controller.decideTime),
  );
  router.get('/calendar', authenticate(), asyncHandler(controller.listCalendarEvents));
  router.post('/calendar', authenticate(), asyncHandler(controller.createCalendarEvent));
  router.get('/calendar/:eventId', authenticate(), asyncHandler(controller.getCalendarEvent));
  router.patch('/calendar/:eventId', authenticate(), asyncHandler(controller.updateCalendarEvent));
  router.post(
    '/calendar/:eventId/cancel',
    authenticate(),
    asyncHandler(controller.cancelCalendarEvent),
  );
  return router;
}

export function createTalentWorkRouter(): Router {
  const router = Router();
  router.get('/tasks', authenticate(), asyncHandler(controller.listMyTasks));
  router.get('/tasks/:taskId', authenticate(), asyncHandler(controller.getMyTask));
  router.post('/tasks/:taskId/status', authenticate(), asyncHandler(controller.transitionMyTask));
  router.post('/tasks/:taskId/comments', authenticate(), asyncHandler(controller.addMyTaskComment));
  router.post('/tasks/:taskId/attachments', authenticate(), asyncHandler(controller.addMyTaskAttachment));

  router.get('/time-entries', authenticate(), asyncHandler(controller.listMyTime));
  router.post('/time-entries', authenticate(), asyncHandler(controller.createTimeEntry));
  router.patch('/time-entries/:timeEntryId', authenticate(), asyncHandler(controller.updateTimeEntry));
  router.post(
    '/time-entries/:timeEntryId/submit',
    authenticate(),
    asyncHandler(controller.submitTimeEntry),
  );
  router.get('/calendar', authenticate(), asyncHandler(controller.listMyCalendar));
  router.post(
    '/calendar/:eventId/respond',
    authenticate(),
    asyncHandler(controller.respondToCalendarEvent),
  );
  return router;
}
