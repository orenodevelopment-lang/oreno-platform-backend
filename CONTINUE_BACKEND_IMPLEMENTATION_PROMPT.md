# Continue and complete the Oreno backend

Use this prompt immediately after supplying `06_CLAUDE_BUILD_COMPLETE_BACKEND.md` again. The text below is addressed to Claude Code working in the existing backend repository.

---

Continue the existing Oreno backend implementation and finish the remaining work required by the main backend prompt. Do the implementation, testing, and documentation; do not stop at a plan or assessment.

The main prompt remains the full specification. This continuation prompt identifies the current checkpoint, known defects, and the order in which to resume. It does not reduce the required scope or replace the original completion criteria.

## 1. Work in the existing repository

Backend repository:

```text
C:\Users\PRAISE\Desktop\Oreno\oreno-platform-backend
```

Project references are in:

```text
C:\Users\PRAISE\Desktop\Oreno
```

Read applicable repository instructions, then read:

- `06_CLAUDE_BUILD_COMPLETE_BACKEND.md`
- `Oreno_Engineering_Architecture_Specification.md`
- `Oreno_Product_Overview.docx`
- `00_FRONTEND_AND_PLATFORM_IMPLEMENTATION_PLAN.md`
- `05_CODEX_INTEGRATE_PLATFORM_ADMIN_DASHBOARD.md`
- `07_INTEGRATION_AND_RELEASE_CHECKLIST.md`
- The backend's `IMPLEMENTATION_STATUS.md`, source, schema, migrations, tests, scripts, and package lockfile
- `oreno-platform-frontend/design/product/API_REQUIREMENTS.md` and relevant frontend/admin contracts or route inventories
- The latest frontend-to-backend handoff, if it has been copied into the project. Its concrete account, profile, discovery, and team-member contracts supplement the older API requirements.

Preserve the approved TypeScript/Express modular monolith, PostgreSQL/Prisma, Render API and separate worker, Render Key Value/BullMQ, private S3, CloudFront, and authenticated WebSockets. Keep `/api/v1` as the API prefix.

Continue the code that already exists. Do not restart the repository, replace its architecture, rewrite working infrastructure unnecessarily, or modify sibling frontend/dashboard repositories without a separate instruction. Resolve contract discrepancies through documented backend contracts and handoff notes.

## 2. Starting checkpoint

A prior code review found the following. Recheck the current files because work may have changed since the review; do not blindly repeat work already completed.

- Foundation infrastructure exists: Express application, API/worker entry points, configuration, logging, security middleware, health checks, error envelopes, pagination, and Docker Compose.
- The Prisma schema has 123 models and 69 enums, with an initial migration. Models for planned features are not evidence that those features are implemented.
- Authentication and users are the only mounted domain API modules in `src/routes/index.ts`.
- Authentication includes credentials, verification/reset flows, sessions, Google/LinkedIn OAuth, and TOTP/recovery-code code, but needs security fixes and integration tests.
- Users includes profile/preferences functionality, directory/profile reads, and avatar association. The status document incorrectly still lists Users as not started.
- RBAC, audit, idempotency, outbox, event catalogue, queue registry, email adapters/templates, and storage/scanning adapters exist.
- Workers currently process domain events, email, and a subset of maintenance jobs. Most business processors and event subscribers are not implemented.
- Seed data covers permissions, roles, and bootstrap administrators, not realistic product journeys.
- Hiring, workforce, communication, compensation, admin, and most other product modules still need implementation.
- The frontend product service still uses fixtures. A backend contract and integration handoff are required; frontend integration itself is not permission to edit that repository.

The last review observed:

| Check | Observed result |
| --- | --- |
| Type checking | Passed |
| Production build | Passed |
| Prisma schema validation | Passed |
| Unit tests | 81 passed across four utility test files |
| Lint | Failed with two errors |
| OpenAPI freshness | Failed; generated JSON was stale |
| Integration and HTTP tests | Suites declared, but test/setup files absent |
| Git history | No commits; source files were untracked |

These are historical observations, not verification of your final result. In particular, the existing tests cover money utilities, pagination, token helpers, and redaction, not complete authentication or business workflows.

## 3. First checkpoint: repair and verify the existing foundation

Before extending the product modules, investigate and fix each finding below if it remains present. Add focused regression tests that reproduce the faulty behavior and verify the intended authorization or reliability guarantee.

