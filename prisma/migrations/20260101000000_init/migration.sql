-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('PASSWORD', 'GOOGLE', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('REGISTERED', 'EMAIL_VERIFIED', 'EMAIL_VERIFICATION_RESENT', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_REVOKED', 'SESSIONS_REVOKED_ALL', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_CHANGED', 'OAUTH_LINKED', 'OAUTH_UNLINKED', 'OAUTH_LOGIN_FAILED', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'TWO_FACTOR_CHALLENGE_SUCCEEDED', 'TWO_FACTOR_CHALLENGE_FAILED', 'RECOVERY_CODE_USED', 'RECOVERY_CODES_REGENERATED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_REACTIVATED', 'ACCOUNT_DEACTIVATED', 'MEMBERSHIP_GRANTED', 'MEMBERSHIP_REVOKED', 'ROLE_CHANGED', 'IMPERSONATION_STARTED', 'IMPERSONATION_ENDED');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'INVITATION', 'EMAIL_CHANGE', 'TWO_FACTOR_CHALLENGE');

-- CreateEnum
CREATE TYPE "OrganisationStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "OrganisationVerificationStatus" AS ENUM ('UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('PLATFORM_OWNER', 'OPERATIONS_ADMIN', 'TALENT_REVIEWER', 'SUPPORT_AGENT', 'FINANCE_ADMIN', 'READ_ONLY_ANALYST', 'COMPANY_OWNER', 'HR_USER', 'MANAGER', 'TALENT');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "TalentProfileStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VettingStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'IN_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "SkillProficiency" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "VettingCaseStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VettingDecision" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_INFO', 'ESCALATE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'FILLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "WorkArrangement" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "RateUnit" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "JobRequirementKind" AS ENUM ('REQUIRED_SKILL', 'PREFERRED_SKILL', 'QUALIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('NOT_REVIEWED', 'APPROVED', 'FLAGGED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEWING', 'OFFER_PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('DIRECT', 'CURATED', 'REFERRAL');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('CV', 'COVER_LETTER', 'PORTFOLIO', 'CERTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ShortlistKind" AS ENUM ('EMPLOYER', 'ORENO_CURATED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('VIDEO', 'PHONE', 'ONSITE');

-- CreateEnum
CREATE TYPE "InterviewOutcomeResult" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ON_HOLD', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED', 'REPLACED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReplacementStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANDIDATES_PROPOSED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReplacementDecisionType" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_INFO', 'PROPOSE_CANDIDATE', 'RESOLVE');

-- CreateEnum
CREATE TYPE "StaffAssignmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED');

-- CreateEnum
CREATE TYPE "AssignmentEndReason" AS ENUM ('RESIGNED', 'TERMINATED', 'CONTRACT_ENDED', 'REPLACED', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('TASK_DEADLINE', 'INTERVIEW', 'COMPANY_EVENT', 'TIME_OFF', 'REMINDER', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "TimesheetPeriodStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "PerformancePeriodStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_REVIEW', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MetricKind" AS ENUM ('NUMERIC', 'PERCENTAGE', 'RATING', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('DRAFT', 'SELF_ASSESSMENT', 'MANAGER_REVIEW', 'CALIBRATION', 'FINALISED', 'ACKNOWLEDGED', 'DISPUTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "PayAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED');

-- CreateEnum
CREATE TYPE "PayBasis" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PayrollLineItemKind" AS ENUM ('ORDINARY_PAY', 'OVERTIME_PAY', 'BONUS', 'INCENTIVE', 'ALLOWANCE', 'DEDUCTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('BONUS', 'INCENTIVE', 'DEDUCTION', 'REIMBURSEMENT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'AUTHORISED', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'CANCELLED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP', 'ORGANISATION', 'TEAM');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'SYSTEM', 'FILE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'BOTH');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('PUBLIC_ASSET', 'PROFILE_PHOTO', 'CV', 'CERTIFICATION', 'PORTFOLIO', 'MESSAGE_ATTACHMENT', 'PAYROLL_REPORT', 'EXPORT', 'ORGANISATION_LOGO', 'OTHER');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'SCANNING', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('PAYROLL_CSV', 'STAFF_ROSTER_CSV', 'APPLICATIONS_CSV', 'TALENT_LIST_CSV', 'TIME_ENTRIES_CSV', 'AUDIT_CSV', 'PLATFORM_ANALYTICS_CSV');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISQUALIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('PENDING_CONFIRMATION', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'ESCALATED', 'RESOLVED', 'REOPENED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportCasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportCaseCategory" AS ENUM ('ACCOUNT', 'HIRING', 'BILLING', 'TECHNICAL', 'REPLACEMENT', 'DISPUTE', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'PERMISSION_CHANGE', 'LOGIN', 'LOGOUT', 'EXPORT', 'ACCESS', 'SUSPEND', 'REACTIVATE', 'DEACTIVATE', 'APPROVE', 'REJECT', 'RETRY', 'IMPERSONATE', 'CONFIGURE');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTERED');

-- CreateEnum
CREATE TYPE "FeatureFlagScope" AS ENUM ('GLOBAL', 'ORGANISATION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120) NOT NULL,
    "display_name" VARCHAR(200),
    "phone" VARCHAR(32),
    "avatar_file_id" UUID,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "country_code" VARCHAR(2),
    "job_title" VARCHAR(160),
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" VARCHAR(1000),
    "deactivated_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(254),
    "display_name" VARCHAR(200),
    "avatar_url" VARCHAR(2048),
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_algo" VARCHAR(32) NOT NULL DEFAULT 'argon2id',
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token_hash" CHAR(64) NOT NULL,
    "user_agent" VARCHAR(512),
    "ip_address" VARCHAR(64),
    "device_label" VARCHAR(160),
    "mfa_satisfied" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_from_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_credentials" (
    "user_id" UUID NOT NULL,
    "secret_encrypted" VARCHAR(512) NOT NULL,
    "enabled_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "failed_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "two_factor_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "two_factor_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" VARCHAR(254),
    "purpose" "TokenPurpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "organisation_id" UUID,
    "type" "SecurityEventType" NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "detail" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "in_app_notifications" BOOLEAN NOT NULL DEFAULT true,
    "marketing_emails" BOOLEAN NOT NULL DEFAULT false,
    "weekly_digest" BOOLEAN NOT NULL DEFAULT true,
    "theme" VARCHAR(16) NOT NULL DEFAULT 'system',
    "reduced_motion" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "organisation_id" UUID,
    "reason" VARCHAR(1000) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "ended_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(500),

    CONSTRAINT "platform_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "legal_name" VARCHAR(200),
    "status" "OrganisationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationStatus" "OrganisationVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "industry" VARCHAR(120),
    "company_size" VARCHAR(40),
    "website_url" VARCHAR(2048),
    "description" VARCHAR(4000),
    "primary_contact_name" VARCHAR(200),
    "primary_contact_email" VARCHAR(254),
    "primary_contact_phone" VARCHAR(32),
    "logo_file_id" UUID,
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "country_code" VARCHAR(2),
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" VARCHAR(1000),
    "deactivated_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_addresses" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL DEFAULT 'primary',
    "line1" VARCHAR(200) NOT NULL,
    "line2" VARCHAR(200),
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(120),
    "postal_code" VARCHAR(20),
    "country_code" VARCHAR(2) NOT NULL,
    "time_zone" VARCHAR(64),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organisation_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_settings" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_progress" (
    "organisation_id" UUID NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "completed_steps" JSONB NOT NULL DEFAULT '[]',
    "personal_info_done" BOOLEAN NOT NULL DEFAULT false,
    "company_info_done" BOOLEAN NOT NULL DEFAULT false,
    "business_info_done" BOOLEAN NOT NULL DEFAULT false,
    "account_info_done" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("organisation_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" "RoleKey" NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "resource" VARCHAR(60) NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "organisation_memberships" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "scoped_department_ids" JSONB,
    "invited_by_id" UUID,
    "joined_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organisation_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120) NOT NULL,
    "role_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "message" VARCHAR(1000),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(500),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "last_reminded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_attempts" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "outcome" VARCHAR(40) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "detail" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "headline" VARCHAR(200),
    "bio" VARCHAR(4000),
    "status" "TalentProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "vettingStatus" "VettingStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "vetting_approved_at" TIMESTAMPTZ(3),
    "country_code" VARCHAR(2),
    "city" VARCHAR(120),
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "years_experience" INTEGER,
    "seniority" VARCHAR(40),
    "current_title" VARCHAR(160),
    "current_company" VARCHAR(200),
    "expected_rate_amount" DECIMAL(14,4),
    "expected_rate_currency" VARCHAR(3),
    "expected_rate_unit" VARCHAR(20),
    "availability" "AvailabilityType" NOT NULL DEFAULT 'FULL_TIME',
    "available_from" TIMESTAMPTZ(3),
    "hours_per_week" INTEGER,
    "portfolio_url" VARCHAR(2048),
    "linkedin_url" VARCHAR(2048),
    "github_url" VARCHAR(2048),
    "website_url" VARCHAR(2048),
    "is_publicly_discoverable" BOOLEAN NOT NULL DEFAULT false,
    "completion_percent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "talent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_experiences" (
    "id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "company" VARCHAR(200) NOT NULL,
    "location" VARCHAR(160),
    "employment_type" VARCHAR(40),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(4000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "talent_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_education" (
    "id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "institution" VARCHAR(200) NOT NULL,
    "degree" VARCHAR(160),
    "field_of_study" VARCHAR(160),
    "start_date" DATE,
    "end_date" DATE,
    "grade" VARCHAR(40),
    "description" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "talent_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_certifications" (
    "id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "issuer" VARCHAR(200) NOT NULL,
    "credential_id" VARCHAR(160),
    "credential_url" VARCHAR(2048),
    "issued_at" DATE,
    "expires_at" DATE,
    "document_file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "talent_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_items" (
    "id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "url" VARCHAR(2048),
    "file_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_categories" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "key" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "is_approved" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_aliases" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "alias" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_skills" (
    "id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "proficiency" "SkillProficiency" NOT NULL DEFAULT 'INTERMEDIATE',
    "years_experience" INTEGER,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "talent_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vetting_cases" (
    "id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "organisation_id" UUID,
    "status" "VettingCaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assigned_to_id" UUID,
    "assigned_at" TIMESTAMPTZ(3),
    "sla_due_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_id" UUID,
    "decision_reason" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vetting_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vetting_reviews" (
    "id" UUID NOT NULL,
    "vetting_case_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "VettingDecision" NOT NULL,
    "internal_notes" VARCHAR(4000),
    "candidate_visible_notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vetting_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL,
    "vetting_case_id" UUID NOT NULL,
    "assessment_key" VARCHAR(120) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "score" DECIMAL(10,4),
    "max_score" DECIMAL(10,4),
    "passed" BOOLEAN,
    "notes" VARCHAR(2000),
    "evidence_url" VARCHAR(2048),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vetting_status_history" (
    "id" UUID NOT NULL,
    "vetting_case_id" UUID NOT NULL,
    "from_status" "VettingCaseStatus",
    "to_status" "VettingCaseStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vetting_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(240) NOT NULL,
    "category" VARCHAR(120),
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "moderation_reason" VARCHAR(1000),
    "moderated_at" TIMESTAMPTZ(3),
    "moderated_by_id" UUID,
    "employment_type" "EmploymentType" NOT NULL,
    "work_arrangement" "WorkArrangement" NOT NULL DEFAULT 'REMOTE',
    "description" VARCHAR(20000) NOT NULL,
    "responsibilities" VARCHAR(10000),
    "requirements_text" VARCHAR(10000),
    "openings" INTEGER NOT NULL DEFAULT 1,
    "filled_count" INTEGER NOT NULL DEFAULT 0,
    "country_code" VARCHAR(2),
    "city" VARCHAR(120),
    "time_zone" VARCHAR(64),
    "is_remote_friendly" BOOLEAN NOT NULL DEFAULT true,
    "rate_min_amount" DECIMAL(14,4),
    "rate_max_amount" DECIMAL(14,4),
    "rate_currency" VARCHAR(3),
    "rate_unit" "RateUnit",
    "min_years_experience" INTEGER,
    "seniority" VARCHAR(40),
    "hiring_manager_id" UUID,
    "contact_email" VARCHAR(254),
    "contact_phone" VARCHAR(32),
    "business_location" VARCHAR(240),
    "application_deadline" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "filled_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "search_vector" tsvector,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requirements" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "kind" "JobRequirementKind" NOT NULL,
    "skill_id" UUID,
    "label" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "weight" INTEGER NOT NULL DEFAULT 1,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "min_years" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_status_history" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "from_status" "JobStatus",
    "to_status" "JobStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "source" "ApplicationSource" NOT NULL DEFAULT 'DIRECT',
    "cover_letter" VARCHAR(8000),
    "expected_rate_amount" DECIMAL(14,4),
    "expected_rate_currency" VARCHAR(3),
    "expected_rate_unit" VARCHAR(20),
    "available_from" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_answers" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "question_key" VARCHAR(120) NOT NULL,
    "question" VARCHAR(1000) NOT NULL,
    "answer" VARCHAR(8000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_attachments" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'OTHER',
    "label" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_algorithm_versions" (
    "id" UUID NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "weights" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_algorithm_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_results" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "algorithm_id" UUID NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "required_skill_score" DECIMAL(5,2) NOT NULL,
    "preferred_skill_score" DECIMAL(5,2) NOT NULL,
    "experience_score" DECIMAL(5,2) NOT NULL,
    "rate_score" DECIMAL(5,2) NOT NULL,
    "time_zone_score" DECIMAL(5,2) NOT NULL,
    "availability_score" DECIMAL(5,2) NOT NULL,
    "explanation" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "job_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "kind" "ShortlistKind" NOT NULL DEFAULT 'EMPLOYER',
    "description" VARCHAR(2000),
    "created_by_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_candidates" (
    "id" UUID NOT NULL,
    "shortlist_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "application_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "added_by_id" UUID,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlist_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_notes" (
    "id" UUID NOT NULL,
    "shortlist_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shortlist_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "stage" VARCHAR(120) NOT NULL,
    "stage_order" INTEGER NOT NULL DEFAULT 1,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "mode" "InterviewMode" NOT NULL DEFAULT 'VIDEO',
    "scheduled_start_at" TIMESTAMPTZ(3) NOT NULL,
    "scheduled_end_at" TIMESTAMPTZ(3) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "meeting_url" VARCHAR(2048),
    "location" VARCHAR(300),
    "created_by_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(1000),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_participants" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "user_id" UUID,
    "talent_profile_id" UUID,
    "role" VARCHAR(40) NOT NULL DEFAULT 'INTERVIEWER',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "attended" BOOLEAN,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_outcomes" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "result" "InterviewOutcomeResult" NOT NULL DEFAULT 'PENDING',
    "summary" VARCHAR(4000),
    "recorded_by_id" UUID,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interview_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_notes" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(8000) NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interview_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "reference" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "work_arrangement" "WorkArrangement" NOT NULL DEFAULT 'REMOTE',
    "start_date" DATE,
    "expires_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "viewed_at" TIMESTAMPTZ(3),
    "responded_at" TIMESTAMPTZ(3),
    "decline_reason" VARCHAR(2000),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_terms" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "value_text" VARCHAR(1000),
    "value_amount" DECIMAL(14,4),
    "currency" VARCHAR(3),
    "rate_unit" "RateUnit",
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placements" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'PENDING',
    "reference" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "replacement_eligible_until" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_status_history" (
    "id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "from_status" "PlacementStatus",
    "to_status" "PlacementStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replacement_requests" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "status" "ReplacementStatus" NOT NULL DEFAULT 'REQUESTED',
    "reference" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "reason_category" VARCHAR(80) NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "assigned_at" TIMESTAMPTZ(3),
    "eligible_at_request" BOOLEAN NOT NULL,
    "eligibility_window_ends_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "replacement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replacement_decisions" (
    "id" UUID NOT NULL,
    "replacement_request_id" UUID NOT NULL,
    "decision" "ReplacementDecisionType" NOT NULL,
    "reason" VARCHAR(2000),
    "decided_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replacement_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replacement_candidates" (
    "id" UUID NOT NULL,
    "replacement_request_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "proposed_by_id" UUID,
    "accepted_by_company" BOOLEAN,
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "replacement_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_managers" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "department_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_leads" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_assignments" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "status" "StaffAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "job_title" VARCHAR(200) NOT NULL,
    "department_id" UUID,
    "employment_type" "EmploymentType" NOT NULL,
    "work_arrangement" "WorkArrangement" NOT NULL DEFAULT 'REMOTE',
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "end_reason" "AssignmentEndReason",
    "end_notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_assignments" (
    "id" UUID NOT NULL,
    "staff_assignment_id" UUID NOT NULL,
    "manager_profile_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_assignments" (
    "id" UUID NOT NULL,
    "staff_assignment_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_assignments" (
    "id" UUID NOT NULL,
    "staff_assignment_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "job_id" UUID,
    "department_id" UUID,
    "team_id" UUID,
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(8000),
    "status" "TaskStatus" NOT NULL DEFAULT 'TO_DO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "start_date" TIMESTAMPTZ(3),
    "due_date" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(1000),
    "created_by_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(8000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "label" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_status_history" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "from_status" "TaskStatus",
    "to_status" "TaskStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "interview_id" UUID,
    "task_id" UUID,
    "type" "CalendarEventType" NOT NULL DEFAULT 'COMPANY_EVENT',
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(4000),
    "location" VARCHAR(300),
    "meeting_url" VARCHAR(2048),
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID,
    "talent_profile_id" UUID,
    "response_status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_reminders" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'IN_APP',
    "minutes_before" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "staff_assignment_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "timesheet_period_id" UUID,
    "task_id" UUID,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "work_date" DATE NOT NULL,
    "ordinary_minutes" INTEGER NOT NULL,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(2000),
    "submitted_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(1000),
    "corrected_from_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entry_approvals" (
    "id" UUID NOT NULL,
    "time_entry_id" UUID NOT NULL,
    "from_status" "TimeEntryStatus" NOT NULL,
    "to_status" "TimeEntryStatus" NOT NULL,
    "decided_by_id" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entry_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_periods" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "TimesheetPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "submitted_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "locked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_periods" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PerformancePeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "performance_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_definitions" (
    "id" UUID NOT NULL,
    "performance_period_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "kind" "MetricKind" NOT NULL,
    "formula" JSONB NOT NULL,
    "min_value" DECIMAL(10,4),
    "max_value" DECIMAL(10,4),
    "weight" DECIMAL(6,4) NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "performance_period_id" UUID NOT NULL,
    "staff_assignment_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "reviewer_profile_id" UUID,
    "status" "PerformanceReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "overall_score" DECIMAL(6,3),
    "score_formula_version" VARCHAR(40),
    "summary" VARCHAR(8000),
    "finalised_at" TIMESTAMPTZ(3),
    "acknowledged_at" TIMESTAMPTZ(3),
    "disputed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_results" (
    "id" UUID NOT NULL,
    "performance_review_id" UUID NOT NULL,
    "metric_definition_id" UUID NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "evidence" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "metric_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_feedback" (
    "id" UUID NOT NULL,
    "performance_review_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL DEFAULT 'MANAGER',
    "body" VARCHAR(8000) NOT NULL,
    "is_visible_to_talent" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "performance_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_corrections" (
    "id" UUID NOT NULL,
    "performance_review_id" UUID NOT NULL,
    "previous_score" DECIMAL(6,3),
    "new_score" DECIMAL(6,3),
    "reason" VARCHAR(2000) NOT NULL,
    "corrected_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_agreements" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "staff_assignment_id" UUID NOT NULL,
    "talent_profile_id" UUID NOT NULL,
    "status" "PayAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "basis" "PayBasis" NOT NULL,
    "rate_amount" DECIMAL(14,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "overtime_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "ordinary_hours_per_period" DECIMAL(6,2),
    "pay_day_of_month" INTEGER,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "notes" VARCHAR(2000),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pay_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compensation_adjustments" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "pay_agreement_id" UUID,
    "staff_assignment_id" UUID NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "effective_date" DATE NOT NULL,
    "applied_in_period_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "compensation_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL,
    "total_gross" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "calculation_version" VARCHAR(40) NOT NULL,
    "calculated_at" TIMESTAMPTZ(3),
    "locked_at" TIMESTAMPTZ(3),
    "locked_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line_items" (
    "id" UUID NOT NULL,
    "payroll_period_id" UUID NOT NULL,
    "staff_assignment_id" UUID NOT NULL,
    "time_entry_id" UUID,
    "kind" "PayrollLineItemKind" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity_minutes" INTEGER,
    "quantity_hours" DECIMAL(8,2),
    "rate_amount" DECIMAL(14,4),
    "multiplier" DECIMAL(5,2),
    "amount" DECIMAL(16,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "calculation_inputs" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_approvals" (
    "id" UUID NOT NULL,
    "payroll_period_id" UUID NOT NULL,
    "from_status" "PayrollPeriodStatus",
    "to_status" "PayrollPeriodStatus" NOT NULL,
    "approved_by_id" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "payroll_period_id" UUID,
    "staff_assignment_id" UUID,
    "talent_profile_id" UUID,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'PENDING',
    "method_description" VARCHAR(200) NOT NULL,
    "external_reference" VARCHAR(200),
    "amount" DECIMAL(16,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "reconciled_at" TIMESTAMPTZ(3),
    "reconciled_by_id" UUID,
    "notes" VARCHAR(2000),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_status_history" (
    "id" UUID NOT NULL,
    "payment_record_id" UUID NOT NULL,
    "from_status" "PaymentRecordStatus",
    "to_status" "PaymentRecordStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
    "title" VARCHAR(200),
    "created_by_id" UUID,
    "last_message_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "archived_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(40) NOT NULL DEFAULT 'MEMBER',
    "last_read_at" TIMESTAMPTZ(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "left_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_group_bindings" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "team_id" UUID,
    "department_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_group_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body" VARCHAR(20000),
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_receipts" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organisation_id" UUID,
    "event_key" VARCHAR(120) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "link_url" VARCHAR(2048),
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "payload" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "dismissed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_key" VARCHAR(120) NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_attempts" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "provider_ref" VARCHAR(255),
    "error_code" VARCHAR(120),
    "error_message" VARCHAR(1000),
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "owner_id" UUID,
    "category" "FileCategory" NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "bucket" VARCHAR(120) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(160) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64),
    "scanned_at" TIMESTAMPTZ(3),
    "ready_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(500),
    "deleted_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_access_grants" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "granted_to_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "purpose" VARCHAR(200) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_scan_results" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "scanner" VARCHAR(80) NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "signature" VARCHAR(255),
    "detail" VARCHAR(1000),
    "duration_ms" INTEGER,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_scan_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_usages" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID NOT NULL,
    "field" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_requests" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "type" "ExportType" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'REQUESTED',
    "parameters" JSONB NOT NULL,
    "row_count" INTEGER,
    "failure_reason" VARCHAR(1000),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_files" (
    "id" UUID NOT NULL,
    "export_request_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "row_count" INTEGER NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_requests" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "full_name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "company_name" VARCHAR(200),
    "company_size" VARCHAR(40),
    "phone" VARCHAR(32),
    "country_code" VARCHAR(2),
    "message" VARCHAR(4000),
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "dedupe_key" CHAR(64) NOT NULL,
    "assigned_to_id" UUID,
    "contacted_at" TIMESTAMPTZ(3),
    "source" VARCHAR(80),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_requests" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "full_name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(240),
    "message" VARCHAR(4000) NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "dedupe_key" CHAR(64) NOT NULL,
    "assigned_to_id" UUID,
    "responded_at" TIMESTAMPTZ(3),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscriptions" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "confirm_token_hash" CHAR(64),
    "unsubscribe_token_hash" CHAR(64),
    "confirmed_at" TIMESTAMPTZ(3),
    "unsubscribed_at" TIMESTAMPTZ(3),
    "source" VARCHAR(80),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "newsletter_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" VARCHAR(254),
    "purpose" VARCHAR(120) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "policy_version" VARCHAR(40) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_cases" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "reference" VARCHAR(40) NOT NULL,
    "subject" VARCHAR(240) NOT NULL,
    "description" VARCHAR(8000) NOT NULL,
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportCasePriority" NOT NULL DEFAULT 'MEDIUM',
    "category" "SupportCaseCategory" NOT NULL DEFAULT 'OTHER',
    "raised_by_id" UUID,
    "raised_by_email" VARCHAR(254),
    "assigned_to_id" UUID,
    "assigned_at" TIMESTAMPTZ(3),
    "escalated_at" TIMESTAMPTZ(3),
    "escalation_reason" VARCHAR(1000),
    "resolved_at" TIMESTAMPTZ(3),
    "resolution_note" VARCHAR(4000),
    "closed_at" TIMESTAMPTZ(3),
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_case_notes" (
    "id" UUID NOT NULL,
    "support_case_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(8000) NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_case_links" (
    "id" UUID NOT NULL,
    "support_case_id" UUID NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_case_history" (
    "id" UUID NOT NULL,
    "support_case_id" UUID NOT NULL,
    "from_status" "SupportCaseStatus",
    "to_status" "SupportCaseStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_type" VARCHAR(40) NOT NULL DEFAULT 'USER',
    "organisation_id" UUID,
    "action" "AuditAction" NOT NULL,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID,
    "summary" VARCHAR(1000) NOT NULL,
    "reason" VARCHAR(1000),
    "changes" JSONB,
    "request_id" VARCHAR(128),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "impersonated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "event_key" VARCHAR(120) NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_job_outcomes" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "queue" VARCHAR(80) NOT NULL,
    "job_name" VARCHAR(120) NOT NULL,
    "job_id" VARCHAR(160),
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload_summary" JSONB,
    "error_code" VARCHAR(120),
    "error_message" VARCHAR(2000),
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "retried_at" TIMESTAMPTZ(3),
    "retried_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "background_job_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "template_key" VARCHAR(120) NOT NULL,
    "recipient_email" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider_ref" VARCHAR(255),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(120),
    "error_message" VARCHAR(1000),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "scope" "FeatureFlagScope" NOT NULL DEFAULT 'GLOBAL',
    "organisation_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(500),
    "rollout_percentage" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_configurations" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "organisation_id" UUID,
    "value" JSONB NOT NULL,
    "value_schema" JSONB,
    "description" VARCHAR(500),
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policy_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "title" VARCHAR(240) NOT NULL,
    "body" VARCHAR(8000) NOT NULL,
    "audience" VARCHAR(40) NOT NULL DEFAULT 'ALL',
    "published_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_deliveries" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "delivered_at" TIMESTAMPTZ(3),
    "error_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(120) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "user_id" UUID,
    "organisation_id" UUID,
    "request_hash" CHAR(64) NOT NULL,
    "status_code" INTEGER,
    "response_body" JSONB,
    "resource_id" UUID,
    "locked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");

-- CreateIndex
CREATE INDEX "users_is_platform_admin_idx" ON "users"("is_platform_admin");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_provider_user_id_key" ON "user_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "two_factor_recovery_codes_user_id_used_at_idx" ON "two_factor_recovery_codes"("user_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_purpose_consumed_at_idx" ON "auth_tokens"("user_id", "purpose", "consumed_at");

-- CreateIndex
CREATE INDEX "auth_tokens_email_purpose_idx" ON "auth_tokens"("email", "purpose");

-- CreateIndex
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "security_events_user_id_created_at_idx" ON "security_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_type_created_at_idx" ON "security_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "security_events_organisation_id_created_at_idx" ON "security_events"("organisation_id", "created_at");

-- CreateIndex
CREATE INDEX "impersonation_sessions_admin_user_id_ended_at_idx" ON "impersonation_sessions"("admin_user_id", "ended_at");

-- CreateIndex
CREATE INDEX "impersonation_sessions_target_user_id_ended_at_idx" ON "impersonation_sessions"("target_user_id", "ended_at");

-- CreateIndex
CREATE INDEX "platform_role_assignments_user_id_revoked_at_idx" ON "platform_role_assignments"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "platform_role_assignments_role_id_idx" ON "platform_role_assignments"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_role_assignments_user_id_role_id_key" ON "platform_role_assignments"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

-- CreateIndex
CREATE INDEX "organisations_status_created_at_idx" ON "organisations"("status", "created_at");

-- CreateIndex
CREATE INDEX "organisations_verificationStatus_idx" ON "organisations"("verificationStatus");

-- CreateIndex
CREATE INDEX "organisations_name_idx" ON "organisations"("name");

-- CreateIndex
CREATE INDEX "organisation_addresses_organisation_id_is_primary_idx" ON "organisation_addresses"("organisation_id", "is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_settings_organisation_id_key_key" ON "organisation_settings"("organisation_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_resource_action_idx" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "organisation_memberships_user_id_status_idx" ON "organisation_memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "organisation_memberships_organisation_id_status_role_id_idx" ON "organisation_memberships"("organisation_id", "status", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_memberships_organisation_id_user_id_key" ON "organisation_memberships"("organisation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organisation_id_accepted_at_revoked_at_idx" ON "invitations"("organisation_id", "accepted_at", "revoked_at");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_expires_at_idx" ON "invitations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_organisation_id_email_role_id_key" ON "invitations"("organisation_id", "email", "role_id");

-- CreateIndex
CREATE INDEX "invitation_attempts_invitation_id_created_at_idx" ON "invitation_attempts"("invitation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "talent_profiles_user_id_key" ON "talent_profiles"("user_id");

-- CreateIndex
CREATE INDEX "talent_profiles_status_vettingStatus_idx" ON "talent_profiles"("status", "vettingStatus");

-- CreateIndex
CREATE INDEX "talent_profiles_country_code_time_zone_idx" ON "talent_profiles"("country_code", "time_zone");

-- CreateIndex
CREATE INDEX "talent_profiles_availability_status_idx" ON "talent_profiles"("availability", "status");

-- CreateIndex
CREATE INDEX "talent_profiles_is_publicly_discoverable_status_idx" ON "talent_profiles"("is_publicly_discoverable", "status");

-- CreateIndex
CREATE INDEX "talent_experiences_talent_profile_id_start_date_idx" ON "talent_experiences"("talent_profile_id", "start_date");

-- CreateIndex
CREATE INDEX "talent_education_talent_profile_id_idx" ON "talent_education"("talent_profile_id");

-- CreateIndex
CREATE INDEX "talent_certifications_talent_profile_id_idx" ON "talent_certifications"("talent_profile_id");

-- CreateIndex
CREATE INDEX "portfolio_items_talent_profile_id_position_idx" ON "portfolio_items"("talent_profile_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_key_key" ON "skill_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "skills_key_key" ON "skills"("key");

-- CreateIndex
CREATE INDEX "skills_category_id_idx" ON "skills"("category_id");

-- CreateIndex
CREATE INDEX "skills_name_idx" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_aliases_alias_key" ON "skill_aliases"("alias");

-- CreateIndex
CREATE INDEX "skill_aliases_skill_id_idx" ON "skill_aliases"("skill_id");

-- CreateIndex
CREATE INDEX "talent_skills_skill_id_idx" ON "talent_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "talent_skills_talent_profile_id_skill_id_key" ON "talent_skills"("talent_profile_id", "skill_id");

-- CreateIndex
CREATE INDEX "vetting_cases_status_priority_created_at_idx" ON "vetting_cases"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "vetting_cases_assigned_to_id_status_idx" ON "vetting_cases"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "vetting_cases_talent_profile_id_idx" ON "vetting_cases"("talent_profile_id");

-- CreateIndex
CREATE INDEX "vetting_reviews_vetting_case_id_created_at_idx" ON "vetting_reviews"("vetting_case_id", "created_at");

-- CreateIndex
CREATE INDEX "assessment_results_vetting_case_id_idx" ON "assessment_results"("vetting_case_id");

-- CreateIndex
CREATE INDEX "vetting_status_history_vetting_case_id_created_at_idx" ON "vetting_status_history"("vetting_case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_reference_key" ON "jobs"("reference");

-- CreateIndex
CREATE INDEX "jobs_organisation_id_status_created_at_idx" ON "jobs"("organisation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "jobs_status_published_at_idx" ON "jobs"("status", "published_at");

-- CreateIndex
CREATE INDEX "jobs_organisation_id_moderation_status_idx" ON "jobs"("organisation_id", "moderation_status");

-- CreateIndex
CREATE INDEX "jobs_employment_type_work_arrangement_idx" ON "jobs"("employment_type", "work_arrangement");

-- CreateIndex
CREATE INDEX "jobs_country_code_time_zone_idx" ON "jobs"("country_code", "time_zone");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_organisation_id_slug_key" ON "jobs"("organisation_id", "slug");

-- CreateIndex
CREATE INDEX "job_requirements_job_id_kind_idx" ON "job_requirements"("job_id", "kind");

-- CreateIndex
CREATE INDEX "job_requirements_skill_id_idx" ON "job_requirements"("skill_id");

-- CreateIndex
CREATE INDEX "job_status_history_job_id_created_at_idx" ON "job_status_history"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "applications_organisation_id_status_submitted_at_idx" ON "applications"("organisation_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "applications_talent_profile_id_status_idx" ON "applications"("talent_profile_id", "status");

-- CreateIndex
CREATE INDEX "applications_job_id_status_idx" ON "applications"("job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_job_id_talent_profile_id_key" ON "applications"("job_id", "talent_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_answers_application_id_question_key_key" ON "application_answers"("application_id", "question_key");

-- CreateIndex
CREATE INDEX "application_attachments_application_id_idx" ON "application_attachments"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_attachments_application_id_file_id_key" ON "application_attachments"("application_id", "file_id");

-- CreateIndex
CREATE INDEX "application_status_history_application_id_created_at_idx" ON "application_status_history"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "matching_algorithm_versions_version_key" ON "matching_algorithm_versions"("version");

-- CreateIndex
CREATE INDEX "match_results_organisation_id_score_idx" ON "match_results"("organisation_id", "score");

-- CreateIndex
CREATE INDEX "match_results_job_id_score_idx" ON "match_results"("job_id", "score");

-- CreateIndex
CREATE INDEX "match_results_talent_profile_id_score_idx" ON "match_results"("talent_profile_id", "score");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_job_id_talent_profile_id_algorithm_id_key" ON "match_results"("job_id", "talent_profile_id", "algorithm_id");

-- CreateIndex
CREATE INDEX "shortlists_organisation_id_archived_at_idx" ON "shortlists"("organisation_id", "archived_at");

-- CreateIndex
CREATE INDEX "shortlists_job_id_idx" ON "shortlists"("job_id");

-- CreateIndex
CREATE INDEX "shortlist_candidates_shortlist_id_position_idx" ON "shortlist_candidates"("shortlist_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_candidates_shortlist_id_talent_profile_id_key" ON "shortlist_candidates"("shortlist_id", "talent_profile_id");

-- CreateIndex
CREATE INDEX "shortlist_notes_shortlist_id_created_at_idx" ON "shortlist_notes"("shortlist_id", "created_at");

-- CreateIndex
CREATE INDEX "interviews_organisation_id_scheduled_start_at_idx" ON "interviews"("organisation_id", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "interviews_application_id_stage_order_idx" ON "interviews"("application_id", "stage_order");

-- CreateIndex
CREATE INDEX "interviews_status_scheduled_start_at_idx" ON "interviews"("status", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "interview_participants_interview_id_idx" ON "interview_participants"("interview_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_participants_interview_id_user_id_talent_profile__key" ON "interview_participants"("interview_id", "user_id", "talent_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_outcomes_interview_id_key" ON "interview_outcomes"("interview_id");

-- CreateIndex
CREATE INDEX "interview_notes_interview_id_created_at_idx" ON "interview_notes"("interview_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "offers_reference_key" ON "offers"("reference");

-- CreateIndex
CREATE INDEX "offers_organisation_id_status_created_at_idx" ON "offers"("organisation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "offers_application_id_idx" ON "offers"("application_id");

-- CreateIndex
CREATE INDEX "offers_talent_profile_id_status_idx" ON "offers"("talent_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "offer_terms_offer_id_key_key" ON "offer_terms"("offer_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "placements_offer_id_key" ON "placements"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "placements_reference_key" ON "placements"("reference");

-- CreateIndex
CREATE INDEX "placements_organisation_id_status_start_date_idx" ON "placements"("organisation_id", "status", "start_date");

-- CreateIndex
CREATE INDEX "placements_talent_profile_id_status_idx" ON "placements"("talent_profile_id", "status");

-- CreateIndex
CREATE INDEX "placement_status_history_placement_id_created_at_idx" ON "placement_status_history"("placement_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "replacement_requests_reference_key" ON "replacement_requests"("reference");

-- CreateIndex
CREATE INDEX "replacement_requests_organisation_id_status_created_at_idx" ON "replacement_requests"("organisation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "replacement_requests_placement_id_idx" ON "replacement_requests"("placement_id");

-- CreateIndex
CREATE INDEX "replacement_requests_assigned_to_id_status_idx" ON "replacement_requests"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "replacement_decisions_replacement_request_id_created_at_idx" ON "replacement_decisions"("replacement_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "replacement_candidates_replacement_request_id_talent_profil_key" ON "replacement_candidates"("replacement_request_id", "talent_profile_id");

-- CreateIndex
CREATE INDEX "departments_organisation_id_archived_at_idx" ON "departments"("organisation_id", "archived_at");

-- CreateIndex
CREATE INDEX "departments_parent_id_idx" ON "departments"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organisation_id_slug_key" ON "departments"("organisation_id", "slug");

-- CreateIndex
CREATE INDEX "department_managers_department_id_effective_to_idx" ON "department_managers"("department_id", "effective_to");

-- CreateIndex
CREATE INDEX "department_managers_talent_profile_id_effective_to_idx" ON "department_managers"("talent_profile_id", "effective_to");

-- CreateIndex
CREATE INDEX "teams_organisation_id_archived_at_idx" ON "teams"("organisation_id", "archived_at");

-- CreateIndex
CREATE INDEX "teams_department_id_idx" ON "teams"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organisation_id_slug_key" ON "teams"("organisation_id", "slug");

-- CreateIndex
CREATE INDEX "team_members_team_id_effective_to_idx" ON "team_members"("team_id", "effective_to");

-- CreateIndex
CREATE INDEX "team_members_talent_profile_id_effective_to_idx" ON "team_members"("talent_profile_id", "effective_to");

-- CreateIndex
CREATE INDEX "team_leads_team_id_effective_to_idx" ON "team_leads"("team_id", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "staff_assignments_placement_id_key" ON "staff_assignments"("placement_id");

-- CreateIndex
CREATE INDEX "staff_assignments_organisation_id_status_effective_from_idx" ON "staff_assignments"("organisation_id", "status", "effective_from");

-- CreateIndex
CREATE INDEX "staff_assignments_talent_profile_id_status_idx" ON "staff_assignments"("talent_profile_id", "status");

-- CreateIndex
CREATE INDEX "staff_assignments_department_id_status_idx" ON "staff_assignments"("department_id", "status");

-- CreateIndex
CREATE INDEX "manager_assignments_staff_assignment_id_effective_to_idx" ON "manager_assignments"("staff_assignment_id", "effective_to");

-- CreateIndex
CREATE INDEX "manager_assignments_manager_profile_id_effective_to_idx" ON "manager_assignments"("manager_profile_id", "effective_to");

-- CreateIndex
CREATE INDEX "department_assignments_staff_assignment_id_effective_to_idx" ON "department_assignments"("staff_assignment_id", "effective_to");

-- CreateIndex
CREATE INDEX "department_assignments_department_id_effective_to_idx" ON "department_assignments"("department_id", "effective_to");

-- CreateIndex
CREATE INDEX "team_assignments_staff_assignment_id_effective_to_idx" ON "team_assignments"("staff_assignment_id", "effective_to");

-- CreateIndex
CREATE INDEX "team_assignments_team_id_effective_to_idx" ON "team_assignments"("team_id", "effective_to");

-- CreateIndex
CREATE INDEX "tasks_organisation_id_status_due_date_idx" ON "tasks"("organisation_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "tasks_organisation_id_priority_idx" ON "tasks"("organisation_id", "priority");

-- CreateIndex
CREATE INDEX "tasks_department_id_idx" ON "tasks"("department_id");

-- CreateIndex
CREATE INDEX "tasks_team_id_idx" ON "tasks"("team_id");

-- CreateIndex
CREATE INDEX "task_assignees_talent_profile_id_completed_at_idx" ON "task_assignees"("talent_profile_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignees_task_id_talent_profile_id_key" ON "task_assignees"("task_id", "talent_profile_id");

-- CreateIndex
CREATE INDEX "task_comments_task_id_created_at_idx" ON "task_comments"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_attachments_task_id_file_id_key" ON "task_attachments"("task_id", "file_id");

-- CreateIndex
CREATE INDEX "task_status_history_task_id_created_at_idx" ON "task_status_history"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "calendar_events_organisation_id_start_at_idx" ON "calendar_events"("organisation_id", "start_at");

-- CreateIndex
CREATE INDEX "calendar_events_organisation_id_type_start_at_idx" ON "calendar_events"("organisation_id", "type", "start_at");

-- CreateIndex
CREATE INDEX "event_participants_event_id_idx" ON "event_participants"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_event_id_user_id_talent_profile_id_key" ON "event_participants"("event_id", "user_id", "talent_profile_id");

-- CreateIndex
CREATE INDEX "event_reminders_event_id_idx" ON "event_reminders"("event_id");

-- CreateIndex
CREATE INDEX "event_reminders_sent_at_failed_at_idx" ON "event_reminders"("sent_at", "failed_at");

-- CreateIndex
CREATE INDEX "time_entries_organisation_id_work_date_status_idx" ON "time_entries"("organisation_id", "work_date", "status");

-- CreateIndex
CREATE INDEX "time_entries_staff_assignment_id_work_date_idx" ON "time_entries"("staff_assignment_id", "work_date");

-- CreateIndex
CREATE INDEX "time_entries_talent_profile_id_status_work_date_idx" ON "time_entries"("talent_profile_id", "status", "work_date");

-- CreateIndex
CREATE INDEX "time_entries_timesheet_period_id_idx" ON "time_entries"("timesheet_period_id");

-- CreateIndex
CREATE INDEX "time_entry_approvals_time_entry_id_created_at_idx" ON "time_entry_approvals"("time_entry_id", "created_at");

-- CreateIndex
CREATE INDEX "timesheet_periods_organisation_id_status_idx" ON "timesheet_periods"("organisation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_periods_organisation_id_start_date_end_date_key" ON "timesheet_periods"("organisation_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "performance_periods_organisation_id_status_idx" ON "performance_periods"("organisation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "performance_periods_organisation_id_start_date_end_date_key" ON "performance_periods"("organisation_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_definitions_performance_period_id_key_key" ON "metric_definitions"("performance_period_id", "key");

-- CreateIndex
CREATE INDEX "performance_reviews_organisation_id_status_idx" ON "performance_reviews"("organisation_id", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_talent_profile_id_status_idx" ON "performance_reviews"("talent_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_performance_period_id_staff_assignment__key" ON "performance_reviews"("performance_period_id", "staff_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_results_performance_review_id_metric_definition_id_key" ON "metric_results"("performance_review_id", "metric_definition_id");

-- CreateIndex
CREATE INDEX "performance_feedback_performance_review_id_created_at_idx" ON "performance_feedback"("performance_review_id", "created_at");

-- CreateIndex
CREATE INDEX "performance_corrections_performance_review_id_created_at_idx" ON "performance_corrections"("performance_review_id", "created_at");

-- CreateIndex
CREATE INDEX "pay_agreements_organisation_id_status_idx" ON "pay_agreements"("organisation_id", "status");

-- CreateIndex
CREATE INDEX "pay_agreements_staff_assignment_id_effective_to_idx" ON "pay_agreements"("staff_assignment_id", "effective_to");

-- CreateIndex
CREATE INDEX "compensation_adjustments_organisation_id_effective_date_idx" ON "compensation_adjustments"("organisation_id", "effective_date");

-- CreateIndex
CREATE INDEX "compensation_adjustments_staff_assignment_id_applied_in_per_idx" ON "compensation_adjustments"("staff_assignment_id", "applied_in_period_id");

-- CreateIndex
CREATE INDEX "payroll_periods_organisation_id_status_idx" ON "payroll_periods"("organisation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_organisation_id_start_date_end_date_key" ON "payroll_periods"("organisation_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "payroll_line_items_payroll_period_id_staff_assignment_id_idx" ON "payroll_line_items"("payroll_period_id", "staff_assignment_id");

-- CreateIndex
CREATE INDEX "payroll_line_items_staff_assignment_id_idx" ON "payroll_line_items"("staff_assignment_id");

-- CreateIndex
CREATE INDEX "payroll_approvals_payroll_period_id_created_at_idx" ON "payroll_approvals"("payroll_period_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_records_organisation_id_status_created_at_idx" ON "payment_records"("organisation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "payment_records_payroll_period_id_idx" ON "payment_records"("payroll_period_id");

-- CreateIndex
CREATE INDEX "payment_records_external_reference_idx" ON "payment_records"("external_reference");

-- CreateIndex
CREATE INDEX "payment_status_history_payment_record_id_created_at_idx" ON "payment_status_history"("payment_record_id", "created_at");

-- CreateIndex
CREATE INDEX "conversations_organisation_id_archived_at_last_message_at_idx" ON "conversations"("organisation_id", "archived_at", "last_message_at");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_left_at_idx" ON "conversation_members"("user_id", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_members_conversation_id_user_id_key" ON "conversation_members"("conversation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_group_bindings_conversation_id_key" ON "conversation_group_bindings"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_group_bindings_team_id_idx" ON "conversation_group_bindings"("team_id");

-- CreateIndex
CREATE INDEX "conversation_group_bindings_department_id_idx" ON "conversation_group_bindings"("department_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "message_receipts_user_id_read_at_idx" ON "message_receipts"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "message_receipts_message_id_user_id_key" ON "message_receipts"("message_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_message_id_file_id_key" ON "message_attachments"("message_id", "file_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_dismissed_at_idx" ON "notifications"("user_id", "dismissed_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_event_key_key" ON "notification_preferences"("user_id", "event_key");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_notification_id_channel_idx" ON "notification_delivery_attempts"("notification_id", "channel");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_status_attempted_at_idx" ON "notification_delivery_attempts"("status", "attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_storage_key_key" ON "file_objects"("storage_key");

-- CreateIndex
CREATE INDEX "file_objects_organisation_id_category_status_idx" ON "file_objects"("organisation_id", "category", "status");

-- CreateIndex
CREATE INDEX "file_objects_owner_id_category_idx" ON "file_objects"("owner_id", "category");

-- CreateIndex
CREATE INDEX "file_objects_status_created_at_idx" ON "file_objects"("status", "created_at");

-- CreateIndex
CREATE INDEX "file_objects_expires_at_idx" ON "file_objects"("expires_at");

-- CreateIndex
CREATE INDEX "file_access_grants_file_id_expires_at_idx" ON "file_access_grants"("file_id", "expires_at");

-- CreateIndex
CREATE INDEX "file_access_grants_granted_to_id_expires_at_idx" ON "file_access_grants"("granted_to_id", "expires_at");

-- CreateIndex
CREATE INDEX "file_scan_results_file_id_created_at_idx" ON "file_scan_results"("file_id", "created_at");

-- CreateIndex
CREATE INDEX "file_scan_results_status_idx" ON "file_scan_results"("status");

-- CreateIndex
CREATE INDEX "file_usages_resource_type_resource_id_idx" ON "file_usages"("resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_usages_file_id_resource_type_resource_id_field_key" ON "file_usages"("file_id", "resource_type", "resource_id", "field");

-- CreateIndex
CREATE INDEX "export_requests_organisation_id_status_created_at_idx" ON "export_requests"("organisation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "export_requests_requested_by_id_created_at_idx" ON "export_requests"("requested_by_id", "created_at");

-- CreateIndex
CREATE INDEX "export_requests_expires_at_idx" ON "export_requests"("expires_at");

-- CreateIndex
CREATE INDEX "export_files_export_request_id_idx" ON "export_files"("export_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "demo_requests_dedupe_key_key" ON "demo_requests"("dedupe_key");

-- CreateIndex
CREATE INDEX "demo_requests_status_created_at_idx" ON "demo_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "demo_requests_email_idx" ON "demo_requests"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contact_requests_dedupe_key_key" ON "contact_requests"("dedupe_key");

-- CreateIndex
CREATE INDEX "contact_requests_status_created_at_idx" ON "contact_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "contact_requests_email_idx" ON "contact_requests"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_email_key" ON "newsletter_subscriptions"("email");

-- CreateIndex
CREATE INDEX "newsletter_subscriptions_status_idx" ON "newsletter_subscriptions"("status");

-- CreateIndex
CREATE INDEX "consent_records_user_id_purpose_idx" ON "consent_records"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "consent_records_email_purpose_idx" ON "consent_records"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_reference_key" ON "support_cases"("reference");

-- CreateIndex
CREATE INDEX "support_cases_organisation_id_status_created_at_idx" ON "support_cases"("organisation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "support_cases_status_priority_created_at_idx" ON "support_cases"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "support_cases_assigned_to_id_status_idx" ON "support_cases"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "support_case_notes_support_case_id_created_at_idx" ON "support_case_notes"("support_case_id", "created_at");

-- CreateIndex
CREATE INDEX "support_case_links_resource_type_resource_id_idx" ON "support_case_links"("resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_case_links_support_case_id_resource_type_resource_i_key" ON "support_case_links"("support_case_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "support_case_history_support_case_id_created_at_idx" ON "support_case_history"("support_case_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_organisation_id_created_at_idx" ON "audit_events"("organisation_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_created_at_idx" ON "audit_events"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_resource_type_resource_id_created_at_idx" ON "audit_events"("resource_type", "resource_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events"("action", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "outbox_events_event_key_created_at_idx" ON "outbox_events"("event_key", "created_at");

-- CreateIndex
CREATE INDEX "background_job_outcomes_status_created_at_idx" ON "background_job_outcomes"("status", "created_at");

-- CreateIndex
CREATE INDEX "background_job_outcomes_queue_status_idx" ON "background_job_outcomes"("queue", "status");

-- CreateIndex
CREATE INDEX "background_job_outcomes_organisation_id_created_at_idx" ON "background_job_outcomes"("organisation_id", "created_at");

-- CreateIndex
CREATE INDEX "email_deliveries_status_created_at_idx" ON "email_deliveries"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_deliveries_recipient_email_created_at_idx" ON "email_deliveries"("recipient_email", "created_at");

-- CreateIndex
CREATE INDEX "email_deliveries_template_key_created_at_idx" ON "email_deliveries"("template_key", "created_at");

-- CreateIndex
CREATE INDEX "feature_flags_key_enabled_idx" ON "feature_flags"("key", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_scope_organisation_id_key" ON "feature_flags"("key", "scope", "organisation_id");

-- CreateIndex
CREATE INDEX "policy_configurations_key_idx" ON "policy_configurations"("key");

-- CreateIndex
CREATE UNIQUE INDEX "policy_configurations_key_organisation_id_key" ON "policy_configurations"("key", "organisation_id");

-- CreateIndex
CREATE INDEX "announcements_organisation_id_published_at_idx" ON "announcements"("organisation_id", "published_at");

-- CreateIndex
CREATE INDEX "announcement_deliveries_announcement_id_status_idx" ON "announcement_deliveries"("announcement_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_deliveries_announcement_id_user_id_channel_key" ON "announcement_deliveries"("announcement_id", "user_id", "channel");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_key_key" ON "idempotency_records"("scope", "key");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_credentials" ADD CONSTRAINT "two_factor_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_recovery_codes" ADD CONSTRAINT "two_factor_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "two_factor_credentials"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_addresses" ADD CONSTRAINT "organisation_addresses_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_settings" ADD CONSTRAINT "organisation_settings_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_attempts" ADD CONSTRAINT "invitation_attempts_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_experiences" ADD CONSTRAINT "talent_experiences_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_education" ADD CONSTRAINT "talent_education_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_certifications" ADD CONSTRAINT "talent_certifications_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "skill_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_aliases" ADD CONSTRAINT "skill_aliases_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_skills" ADD CONSTRAINT "talent_skills_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_skills" ADD CONSTRAINT "talent_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vetting_cases" ADD CONSTRAINT "vetting_cases_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vetting_cases" ADD CONSTRAINT "vetting_cases_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vetting_reviews" ADD CONSTRAINT "vetting_reviews_vetting_case_id_fkey" FOREIGN KEY ("vetting_case_id") REFERENCES "vetting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vetting_reviews" ADD CONSTRAINT "vetting_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_vetting_case_id_fkey" FOREIGN KEY ("vetting_case_id") REFERENCES "vetting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vetting_status_history" ADD CONSTRAINT "vetting_status_history_vetting_case_id_fkey" FOREIGN KEY ("vetting_case_id") REFERENCES "vetting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_attachments" ADD CONSTRAINT "application_attachments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_algorithm_id_fkey" FOREIGN KEY ("algorithm_id") REFERENCES "matching_algorithm_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_candidates" ADD CONSTRAINT "shortlist_candidates_shortlist_id_fkey" FOREIGN KEY ("shortlist_id") REFERENCES "shortlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_candidates" ADD CONSTRAINT "shortlist_candidates_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_candidates" ADD CONSTRAINT "shortlist_candidates_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_notes" ADD CONSTRAINT "shortlist_notes_shortlist_id_fkey" FOREIGN KEY ("shortlist_id") REFERENCES "shortlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_outcomes" ADD CONSTRAINT "interview_outcomes_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_notes" ADD CONSTRAINT "interview_notes_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_terms" ADD CONSTRAINT "offer_terms_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_status_history" ADD CONSTRAINT "placement_status_history_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_requests" ADD CONSTRAINT "replacement_requests_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_requests" ADD CONSTRAINT "replacement_requests_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_decisions" ADD CONSTRAINT "replacement_decisions_replacement_request_id_fkey" FOREIGN KEY ("replacement_request_id") REFERENCES "replacement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_candidates" ADD CONSTRAINT "replacement_candidates_replacement_request_id_fkey" FOREIGN KEY ("replacement_request_id") REFERENCES "replacement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_candidates" ADD CONSTRAINT "replacement_candidates_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_managers" ADD CONSTRAINT "department_managers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_managers" ADD CONSTRAINT "department_managers_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_leads" ADD CONSTRAINT "team_leads_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_leads" ADD CONSTRAINT "team_leads_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_assignments" ADD CONSTRAINT "manager_assignments_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_assignments" ADD CONSTRAINT "department_assignments_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_assignments" ADD CONSTRAINT "team_assignments_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_timesheet_period_id_fkey" FOREIGN KEY ("timesheet_period_id") REFERENCES "timesheet_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry_approvals" ADD CONSTRAINT "time_entry_approvals_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_periods" ADD CONSTRAINT "performance_periods_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_performance_period_id_fkey" FOREIGN KEY ("performance_period_id") REFERENCES "performance_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_performance_period_id_fkey" FOREIGN KEY ("performance_period_id") REFERENCES "performance_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_results" ADD CONSTRAINT "metric_results_performance_review_id_fkey" FOREIGN KEY ("performance_review_id") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_results" ADD CONSTRAINT "metric_results_metric_definition_id_fkey" FOREIGN KEY ("metric_definition_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_feedback" ADD CONSTRAINT "performance_feedback_performance_review_id_fkey" FOREIGN KEY ("performance_review_id") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_corrections" ADD CONSTRAINT "performance_corrections_performance_review_id_fkey" FOREIGN KEY ("performance_review_id") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_agreements" ADD CONSTRAINT "pay_agreements_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_agreements" ADD CONSTRAINT "pay_agreements_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_agreements" ADD CONSTRAINT "pay_agreements_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_adjustments" ADD CONSTRAINT "compensation_adjustments_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_adjustments" ADD CONSTRAINT "compensation_adjustments_pay_agreement_id_fkey" FOREIGN KEY ("pay_agreement_id") REFERENCES "pay_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_adjustments" ADD CONSTRAINT "compensation_adjustments_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_adjustments" ADD CONSTRAINT "compensation_adjustments_applied_in_period_id_fkey" FOREIGN KEY ("applied_in_period_id") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_approvals" ADD CONSTRAINT "payroll_approvals_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_staff_assignment_id_fkey" FOREIGN KEY ("staff_assignment_id") REFERENCES "staff_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_talent_profile_id_fkey" FOREIGN KEY ("talent_profile_id") REFERENCES "talent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_payment_record_id_fkey" FOREIGN KEY ("payment_record_id") REFERENCES "payment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_group_bindings" ADD CONSTRAINT "conversation_group_bindings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_group_bindings" ADD CONSTRAINT "conversation_group_bindings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_access_grants" ADD CONSTRAINT "file_access_grants_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_scan_results" ADD CONSTRAINT "file_scan_results_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_usages" ADD CONSTRAINT "file_usages_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_requests" ADD CONSTRAINT "export_requests_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_requests" ADD CONSTRAINT "export_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_export_request_id_fkey" FOREIGN KEY ("export_request_id") REFERENCES "export_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_requests" ADD CONSTRAINT "demo_requests_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_case_notes" ADD CONSTRAINT "support_case_notes_support_case_id_fkey" FOREIGN KEY ("support_case_id") REFERENCES "support_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_case_links" ADD CONSTRAINT "support_case_links_support_case_id_fkey" FOREIGN KEY ("support_case_id") REFERENCES "support_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_case_history" ADD CONSTRAINT "support_case_history_support_case_id_fkey" FOREIGN KEY ("support_case_id") REFERENCES "support_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_job_outcomes" ADD CONSTRAINT "background_job_outcomes_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_configurations" ADD CONSTRAINT "policy_configurations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_deliveries" ADD CONSTRAINT "announcement_deliveries_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

