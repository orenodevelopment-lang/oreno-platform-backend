# Recruitment screening operator runbook

Updated 2026-10-28. Run these steps against a disposable or staging environment before production. Never rehearse against the live database.

## Prerequisites

- PostgreSQL and Key Value/Redis are reachable by both API and worker services.
- API and worker use the same release, `DATABASE_URL`, `KEY_VALUE_URL`, queue prefix, storage buckets, and provider configuration.
- Private storage upload/download, GuardDuty scanning, email, and frontend/API production origins have passed their provider smoke tests.
- Platform roles have been seeded so `TALENT_REVIEWER` can review and `OPERATIONS_ADMIN` can explicitly release.

## Migration rehearsal

1. Restore a recent sanitized production snapshot into disposable PostgreSQL.
2. Record counts for applications, interviews, offers, placements, and application attachments.
3. Run `npm run prisma:validate`, `npm run migrate:deploy`, and `npm run db:seed` with disposable environment variables.
4. Count `application_screenings` by status. Only CV-backed legacy applications with established employer interview or offer history should be `RELEASED_TO_COMPANY`; other CV-backed records should await review.
5. Confirm applications without a CV received no synthetic screening evidence and are hidden from company endpoints.
6. Run backend unit, integration, HTTP, and frontend browser suites. Exercise the three fictional Candidate A/B/C journeys described in the implementation prompt.
7. Verify established offers and placements remain accessible and no application, profile, offer, or placement count unexpectedly changed.

## Manual smoke test

1. As a fictional talent, upload a clean PDF/DOC/DOCX CV, wait for `READY`, and submit one application.
2. Confirm the target company cannot list or fetch the application, create a shortlist/interview/offer, open its CV, message the applicant, or discover it through reports/exports.
3. As an Oreno reviewer, assign the item, open the audited CV link, record the CV decision, schedule/complete the internal interview, and record the final decision.
4. Confirm the company still cannot see an approved-but-unreleased application.
5. As an Oreno release approver, review the safe summary and explicitly release it to the exact company. Retry the same idempotency key and confirm no duplicate shortlist, notification, or history row.
6. Confirm the company sees the candidate once, sees only the safe summary, and can complete its independent interview, offer, acceptance, and placement flow.
7. Confirm candidate-visible status and notifications contain no private notes, rubrics, signed URLs, or provider credentials.

## Rollout and rollback

Apply the forward migration before starting the new API and worker release. Deploy API and worker together, then deploy the regenerated frontend contract. Monitor migration errors, screening command failures, forbidden employer access, outbox retries, file-link failures, and notification delivery.

If the application release must be rolled back, return API, worker, and frontend to the previous release while retaining the new tables and history. Do not drop the migration or delete screening evidence. Pause release actions until the corrected application build is available.

## Known external verification

Local compilation does not verify production database classification, S3/GuardDuty event delivery, presigned link expiry across the real domains, Resend delivery, Socket.IO/Redis propagation, OAuth, monitoring, or browser cookie/CSRF behavior. Record those staging results separately before enabling production screening.
