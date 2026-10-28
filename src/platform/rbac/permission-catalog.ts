/**
 * The permission catalogue.
 *
 * A permission is a `resource:action` pair. Roles are compositions of
 * permissions, and every authorisation decision in the platform is expressed as
 * a permission check against the actor's resolved grants — never as an ad-hoc
 * `if (role === 'X')` branch inside a service.
 *
 * Keeping the catalogue in one file means the seeded `permissions` table, the
 * role definitions and the OpenAPI security documentation all derive from the
 * same source of truth.
 */

export interface PermissionDefinition {
  readonly key: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
}

interface ResourceSpec {
  /** Resource segment; also the first half of every permission key. */
  readonly resource: string;
  readonly actions: Readonly<Record<string, string>>;
}

/**
 * Resource → action → description. The action description is combined with the
 * resource name to form the stored human-readable description.
 */
const RESOURCES: readonly ResourceSpec[] = [
  {
    resource: 'organisation',
    actions: {
      read: 'View organisation profile, addresses and settings',
      update: 'Edit organisation profile, addresses and settings',
      manage_settings: 'Change organisation settings and onboarding state',
      verify: 'Approve or reject organisation verification',
      suspend: 'Suspend or reactivate an organisation',
      deactivate: 'Deactivate an organisation',
    },
  },
  {
    resource: 'membership',
    actions: {
      read: 'View organisation members',
      invite: 'Invite users to the organisation',
      revoke_invitation: 'Revoke a pending invitation',
      update_role: 'Change a member role',
      suspend: 'Suspend a member',
      revoke: 'Revoke a member',
      read_self: 'View own membership',
    },
  },
  {
    resource: 'role',
    actions: {
      read: 'View roles and their permissions',
      update: 'Change the permissions granted to a role',
    },
  },
  {
    resource: 'talent',
    actions: {
      read: 'View talent profiles',
      read_self: 'View own talent profile',
      create: 'Create a talent profile',
      update: 'Edit any talent profile in the organisation',
      update_self: 'Edit own talent profile',
      delete: 'Archive a talent profile',
      read_sensitive: 'View vetting evidence and identity documents',
    },
  },
  {
    resource: 'skill',
    actions: {
      read: 'View the skill taxonomy',
      create: 'Create a skill',
      update: 'Edit a skill or its aliases',
      delete: 'Archive a skill',
    },
  },
  {
    resource: 'vetting',
    actions: {
      read: 'View vetting cases',
      create: 'Open a vetting case',
      review: 'Record a vetting review',
      decide: 'Record a vetting decision',
      assign_reviewer: 'Assign a vetting reviewer',
    },
  },
  {
    resource: 'screening',
    actions: {
      read: 'View job-specific recruitment screening cases and submitted CVs',
      assign: 'Assign or reassign a recruitment screening reviewer',
      cv_review: 'Record a human CV screening decision',
      interview_manage: 'Schedule, reschedule and cancel Oreno screening interviews',
      interview_decide: 'Record an Oreno screening interview outcome',
      final_decide: 'Record a final human job-screening decision',
      release: 'Release an approved application to the correct employer',
      audit_read: 'View recruitment screening decision history',
    },
  },
  {
    resource: 'job',
    actions: {
      read: 'View jobs',
      read_public: 'View published jobs',
      create: 'Draft a job',
      update: 'Edit a draft job',
      publish: 'Publish a job',
      close: 'Close a job',
      archive: 'Archive a job',
      moderate: 'Moderate or remove a flagged job',
      read_compensation: 'View a job rate range',
    },
  },
  {
    resource: 'application',
    actions: {
      read: 'View applications',
      read_self: 'View own applications',
      create: 'Submit an application',
      withdraw: 'Withdraw an application',
      update_status: 'Move an application through the pipeline',
      read_notes: 'View internal application notes',
      update_answers: 'Edit application answers',
    },
  },
  {
    resource: 'matching',
    actions: {
      read: 'View matching results',
      recompute: 'Recompute matching results for a job',
      read_explanation: 'View the explanation behind a match',
    },
  },
  {
    resource: 'shortlist',
    actions: {
      read: 'View shortlists',
      create: 'Create a shortlist',
      update: 'Edit a shortlist',
      add_candidate: 'Add a candidate to a shortlist',
      remove_candidate: 'Remove a candidate from a shortlist',
      delete: 'Archive a shortlist',
    },
  },
  {
    resource: 'interview',
    actions: {
      read: 'View interviews',
      read_self: 'View interviews in which you participate',
      schedule: 'Schedule an interview',
      update: 'Reschedule or edit an interview',
      cancel: 'Cancel an interview',
      record_outcome: 'Record an interview outcome',
    },
  },
  {
    resource: 'offer',
    actions: {
      read: 'View offers',
      read_self: 'View own offer',
      create: 'Draft an offer',
      update: 'Edit a draft offer',
      send: 'Send an offer',
      withdraw: 'Withdraw an offer',
      respond: 'Accept or decline an offer',
    },
  },
  {
    resource: 'placement',
    actions: {
      read: 'View placements',
      read_self: 'View own placement',
      create: 'Create a placement',
      update: 'Edit a placement',
      end: 'End a placement',
      request_replacement: 'Request a replacement',
      decide_replacement: 'Decide a replacement request',
    },
  },
  {
    resource: 'workforce',
    actions: {
      read: 'View departments, teams and assignments',
      manage_department: 'Create and edit departments',
      manage_team: 'Create and edit teams',
      manage_assignment: 'Create and end staff assignments',
      read_self: 'View your own assignment, department and team',
    },
  },
  {
    resource: 'task',
    actions: {
      read: 'View tasks',
      read_self: 'View tasks assigned to you',
      create: 'Create a task',
      update: 'Edit a task',
      assign: 'Change task assignees',
      complete_any: 'Complete or cancel any task',
      comment: 'Comment on a task',
    },
  },
  {
    resource: 'calendar',
    actions: {
      read: 'View the organisation calendar',
      read_self: 'View events you participate in',
      create: 'Create a calendar event',
      update: 'Edit a calendar event',
      cancel: 'Cancel a calendar event',
    },
  },
  {
    resource: 'time',
    actions: {
      read: 'View time entries for the organisation',
      read_self: 'View and submit your own time entries',
      create_self: 'Log your own time',
      update_self: 'Edit your own unapproved time entries',
      approve: 'Approve timesheets',
      reopen: 'Reopen a locked timesheet period',
    },
  },
  {
    resource: 'performance',
    actions: {
      read: 'View performance reviews',
      read_self: 'View your own reviews',
      manage_period: 'Create and close performance periods',
      manage_metrics: 'Define and edit performance metrics',
      write_review: 'Write a performance review',
      submit_review: 'Submit a review for the organisation',
      correct: 'Apply a correction to a submitted review',
    },
  },
  {
    resource: 'compensation',
    actions: {
      read: 'View pay agreements and adjustments',
      read_self: 'View your own pay agreement',
      manage_agreement: 'Create and edit pay agreements',
      manage_adjustment: 'Create and edit compensation adjustments',
      read_organisation_total: 'View organisation-wide compensation totals',
    },
  },
  {
    resource: 'payroll',
    actions: {
      read: 'View payroll periods and line items',
      manage_period: 'Create and edit payroll periods',
      calculate: 'Calculate payroll line items',
      approve: 'Approve a payroll period',
      lock: 'Lock an approved payroll period',
      reopen: 'Reopen a locked payroll period',
    },
  },
  {
    resource: 'payment',
    actions: {
      read: 'View payment records',
      record: 'Record an externally settled payment',
      update_status: 'Change the status of a payment record',
      reconcile: 'Reconcile payment records for a period',
    },
  },
  {
    resource: 'message',
    actions: {
      read_self: 'Read your own conversations',
      create: 'Start a conversation',
      send: 'Send a message',
      moderate: 'Moderate message content',
    },
  },
  {
    resource: 'notification',
    actions: {
      read_self: 'View your own notifications',
      manage_self: 'Change your own notification preferences',
      broadcast: 'Send an announcement to organisation members',
    },
  },
  {
    resource: 'file',
    actions: {
      read: 'View file metadata and grants',
      read_self: 'View files you own or have been granted',
      upload: 'Upload a file',
      delete: 'Archive a file',
      manage_grant: 'Grant or revoke access to a file',
      scan_review: 'Review files flagged by the malware scanner',
    },
  },
  {
    resource: 'export',
    actions: {
      read: 'View export requests',
      create: 'Request a data export',
      download: 'Download a completed export',
    },
  },
  {
    resource: 'search',
    actions: {
      read: 'Search jobs, talent and platform content',
    },
  },
  {
    resource: 'audit',
    actions: {
      read: 'View the audit trail',
      read_own_organisation: 'View the audit trail for your organisation',
    },
  },
  {
    resource: 'admin',
    actions: {
      read: 'View the platform administration console',
      manage_organisation: 'Create, suspend and reactivate organisations',
      manage_user: 'Suspend, reactivate and deactivate users',
      assign_platform_role: 'Grant or revoke a platform role',
      impersonate: 'Start an audited impersonation session',
      manage_support: 'Assign and resolve support cases',
      manage_leads: 'View and triage demo, contact and newsletter submissions',
      read_audit: 'View the platform-wide audit trail',
      manage_flags: 'Change feature flags',
      manage_policy: 'Change platform policy configuration',
      manage_announcement: 'Create and publish announcements',
    },
  },
  {
    resource: 'support',
    actions: {
      read_self: 'View support cases you raised',
      create: 'Raise a support case',
      read: 'View support cases for the organisation',
      update: 'Update and resolve support cases',
    },
  },
  {
    resource: 'lead',
    actions: {
      create_public: 'Submit a public enquiry',
      read: 'View captured enquiries and newsletter subscriptions',
      update: 'Update the status of a captured enquiry',
    },
  },
  {
    resource: 'consent',
    actions: {
      read_self: 'View your own consent records',
      record: 'Record a consent decision',
      withdraw: 'Withdraw consent',
    },
  },
  {
    resource: 'config',
    actions: {
      read: 'Read feature flags and policy configuration',
      manage: 'Change feature flags and policy configuration',
    },
  },
  {
    resource: 'ops',
    actions: {
      read: 'View health, queue and background job status',
      retry_job: 'Retry a failed background job',
      manage_queue: 'Pause, resume or drain a queue',
    },
  },
];

function buildCatalogue(): readonly PermissionDefinition[] {
  const definitions: PermissionDefinition[] = [];
  for (const spec of RESOURCES) {
    for (const [action, description] of Object.entries(spec.actions)) {
      definitions.push({
        key: `${spec.resource}:${action}`,
        resource: spec.resource,
        action,
        description,
      });
    }
  }
  return Object.freeze(definitions);
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = buildCatalogue();

export const ALL_PERMISSION_KEYS: readonly string[] = Object.freeze(
  PERMISSION_DEFINITIONS.map((definition) => definition.key),
);

const permissionKeySet = new Set(ALL_PERMISSION_KEYS);

export function isKnownPermission(key: string): boolean {
  return permissionKeySet.has(key);
}