### A. Cross-organisation user-profile disclosure

Inspect `src/modules/users/user.policy.ts`, `user.service.ts`, and `user.repository.ts`.

`canViewAnyProfile` currently accepts `membership:read`, which can be an organisation-level permission. The service then treats this as global authority and skips shared-organisation checks, returning a full profile including email and memberships.

Separate platform-wide grants from tenant permissions. Enforce the exact organisation/resource relationship and return only permitted fields. Test unrelated organisations, company owners, HR users, managers, self-access, appropriately privileged platform roles, suspended memberships, and users with multiple memberships. Also review the central organisation resolver and middleware so a supplied organisation header alone cannot confer access.

### B. First-time 2FA enrolment deadlock

Inspect `src/modules/auth/auth.service.ts`, `auth.routes.ts`, `auth.middleware.ts`, and `auth.two-factor.ts`.

Password login sets `mfaSatisfied` according to whether 2FA is already enabled, while setup and confirmation require an MFA-satisfied session. This blocks first-time enrolment for password users.

Implement distinct, secure initial-enrolment and existing-factor reauthentication flows. Require appropriate fresh authentication for sensitive changes. Enforce mandatory admin 2FA without locking new administrators out of enrolment. Test enrolment, confirmation, subsequent login, recovery-code use, regeneration, disablement, and attempts to replace an existing factor using only a password.

### C. OAuth and second-factor handling

Inspect `src/modules/auth/auth.controller.ts`, `auth.oauth.ts`, and `auth.oauth-linking.ts`.

The callback currently creates a session with `mfaSatisfied: true` without verifying Oreno's second factor. Do not treat social login alone as proof that the platform's MFA requirement was met.

Complete browser-bound, expiring, single-use OAuth state validation and PKCE where supported, using current official provider documentation. Preserve exact redirect validation and secure account-linking rules. Test state mismatch, replay, expiration, redirect rejection, disabled/suspended users, linking, and MFA enforcement with mock providers. Keep provider-specific implementation behind the identity abstraction required by the main prompt.

### D. Invalid BullMQ job IDs

Inspect `src/platform/email/email.service.ts` and `src/platform/outbox/outbox.dispatcher.ts` against the locked BullMQ version.

The code uses IDs such as `email:<uuid>` and `outbox:<uuid>`, which the installed package rejects. Adopt valid, deterministic IDs; review all enqueue and scheduler paths for the same issue. Test real enqueue/processing against isolated local/test Key Value, plus duplicate delivery and bounded retries. A successful enqueue is not sufficient proof of idempotent side effects.

### E. Outbox recovery after process failure

Inspect `src/platform/outbox/outbox.dispatcher.ts`.

Events are marked `PUBLISHING`, but the dispatcher selects only `PENDING`, with no stale-claim recovery. A crash can strand events permanently.

Implement safe claim expiry/recovery or another concurrency-safe design. Test crashes after claim, before enqueue, and after enqueue before marking published. Verify concurrent dispatchers and duplicate delivery. Ensure business changes and durable follow-up intent are committed together; do not leave essential emails or other follow-ups dependent on an unprotected post-commit enqueue. Register actual event subscribers in the worker and make consequential effects idempotent.

### F. Validation and contract drift

- Fix the ESLint project-service error for `scripts/prepare-hooks.mjs`.
- Fix the unsafe argument error in `src/openapi/openapi.builder.ts` without broadly disabling type-safety rules.
- Correct and regenerate OpenAPI from the current routes and schemas. Include users routes and accurate request/response shapes, pagination, security requirements, parameters, and operation IDs.
- Reconcile existing backend paths with frontend expectations, such as `/auth/me` versus `/me` and verification/recovery paths. Document the agreed contract; do not silently assume compatibility.
- Update `IMPLEMENTATION_STATUS.md` to distinguish implemented code from tested behavior.
- Inspect Git state and preserve all existing untracked work. Do not reset, clean, or overwrite it. Follow repository instructions for a local checkpoint; do not push or deploy.

## 4. Mandatory frontend-contract checkpoint

Complete this checkpoint after repairing the foundation and before building the remaining talent, hiring, and workforce modules. These requirements come from the current implemented frontend and are part of the backend completion criteria. They refine the main prompt without removing platform-admin, support, operations, security, or deployment work.

