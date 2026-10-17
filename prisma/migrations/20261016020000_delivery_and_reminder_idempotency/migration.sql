ALTER TABLE "tasks" ADD COLUMN "due_reminder_sent_at" TIMESTAMPTZ(3);

ALTER TABLE "email_deliveries" ADD COLUMN "dedupe_key" VARCHAR(255);
CREATE UNIQUE INDEX "email_deliveries_dedupe_key_key" ON "email_deliveries"("dedupe_key");
