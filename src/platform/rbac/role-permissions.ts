import { RoleKey, RoleScope } from '@prisma/client';
import { ALL_PERMISSION_KEYS } from './permission-catalog.js';

/**
 * Role to permission mapping.
 *
 * Two rules govern this file and are enforced by its unit tests:
 *
 *   1. Platform-only permissions are never granted to an organisation role. An
 *      organisation owner must not be able to verify an organisation, moderate
 *      a job, retry a queue or read the platform audit trail.
 *   2. A platform role never receives `read_self`-style permissions, because a
 *      platform administrator is not a tenant participant.
 */

/** Permission keys that only a platform-scoped role may hold. */
export const PLATFORM_ONLY_PERMISSIONS: ReadonlySet<string> = new Set([
  'organisation:verify',
  'organisation:suspend',
  'organisation:deactivate',
  'job:moderate',
  'file:scan_review',
  'talent:create',
  'talent:update',
  'talent:delete',
  'talent:read_sensitive',
  'vetting:read',
  'vetting:create',
  'vetting:review',
  'vetting:decide',
  'vetting:assign_reviewer',
  'placement:decide_replacement',
  'lead:read',
  'lead:update',
  'audit:read',
  'config:manage',
]);

const PLATFORM_ONLY_PREFIXES: readonly string[] = ['admin:', 'ops:'];

