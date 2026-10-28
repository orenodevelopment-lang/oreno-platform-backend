# Recruitment screening implementation matrix

Updated 2026-10-28.

| Requirement | Backend/API | Frontend | Verification | Status |
| --- | --- | --- | --- | --- |
| CV-backed application | Application submission validates an owned, private, `READY` CV and creates `ApplicationScreening` atomically | Talent apply form uploads PDF/DOC/DOCX through the private file API and waits for scanning | Schema/unit and HTTP screening journey | Implemented |
| Human CV review | `POST /admin/screening/applications/:applicationId/cv-review` with structured rubric, private notes, candidate feedback, and employer-safe summary | Screening workbench exposes explicit human decisions | Permission and transition unit tests; HTTP journey | Implemented |
| Candidate information request | Dedicated request/response records and talent endpoint preserve the original application evidence | Applicant sees the request and submits a scoped response | Controller/schema validation and state transition coverage | Implemented |
| Internal Oreno interview | Separate `ScreeningInterview` aggregate, schedule/update/cancel/outcome commands | Admin schedule/outcome forms; talent-safe interview card and meeting link | HTTP pass path; transition tests | Implemented |
| Final approval separate from release | `APPROVED_FOR_SUBMISSION` and `RELEASED_TO_COMPANY` are distinct states and permissions | Separate final-decision and company-release controls | Transition test and pre-release company 404 assertion | Implemented |
| Employer privacy gate | Central `releasedToOrganisationWhere()` applied to applications, counts, interviews, offers, matching, shortlists, messaging, files, exports, reporting, and private discovery | Company pipeline consumes released-only APIs and displays the safe summary | HTTP direct-detail/list denial before release | Implemented |
| Audit, history, concurrency, idempotency | Optimistic timestamps, append-only history, administrative audit, outbox events, and idempotent release | Stale/error responses are shown; successful actions refresh live resources | Unit and HTTP replay coverage | Implemented |
| Least-privilege roles | Dedicated screening permissions; reviewers cannot release; support/read-only/company roles cannot read screening CVs | Navigation and actions follow dedicated client permissions | Role boundary tests | Implemented |
| Legacy migration | Forward migration classifies only applications with established employer interview/offer history as released; other CV-backed legacy records remain screened/hidden | No special client bypass | SQL reviewed; disposable-database execution still required before production | Implemented; staging migration rehearsal required |
| OpenAPI/type sync | All screening operations use controller Zod bodies and generated OpenAPI responses | Frontend `schema.d.ts` regenerated from backend contract | `openapi:generate`, `api:generate`, contract check | Implemented |

The applicant's global `TalentProfile.vettingStatus` is never changed by this workflow. Employer interviews remain in the existing `Interview` aggregate and start only after explicit release.
