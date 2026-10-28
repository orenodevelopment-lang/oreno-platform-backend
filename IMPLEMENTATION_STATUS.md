# Oreno backend implementation status

Updated 2026-10-17. Legend: **[x]** implemented and locally validated, **[~]** implemented with validation or contract detail still outstanding, **[!]** external input/service required.

## Foundation and security

| Area | Status | Evidence / remaining work |
| --- | --- | --- |
| Express API and separate worker | [x] | `src/server.ts`, `src/worker.ts`, graceful shutdown and health routes |
| Environment, logging, safe errors, CORS/CSRF/Helmet, rate limits | [x] | `src/config`, `src/common` |
| PostgreSQL/Prisma model and migrations | [x] | Six migrations applied to a fresh isolated PostgreSQL 16 database; status current; seed repeatable |
| Sessions, password flows, OAuth state/PKCE, 2FA/recovery | [x] | Hashed expiring single-use tokens and challenge limits |
| RBAC and tenant/manager boundaries | [x] | Central catalogue, tenant policies, unit boundary tests |
| Audit, idempotency, outbox recovery | [x] | Append-only database guards; stale claim recovery and stable queue IDs |
| Queue/email outcome tracking | [x] | Encrypted durable email intents, identifier-only queue/event payloads, deduplicated delivery and unique queue/job outcomes |
| OpenAPI | [~] | 319 operations; controller mutation/filter schemas, UUID paths, idempotency headers and core hiring responses; non-core response envelopes remain generic |
| Documentation | [x] | `README.md`, `DEPLOYMENT.md`, `HANDOFF.md`, `.env.example` |

## Product modules

| Module group | Status | Implemented behavior |
| --- | --- | --- |
| Users/accounts | [x] | profile, preferences, avatar, sessions/activity, account deactivation |
| Organisations/members/invitations | [x] | settings, addresses, resumable onboarding, roles, lifecycle, resend/accept |
| Talent and discovery | [x] | profile/repeatable records, availability, visibility, skills, public/company projections |
| Jobs/applications | [x] | company CRUD/state history, public discovery, CV-backed application submit, managed Oreno screening, explicit employer release, withdraw/status |
| Matching/shortlists | [x] | deterministic versioned explanations, recompute, notes/candidate lifecycle |
| Vetting | [x] | talent submissions and platform-owned review/decision surface |
| Interviews/offers | [x] | schedules/outcomes, immutable offer history, send/respond/expire |
| Placements/replacements | [x] | atomic offer acceptance, status history, eligibility, platform decisions |
| Workforce | [x] | departments, teams, manager links, assignments, offboarding, scoped projections |
| Tasks/calendar/time/performance | [x] | comments/attachments/history, reminders, time decisions, review foundations |
| Files | [x] | private upload completion, type/size/ownership, quarantine/scanning, grants/signed access |
| Messaging/realtime | [x] | conversations, messages, receipts/unread, authenticated and authorised Socket.IO rooms |
| Notifications/email | [x] | preferences, in-app events, encrypted/deduplicated transactional delivery, admin/work/time/payroll/vetting/announcement handlers |
| Compensation/payroll/payments | [x] | explicit rate denominators, decimal calculations, period transitions, external payment records |
| Reporting/exports | [x] | organisation/platform dashboards, background private CSV, formula-injection protection/expiry |
| Public growth | [x] | demo/contact dedupe, newsletter double opt-in/unsubscribe and consent evidence |
| Support/search/admin | [x] | customer/admin cases, unified search, statuses, verification, roles, moderation, leads, config, audit, job retry |

## Background processors

| Processor | Status |
| --- | --- |
| Outbox dispatch and stale-claim recovery | [x] |
| Transactional email and notification subscribers | [x] |
| File scanning | [x] |
| Export generation and expiry | [x] |
| Offer expiry and due placement activation | [x] |
| Calendar/task reminders | [x] |
| Weekly digests and invitation-expiry reminders | [x] |
| Session/outbox pruning and queue telemetry | [x] |

## Verification

| Check | Latest result |
| --- | --- |
| `npm run prisma:generate` | Passed |
| `npm run prisma:validate` | Passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test:all` | 132/132 passed, 25 files: 98 unit, 22 integration, 12 HTTP |
| `npm run openapi:generate` | Passed, 298 operations |
| `npm run openapi:check` | Passed |
| `npm run build` | Passed |
| clean database `migrate:deploy` + seed | Passed; seed passed twice idempotently |
| integration and HTTP suites | Tenant/security/outbox/email/file/payroll/admin/WebSocket/schedulers plus full hiring journey passed |
| built API and worker | Started separately; readiness returned 200; both logged graceful shutdown |
| `npm audit --omit=dev` | Passed with 0 production vulnerabilities; Nodemailer 10.1.2 |
| live provider verification | [!] Requires client credentials/services listed in `HANDOFF.md` |

## Exact resume point

1. Configure and verify the external production providers and client-approved policies listed in `HANDOFF.md`.
2. Replace generic non-core OpenAPI response envelopes with endpoint-specific response schemas as each frontend module generates its typed client.
3. Plan a coordinated Node 22.12+ and Vitest/coverage upgrade to clear the seven remaining development-only test-tool advisories without dropping the currently documented Node 20.11 support accidentally.