export function isPlatformOnlyPermission(key: string): boolean {
  if (PLATFORM_ONLY_PERMISSIONS.has(key)) return true;
  return PLATFORM_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Every organisation-scoped permission an owner-level role holds. */
const ORGANISATION_OWNER_PERMISSIONS: readonly string[] = ALL_PERMISSION_KEYS.filter(
  (key) => !isPlatformOnlyPermission(key),
);

const HR_PERMISSIONS: readonly string[] = [
  'organisation:read',
  'organisation:update',
  'organisation:manage_settings',
  'membership:read',
  'membership:invite',
  'membership:revoke_invitation',
  'membership:read_self',
  'role:read',
  'talent:read',
  'skill:read',
  'job:read',
  'job:read_public',
  'job:create',
  'job:update',
  'job:publish',
  'job:close',
  'job:archive',
  'job:read_compensation',
  'application:read',
  'application:update_status',
  'application:read_notes',
  'application:update_answers',
  'matching:read',
  'matching:recompute',
  'matching:read_explanation',
  'shortlist:read',
  'shortlist:create',
  'shortlist:update',
  'shortlist:add_candidate',
  'shortlist:remove_candidate',
  'shortlist:delete',
  'interview:read',
  'interview:schedule',
  'interview:update',
  'interview:cancel',
  'interview:record_outcome',
  'offer:read',
  'offer:create',
  'offer:update',
  'offer:send',
  'offer:withdraw',
  'placement:read',
  'placement:create',
  'placement:update',
  'placement:end',
  'placement:request_replacement',
  'workforce:read',
  'workforce:manage_department',
  'workforce:manage_team',
  'workforce:manage_assignment',
  'task:read',
  'task:create',
  'task:update',
  'task:assign',
  'task:complete_any',
  'task:comment',
  'calendar:read',
  'calendar:create',
  'calendar:update',
  'calendar:cancel',
  'time:read',
  'time:approve',
  'performance:read',
  'performance:manage_period',
  'performance:manage_metrics',
  'performance:write_review',
  'performance:submit_review',
  'compensation:read',
  'compensation:manage_agreement',
  'compensation:manage_adjustment',
  'compensation:read_organisation_total',
  'message:read_self',
  'message:create',
  'message:send',
  'notification:read_self',
  'notification:manage_self',
  'notification:broadcast',
  'file:read',
  'file:upload',
  'file:delete',
  'file:manage_grant',
  'export:read',
  'export:create',
  'export:download',
  'search:read',
  'audit:read_own_organisation',
  'support:create',
  'support:read',
  'support:read_self',
  'support:update',
  'consent:read_self',
  'consent:record',
  'consent:withdraw',
  'config:read',
  'organisation:read',
];

const MANAGER_PERMISSIONS: readonly string[] = [
  'organisation:read',
  'membership:read_self',
  'role:read',
  'talent:read',
  'skill:read',
  'job:read',
  'job:read_public',
  'application:read',
  'application:read_notes',
  'matching:read',
  'matching:read_explanation',
  'shortlist:read',
  'shortlist:add_candidate',
  'interview:read',
  'interview:record_outcome',
  'placement:read',
  'workforce:read',
  'workforce:read_self',
  'task:read',
  'task:read_self',
  'task:create',
  'task:update',
  'task:assign',
  'task:comment',
  'calendar:read',
  'calendar:read_self',
  'calendar:create',
  'time:read',
  'time:read_self',
  'time:create_self',
  'time:update_self',
  'time:approve',
  'performance:read',
  'performance:read_self',
  'performance:write_review',
  'message:read_self',
  'message:create',
  'message:send',
  'notification:read_self',
  'notification:manage_self',
  'file:read_self',
  'file:upload',
  'export:read',
  'export:create',
  'search:read',
  'support:create',
  'support:read_self',
  'consent:read_self',
  'consent:record',
  'consent:withdraw',
  'config:read',
];

const TALENT_PERMISSIONS: readonly string[] = [
  'talent:read_self',
  'talent:update_self',
  'skill:read',
  'job:read_public',
  'application:read_self',
  'application:create',
  'application:withdraw',
  'offer:read_self',
  'offer:respond',
  'placement:read_self',
  'workforce:read_self',
  'task:read_self',
  'calendar:read_self',
  'time:read_self',
  'time:create_self',
  'time:update_self',
  'performance:read_self',
  'compensation:read_self',
  'message:read_self',
  'message:create',
  'message:send',
  'notification:read_self',
  'notification:manage_self',
  'file:read_self',
  'file:upload',
  'export:create',
  'export:download',
  'search:read',
  'support:create',
  'support:read_self',
  'consent:read_self',
  'consent:record',
  'consent:withdraw',
  'config:read',
  'skill:read',
];

const SUPPORT_AGENT_PERMISSIONS: readonly string[] = [
  'admin:read',
  'admin:manage_support',
  'admin:manage_leads',
  'admin:read_audit',
  'support:read',
  'support:update',
  'organisation:read',
  'membership:read',
  'talent:read',
  'job:read',
  'application:read',
  'audit:read_own_organisation',
  'config:read',
  'ops:read',
  'search:read',
];

const FINANCE_ADMIN_PERMISSIONS: readonly string[] = [
  'admin:read',
  'organisation:read',
  'membership:read',
  'compensation:read',
  'compensation:read_organisation_total',
  'payroll:read',
  'payroll:manage_period',
  'payroll:calculate',
  'payroll:approve',
  'payroll:lock',
  'payroll:reopen',
  'payment:read',
  'payment:record',
  'payment:update_status',
  'payment:reconcile',
  'placement:read',
  'placement:update',
  'audit:read_own_organisation',
  'export:read',
  'export:create',
  'export:download',
  'search:read',
  'config:read',
];

const TALENT_REVIEWER_PERMISSIONS: readonly string[] = [
  'admin:read',
  'talent:read',
  'talent:read_sensitive',
  'talent:update',
  'vetting:read',
  'vetting:create',
  'vetting:review',
  'vetting:decide',
  'vetting:assign_reviewer',
  'skill:read',
  'skill:create',
  'skill:update',
  'file:read',
  'file:read_self',
  'file:scan_review',
  'audit:read_own_organisation',
  'search:read',
  'config:read',
];

const OPERATIONS_ADMIN_PERMISSIONS: readonly string[] = [
  'admin:read',
  'admin:manage_organisation',
  'admin:manage_user',
  'admin:manage_support',
  'admin:manage_leads',
  'admin:read_audit',
  'admin:manage_flags',
  'admin:manage_policy',
  'admin:manage_announcement',
  'organisation:read',
  'organisation:update',
  'organisation:verify',
  'organisation:suspend',
  'organisation:deactivate',
  'membership:read',
  'talent:read',
  'vetting:read',
  'job:read',
  'job:moderate',
  'application:read',
  'support:read',
  'support:update',
  'lead:read',
  'lead:update',
  'file:read',
  'file:scan_review',
  'audit:read',
  'config:read',
  'config:manage',
  'ops:read',
  'ops:retry_job',
  'ops:manage_queue',
  'search:read',
];

/** Read-only analyst: every read permission, nothing that mutates. */
const READ_ONLY_ANALYST_PERMISSIONS: readonly string[] = ALL_PERMISSION_KEYS.filter(
  (key) =>
    key.endsWith(':read') ||
    key.endsWith(':read_public') ||
    key.endsWith(':read_self') ||
    key.endsWith(':read_notes') ||
    key.endsWith(':read_compensation') ||
    key.endsWith(':read_explanation') ||
    key.endsWith(':read_sensitive') ||
    key.endsWith(':read_organisation_total') ||
    key.endsWith(':read_own_organisation'),
);

export interface RoleDefinition {
  readonly key: RoleKey;
  readonly scope: RoleScope;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = Object.freeze([
  {
    key: RoleKey.PLATFORM_OWNER,
    scope: RoleScope.PLATFORM,
    name: 'Platform Owner',
    description: 'Unrestricted platform administration. Every action is still audited.',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    key: RoleKey.OPERATIONS_ADMIN,
    scope: RoleScope.PLATFORM,
    name: 'Operations Admin',
    description: 'Runs day-to-day platform operations: onboarding, verification, moderation.',
    permissions: OPERATIONS_ADMIN_PERMISSIONS,
  },
  {
    key: RoleKey.TALENT_REVIEWER,
    scope: RoleScope.PLATFORM,
    name: 'Talent Reviewer',
    description: 'Reviews talent profiles and records vetting decisions.',
    permissions: TALENT_REVIEWER_PERMISSIONS,
  },
  {
    key: RoleKey.SUPPORT_AGENT,
    scope: RoleScope.PLATFORM,
    name: 'Support Agent',
    description: 'Handles customer support cases and inbound enquiries.',
    permissions: SUPPORT_AGENT_PERMISSIONS,
  },
  {
    key: RoleKey.FINANCE_ADMIN,
    scope: RoleScope.PLATFORM,
    name: 'Finance Admin',
    description:
      'Owns payroll approval and payment reconciliation. Records only; never transfers funds.',
    permissions: FINANCE_ADMIN_PERMISSIONS,
  },
  {
    key: RoleKey.READ_ONLY_ANALYST,
    scope: RoleScope.PLATFORM,
    name: 'Read-only Analyst',
    description: 'Read access to platform data for reporting. Cannot change anything.',
    permissions: READ_ONLY_ANALYST_PERMISSIONS,
  },
  {
    key: RoleKey.COMPANY_OWNER,
    scope: RoleScope.ORGANISATION,
    name: 'Company Owner',
    description: 'Full control of the organisation and its members.',
    permissions: ORGANISATION_OWNER_PERMISSIONS,
  },
  {
    key: RoleKey.HR_USER,
    scope: RoleScope.ORGANISATION,
    name: 'HR User',
    description: 'Runs hiring and workforce operations for the organisation.',
    permissions: HR_PERMISSIONS,
  },
  {
    key: RoleKey.MANAGER,
    scope: RoleScope.ORGANISATION,
    name: 'Manager',
    description: 'Manages assigned people, tasks, time approval and reviews.',
    permissions: MANAGER_PERMISSIONS,
  },
  {
    key: RoleKey.TALENT,
    scope: RoleScope.ORGANISATION,
    name: 'Talent',
    description: 'A placed or prospective worker. Sees only their own records.',
    permissions: TALENT_PERMISSIONS,
  },
]);

const byKey = new Map<RoleKey, RoleDefinition>(ROLE_DEFINITIONS.map((role) => [role.key, role]));

export function getRoleDefinition(key: RoleKey): RoleDefinition | undefined {
  return byKey.get(key);
}

export function isOrganisationRole(key: RoleKey): boolean {
  return byKey.get(key)?.scope === RoleScope.ORGANISATION;
}

export function isPlatformRole(key: RoleKey): boolean {
  return byKey.get(key)?.scope === RoleScope.PLATFORM;
}