### A. Enforce resource ownership boundaries

Treat these as separate resources with separate owners:

1. `User` is the global account and owns sign-in identity, email, phone, verification, password/2FA controls, sessions, locale/time-zone preferences, and personal notification preferences.
2. `TalentProfile` is the talent-owned global professional identity and contains biography, experience, education, certifications, portfolio, skills, rate, availability, visibility, and the talent-visible part of vetting state.
3. `Placement` and `StaffAssignment` are organisation-owned employment records containing employee code, employment title, manager, department, teams, dates, work status, tasks, time, performance, and compensation relationships.

Do not create a separate `TalentAccount` table. Project talent account screens from the existing user, talent profile, session, 2FA, user-preference, and notification-preference models. One user may own at most one global talent profile and may work for several organisations through distinct placements and staff assignments. Placement creation must never create another user or talent profile.

A company may update only organisation-owned hiring, placement, and workforce data. Company owners, HR users, and managers must never edit a talent's global account, authentication data, notification preferences, profile visibility, rate, skills, experience, education, certifications, portfolio, or other talent-authored fields. Review the RBAC catalogue: organisation-level grants such as broad `talent:update`, `talent:delete`, `talent:read_sensitive`, and vetting-decision permissions must not authorize global profile edits or platform-owned vetting. Replace broad grants with narrowly scoped permissions where necessary.

Historical offer and placement terms must remain stable when a talent later edits mutable profile fields. Store or preserve the required accepted-term snapshots rather than rebuilding history from the current profile.

### B. Add non-privileged registration intent

Give registration an unambiguous journey intent, through `POST /api/v1/auth/register` or explicit orchestration endpoints that call the same auth service:

```ts
accountType: "TALENT" | "COMPANY_OWNER"
```

- `TALENT` creates the user, credential, verification token, default preferences, relevant consent record, and a private draft talent profile in one transaction.
- `COMPANY_OWNER` creates the user and starts resumable organisation onboarding. It must not grant a platform role.
- Intent chooses the first onboarding journey and must not prevent the person from later being both a talent and an organisation owner.
- A repeated completed registration returns a safe conflict. A timed-out request retried with the same idempotency key replays the same result and never creates duplicates.

Test both paths, rollback, idempotent replay, conflicting key reuse, and malicious privilege-bearing input.

### C. Apply required schema migrations

Add committed Prisma migrations and application rules for these deltas:

1. Replace `TalentProfile.isPubliclyDiscoverable` with `ProfileVisibility`: `PUBLIC`, `ORENO_COMPANIES_ONLY`, or `PRIVATE`. Default to `PRIVATE`. Migrate existing `true` values to `PUBLIC` and `false` values to `PRIVATE` before removing or deprecating the Boolean.
2. Separate availability from engagement preferences. Model available now, available from a date, or unavailable; `availableFrom` when applicable; one or more preferred employment types (`FULL_TIME`, `PART_TIME`, `CONTRACT`); preferred work arrangement (`REMOTE`, `HYBRID`, `ON_SITE`); hours per week; and structured expected rate amount/currency/unit. Do not reuse one enum for availability and employment type.
3. Add an organisation-owned `employeeCode` to `StaffAssignment`, unique on `(organisationId, employeeCode)`. Define generation or validation, normalization/case policy, and a safe backfill.
4. Add a validated optional category/key to `PortfolioItem`, or relate it to an approved taxonomy.
5. Add revision support for optimistic concurrency. Profile and repeatable-record writes must require `updatedAt`, a revision, or `If-Match` and return a stable stale-revision conflict instead of overwriting concurrent edits.

Review deletion behavior during these migrations. Account closure uses deactivation/anonymisation and the approved retention policy. Hard deletion must not cascade away required applications, placements, assignments, time, payroll, payment, or audit history.

### D. Complete the talent-account contract

Preserve the implemented `/api/v1/auth/...` routes. Extend `GET /api/v1/auth/me` or add `GET /api/v1/talents/me/account` to return:

```ts
interface TalentAccountView {
  id: string;
  profileId: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  createdAt: string;
  lastSignedInAt: string | null;
  security: { twoFactorEnabled: boolean; activeSessions: number };
  preferences: {
    jobAlerts: boolean;
    applicationUpdates: boolean;
    profileVisibility: "PUBLIC" | "ORENO_COMPANIES_ONLY" | "PRIVATE";
    marketingEmails: boolean;
  };
}
```

