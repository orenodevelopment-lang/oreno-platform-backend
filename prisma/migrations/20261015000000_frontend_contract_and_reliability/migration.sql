-- Frontend contract and reliability additions.
-- This is an expand/data-migrate/contract migration so existing profiles and
-- assignments retain their meaning while the API adopts the new contract.

ALTER TYPE "TokenPurpose" ADD VALUE 'OAUTH_STATE';

CREATE TYPE "RegistrationIntent" AS ENUM ('TALENT', 'COMPANY_OWNER');
ALTER TABLE "users" ADD COLUMN "registration_intent" "RegistrationIntent";

CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE_NOW', 'AVAILABLE_FROM_DATE', 'UNAVAILABLE');
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'ORENO_COMPANIES_ONLY', 'PRIVATE');

ALTER TABLE "two_factor_credentials"
  ADD COLUMN "setup_token_hash" CHAR(64),
  ADD COLUMN "setup_expires_at" TIMESTAMPTZ(3);

ALTER TABLE "talent_profiles"
  ADD COLUMN "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'UNAVAILABLE',
  ADD COLUMN "preferred_employment_types" "EmploymentType"[] NOT NULL DEFAULT ARRAY[]::"EmploymentType"[],
  ADD COLUMN "preferred_work_arrangement" "WorkArrangement",
  ADD COLUMN "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PRIVATE';

UPDATE "talent_profiles"
SET
  "visibility" = CASE
    WHEN "is_publicly_discoverable" THEN 'PUBLIC'::"ProfileVisibility"
    ELSE 'PRIVATE'::"ProfileVisibility"
  END,
  "availability_status" = CASE
    WHEN "availability" = 'UNAVAILABLE'::"AvailabilityType" THEN 'UNAVAILABLE'::"AvailabilityStatus"
    WHEN "available_from" IS NOT NULL AND "available_from" > now() THEN 'AVAILABLE_FROM_DATE'::"AvailabilityStatus"
    ELSE 'AVAILABLE_NOW'::"AvailabilityStatus"
  END,
  "preferred_employment_types" = CASE "availability"
    WHEN 'FULL_TIME'::"AvailabilityType" THEN ARRAY['FULL_TIME'::"EmploymentType"]
    WHEN 'PART_TIME'::"AvailabilityType" THEN ARRAY['PART_TIME'::"EmploymentType"]
    WHEN 'CONTRACT'::"AvailabilityType" THEN ARRAY['CONTRACT'::"EmploymentType"]
    ELSE ARRAY[]::"EmploymentType"[]
  END;

DROP INDEX IF EXISTS "talent_profiles_availability_status_idx";
DROP INDEX IF EXISTS "talent_profiles_is_publicly_discoverable_status_idx";
ALTER TABLE "talent_profiles" DROP COLUMN "availability";
ALTER TABLE "talent_profiles" DROP COLUMN "is_publicly_discoverable";
DROP TYPE "AvailabilityType";

CREATE INDEX "talent_profiles_availability_status_status_idx"
  ON "talent_profiles"("availability_status", "status");
CREATE INDEX "talent_profiles_visibility_status_idx"
  ON "talent_profiles"("visibility", "status");

ALTER TABLE "portfolio_items" ADD COLUMN "category" VARCHAR(80);

ALTER TABLE "staff_assignments" ADD COLUMN "employee_code" VARCHAR(80);
UPDATE "staff_assignments"
SET "employee_code" = 'OR-' || upper(substr(replace("id"::text, '-', ''), 1, 10))
WHERE "employee_code" IS NULL;
ALTER TABLE "staff_assignments" ALTER COLUMN "employee_code" SET NOT NULL;
CREATE UNIQUE INDEX "staff_assignments_organisation_id_employee_code_key"
  ON "staff_assignments"("organisation_id", "employee_code");

-- Manager identity is explicit: either another staff assignment or an active
-- organisation membership for an invited manager who is not placed staff.
ALTER TABLE "manager_assignments"
  ADD COLUMN "manager_staff_assignment_id" UUID,
  ADD COLUMN "manager_membership_id" UUID;
UPDATE "manager_assignments" ma
SET "manager_staff_assignment_id" = manager_sa."id"
FROM "staff_assignments" subject_sa, "staff_assignments" manager_sa
WHERE subject_sa."id" = ma."staff_assignment_id"
  AND manager_sa."organisation_id" = subject_sa."organisation_id"
  AND manager_sa."talent_profile_id" = ma."manager_profile_id";
UPDATE "manager_assignments" ma
SET "manager_membership_id" = om."id"
FROM "staff_assignments" subject_sa, "talent_profiles" manager_profile, "organisation_memberships" om
WHERE subject_sa."id" = ma."staff_assignment_id"
  AND manager_profile."id" = ma."manager_profile_id"
  AND om."organisation_id" = subject_sa."organisation_id"
  AND om."user_id" = manager_profile."user_id"
  AND om."status" = 'ACTIVE'::"MembershipStatus"
  AND ma."manager_staff_assignment_id" IS NULL;
ALTER TABLE "manager_assignments" DROP COLUMN "manager_profile_id";
ALTER TABLE "manager_assignments"
  ADD CONSTRAINT "manager_assignments_manager_staff_assignment_id_fkey"
    FOREIGN KEY ("manager_staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "manager_assignments_manager_membership_id_fkey"
    FOREIGN KEY ("manager_membership_id") REFERENCES "organisation_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "manager_assignments_exactly_one_manager_check"
    CHECK (("manager_staff_assignment_id" IS NOT NULL)::int + ("manager_membership_id" IS NOT NULL)::int = 1);
CREATE INDEX "manager_assignments_manager_staff_assignment_id_effective_to_idx"
  ON "manager_assignments"("manager_staff_assignment_id", "effective_to");
CREATE INDEX "manager_assignments_manager_membership_id_effective_to_idx"
  ON "manager_assignments"("manager_membership_id", "effective_to");
ALTER TABLE "department_assignments"
  ADD CONSTRAINT "department_assignments_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_assignments"
  ADD CONSTRAINT "team_assignments_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outbox_events" ADD COLUMN "claimed_at" TIMESTAMPTZ(3);
CREATE INDEX "outbox_events_status_claimed_at_idx"
  ON "outbox_events"("status", "claimed_at");

ALTER TABLE "notifications" ADD COLUMN "source_event_id" UUID;
CREATE UNIQUE INDEX "notifications_source_event_id_key" ON "notifications"("source_event_id");
