-- NR-M2 completes the immutable interview time policy snapshot.
-- Existing sessions remain nullable and are validated as legacy or incomplete.

ALTER TABLE "interview_sessions"
  ADD COLUMN "retry_allowed_snapshot" BOOLEAN;
