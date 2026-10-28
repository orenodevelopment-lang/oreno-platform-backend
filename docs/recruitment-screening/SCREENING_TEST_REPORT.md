# Recruitment screening test report

Updated 2026-10-28. This report describes local verification only; no production migration, provider call, or deployment was performed.

## Automated checks

| Command | Result |
| --- | --- |
| `npm run prisma:validate` | Passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed: 18 files, 147 unit tests |
| `npm run build` | Passed |
| `npm run openapi:check` | Passed; generated specification is current with 319 operations |
| Frontend `npm run api:generate` | Passed; frontend types regenerated from the backend specification |
| Frontend `npm run typecheck` | Passed |
| Frontend `npm run lint` | Passed |
| Frontend `npm test` | Passed: 22 tests |
| Frontend `npm run build` | Passed; all static and dynamic application routes compiled |
| Screening HTTP journey | Added, but not executed locally because the configured PostgreSQL service was unavailable |
| Disposable migration rehearsal | Blocked because local Docker Desktop/PostgreSQL was unavailable; no remote or production database was used |

## Covered behavior

- Dedicated screening states and forbidden direct CV-to-release transitions.
- Least-privilege platform and tenant roles.
- Real CV attachment requirement and exact file reference.
- Company list/detail invisibility before release.
- Human CV approval, internal interview, final approval, separate release, and release replay.
- Employer-safe summary after release and one curated shortlist candidate.
- OAuth code was not edited.

## External and browser conditions

Live S3/GuardDuty, Resend, OAuth, monitoring, and production-domain cookie behavior remain staging smoke tests. The frontend uploader uses the existing presigned upload and scan-status APIs; it does not bypass quarantine. Browser E2E needs seeded fixture accounts, a disposable database, Redis, and deterministic local storage/email adapters. These external checks must not be reported as passing until those services are configured and exercised.

The database-backed HTTP test covers the successful Candidate C path, including pre-release company invisibility, human CV review, internal interview, final approval, explicit release, safe company projection, idempotent replay, and a single curated shortlist entry. Candidate A/B browser journeys, cross-tenant negative browser checks, live file-link expiry, and the full released interview-to-placement journey still require the disposable environment described above.
