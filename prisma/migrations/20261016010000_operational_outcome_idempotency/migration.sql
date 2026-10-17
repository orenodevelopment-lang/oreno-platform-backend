CREATE UNIQUE INDEX "background_job_outcomes_queue_job_id_key"
ON "background_job_outcomes"("queue", "job_id");
