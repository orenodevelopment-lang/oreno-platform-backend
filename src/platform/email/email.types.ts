/**
 * Transactional email abstraction.
 *
 * Rendering is separated from delivery so a template can be tested without a
 * provider, and delivery is separated from the domain so an offer being sent
 * does not depend on SMTP being reachable. The domain writes an outbox event;
 * the worker renders and delivers, recording every attempt in `EmailDelivery`.
 */
export interface EmailMessage {
  to: string;
  toName?: string | undefined;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | undefined;
  headers?: Record<string, string> | undefined;
  tags?: Record<string, string> | undefined;
}

export interface EmailSendResult {
  /** Provider-assigned identifier, stored for support and delivery tracing. */
  providerRef?: string | undefined;
}

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Every transactional email the platform can send. Typing this as a union means
 * a renamed or removed template is a compile error at the call site rather than
 * a silent missing email.
 */
export const EMAIL_TEMPLATES = {
  EMAIL_VERIFICATION: 'email-verification',
  PASSWORD_RESET: 'password-reset',
  PASSWORD_CHANGED: 'password-changed',
  WELCOME: 'welcome',
  ORGANISATION_INVITATION: 'organisation-invitation',
  INVITATION_REMINDER: 'invitation-reminder',
  ORGANISATION_VERIFIED: 'organisation-verified',
  ORGANISATION_SUSPENDED: 'organisation-suspended',
  APPLICATION_RECEIVED: 'application-received',
  APPLICATION_STATUS_CHANGED: 'application-status-changed',
  INTERVIEW_SCHEDULED: 'interview-scheduled',
  INTERVIEW_UPDATED: 'interview-updated',
  OFFER_SENT: 'offer-sent',
  OFFER_EXPIRED: 'offer-expired',
  PLACEMENT_STARTED: 'placement-started',
  PLACEMENT_ENDED: 'placement-ended',
  TIMESHEET_SUBMITTED: 'timesheet-submitted',
  TIMESHEET_APPROVED: 'timesheet-approved',
  TIMESHEET_REJECTED: 'timesheet-rejected',
  PAYROLL_PERIOD_APPROVED: 'payroll-period-approved',
  TASK_ASSIGNED: 'task-assigned',
  TASK_DUE_SOON: 'task-due-soon',
  CALENDAR_REMINDER: 'calendar-reminder',
  VETTING_DECISION: 'vetting-decision',
  EXPORT_READY: 'export-ready',
  EXPORT_FAILED: 'export-failed',
  SUPPORT_CASE_ACKNOWLEDGED: 'support-case-acknowledged',
  SUPPORT_CASE_UPDATED: 'support-case-updated',
  DEMO_REQUEST_RECEIVED: 'demo-request-received',
  CONTACT_REQUEST_RECEIVED: 'contact-request-received',
  NEWSLETTER_CONFIRMATION: 'newsletter-confirmation',
  NEWSLETTER_WELCOME: 'newsletter-welcome',
  ACCOUNT_SUSPENDED: 'account-suspended',
  ACCOUNT_REACTIVATED: 'account-reactivated',
  WEEKLY_DIGEST: 'weekly-digest',
  ANNOUNCEMENT: 'announcement',
} as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

export type TemplateVariables = Record<string, string | number | boolean | null | undefined>;
