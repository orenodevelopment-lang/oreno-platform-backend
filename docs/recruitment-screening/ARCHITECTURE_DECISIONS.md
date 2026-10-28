# Recruitment screening architecture decisions

## Aggregate and state machine

`ApplicationScreening` is a one-to-one job-specific aggregate linked to the existing `Application`. CV reviews, internal Oreno interviews, information requests, and status history are append-only related records. The submitted application, talent identity, global vetting case, employer interview, offer, and placement models are reused rather than copied.

```text
PENDING_CV_REVIEW -> CV_REVIEW_IN_PROGRESS
  -> ADDITIONAL_INFO_REQUIRED -> PENDING_CV_REVIEW
  -> CV_APPROVED -> INTERVIEW_SCHEDULED
  -> FINAL_REVIEW_PENDING -> APPROVED_FOR_SUBMISSION
  -> RELEASED_TO_COMPANY

Active review states may move to NOT_SELECTED, WITHDRAWN, or CANCELLED only through their command-specific guards.
```

The code-owned transition graph is in `src/modules/application-screening/screening.transitions.ts`. Final approval does not release a candidate. Release requires `screening:release`, the exact application organisation, a published job, active organisation and talent account, a non-withdrawn application, an optimistic timestamp, explicit confirmation, and an idempotency key.

## Privacy and file access

- Before release, company list/detail/count/search paths cannot project the applicant. Guessed identifiers return the normal safe not-found response.
- Application CV authorization checks the file owner, a staff member with `screening:read`, or a member of the exact released organisation with the existing file permission.
- Internal CV notes, interview notes, rubrics, information responses, and history are never part of company projections. The company receives only the deliberately authored `employerSummary` plus existing allowed application/profile fields.
- CV download links are short-lived and minted after server authorization. Sensitive access is audited without storing the signed URL or document contents.
- Job-specific decisions do not modify global talent vetting or unrelated applications.

## Roles

`TALENT_REVIEWER` can read, assign, review CVs, manage/decide Oreno interviews, take final decisions, and read screening history. `OPERATIONS_ADMIN` can perform the explicit release. `PLATFORM_OWNER` retains all permissions. Company roles, support, finance, and read-only analysts receive no screening permission.

## Migration and rollout

Migration `20261028000000_application_screening` is forward-only. It creates screening records for legacy applications only when a CV attachment exists. Existing applications with an employer interview or offer are classified as already released so established hiring relationships remain valid. Other legacy CV-backed applications remain hidden pending review. Applications without a CV receive no synthetic evidence and remain hidden because the employer predicate requires a released screening row.

Before production, restore a recent sanitized database into disposable PostgreSQL, run `prisma migrate deploy`, inspect classification counts by screening status, run the HTTP suite, and confirm established offers/placements remain visible. Deploy API and worker code together after the migration, then run seed to add permissions. Rollback is an application rollback that continues to preserve the new tables; do not reverse or delete screening history.