If this extends general `/auth/me`, use a discriminated or nullable profile projection for company-only users; do not require every user to have a talent profile. `PATCH /api/v1/auth/me` updates only permitted account fields such as phone, locale, and time zone. Email remains read-only until a separate verified email-change flow exists; that flow must use hashed, expiring, single-use tokens and notify both addresses.

Session responses include device label, approximate activity, created/expiry times, and whether the row is current, without tokens or hashes. Password change requires the current password and applies the documented session revocation/rotation policy. 2FA setup uses a short-lived challenge, does not enable the credential before confirmation, and displays recovery codes once. Suspended or deactivated users immediately lose protected access.

### E. Implement talent profile and onboarding contracts

Provide and document at least:

- `GET /api/v1/talents/me/profile` and `PATCH /api/v1/talents/me/profile`
- onboarding-draft read/update and explicit completion commands
- item-level CRUD for experience, education, certifications, portfolio, and skills
- availability and work-preference update commands
- `PATCH /api/v1/talents/me/visibility` or an equivalent explicit command
- profile-photo, CV, certification, and portfolio upload/link flows through the shared file module
- a talent-visible vetting summary that excludes internal review data

Keep name fields owned by `User` and professional fields owned by `TalentProfile`, even in a combined response. Calculate profile completion from versioned backend rules; clients cannot submit a percentage. Talents cannot mark themselves vetted. Skill IDs come from the taxonomy and UI labels map to one canonical proficiency enum. Rates are decimal strings with ISO currency and rate unit. Use item-level commands and optimistic concurrency so edits in different tabs cannot overwrite one another.

### F. Enforce discovery visibility and privacy

Public talent endpoints return only eligible `PUBLIC` profiles through an explicit allowlisted projection. Never expose account contact data, session/security state, private file IDs or storage keys, internal vetting records, applications, employment records, or compensation history.

`ORENO_COMPANIES_ONLY` profiles are excluded from public endpoints but available through authorised company discovery. `PRIVATE` profiles are excluded from discovery. An organisation with an existing application, offer, placement, or assignment may retain relationship-scoped access to only the fields needed for that relationship. Guessing a private profile UUID without such a relationship must not disclose its existence.

Public and company discovery require pagination, deterministic sorting, and typed filters for skills, seniority, location/time zone, availability, work arrangement, employment type, and structured rate ranges. Return an approved public or short-lived signed avatar URL, never a raw object key.

### G. Use staff assignments as company team-member resources

Use `StaffAssignment.id` as the team-member resource identity. Provide at least:

- `GET /api/v1/organisations/:organisationId/team-members`
- `GET /api/v1/organisations/:organisationId/team-members/:staffAssignmentId`
- authorised commands for employment title, status, dates, and employee code
- effective-dated manager, department, and team assignment commands
- assignment-scoped task, performance, time, compensation, and payment projections or links
- offboarding that closes active assignments while preserving history
- an authenticated-talent projection for the current placement/team relationship used by the talent workspace

The detail projection exposes the assignment, placement, profile, and organisation IDs; employee code; display name; approved avatar URL; professional headline; employment title; department; manager; teams; dates; engagement; and assignment status. Exclude account email/phone, authentication state, sessions, home address, personal notification preferences, and unrelated records.

Define manager identity consistently. If a manager is an employed team member, reference their staff-assignment ID. If an invited manager is an organisation member without a placement, use a typed organisation-member reference rather than inventing a staff assignment. Document the response union or invariant in OpenAPI.

Every query and mutation must verify `organisationId`. Cross-tenant IDs return a safe not-found or denied response. Managers see only staff and teams authorized by relationship policy unless a broader role grants access.

### H. Complete notification, consent, and contract conventions

Use event-keyed preferences for job-match alerts and application-status changes. Select one canonical format and use it consistently in the event catalogue, stored preferences, handlers, OpenAPI, and frontend mapping; do not retain both `application.status.changed` and `application.status_changed`. Security-critical account notifications cannot be disabled.

Complete notification list, read, unread, dismiss, and preference-update operations. Public demo, contact, and newsletter endpoints require validation, abuse controls, safe duplicate behavior, confirmation/unsubscribe flows, and no account enumeration.

