import {
  EMAIL_TEMPLATES,
  type EmailTemplateKey,
  type RenderedTemplate,
  type TemplateVariables,
} from './email.types.js';

/**
 * Template rendering.
 *
 * Templates are functions rather than files so a missing variable is caught by
 * the type checker and a malformed one by the unit suite. Every interpolated
 * value is HTML-escaped, because template variables routinely contain
 * user-controlled text (a candidate name, a company name in a subject line).
 */
const NL = String.fromCharCode(10);

function escapeHtml(value: unknown): string {
  // Template variables are declared `unknown`; only primitives have a meaningful
  // rendering, and anything else becomes an empty string rather than
  // `[object Object]` appearing in a candidate-facing email.
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
        ? String(value)
        : '';

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function required(vars: TemplateVariables, key: string): string {
  const value = vars[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Email template variable "${key}" is required but was not provided.`);
  }
  return String(value);
}

function optional(vars: TemplateVariables, key: string, fallback = ''): string {
  const value = vars[key];
  return value === undefined || value === null ? fallback : String(value);
}

interface TemplateDefinition {
  subject: (vars: TemplateVariables) => string;
  heading: (vars: TemplateVariables) => string;
  paragraphs: (vars: TemplateVariables) => string[];
  cta?: (vars: TemplateVariables) => { label: string; url: string } | undefined;
  /** Plain-text alternative. Built separately so it never contains markup. */
  textBody: (vars: TemplateVariables) => string[];
}

const DEFINITIONS: Record<EmailTemplateKey, TemplateDefinition> = {
  [EMAIL_TEMPLATES.EMAIL_VERIFICATION]: {
    subject: () => `Confirm your Oreno email address`,
    heading: () => `Confirm your email address`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'firstName')},`,
      `Confirm this address to finish setting up your Oreno account. The link expires in 24 hours.`,
    ],
    cta: (vars) => ({ label: `Confirm email address`, url: required(vars, 'verificationUrl') }),
    textBody: (vars) => [
      `Hi ${required(vars, 'firstName')},`,
      `Confirm this address to finish setting up your Oreno account.`,
      `Open this link to confirm: ${required(vars, 'verificationUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.PASSWORD_RESET]: {
    subject: () => `Reset your Oreno password`,
    heading: () => `Reset your password`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'firstName')},`,
      `We received a request to reset the password on your Oreno account. The link expires in one hour and can be used once.`,
      `If you did not request this, you can ignore this email — your password will not change.`,
    ],
    cta: (vars) => ({ label: `Choose a new password`, url: required(vars, 'resetUrl') }),
    textBody: (vars) => [
      `Hi ${required(vars, 'firstName')},`,
      `Use this link to choose a new password (expires in one hour): ${required(vars, 'resetUrl')}`,
      `If you did not request this, ignore this email.`,
    ],
  },

  [EMAIL_TEMPLATES.PASSWORD_CHANGED]: {
    subject: () => `Your Oreno password was changed`,
    heading: () => `Your password was changed`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'firstName')},`,
      `The password on your Oreno account was changed on ${required(vars, 'changedAt')}.`,
      `If this was not you, reset your password immediately and contact support.`,
    ],
    textBody: (vars) => [
      `The password on your Oreno account was changed on ${required(vars, 'changedAt')}.`,
      `If this was not you, reset your password immediately and contact support.`,
    ],
  },

  [EMAIL_TEMPLATES.WELCOME]: {
    subject: () => `Welcome to Oreno`,
    heading: (vars) => `Welcome, ${required(vars, 'firstName')}`,
    paragraphs: (vars) => [
      `Your Oreno account is ready.`,
      `You are a member of ${required(vars, 'organisationName')}.`,
      `Next step: complete your organisation profile so we can verify your account.`,
    ],
    cta: (vars) => ({ label: `Open Oreno`, url: required(vars, 'appUrl') }),
    textBody: (vars) => [
      `Welcome to Oreno, ${required(vars, 'firstName')}.`,
      `You are a member of ${required(vars, 'organisationName')}.`,
      `Open Oreno: ${required(vars, 'appUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.ORGANISATION_INVITATION]: {
    subject: (vars) =>
      `${required(vars, 'inviterName')} invited you to ${required(vars, 'organisationName')} on Oreno`,
    heading: () => `You have been invited`,
    paragraphs: (vars) => [
      `${required(vars, 'inviterName')} invited you to join ${required(vars, 'organisationName')} on Oreno as ${required(vars, 'roleName')}.`,
      optional(vars, 'message'),
      `This invitation expires on ${required(vars, 'expiresAt')}.`,
    ],
    cta: (vars) => ({ label: `Accept invitation`, url: required(vars, 'invitationUrl') }),
    textBody: (vars) => [
      `${required(vars, 'inviterName')} invited you to join ${required(vars, 'organisationName')} as ${required(vars, 'roleName')}.`,
      `Accept the invitation: ${required(vars, 'invitationUrl')}`,
      `This invitation expires on ${required(vars, 'expiresAt')}.`,
    ],
  },

  [EMAIL_TEMPLATES.INVITATION_REMINDER]: {
    subject: (vars) => `Reminder: your invitation to ${required(vars, 'organisationName')}`,
    heading: () => `Your invitation is still open`,
    paragraphs: (vars) => [
      `This is a reminder that your invitation to ${required(vars, 'organisationName')} has not been accepted yet.`,
      `It expires on ${required(vars, 'expiresAt')}.`,
    ],
    cta: (vars) => ({ label: `Accept invitation`, url: required(vars, 'invitationUrl') }),
    textBody: (vars) => [
      `Your invitation to ${required(vars, 'organisationName')} expires on ${required(vars, 'expiresAt')}.`,
      `Accept it here: ${required(vars, 'invitationUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.ORGANISATION_VERIFIED]: {
    subject: () => `Your organisation has been verified`,
    heading: () => `Verification complete`,
    paragraphs: (vars) => [
      `${required(vars, 'organisationName')} has been verified. You can now publish jobs and invite your team.`,
    ],
    cta: (vars) => ({ label: `Go to dashboard`, url: required(vars, 'appUrl') }),
    textBody: (vars) => [
      `${required(vars, 'organisationName')} has been verified.`,
      `Go to your dashboard: ${required(vars, 'appUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.ORGANISATION_SUSPENDED]: {
    subject: () => `Your organisation has been suspended`,
    heading: () => `Organisation suspended`,
    paragraphs: (vars) => [
      `${required(vars, 'organisationName')} has been suspended and its members cannot sign in until this is resolved.`,
      `Reason: ${required(vars, 'reason')}`,
      `Contact support if you believe this is a mistake.`,
    ],
    textBody: (vars) => [
      `${required(vars, 'organisationName')} has been suspended.`,
      `Reason: ${required(vars, 'reason')}`,
    ],
  },

  [EMAIL_TEMPLATES.ACCOUNT_SUSPENDED]: {
    subject: () => `Your Oreno account has been suspended`,
    heading: () => `Account suspended`,
    paragraphs: (vars) => [
      `Your Oreno account has been suspended.`,
      `Reason: ${required(vars, 'reason')}`,
      `Contact support if you believe this is a mistake.`,
    ],
    textBody: (vars) => [
      `Your Oreno account has been suspended.`,
      `Reason: ${required(vars, 'reason')}`,
    ],
  },

  [EMAIL_TEMPLATES.ACCOUNT_REACTIVATED]: {
    subject: () => `Your Oreno account has been reactivated`,
    heading: () => `Account reactivated`,
    paragraphs: () => [`Your Oreno account has been reactivated. You can sign in again.`],
    cta: (vars) => ({ label: `Sign in`, url: required(vars, 'appUrl') }),
    textBody: (vars) => [`Your account is active again. Sign in: ${required(vars, 'appUrl')}`],
  },

  [EMAIL_TEMPLATES.APPLICATION_RECEIVED]: {
    subject: (vars) => `We received your application for ${required(vars, 'jobTitle')}`,
    heading: () => `Application received`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'candidateName')},`,
      `Your application for ${required(vars, 'jobTitle')} at ${required(vars, 'organisationName')} has been received.`,
      `We will let you know when the status changes.`,
    ],
    cta: (vars) => ({ label: `View your application`, url: required(vars, 'applicationUrl') }),
    textBody: (vars) => [
      `Your application for ${required(vars, 'jobTitle')} at ${required(vars, 'organisationName')} has been received.`,
      `View it here: ${required(vars, 'applicationUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.APPLICATION_STATUS_CHANGED]: {
    subject: (vars) => `Update on your application for ${required(vars, 'jobTitle')}`,
    heading: () => `Application update`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'candidateName')},`,
      `Your application for ${required(vars, 'jobTitle')} is now ${required(vars, 'statusLabel')}.`,
      optional(vars, 'note'),
    ],
    cta: (vars) => ({ label: `View your application`, url: required(vars, 'applicationUrl') }),
    textBody: (vars) => [
      `Your application for ${required(vars, 'jobTitle')} is now ${required(vars, 'statusLabel')}.`,
      optional(vars, 'note'),
    ],
  },

  [EMAIL_TEMPLATES.INTERVIEW_SCHEDULED]: {
    subject: (vars) => `Interview scheduled: ${required(vars, 'jobTitle')}`,
    heading: () => `Interview scheduled`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'participantName')},`,
      `An interview for ${required(vars, 'jobTitle')} with ${required(vars, 'organisationName')} is scheduled for ${required(vars, 'scheduledAt')} (${required(vars, 'timeZone')}).`,
      `Format: ${required(vars, 'mode')}.${optional(vars, 'location') ? ` Location: ${optional(vars, 'location')}` : ''}`,
      optional(vars, 'notes'),
    ],
    cta: (vars) => ({ label: `View interview details`, url: required(vars, 'interviewUrl') }),
    textBody: (vars) => [
      `Interview for ${required(vars, 'jobTitle')} on ${required(vars, 'scheduledAt')} (${required(vars, 'timeZone')}).`,
      `Format: ${required(vars, 'mode')}.`,
      `Details: ${required(vars, 'interviewUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.INTERVIEW_UPDATED]: {
    subject: (vars) => `Interview rescheduled: ${required(vars, 'jobTitle')}`,
    heading: () => `Interview updated`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'participantName')},`,
      `The interview for ${required(vars, 'jobTitle')} is now scheduled for ${required(vars, 'scheduledAt')} (${required(vars, 'timeZone')}).`,
      optional(vars, 'previousScheduledAt') ? `Previous time: ${optional(vars, 'previousScheduledAt')}.` : '',
      optional(vars, 'reason'),
    ],
    cta: (vars) => ({ label: `View interview details`, url: required(vars, 'interviewUrl') }),
    textBody: (vars) => [
      `The interview for ${required(vars, 'jobTitle')} moved to ${required(vars, 'scheduledAt')} (${required(vars, 'timeZone')}).`,
      optional(vars, 'previousScheduledAt') ? `Previous time was ${optional(vars, 'previousScheduledAt')}.` : '',
    ],
  },

  [EMAIL_TEMPLATES.OFFER_SENT]: {
    subject: (vars) => `Your offer for ${required(vars, 'jobTitle')}`,
    heading: () => `You have an offer`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'candidateName')},`,
      `${required(vars, 'organisationName')} has sent you an offer for ${required(vars, 'jobTitle')}.`,
      `Please respond before ${required(vars, 'expiresAt')}.`,
    ],
    cta: (vars) => ({ label: `Review your offer`, url: required(vars, 'offerUrl') }),
    textBody: (vars) => [
      `${required(vars, 'organisationName')} sent you an offer for ${required(vars, 'jobTitle')}.`,
      `Respond before ${required(vars, 'expiresAt')}: ${required(vars, 'offerUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.OFFER_EXPIRED]: {
    subject: (vars) => `Your offer for ${required(vars, 'jobTitle')} has expired`,
    heading: () => `Offer expired`,
    paragraphs: (vars) => [
      `The offer for ${required(vars, 'jobTitle')} expired on ${required(vars, 'expiredAt')} without a response.`,
      `Contact ${required(vars, 'organisationName')} if you would still like to be considered.`,
    ],
    cta: (vars) => ({ label: `View the job`, url: required(vars, 'jobUrl') }),
    textBody: (vars) => [
      `The offer for ${required(vars, 'jobTitle')} expired on ${required(vars, 'expiredAt')}.`,
    ],
  },

  [EMAIL_TEMPLATES.PLACEMENT_STARTED]: {
    subject: (vars) => `Your placement with ${required(vars, 'organisationName')} starts soon`,
    heading: () => `Placement confirmed`,
    paragraphs: (vars) => [
      `Hi ${required(vars, 'participantName')},`,
      `Your placement for ${required(vars, 'jobTitle')} with ${required(vars, 'organisationName')} starts on ${required(vars, 'startDate')}.`,
      `Your manager is ${required(vars, 'managerName')}.`,
    ],
    cta: (vars) => ({ label: `View your placement`, url: required(vars, 'placementUrl') }),
    textBody: (vars) => [
      `Your placement for ${required(vars, 'jobTitle')} starts on ${required(vars, 'startDate')}.`,
      `Manager: ${required(vars, 'managerName')}.`,
    ],
  },

  [EMAIL_TEMPLATES.PLACEMENT_ENDED]: {
    subject: () => `Your placement has ended`,
    heading: () => `Placement ended`,
    paragraphs: (vars) => [
      `Your placement for ${required(vars, 'jobTitle')} with ${required(vars, 'organisationName')} ended on ${required(vars, 'endDate')}.`,
      `Reason: ${required(vars, 'endReasonLabel')}.`,
    ],
    textBody: (vars) => [
      `Your placement for ${required(vars, 'jobTitle')} ended on ${required(vars, 'endDate')}.`,
      `Reason: ${required(vars, 'endReasonLabel')}.`,
    ],
  },

  [EMAIL_TEMPLATES.TIMESHEET_SUBMITTED]: {
    subject: (vars) => `Timesheet submitted for ${required(vars, 'periodLabel')}`,
    heading: () => `Timesheet submitted`,
    paragraphs: (vars) => [
      `${required(vars, 'memberName')} submitted ${required(vars, 'hours')} hours for ${required(vars, 'periodLabel')}.`,
      optional(vars, 'approvalDeadline')
        ? `Approve or reject it before ${optional(vars, 'approvalDeadline')}.`
        : `Review the submitted time when ready.`,
    ],
    cta: (vars) => ({ label: `Review timesheet`, url: required(vars, 'timesheetUrl') }),
    textBody: (vars) => [
      `${required(vars, 'memberName')} submitted ${required(vars, 'hours')} hours for ${required(vars, 'periodLabel')}.`,
      `Review it: ${required(vars, 'timesheetUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.TIMESHEET_APPROVED]: {
    subject: (vars) => `Timesheet approved for ${required(vars, 'periodLabel')}`,
    heading: () => `Timesheet approved`,
    paragraphs: (vars) => [
      `Your timesheet for ${required(vars, 'periodLabel')} (${required(vars, 'hours')} hours) was approved.`,
    ],
    cta: (vars) => ({ label: `View timesheet`, url: required(vars, 'timesheetUrl') }),
    textBody: (vars) => [
      `Your timesheet for ${required(vars, 'periodLabel')} (${required(vars, 'hours')} hours) was approved.`,
    ],
  },

  [EMAIL_TEMPLATES.TIMESHEET_REJECTED]: {
    subject: (vars) => `Timesheet needs changes for ${required(vars, 'periodLabel')}`,
    heading: () => `Timesheet returned`,
    paragraphs: (vars) => [
      `Your timesheet for ${required(vars, 'periodLabel')} was returned for changes.`,
      `Reason: ${required(vars, 'reason')}`,
      `Correct it and resubmit.`,
    ],
    cta: (vars) => ({ label: `Open timesheet`, url: required(vars, 'timesheetUrl') }),
    textBody: (vars) => [
      `Your timesheet for ${required(vars, 'periodLabel')} was returned.`,
      `Reason: ${required(vars, 'reason')}`,
    ],
  },

  [EMAIL_TEMPLATES.PAYROLL_PERIOD_APPROVED]: {
    subject: (vars) => `Payroll approved for ${required(vars, 'periodLabel')}`,
    heading: () => `Payroll period approved`,
    paragraphs: (vars) => [
      `Payroll for ${required(vars, 'periodLabel')} covering ${required(vars, 'memberCount')} members has been approved by ${required(vars, 'approvedBy')}.`,
      `Total: ${required(vars, 'totalAmount')}.`,
      `Oreno records payroll outcomes only. Settlement is handled outside the platform.`,
    ],
    cta: (vars) => ({ label: `View payroll period`, url: required(vars, 'payrollUrl') }),
    textBody: (vars) => [
      `Payroll for ${required(vars, 'periodLabel')} was approved. Total: ${required(vars, 'totalAmount')}.`,
    ],
  },

  [EMAIL_TEMPLATES.TASK_ASSIGNED]: {
    subject: (vars) => `New task: ${required(vars, 'taskTitle')}`,
    heading: () => `You have a new task`,
    paragraphs: (vars) => [
      `${required(vars, 'assignedByName')} assigned you "${required(vars, 'taskTitle')}".`,
      `Priority: ${required(vars, 'priority')}.${optional(vars, 'dueDate') ? ` Due ${optional(vars, 'dueDate')}.` : ''}`,
      optional(vars, 'description'),
    ],
    cta: (vars) => ({ label: `Open task`, url: required(vars, 'taskUrl') }),
    textBody: (vars) => [
      `New task: ${required(vars, 'taskTitle')} (${required(vars, 'priority')}).`,
      `Open it: ${required(vars, 'taskUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.TASK_DUE_SOON]: {
    subject: (vars) => `Task due soon: ${required(vars, 'taskTitle')}`,
    heading: () => `A task is due soon`,
    paragraphs: (vars) => [
      `"${required(vars, 'taskTitle')}" is due on ${required(vars, 'dueDate')}.`,
    ],
    cta: (vars) => ({ label: `Open task`, url: required(vars, 'taskUrl') }),
    textBody: (vars) => [`"${required(vars, 'taskTitle')}" is due ${required(vars, 'dueDate')}.`],
  },

  [EMAIL_TEMPLATES.CALENDAR_REMINDER]: {
    subject: (vars) => `Reminder: ${required(vars, 'eventTitle')}`,
    heading: () => `Upcoming calendar event`,
    paragraphs: (vars) => [
      `"${required(vars, 'eventTitle')}" starts at ${required(vars, 'startsAt')} (${required(vars, 'timeZone')}).`,
      optional(vars, 'location'),
    ],
    cta: (vars) => ({ label: `Open calendar`, url: required(vars, 'eventUrl') }),
    textBody: (vars) => [
      `${required(vars, 'eventTitle')} starts at ${required(vars, 'startsAt')} (${required(vars, 'timeZone')}).`,
      `Details: ${required(vars, 'eventUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.VETTING_DECISION]: {
    subject: (vars) => `Vetting decision: ${required(vars, 'decisionLabel')}`,
    heading: () => `Vetting decision recorded`,
    paragraphs: (vars) => [
      `A vetting decision of ${required(vars, 'decisionLabel')} was recorded for ${required(vars, 'talentName')} on ${required(vars, 'decidedAt')}.`,
      optional(vars, 'rationale'),
      `Every decision is supported by the recorded evidence and review notes.`,
    ],
    cta: (vars) => ({ label: `View vetting case`, url: required(vars, 'vettingUrl') }),
    textBody: (vars) => [
      `Vetting decision for ${required(vars, 'talentName')}: ${required(vars, 'decisionLabel')}.`,
    ],
  },

  [EMAIL_TEMPLATES.EXPORT_READY]: {
    subject: () => `Your Oreno export is ready`,
    heading: () => `Export ready to download`,
    paragraphs: (vars) => [
      `Your export "${required(vars, 'exportLabel')}" is ready.`,
      `The download link expires on ${required(vars, 'expiresAt')}.`,
    ],
    cta: (vars) => ({ label: `Download export`, url: required(vars, 'downloadUrl') }),
    textBody: (vars) => [
      `Your export is ready. Download link (expires ${required(vars, 'expiresAt')}): ${required(vars, 'downloadUrl')}`,
    ],
  },

  [EMAIL_TEMPLATES.EXPORT_FAILED]: {
    subject: () => `Your Oreno export could not be generated`,
    heading: () => `Export failed`,
    paragraphs: (vars) => [
      `The export "${required(vars, 'exportLabel')}" could not be generated.`,
      `Reason: ${required(vars, 'reason')}`,
      `You can request it again from the exports page.`,
    ],
    cta: (vars) => ({ label: `Open exports`, url: required(vars, 'exportsUrl') }),
    textBody: (vars) => [`Export failed: ${required(vars, 'reason')}`],
  },

  [EMAIL_TEMPLATES.SUPPORT_CASE_ACKNOWLEDGED]: {
    subject: (vars) => `We received your support case (${required(vars, 'reference')})`,
    heading: () => `Support case received`,
    paragraphs: (vars) => [
      `Your support case has been logged with reference ${required(vars, 'reference')}.`,
      `Subject: ${required(vars, 'subject')}.`,
      `Our team will respond by email.`,
    ],
    cta: (vars) => ({ label: `View case`, url: required(vars, 'caseUrl') }),
    textBody: (vars) => [
      `Support case ${required(vars, 'reference')} received: ${required(vars, 'subject')}.`,
    ],
  },

  [EMAIL_TEMPLATES.SUPPORT_CASE_UPDATED]: {
    subject: (vars) => `Update on support case ${required(vars, 'reference')}`,
    heading: () => `Support case updated`,
    paragraphs: (vars) => [
      `Your support case ${required(vars, 'reference')} is now ${required(vars, 'statusLabel')}.`,
      optional(vars, 'note'),
    ],
    cta: (vars) => ({ label: `View case`, url: required(vars, 'caseUrl') }),
    textBody: (vars) => [
      `Support case ${required(vars, 'reference')} is now ${required(vars, 'statusLabel')}.`,
      optional(vars, 'note'),
    ],
  },

  [EMAIL_TEMPLATES.DEMO_REQUEST_RECEIVED]: {
    subject: () => `We received your Oreno demo request`,
    heading: (vars) => `Thanks, ${required(vars, 'firstName')}`,
    paragraphs: (vars) => [
      `We received your request for a demo for ${required(vars, 'companyName')}.`,
      `A member of our team will contact you within one business day.`,
    ],
    textBody: (vars) => [
      `We received your demo request for ${required(vars, 'companyName')}.`,
      `We will be in touch within one business day.`,
    ],
  },

  [EMAIL_TEMPLATES.CONTACT_REQUEST_RECEIVED]: {
    subject: () => `We received your message`,
    heading: (vars) => `Thanks for getting in touch, ${required(vars, 'firstName')}`,
    paragraphs: (vars) => [
      `We received your message and will reply to this address.`,
      `For reference, your message was: ${required(vars, 'messageSummary')}`,
    ],
    textBody: () => [`We received your message and will reply shortly.`],
  },

  [EMAIL_TEMPLATES.NEWSLETTER_CONFIRMATION]: {
    subject: () => `Confirm your Oreno newsletter subscription`,
    heading: () => `Confirm your subscription`,
    paragraphs: () => [
      `Confirm that you want to receive Oreno product updates and hiring insights.`,
      `The confirmation link expires in 24 hours. If you did not request this, ignore this email.`,
    ],
    cta: (vars) => ({ label: `Confirm subscription`, url: required(vars, 'confirmationUrl') }),
    textBody: (vars) => [`Confirm your subscription: ${required(vars, 'confirmationUrl')}`],
  },

  [EMAIL_TEMPLATES.NEWSLETTER_WELCOME]: {
    subject: () => `You are subscribed to the Oreno newsletter`,
    heading: () => `Subscription confirmed`,
    paragraphs: () => [
      `Thank you for subscribing. You will receive product updates and hiring insights.`,
      `You can unsubscribe at any time using the link in every email.`,
    ],
    cta: (vars) => ({ label: `Unsubscribe`, url: required(vars, 'unsubscribeUrl') }),
    textBody: (vars) => [`Unsubscribe at any time: ${required(vars, 'unsubscribeUrl')}`],
  },

  [EMAIL_TEMPLATES.WEEKLY_DIGEST]: {
    subject: (vars) => `Your Oreno week: ${required(vars, 'periodLabel')}`,
    heading: (vars) => `Your week at ${required(vars, 'organisationName')}`,
    paragraphs: (vars) => [
      `Here is what happened in ${required(vars, 'periodLabel')}:`,
      required(vars, 'summaryLines'),
    ],
    cta: (vars) => ({ label: `Open dashboard`, url: required(vars, 'appUrl') }),
    textBody: (vars) => [
      `Your week at ${required(vars, 'organisationName')} (${required(vars, 'periodLabel')}):`,
      required(vars, 'summaryLines'),
    ],
  },

  [EMAIL_TEMPLATES.ANNOUNCEMENT]: {
    subject: (vars) => required(vars, 'announcementTitle'),
    heading: (vars) => required(vars, 'announcementTitle'),
    paragraphs: (vars) => [required(vars, 'announcementBody')],
    textBody: (vars) => [required(vars, 'announcementBody')],
  },
};

/**
 * Wrap template content in a minimal, email-client-safe HTML shell. Inline
 * styles only: external stylesheets are stripped by most clients.
 */
function layout(input: {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string } | undefined;
}): string {
  const body = input.paragraphs
    .filter((paragraph) => paragraph.length > 0)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#1f2933;">${escapeHtml(
          paragraph,
        )}</p>`,
    )
    .join('');

  const button = input.cta
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:12px 20px;background:#1f2933;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;">${escapeHtml(
        input.cta.label,
      )}</a></p>`
    : '';

  return [
    `<!doctype html>`,
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
      input.heading,
    )}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">`,
    `<h1 style="margin:0 0 20px 0;font-size:20px;line-height:1.3;color:#1f2933;">${escapeHtml(
      input.heading,
    )}</h1>`,
    body,
    button,
    `<hr style="border:none;border-top:1px solid #e4e7eb;margin:24px 0;">`,
    `<p style="margin:0;font-size:12px;line-height:1.5;color:#7b8794;">Oreno — hiring and workforce management. This message was sent because of activity on your Oreno account.</p>`,
    `</div></body></html>`,
  ].join('');
}

export function renderEmail(
  template: EmailTemplateKey,
  variables: TemplateVariables,
): RenderedTemplate {
  const definition = DEFINITIONS[template];
  if (!definition) {
    throw new Error(`Unknown email template: ${template}`);
  }

  const heading = definition.heading(variables);
  const paragraphs = definition.paragraphs(variables);
  const cta = definition.cta?.(variables);
  const textParts = definition.textBody(variables).filter((part) => part.length > 0);

  const footer = `Oreno — hiring and workforce management.`;
  const text = [...textParts, '', footer].join(NL + NL);

  return {
    subject: definition.subject(variables),
    html: layout({ heading, paragraphs, cta }),
    text,
  };
}

export function isKnownTemplate(template: string): template is EmailTemplateKey {
  return Object.prototype.hasOwnProperty.call(DEFINITIONS, template);
}
