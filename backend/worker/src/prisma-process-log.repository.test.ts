import test from "node:test";
import assert from "node:assert/strict";
import { PrismaAiProcessLogRepository } from "./prisma-process-log.repository";

test("PrismaAiProcessLogRepository writes process state transitions to ai_process_logs", async () => {
  const calls: Array<{ method: string; args: any }> = [];
  const records = new Map<bigint, any>();
  const prisma = {
    aiProcessLog: {
      async upsert(args: any) {
        calls.push({ method: "upsert", args });
        const id = args.where.processLogId;
        const existing = records.get(id);
        if (existing) {
          return existing;
        }
        const created = {
          ...args.create,
          outputRef: null,
          failureCategory: null,
          failureReason: null
        };
        records.set(id, created);
        return created;
      },
      async findUnique(args: any) {
        calls.push({ method: "findUnique", args });
        return records.get(args.where.processLogId) ?? null;
      },
      async update(args: any) {
        calls.push({ method: "update", args });
        const id = args.where.processLogId;
        const updated = {
          ...records.get(id),
          ...args.data
        };
        records.set(id, updated);
        return updated;
      },
      async updateMany(args: any) {
        calls.push({ method: "updateMany", args });
        const id = args.where.processLogId;
        const existing = records.get(id);
        if (!existing) return { count: 0 };
        records.set(id, { ...existing, ...args.data });
        return { count: 1 };
      }
    },
    aiGuardrailLog: {
      async create(args: any) {
        calls.push({ method: "guardrailCreate", args });
        return { guardrailLogId: args.data.guardrailLogId };
      }
    }
  };
  const repository = new PrismaAiProcessLogRepository(prisma);

  await repository.ensurePending({
    processLogId: 10,
    processType: "REPORT_GENERATE",
    inputRef: "report:10",
    attempt: 1
  });
  await repository.markRunning(10);
  const completed = await repository.markCompleted(10, "s3://reports/10.json");
  const guardrailLogId = await repository.saveGuardrailLog(10, "REPORT_FINAL_SAVE", {
    result: "PASS",
    reason: null
  });

  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.outputRef, "s3://reports/10.json");
  assert.equal(typeof guardrailLogId, "number");
  assert.deepEqual(
    calls.map((call) => call.method),
    ["upsert", "update", "findUnique", "update", "guardrailCreate"]
  );
  assert.equal(calls[1].args.data.status, "RUNNING");
  assert.equal(calls[3].args.data.status, "COMPLETED");
  assert.equal(calls[4].args.data.result, "PASS");
  assert.equal(calls[4].args.data.failureCategory, null);
});

test("PrismaAiProcessLogRepository records retryability on failed worker jobs", async () => {
  const records = new Map<bigint, any>();
  const prisma = {
    aiProcessLog: {
      async upsert(args: any) {
        const created = {
          ...args.create,
          outputRef: null,
          failureCategory: null,
          failureReason: null
        };
        records.set(args.where.processLogId, created);
        return created;
      },
      async findUnique(args: any) {
        return records.get(args.where.processLogId) ?? null;
      },
      async update(args: any) {
        const id = args.where.processLogId;
        const updated = {
          ...records.get(id),
          ...args.data
        };
        records.set(id, updated);
        return updated;
      },
      async updateMany(args: any) {
        const id = args.where.processLogId;
        const existing = records.get(id);
        if (!existing) return { count: 0 };
        records.set(id, { ...existing, ...args.data });
        return { count: 1 };
      }
    },
    aiGuardrailLog: {
      async create(args: any) {
        return { guardrailLogId: args.data.guardrailLogId };
      }
    }
  };
  const repository = new PrismaAiProcessLogRepository(prisma);

  await repository.ensurePending({
    processLogId: 11,
    processType: "STT",
    inputRef: "answer:11",
    attempt: 1
  });
  const failed = await repository.markFailed(11, {
    category: "RETRYABLE",
    reason: "provider timeout for applicant@example.com transcript=private",
    retryable: true
  });

  assert.equal(failed.status, "FAILED");
  assert.deepEqual(failed.failure, {
    category: "RETRYABLE",
    reason: "Temporary AI processing failure.",
    retryable: true
  });
});

test("PrismaAiProcessLogRepository records guardrail retryability", async () => {
  let guardrailCreateArgs: any;
  const prisma = {
    aiProcessLog: {
      async upsert(args: any) {
        return {
          ...args.create,
          outputRef: null,
          failureCategory: null,
          failureReason: null
        };
      },
      async findUnique(_args: any) {
        return null;
      },
      async update(args: any) {
        return {
          processLogId: args.where.processLogId,
          processType: "REPORT_GENERATE",
          status: args.data.status,
          inputRef: "report:12",
          outputRef: null,
          failureCategory: args.data.failureCategory ?? null,
          failureReason: args.data.failureReason ?? null,
          leaseOwner: args.data.leaseOwner ?? null,
          leaseExpiresAt: args.data.leaseExpiresAt ?? null,
          startedAt: args.data.startedAt ?? null,
          completedAt: args.data.completedAt ?? null,
          durationMs: args.data.durationMs ?? null,
          modelName: args.data.modelName ?? null,
          inputTokens: args.data.inputTokens ?? null,
          outputTokens: args.data.outputTokens ?? null,
          audioSeconds: args.data.audioSeconds ?? null,
          estimatedCostUsd: args.data.estimatedCostUsd ?? null,
          costMetadataJson: args.data.costMetadataJson ?? null
        };
      },
      async updateMany(_args: any) {
        return { count: 0 };
      }
    },
    aiGuardrailLog: {
      async create(args: any) {
        guardrailCreateArgs = args;
        return { guardrailLogId: args.data.guardrailLogId };
      }
    }
  };
  const repository = new PrismaAiProcessLogRepository(prisma);

  await repository.saveGuardrailLog(12, "REPORT_FINAL_SAVE", {
    result: "BLOCKED",
    reason: "unsafe report wording"
  });

  assert.equal(guardrailCreateArgs.data.result, "BLOCKED");
  assert.equal(guardrailCreateArgs.data.failureCategory, "NON_RETRYABLE");
});