`marketingEmails` requires consent history with timestamp, policy/version, source, and withdrawal where applicable. A Boolean alone is insufficient evidence.

Contracts must guarantee safe `fieldErrors`; UTC ISO timestamps; `YYYY-MM-DD` for date-only employment values; decimal strings plus currency/unit for money and rates; stable stale-revision, suspended, archived, expired-token, transition, rate-limit, and dependency error codes; deterministic pagination/sorting/filtering; idempotency keys on harmful mutations; and UUIDs for writes and relationships even when frontend URLs use slugs.

### I. Expand durable events and authorization tests

Emit identifier-only durable events where follow-up is required for registration/verification, password/2FA/session changes, profile/visibility/onboarding/vetting changes, applications/interviews, offers/placements/assignments, tasks/time/performance, payroll, and external payment records. Never place credentials, tokens, CV contents, bank data, private messages, or complete profiles in job/event payloads.

Before frontend integration, automated tests must prove:

1. A talent can read and update only their own account and global profile.
2. A company cannot update a talent's account, global profile, visibility, rate, skills, experience, education, portfolio, or credentials.
3. A company without a relationship cannot fetch a private profile by UUID.
4. `ORENO_COMPANIES_ONLY` profiles never appear publicly.
5. A company member cannot access another organisation's team member, task, time, performance, compensation, or payment record.
6. A manager cannot access staff outside their relationship scope.
7. Employee codes are unique per organisation but reusable in another organisation.
8. Placement creation reuses the existing user and talent profile.
9. Offboarding preserves placement, assignment, task, time, payroll, payment, and audit history.
10. Revoked sessions and suspended accounts immediately lose protected access.
11. Verification, reset, invitation, OAuth-state/setup, and future email-change tokens/challenges are expiring, single use, and hashed where applicable.
12. Public projections never leak private account, file, profile, or employment data.

Update `IMPLEMENTATION_STATUS.md`, migrations, seed data, OpenAPI, and handoff documentation with this checkpoint. The frontend will later generate types from the committed OpenAPI contract and replace fixture-backed services one module at a time. Do not edit the frontend during this backend continuation without a separate instruction.

## 5. Finish the remaining phases in order

Maintain a traceable checklist of every required module and cross-cutting requirement from the main prompt. Shared infrastructure may satisfy part of a module, but it does not substitute for its domain rules, API, authorization, persistence, and tests.

### Complete Phase 1: foundation

Finish users, organisations, organisation settings/addresses, resumable onboarding, memberships, invitations and their lifecycle, role changes, central policies, and audit integration. Support multi-organisation membership and properly restricted manager access. Verify the full registration-to-organisation-to-invited-manager journey with two unrelated organisations.

### Phase 2: talent and hiring

Implement talent profiles, experience/education/certifications/portfolio/availability, skill taxonomy, vetting, files/media, jobs/discovery, applications, deterministic explainable matching, shortlists, interviews, offers, placements, and replacements.

Enforce central state transitions and immutable history. Use the controlled transaction required for offer acceptance, placement, initial staff assignment, and pay agreement. Complete file ownership/size/type validation, upload completion, quarantine/scanning, readiness, grants, and signed access. Keep replacement rules in typed configuration or policy data.

Verify a complete company-to-candidate hiring journey, not just isolated CRUD endpoints.

### Phase 3: workforce management

Implement departments/subdepartments, managers, teams/leads/members, effective-dated staff assignments, tasks/assignees/comments/attachments/history, calendar/events/reminders, time entry submission/approval/correction, and performance foundations.

Company and talent views must use the same underlying records. Enforce manager relationship restrictions. Do not invent a displayable performance percentage without an approved formula and supporting evidence.

### Phase 4: communication and background work

Implement conversations/membership, persisted messages/attachments/receipts, notification preferences/delivery, authenticated Socket.IO or equivalent, and remaining email workflows.

Persist before emitting. Authorize every room and event, including typing and receipts. Handle reconnects and unread counts. Complete all required queue processors, subscribers, failure outcomes, retry behavior, and scheduled reminder/cleanup commands suitable for the planned Render deployment.

### Phase 5: compensation and reporting

