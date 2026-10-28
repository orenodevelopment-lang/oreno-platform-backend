/**
 * The domain event catalogue.
 *
 * Domain events are the only supported way for one module to react to another
 * module's change. A module writes an `OutboxEvent` row inside the same
 * transaction as the business change; the outbox dispatcher later hands the
 * event to every registered handler. This is what keeps "create the offer"
 * from turning into a chain of synchronous cross-module writes.
 *
 * Event keys are part of the internal contract. Renaming one requires updating
 * its handlers in the same change; nothing outside the backend consumes them.
 */
export const EVENT_KEYS = {
  // Identity and access
  USER_REGISTERED: 'user.registered',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  USER_PASSWORD_RESET_REQUESTED: 'user.password_reset_requested',
  USER_PASSWORD_RESET_COMPLETED: 'user.password_reset_completed',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_STATUS_CHANGED: 'user.status_changed',

  // Organisation
  ORGANISATION_CREATED: 'organisation.created',
  ORGANISATION_UPDATED: 'organisation.updated',
  ORGANISATION_STATUS_CHANGED: 'organisation.status_changed',
  ORGANISATION_VERIFICATION_CHANGED: 'organisation.verification_changed',
  ORGANISATION_ONBOARDING_COMPLETED: 'organisation.onboarding_completed',

  // Membership and invitations
  INVITATION_CREATED: 'invitation.created',
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_REVOKED: 'invitation.revoked',
  MEMBERSHIP_GRANTED: 'membership.granted',
  MEMBERSHIP_ROLE_CHANGED: 'membership.role_changed',
  MEMBERSHIP_SUSPENDED: 'membership.suspended',
  MEMBERSHIP_REVOKED: 'membership.revoked',

  // Talent and vetting
  TALENT_PROFILE_CREATED: 'talent.profile_created',
  TALENT_PROFILE_UPDATED: 'talent.profile_updated',
  VETTING_CASE_OPENED: 'vetting.case_opened',
  VETTING_REVIEW_RECORDED: 'vetting.review_recorded',
  VETTING_DECIDED: 'vetting.decided',

  // Jobs and applications
  JOB_PUBLISHED: 'job.published',
  JOB_UPDATED: 'job.updated',
  JOB_CLOSED: 'job.closed',
  JOB_ARCHIVED: 'job.archived',
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_STATUS_CHANGED: 'application.status_changed',
  APPLICATION_WITHDRAWN: 'application.withdrawn',
  SCREENING_SUBMITTED: 'screening.submitted',
  SCREENING_ASSIGNED: 'screening.assigned',
  SCREENING_CV_REVIEWED: 'screening.cv_reviewed',
  SCREENING_INFO_REQUESTED: 'screening.info_requested',
  SCREENING_INFO_SUBMITTED: 'screening.info_submitted',
  SCREENING_INTERVIEW_SCHEDULED: 'screening.interview_scheduled',
  SCREENING_INTERVIEW_UPDATED: 'screening.interview_updated',
  SCREENING_INTERVIEW_DECIDED: 'screening.interview_decided',
  SCREENING_FINAL_DECIDED: 'screening.final_decided',
  SCREENING_RELEASED_TO_COMPANY: 'screening.released_to_company',
  SCREENING_CANCELLED: 'screening.cancelled',

  // Pipeline
  SHORTLIST_CREATED: 'shortlist.created',
  SHORTLIST_CANDIDATE_ADDED: 'shortlist.candidate_added',
  INTERVIEW_SCHEDULED: 'interview.scheduled',
  INTERVIEW_UPDATED: 'interview.updated',
  INTERVIEW_CANCELLED: 'interview.cancelled',
  INTERVIEW_OUTCOME_RECORDED: 'interview.outcome_recorded',
  OFFER_CREATED: 'offer.created',
  OFFER_SENT: 'offer.sent',
  OFFER_RESPONDED: 'offer.responded',
  OFFER_EXPIRED: 'offer.expired',
  PLACEMENT_CREATED: 'placement.created',
  PLACEMENT_UPDATED: 'placement.updated',
  PLACEMENT_ENDED: 'placement.ended',
  REPLACEMENT_REQUESTED: 'placement.replacement_requested',
  REPLACEMENT_DECIDED: 'placement.replacement_decided',

  // Workforce
  DEPARTMENT_CHANGED: 'workforce.department_changed',
  TEAM_CHANGED: 'workforce.team_changed',
  STAFF_ASSIGNMENT_STARTED: 'workforce.assignment_started',
  STAFF_ASSIGNMENT_ENDED: 'workforce.assignment_ended',
  TASK_CREATED: 'task.created',
  TASK_ASSIGNED: 'task.assigned',
  TASK_STATUS_CHANGED: 'task.status_changed',
  TASK_DUE_SOON: 'task.due_soon',
  TASK_COMMENTED: 'task.commented',
  CALENDAR_EVENT_CREATED: 'calendar.event_created',
  CALENDAR_EVENT_UPDATED: 'calendar.event_updated',
  CALENDAR_EVENT_CANCELLED: 'calendar.event_cancelled',
  CALENDAR_REMINDER_DUE: 'calendar.reminder_due',

  // Time and performance
  TIME_ENTRY_SUBMITTED: 'time.entry_submitted',
  TIMESHEET_APPROVED: 'time.timesheet_approved',
  TIMESHEET_REJECTED: 'time.timesheet_rejected',
  PERFORMANCE_REVIEW_SUBMITTED: 'performance.review_submitted',
  PERFORMANCE_REVIEW_CORRECTED: 'performance.review_corrected',

  // Money (records only — Oreno never moves funds)
  PAY_AGREEMENT_CREATED: 'compensation.agreement_created',
  PAY_AGREEMENT_UPDATED: 'compensation.agreement_updated',
  COMPENSATION_ADJUSTMENT_CREATED: 'compensation.adjustment_created',
  PAYROLL_PERIOD_CALCULATED: 'payroll.period_calculated',
  PAYROLL_PERIOD_APPROVED: 'payroll.period_approved',
  PAYROLL_PERIOD_LOCKED: 'payroll.period_locked',
  PAYMENT_RECORDED: 'payment.recorded',
  PAYMENT_STATUS_CHANGED: 'payment.status_changed',

  // Communication
  CONVERSATION_CREATED: 'message.conversation_created',
  MESSAGE_SENT: 'message.sent',
  NOTIFICATION_CREATED: 'notification.created',
  EMAIL_DELIVERY_REQUESTED: 'email.delivery_requested',

  // Files, exports, search
  FILE_UPLOADED: 'file.uploaded',
  FILE_SCAN_COMPLETED: 'file.scan_completed',
  FILE_SCAN_FAILED: 'file.scan_failed',
  FILE_ARCHIVED: 'file.archived',
  EXPORT_REQUESTED: 'export.requested',
  EXPORT_COMPLETED: 'export.completed',
  EXPORT_FAILED: 'export.failed',

  // Growth and support
  DEMO_REQUEST_SUBMITTED: 'lead.demo_requested',
  CONTACT_REQUEST_SUBMITTED: 'lead.contact_submitted',
  NEWSLETTER_SUBSCRIBED: 'lead.newsletter_subscribed',
  SUPPORT_CASE_CREATED: 'support.case_created',
  SUPPORT_CASE_UPDATED: 'support.case_updated',

  // Platform administration
  FEATURE_FLAG_CHANGED: 'config.feature_flag_changed',
  POLICY_CHANGED: 'config.policy_changed',
  ANNOUNCEMENT_PUBLISHED: 'config.announcement_published',
  AUDIT_EXPORT_REQUESTED: 'audit.export_requested',
} as const;

export type EventKey = (typeof EVENT_KEYS)[keyof typeof EVENT_KEYS];

const EVENT_KEY_SET: ReadonlySet<string> = new Set(Object.values(EVENT_KEYS));

export function isKnownEventKey(key: string): key is EventKey {
  return EVENT_KEY_SET.has(key);
}

/**
 * Envelope delivered to handlers. `payload` is intentionally `unknown` at the
 * boundary; each handler narrows it with a Zod schema so a malformed stored
 * payload fails loudly in the worker rather than corrupting state.
 */
export interface DomainEvent<T = unknown> {
  readonly id: string;
  readonly key: EventKey;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly organisationId?: string;
  readonly payload: T;
  readonly occurredAt: Date;
  readonly attempts: number;
}