test("PrismaAiProcessLogRepository atomically claims and renews an AI process lease", async () => {
  const records = new Map<bigint, any>();
  const updateManyCalls: any[] = [];
  const prisma = {
    aiProcessLog: {
      async upsert(args: any) {
        const id = args.where.processLogId;
        const existing = records.get(id);
        if (existing) return existing;
        const created = {
          ...args.create,
          outputRef: null,
          failureCategory: null,
          failureReason: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          modelName: null,
          inputTokens: null,
          outputTokens: null,
          audioSeconds: null,
          estimatedCostUsd: null,
          costMetadataJson: null,
        };
        records.set(id, created);
        return created;
      },
      async findUnique(args: any) {
        return records.get(args.where.processLogId) ?? null;
      },
      async update(args: any) {
        const id = args.where.processLogId;
        const updated = { ...records.get(id), ...args.data };
        records.set(id, updated);
        return updated;
      },
      async updateMany(args: any) {
        updateManyCalls.push(args);
        const id = args.where.processLogId;
        const existing = records.get(id);
        if (!existing) return { count: 0 };
        records.set(id, { ...existing, ...args.data });
        return { count: 1 };
      },
    },
    aiGuardrailLog: {
      async create(args: any) {
        return { guardrailLogId: args.data.guardrailLogId };
      },
    },
  };
  const repository = new PrismaAiProcessLogRepository(prisma);
  const leaseExpiresAt = new Date("2026-07-16T12:00:00.000Z");

  const claim = await repository.claim({
    processLogId: 21,
    processType: "QUESTION_GENERATE",
    inputRef: "question:21",
    attempt: 1,
  }, "worker-a:message-21", leaseExpiresAt);
  const renewed = await repository.renewClaim(21, "worker-a:message-21", new Date("2026-07-16T12:05:00.000Z"));

  assert.equal(claim.status, "CLAIMED");
  assert.equal(claim.snapshot.leaseOwner, "worker-a:message-21");
  assert.equal(renewed, true);
  assert.equal(updateManyCalls[0].where.attemptCount, 1);
  assert.deepEqual(updateManyCalls[0].where.OR, [
    { status: "PENDING" },
    {
      status: "FAILED",
      failureCategory: { in: ["RETRYABLE", "STT_RETRYABLE"] },
      attemptCount: { lt: 3 },
      nextRetryAt: { lte: updateManyCalls[0].where.OR[1].nextRetryAt.lte },
    },
    { status: "RUNNING", leaseExpiresAt: null },
    { status: "RUNNING", leaseExpiresAt: { lte: updateManyCalls[0].where.OR[3].leaseExpiresAt.lte } },
  ]);
  assert.deepEqual(updateManyCalls[1].where, {
    processLogId: BigInt(21),
    status: "RUNNING",
    leaseOwner: "worker-a:message-21",
  });
});

test("PrismaAiProcessLogRepository finds stale recoverable report and resume-question jobs", async () => {
  let findManyArgs: any;
  const prisma = {
    aiProcessLog: {
      async findMany(args: any) {
        findManyArgs = args;
        return [{
          processLogId: BigInt(41),
          processType: "RESUME_QUESTION_GENERATE",
          inputRef: JSON.stringify({ applicationId: 206, attempt: 3 }),
        }];
      },
      async upsert(_args: any) { throw new Error("not used"); },
      async findUnique(_args: any) { return null; },
      async update(_args: any) { throw new Error("not used"); },
      async updateMany(_args: any) { return { count: 0 }; },
    },
    aiGuardrailLog: {
      async create(_args: any) { return { guardrailLogId: BigInt(1) }; },
    },
  };
  const repository = new PrismaAiProcessLogRepository(prisma);
  const createdBefore = new Date("2026-07-18T03:35:00.000Z");

  const jobs = await repository.findOrphanedPendingJobs(createdBefore, 5);

  assert.deepEqual(findManyArgs.where, {
    createdAt: { lte: createdBefore },
    inputRef: { not: null },
    OR: [
      {
        status: "PENDING",
        processType: "REPORT_GENERATE",
      },
      {
        status: "PENDING",
        processType: "RESUME_QUESTION_GENERATE",
        latestResumeQuestionBatches: { some: { status: "GENERATING" } },
      },
      {
        status: "FAILED",
        processType: { in: ["REPORT_GENERATE", "RESUME_QUESTION_GENERATE"] },
        failureCategory: { in: ["RETRYABLE", "STT_RETRYABLE"] },
        attemptCount: { lt: 3 },
        nextRetryAt: { lte: findManyArgs.where.OR[2].nextRetryAt.lte },
      },
    ],
  });
  assert.ok(findManyArgs.where.OR[2].nextRetryAt.lte instanceof Date);
  assert.deepEqual(jobs, [{
    processLogId: 41,
    processType: "RESUME_QUESTION_GENERATE",
    inputRef: JSON.stringify({ applicationId: 206, attempt: 3 }),
    attempt: 3,
  }]);
});