Implement effective-dated pay agreements, payroll periods, approved-time calculations, line items, adjustments, approvals/locking, external payment records/reconciliation, dashboard aggregates, and export requests/status/signed downloads.

Use decimal-safe money with explicit currencies. Preserve calculation inputs and history. Prevent silent recalculation of approved periods. Require idempotency for harmful-to-repeat commands. Do not initiate or execute money transfers.

### Phase 6: platform administration and hardening

Implement the full `/api/v1/admin` scope from the main prompt, including company/user operations, role management, vetting, moderation, hiring lookups, replacement review, support/disputes, compensation/payment review, announcements, configuration, analytics/exports, audit access, and operational failure review/retry.

Admin actions must call domain services and exact policies, require reasons where specified, and create immutable audit records. Do not expose private conversations through a generic admin endpoint. Restricted impersonation is optional; either omit it safely or implement every specified permission, expiry, audit, and visible-banner requirement.

Finish public leads/newsletter consent, search and the required PostgreSQL search indexes/extensions, policy configuration, observability, retention/cleanup, realistic fictional seeds, security hardening, and deployment/handoff documentation.

## 6. Product decisions and unavailable credentials

Follow decisions already adopted by the main prompt and architecture. Do not reopen settled architecture choices or expand the MVP to money transfer, black-box hiring decisions, or automatic external-calendar meeting creation.

If replacement eligibility, vetting criteria, overtime/bonus rules, performance formulas, retention, or another business policy is genuinely unspecified, distinguish safe development configuration from client-approved production policy. Never present an invented policy as approved. Implement the surrounding mechanism and record the precise decision needed; ask only when it blocks a necessary behavior.

Missing external credentials are not a reason to stop implementing a module. Provide the production adapter, safe local/test adapter, mock-backed tests, and exact configuration instructions. Production must fail safely when a required integration is unavailable. Do not fabricate credentials, print secrets, or weaken production safeguards to make checks pass. Report live-provider verification separately from local verification.

## 7. Verification and completion gate

Create the missing integration/HTTP test setup using isolated test PostgreSQL and Key Value. Never run destructive tests or resets against an unknown or production database.

Run the repository's relevant commands after each checkpoint and all applicable release checks at the end, including:

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:http
npm run build
npm run prisma:validate
npm run openapi:check
```

Use the supported migration workflow for the locked Prisma version. Apply all migrations to a clean, isolated test database and verify migration status. Confirm that production-built API and worker start independently against test dependencies and shut down gracefully.

Add meaningful tests for authorization, tenant isolation, state transitions, concurrency, idempotency, outbox recovery, queue retries, WebSocket permissions/delivery, file access, compensation calculations, and admin audit behavior. Complete the end-to-end API journeys listed in the main prompt and release checklist. Passing the existing 81 utility tests is not the completion gate.

Maintain:

- `IMPLEMENTATION_STATUS.md`: every requirement, implementation/test status, blockers, and exact resume point.
- `README.md`: local setup, services, seed, API/worker usage, and validation commands.
- `.env.example`: documented configuration without real secrets.
- Current machine-readable OpenAPI and documented frontend TypeScript generation steps.
- Manual Render deployment documentation: API/worker build/start, database/Key Value, migration, health, storage/CloudFront/scanner, release, rollback, and smoke-test procedures.
- `HANDOFF.md`: completed scope, actual commands/results, contract decisions, outstanding credentials/product decisions, and any unverified behavior.

Do not deploy production, push remote changes, provision paid resources, or add a custom CI/CD pipeline as part of this continuation task.

## 8. Continue until the work is actually complete

Proceed autonomously through the remaining phases, preserving working code and reporting meaningful checkpoints. Do not repeatedly ask whether to continue with work already required by the main prompt.

Do not call a feature complete because it has a schema, route skeleton, adapter interface, mock response, or passing happy-path request. It must have implemented behavior, authorization, persistence, failure handling, and appropriate verification.

If a session limit prevents completion, leave a coherent checkpoint with exact files, next steps, test results, and unresolved issues in the status and handoff documents. Do not label unfinished work complete. Resume from that checkpoint in the next session.

Start now by inspecting the current state, reconciling the checklist, fixing the foundation defects, and completing the mandatory frontend-contract checkpoint. Then complete Phase 1, continue through Phases 2–6, and satisfy the final verification gate.
