# Backend handoff

## Implemented scope

The backend now mounts the full planned modular surface for authentication and 2FA, accounts, organisations and invitations, public/company talent discovery, jobs and applications, matching and shortlists, vetting, interviews/offers/placements/replacements, workforce structure, tasks/calendar/time/performance, files, messaging and authenticated Socket.IO, notifications and transactional email, compensation/payroll/payment records, reporting/CSV exports, public leads/newsletter, support, search, and platform administration.

Sensitive commands use tenant checks, scoped manager policies, state transitions, optimistic timestamps, idempotency where repeat execution is harmful, immutable history, and audit/outbox records. Offer acceptance reuses the existing user and talent profile and creates the placement, assignment, and pay agreement in one transaction. Oreno records compensation and external payment outcomes; it does not transfer funds.

The worker drains stale outbox claims safely, records queue outcomes, sends deduplicated event email, creates in-app notifications, scans files, builds private exports, expires offers, activates due placements/assignments/pay agreements, sends calendar/task reminders, produces weekly digests, rotates and resends soon-to-expire invitations once, prunes sessions/outbox rows, and deletes expired exports. Email content is staged as an encrypted database intent; outbox and BullMQ payloads carry only the delivery identifier, so verification, reset, and invitation tokens are not copied into queue/event payloads.

OpenAPI now inventories all 298 mounted operations in `openapi/openapi.json`. Mutation bodies and major query filters share controller Zod contracts, UUID path parameters and idempotency headers are explicit, and the core hiring journey has structured response models. Some non-core response payloads remain generic object envelopes; specialize those incrementally when the frontend generates each module's client.

## Contract decisions

- `User` is the global identity. `TalentProfile` is the global professional profile. Employment data lives under organisation-owned `Placement` and `StaffAssignment` rows.
- Company roles cannot mutate global talent-authored fields or make platform vetting decisions.
- Public talent projections are allowlisted and exclude private account, files, employment, vetting internals, and compensation history.
- Annual and other non-hourly pay requires an explicit `ordinary_hours_per_period` term. No annual-hours assumption is invented.
- Organisation operational status and verification status use separate admin commands.
- Manager identity supports employed-assignment and organisation-member cases through the workforce contract rather than fabricating assignments.
- Historical offers, placements, agreements, application status, and audit rows persist independently of later profile edits.
- Production policy values remain typed configuration. `REPLACEMENT_WINDOW_DAYS` is a development/default input until the client approves it.

## Validation recorded on 2026-10-17

- Prisma Client generation: passed.
- Prisma schema validation: passed.
- TypeScript typecheck: passed.
- ESLint: passed.
- Full Vitest run: 132 passed across 25 files (98 unit, 22 PostgreSQL/Redis integration, and 12 HTTP tests).
- Coverage includes tenant and manager boundaries, security-token consumption, registration and offer idempotency, outbox crash recovery, queue retry outcomes, durable encrypted email, file access, payroll inputs/locking, admin audit/events, authenticated WebSockets, scheduled digests/invitation reminders, public privacy, and the company-to-candidate hiring journey.
- OpenAPI generation/check: passed with 298 documented operations.
- Production build: passed.
- All six migrations applied to a fresh isolated PostgreSQL 16 database; migration status is current; seed completed twice idempotently.
- Built API and worker started independently against PostgreSQL/Redis. `/health/ready` returned 200 with both dependencies healthy, and both processes logged graceful SIGINT shutdown completion.
- `npm audit --omit=dev`: zero production vulnerabilities after upgrading Nodemailer to 10.1.2. Prisma Client is declared as a production dependency.

## External configuration still required

No production credentials were created or stored. Live verification still needs the client's Render PostgreSQL/Key Value services, email provider, OAuth applications, S3 buckets/IAM, CloudFront signing key, ClamAV endpoint, monitoring DSN, production origins/domains, bootstrap owners, and approved policy values. Provider adapters and fail-safe production validation are implemented.

The full development audit still reports seven advisories in the Vitest 2/Vite test toolchain. They are excluded from the deployed runtime; the fully patched Vitest major requires Node 22.12 or later, while this repository still supports Node 20.11. Patched `deepmerge-ts` and `source-map-js` versions are pinned through npm overrides and Prisma validation passes. Upgrade Node and Vitest/coverage together as a separate toolchain change.

No production deployment, remote push, sibling frontend edit, paid resource creation, or custom CI/CD pipeline was performed.
