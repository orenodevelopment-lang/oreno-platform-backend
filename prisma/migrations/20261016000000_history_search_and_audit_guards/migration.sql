CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "offer_status_history" (
  "id" UUID NOT NULL,
  "offer_id" UUID NOT NULL,
  "from_status" "OfferStatus",
  "to_status" "OfferStatus" NOT NULL,
  "changed_by_id" UUID,
  "reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offer_status_history_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "offer_status_history_offer_id_created_at_idx" ON "offer_status_history"("offer_id", "created_at");
INSERT INTO "offer_status_history" ("id", "offer_id", "to_status", "reason", "created_at")
SELECT gen_random_uuid(), "id", "status", 'Backfilled current state', "created_at" FROM "offers";

CREATE INDEX "jobs_title_trgm_idx" ON "jobs" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "jobs_description_trgm_idx" ON "jobs" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "talent_profiles_headline_trgm_idx" ON "talent_profiles" USING GIN ("headline" gin_trgm_ops);
CREATE INDEX "talent_profiles_current_title_trgm_idx" ON "talent_profiles" USING GIN ("current_title" gin_trgm_ops);

UPDATE "jobs" SET "search_vector" = to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("requirements_text", ''));
CREATE INDEX "jobs_search_vector_idx" ON "jobs" USING GIN ("search_vector");
CREATE FUNCTION update_job_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."search_vector" := to_tsvector('simple', coalesce(NEW."title", '') || ' ' || coalesce(NEW."description", '') || ' ' || coalesce(NEW."requirements_text", ''));
  RETURN NEW;
END $$;
CREATE TRIGGER "jobs_search_vector_update" BEFORE INSERT OR UPDATE OF "title", "description", "requirements_text" ON "jobs" FOR EACH ROW EXECUTE FUNCTION update_job_search_vector();

CREATE FUNCTION reject_append_only_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();
CREATE TRIGGER "offer_status_history_append_only" BEFORE UPDATE OR DELETE ON "offer_status_history" FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();
