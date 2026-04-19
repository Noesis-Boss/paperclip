-- Add diagnostic retry tracking to heartbeat_runs
-- Allows the heartbeat service to automatically retry failed runs with a diagnostic agent
-- before giving up, improving resilience of long-running agent jobs.
ALTER TABLE "heartbeat_runs" ADD COLUMN IF NOT EXISTS "diagnostic_retry_count" integer NOT NULL DEFAULT 0;
