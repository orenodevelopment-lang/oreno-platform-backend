# Manual Render deployment

This repository supports two deployment shapes sharing one PostgreSQL database and one Render Key Value instance:

- **Combined:** one always-on web service runs the API and background workers. Use this for a low-traffic initial deployment where the extra worker service is not economical.
- **Separate:** one web service runs the API and one background worker consumes queues. Use this when API and job load need independent scaling or failure isolation.

Do not use combined mode on a free web service that sleeps when idle. Scheduled work, email delivery and GuardDuty reconciliation stop whenever the service sleeps.

## Services and commands

Create a Render PostgreSQL database, a Key Value instance and a web service named for the API. Add a background worker only for the separate deployment shape. Pin Node.js 22.12 or later.

| Service | Build command                                        | Start command          |
| ------- | ---------------------------------------------------- | ---------------------- |
| API     | `npm ci && npm run prisma:generate && npm run build` | `npm run start`        |
| Worker  | `npm ci && npm run prisma:generate && npm run build` | `npm run start:worker` |

### Combined deployment

Set `RUN_WORKER_IN_API=true` on the API and do not deploy the standalone worker. Keep the API at one replica initially and use an always-on compute plan. The API starts the same BullMQ consumers and repeatable schedules as `npm run start:worker`, and stops them during graceful shutdown.

### Separate deployment

Set `RUN_WORKER_IN_API=false` on the API and deploy the worker with `npm run start:worker`. Both services use the same `DATABASE_URL`, `KEY_VALUE_URL`, `QUEUE_PREFIX` and provider configuration.

To move from combined to separate mode without pausing queue consumption, deploy the standalone worker first, confirm `worker ready`, then set `RUN_WORKER_IN_API=false` on the API. To move back, enable combined mode and confirm `embedded background workers ready` before stopping the standalone worker. BullMQ can safely have both consumers active during this short cutover; do not leave both shapes enabled as the steady state.

Run `npm run migrate:deploy` once as a pre-deploy/release command against the direct PostgreSQL URL. Run `npm run db:seed` after the first migration and whenever the permission catalogue changes. The seed is idempotent and never creates a production default password.

## Required configuration

Start from `.env.example` and set production values in Render, including:

- `NODE_ENV=production`, `APP_URL`, `API_URL`, and exact `ALLOWED_ORIGINS`.
- pooled `DATABASE_URL` and direct `DIRECT_DATABASE_URL`.
- `KEY_VALUE_URL`, TLS settings required by the provider, a deployment-specific `QUEUE_PREFIX`, and the selected `RUN_WORKER_IN_API` deployment shape.
- a random `SESSION_SECRET` of at least 32 characters and secure OAuth credentials/redirect URLs where enabled.
- a real email provider and verified sender. Keep `SESSION_SECRET` stable within a release because it also protects staged email intent content.
- `STORAGE_DRIVER=s3`, AWS credentials/role, `S3_APPLICATION_BUCKET` and `S3_QUARANTINE_BUCKET`, plus storage TTL/size limits. The application bucket remains private and stores objects under `public/`, `private/`, and `exports/` prefixes.
- CloudFront domain/key pair/private key when signed distribution URLs are enabled.
- `MALWARE_SCANNER=guardduty` with versioning and GuardDuty scan-result tagging enabled on the quarantine bucket. Grant the application `s3:GetObjectTagging`, `s3:GetObjectVersionTagging`, and `s3:GetObjectVersion`; ClamAV remains an alternative requiring a reachable host/port. Production rejects the `none` scanner.
- bootstrap owner emails, monitoring DSN, metrics setting, and the client-approved replacement policy.

Do not put secrets in the repository, logs, outbox payloads, queue payload summaries, or OpenAPI output.

## Release procedure

1. Back up the production database and review every pending SQL migration, especially enum changes, constraints, and indexes.
2. Build the exact revision locally with `npm run check:production`, then run `npm run verify:providers -- --live` against production-equivalent provider credentials.
3. Apply `npm run migrate:deploy` with the direct URL. Stop if Prisma reports drift or a failed migration.
4. In separate mode, deploy the worker and confirm it is ready before deploying the API. In combined mode, deploy the API and confirm both `embedded background workers ready` and `api listening` appear in its logs.
5. Check `/health/live`, `/health/startup`, and `/health/ready`; verify PostgreSQL and Key Value report healthy.
6. Perform the smoke checks below and review structured logs, failed outbox rows, email outcomes, and background-job outcomes.

## Smoke checks

- Register, verify email, sign in, refresh `/api/v1/auth/me`, and sign out.
- Create an organisation, complete onboarding, invite a manager, preview/accept the invitation, and confirm cross-tenant denial.
- Publish and discover a job, submit an application, schedule an interview, send/accept an offer, and confirm the placement, assignment, and pay agreement share the expected identities.
- Upload and complete a private file, verify scanner readiness, and confirm an unrelated user cannot download it.
- Send a conversation message over REST, receive it over authenticated Socket.IO, reconnect, and verify unread/read state.
- Create an export and confirm the worker produces a private signed download.
- Calculate and approve a disposable payroll period, recording an external payment outcome without moving money.
- Exercise an audited admin status command and retry a deliberately failed non-production job.

## Rollback

Render should retain the prior API and worker artifact. Roll back application services to the last compatible revision. Database migrations are forward-only by default: prefer a corrective migration. Restore a backup only after stopping both services and confirming the restore point and data-loss window with the client. Never run `prisma migrate reset` against a shared or production database.

If a release emits events the previous worker does not understand, stop the API first, restore the compatible worker, and inspect pending/failed outbox rows before resuming traffic. Private objects can remain in storage during rollback because database grants and file status control access.
