# Oreno platform backend

TypeScript/Express backend for Oreno's multi-tenant hiring, talent, workforce, messaging, compensation, reporting, and platform-administration product. PostgreSQL is the source of truth, Prisma manages the schema, BullMQ/Redis runs asynchronous work, Socket.IO provides authenticated real-time messaging, and object storage remains private unless a projection explicitly permits public access.

## Local setup

Prerequisites: Node.js 20.11 or later, npm, Docker Desktop, PostgreSQL 16, and Redis 7. The repository currently resolves Prisma 6.19 through the lockfile.

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d
npm run migrate:deploy
npm run db:seed
```

The development seed creates the permission and role catalogues, an optional platform owner from `PLATFORM_ADMIN_EMAILS`, an inactive-in-production matching baseline, and a fictional local journey containing Acme Demo Ltd, an owner, a public talent, a published job, and an application. Seeded users have no password. Use the password-reset flow rather than a shared default credential.

Start the API and worker in separate terminals:

```powershell
npm run dev
npm run dev:worker
```

The defaults expose the API at `http://localhost:4000`, Swagger UI at `/docs` outside production, liveness at `/health/live`, and readiness at `/health/ready`. The frontend origin defaults to `http://localhost:3000`.

## Runtime services

- `src/server.ts` starts the HTTP API and Socket.IO server.
- `src/worker.ts` starts outbox, email, notification, file, export, reminder, lifecycle, weekly-digest, invitation-reminder, and maintenance processors.
- PostgreSQL stores business data, sessions, audit history, outbox records, encrypted email intents, delivery outcomes, and job outcomes.
- Redis stores BullMQ queues and can back Socket.IO scale-out. Losing Redis does not grant access or erase business records.
- `STORAGE_DRIVER=local` and `EMAIL_PROVIDER=capture|log` support local work. Production uses private S3, optional CloudFront signed access, ClamAV, and a configured email provider.

The API prefix is `/api/v1`. Responses use `{ "data": ..., "meta": ... }` or `{ "error": { "code", "message", "requestId", ... } }`. Date-time values are UTC ISO strings; date-only employment fields use `YYYY-MM-DD`; money is returned as decimal strings with currency and unit. State-changing cookie-authenticated requests must send the configured CSRF header.

## Database and seed commands

```powershell
npm run prisma:validate
npm run prisma:generate
npm run migrate:status
npm run migrate:deploy
npm run db:seed
```

Use `migrate:deploy` for shared and production databases. `migrate:reset` destroys local data and is only for an explicitly disposable database.

## Validation

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:http
npm run test:all
npm run build
npm run openapi:check
npm audit --omit=dev
```

Integration and HTTP suites require isolated PostgreSQL and Redis services. Unit tests do not require external services.

## API contract

The generated OpenAPI 3.1 document is [openapi/openapi.json](openapi/openapi.json). Regenerate it after a route or schema change:

```powershell
npm run openapi:generate
npm run openapi:check
```

All 298 mounted operations are inventoried. Mutation bodies and the principal query filters use the same Zod schemas as their controllers, idempotent commands document `Idempotency-Key`, and the core hiring journey has structured response models. Some non-core response payloads still use a generic object envelope, so review those generated types as each frontend module is integrated.

Frontend TypeScript clients can be generated with any OpenAPI 3.1-compatible generator. One example is:

```powershell
npx openapi-typescript openapi/openapi.json -o src/generated/oreno-api.d.ts
```

Keep generated frontend files in the frontend repository. This backend repository does not modify sibling client projects.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the manual Render release procedure and [HANDOFF.md](HANDOFF.md) for implementation decisions and verification limits.
