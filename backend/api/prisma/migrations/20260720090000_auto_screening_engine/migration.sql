-- PostgreSQL requires a commit before a newly added enum value can be used.
-- Keep this enum extension in its own Prisma migration transaction.
ALTER TYPE "ScreeningDecision" ADD VALUE IF NOT EXISTS 'RETRY';
