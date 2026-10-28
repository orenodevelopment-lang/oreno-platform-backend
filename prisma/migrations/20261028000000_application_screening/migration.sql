-- Job-specific managed recruitment screening. This migration is forward-only.
CREATE TYPE "ApplicationScreeningStatus" AS ENUM (
  'PENDING_CV_REVIEW', 'CV_REVIEW_IN_PROGRESS', 'ADDITIONAL_INFO_REQUIRED',
  'CV_APPROVED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED',
  'FINAL_REVIEW_PENDING', 'APPROVED_FOR_SUBMISSION', 'RELEASED_TO_COMPANY',
  'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED'
);

CREATE TYPE "ScreeningCvDecision" AS ENUM ('APPROVED', 'NOT_SELECTED', 'REQUEST_INFORMATION');
CREATE TYPE "ScreeningInterviewStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "ScreeningInterviewOutcome" AS ENUM ('PASSED', 'FAILED', 'ON_HOLD', 'NEEDS_FOLLOWUP');
CREATE TYPE "ScreeningFinalDecision" AS ENUM ('APPROVED', 'NOT_SELECTED', 'ON_HOLD');

CREATE TABLE "application_screenings" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "status" "ApplicationScreeningStatus" NOT NULL DEFAULT 'PENDING_CV_REVIEW',
  "version" INTEGER NOT NULL DEFAULT 1,
  "assigned_reviewer_id" UUID,
  "due_at" TIMESTAMPTZ(3),
  "current_cv_file_id" UUID NOT NULL,
  "final_decision" "ScreeningFinalDecision",
  "final_decided_by_id" UUID,
  "final_decided_at" TIMESTAMPTZ(3),
  "candidate_message" VARCHAR(2000),
  "employer_summary" VARCHAR(4000),
  "approved_at" TIMESTAMPTZ(3),
  "released_to_company_at" TIMESTAMPTZ(3),
  "released_by_id" UUID,
  "failure_reason" VARCHAR(2000),
  "withdrawn_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "application_screenings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "screening_cv_reviews" (
  "id" UUID NOT NULL,
  "screening_id" UUID NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "file_id" UUID NOT NULL,
  "decision" "ScreeningCvDecision" NOT NULL,
  "rubric" JSONB NOT NULL,
  "private_notes" VARCHAR(8000),
  "candidate_visible_feedback" VARCHAR(2000),
  "employer_safe_summary" VARCHAR(4000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "screening_cv_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "screening_interviews" (
  "id" UUID NOT NULL,
  "screening_id" UUID NOT NULL,
  "interviewer_id" UUID NOT NULL,
  "mode" "InterviewMode" NOT NULL DEFAULT 'VIDEO',
  "status" "ScreeningInterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduled_start_at" TIMESTAMPTZ(3) NOT NULL,
  "scheduled_end_at" TIMESTAMPTZ(3) NOT NULL,
  "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "meeting_url" VARCHAR(2048),
  "location" VARCHAR(300),
  "reschedule_reason" VARCHAR(1000),
  "cancelled_at" TIMESTAMPTZ(3),
  "cancel_reason" VARCHAR(1000),
  "completed_at" TIMESTAMPTZ(3),
  "outcome" "ScreeningInterviewOutcome",
  "rubric" JSONB,
  "private_notes" VARCHAR(8000),
  "candidate_visible_feedback" VARCHAR(2000),
  "recorded_by_id" UUID,
  "recorded_at" TIMESTAMPTZ(3),
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "screening_interviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "screening_status_history" (
  "id" UUID NOT NULL,
  "screening_id" UUID NOT NULL,
  "actor_id" UUID,
  "from_status" "ApplicationScreeningStatus",
  "to_status" "ApplicationScreeningStatus" NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "reason" VARCHAR(2000),
  "request_id" VARCHAR(100),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "screening_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "screening_information_requests" (
  "id" UUID NOT NULL,
  "screening_id" UUID NOT NULL,
  "requested_by_id" UUID NOT NULL,
  "message" VARCHAR(2000) NOT NULL,
  "response_text" VARCHAR(4000),
  "response_file_id" UUID,
  "responded_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "screening_information_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "application_screenings_application_id_key" ON "application_screenings"("application_id");
CREATE INDEX "application_screenings_status_due_at_created_at_idx" ON "application_screenings"("status", "due_at", "created_at");
CREATE INDEX "application_screenings_assigned_reviewer_id_status_idx" ON "application_screenings"("assigned_reviewer_id", "status");
CREATE INDEX "application_screenings_released_to_company_at_idx" ON "application_screenings"("released_to_company_at");
CREATE INDEX "screening_cv_reviews_screening_id_created_at_idx" ON "screening_cv_reviews"("screening_id", "created_at");
CREATE INDEX "screening_cv_reviews_file_id_idx" ON "screening_cv_reviews"("file_id");
CREATE INDEX "screening_interviews_screening_id_scheduled_start_at_idx" ON "screening_interviews"("screening_id", "scheduled_start_at");
CREATE INDEX "screening_interviews_interviewer_id_status_scheduled_start_at_idx" ON "screening_interviews"("interviewer_id", "status", "scheduled_start_at");
CREATE INDEX "screening_status_history_screening_id_created_at_idx" ON "screening_status_history"("screening_id", "created_at");
CREATE INDEX "screening_information_requests_screening_id_created_at_idx" ON "screening_information_requests"("screening_id", "created_at");

ALTER TABLE "application_screenings" ADD CONSTRAINT "application_screenings_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_screenings" ADD CONSTRAINT "application_screenings_assigned_reviewer_id_fkey" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_screenings" ADD CONSTRAINT "application_screenings_final_decided_by_id_fkey" FOREIGN KEY ("final_decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_screenings" ADD CONSTRAINT "application_screenings_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "screening_cv_reviews" ADD CONSTRAINT "screening_cv_reviews_screening_id_fkey" FOREIGN KEY ("screening_id") REFERENCES "application_screenings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_cv_reviews" ADD CONSTRAINT "screening_cv_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screening_cv_reviews" ADD CONSTRAINT "screening_cv_reviews_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screening_interviews" ADD CONSTRAINT "screening_interviews_screening_id_fkey" FOREIGN KEY ("screening_id") REFERENCES "application_screenings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_interviews" ADD CONSTRAINT "screening_interviews_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screening_status_history" ADD CONSTRAINT "screening_status_history_screening_id_fkey" FOREIGN KEY ("screening_id") REFERENCES "application_screenings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_status_history" ADD CONSTRAINT "screening_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "screening_information_requests" ADD CONSTRAINT "screening_information_requests_screening_id_fkey" FOREIGN KEY ("screening_id") REFERENCES "application_screenings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_information_requests" ADD CONSTRAINT "screening_information_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Safe legacy classification: only applications already carrying employer-side
-- interviews/offers/placements are considered previously shared. Other legacy
-- active applications remain hidden and await a fresh Oreno review.
INSERT INTO "application_screenings" (
  "id", "application_id", "status", "current_cv_file_id", "final_decision",
  "final_decided_at", "employer_summary", "approved_at", "released_to_company_at",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), a."id",
  CASE WHEN EXISTS (SELECT 1 FROM "interviews" i WHERE i."application_id" = a."id")
         OR EXISTS (SELECT 1 FROM "offers" o WHERE o."application_id" = a."id")
       THEN 'RELEASED_TO_COMPANY'::"ApplicationScreeningStatus"
       WHEN a."status" = 'WITHDRAWN' THEN 'WITHDRAWN'::"ApplicationScreeningStatus"
       WHEN a."status" = 'REJECTED' THEN 'NOT_SELECTED'::"ApplicationScreeningStatus"
       ELSE 'PENDING_CV_REVIEW'::"ApplicationScreeningStatus" END,
  aa."file_id",
  CASE WHEN EXISTS (SELECT 1 FROM "interviews" i WHERE i."application_id" = a."id")
         OR EXISTS (SELECT 1 FROM "offers" o WHERE o."application_id" = a."id")
       THEN 'APPROVED'::"ScreeningFinalDecision" ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM "interviews" i WHERE i."application_id" = a."id")
         OR EXISTS (SELECT 1 FROM "offers" o WHERE o."application_id" = a."id")
       THEN a."submitted_at" ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM "interviews" i WHERE i."application_id" = a."id")
         OR EXISTS (SELECT 1 FROM "offers" o WHERE o."application_id" = a."id")
       THEN 'Legacy application previously shared with the employer.' ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM "interviews" i WHERE i."application_id" = a."id")
         OR EXISTS (SELECT 1 FROM "offers" o WHERE o."application_id" = a."id")
       THEN a."submitted_at" ELSE NULL END,
  CASE WHEN EXISTS (SELECT 1 FROM "interviews" i WHERE i."application_id" = a."id")
         OR EXISTS (SELECT 1 FROM "offers" o WHERE o."application_id" = a."id")
       THEN a."submitted_at" ELSE NULL END,
  a."created_at", CURRENT_TIMESTAMP
FROM "applications" a
JOIN LATERAL (
  SELECT "file_id" FROM "application_attachments"
  WHERE "application_id" = a."id" AND "kind" = 'CV'
  ORDER BY "created_at" DESC LIMIT 1
) aa ON TRUE;

INSERT INTO "screening_status_history" ("id", "screening_id", "from_status", "to_status", "action", "reason")
SELECT gen_random_uuid(), s."id", NULL, s."status", 'LEGACY_BACKFILL',
       CASE WHEN s."status" = 'RELEASED_TO_COMPANY' THEN 'Classified as already shared because employer-side hiring records exist.'
            ELSE 'Classified under mandatory managed screening.' END
FROM "application_screenings" s;
