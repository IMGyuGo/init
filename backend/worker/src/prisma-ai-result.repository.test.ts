import test from "node:test";
import assert from "node:assert/strict";
import { PrismaAiResultRepository } from "./prisma-ai-result.repository";

test("PrismaAiResultRepository stores document extraction into application_documents", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveDocumentExtraction({
    documentId: 7,
    fileId: 9,
    s3Key: "candidate/1/resume.pdf",
    extractedText: "parsed resume text"
  });

  assert.deepEqual(calls[0], {
    model: "applicationDocument",
    method: "updateMany",
    args: {
      where: {
        documentId: BigInt(7),
        fileId: BigInt(9),
        parseStatus: { not: "EXTRACTED" }
      },
      data: {
        parseStatus: "EXTRACTED",
        extractedText: "parsed resume text"
      }
    }
  });
});

test("PrismaAiResultRepository marks document extraction started and failed", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.markDocumentExtractionStarted({ documentId: 7, fileId: 9 });
  await repository.markDocumentExtractionFailed({ documentId: 7, fileId: 9 });

  assert.deepEqual(calls[0], {
    model: "applicationDocument",
    method: "updateMany",
    args: {
      where: {
        documentId: BigInt(7),
        fileId: BigInt(9),
        parseStatus: { not: "EXTRACTED" }
      },
      data: { parseStatus: "EXTRACTING" }
    }
  });
  assert.deepEqual(calls[1], {
    model: "applicationDocument",
    method: "updateMany",
    args: {
      where: {
        documentId: BigInt(7),
        fileId: BigInt(9),
        parseStatus: { not: "EXTRACTED" }
      },
      data: { parseStatus: "FAILED" }
    }
  });
});

test("PrismaAiResultRepository stores STT transcript into interview_answers", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveTranscript({
    answerId: 42,
    audioFileId: 11,
    audioS3Key: "candidate/1/answer-42.wav",
    transcript: "hello"
  });

  assert.deepEqual(calls[0], {
    model: "interviewAnswer",
    method: "updateMany",
    args: {
      where: {
        answerId: BigInt(42),
        AND: [
          { OR: [{ audioFileId: BigInt(11) }, { videoFileId: BigInt(11) }] },
          { OR: [{ transcript: null }, { transcript: "" }] }
        ]
      },
      data: {
        transcript: "hello"
      }
    }
  });
});

test("PrismaAiResultRepository upserts one follow-up per answer and policy", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveFollowUpQuestion({
    sessionId: 3,
    answerId: 4,
    content: "Practice follow-up",
    policy: "MOCK"
  });

  assert.equal(calls[0].model, "followUpQuestion");
  assert.equal(calls[0].method, "upsert");
  assert.deepEqual(calls[0].args.where, {
    answerIdPolicy: {
      answerId: BigInt(4),
      policy: "MOCK"
    }
  });
  assert.equal(calls[0].args.create.generationStatus, "GENERATED");
  assert.deepEqual(calls[0].args.update, {});
});

test("PrismaAiResultRepository upserts embeddings by source_type and source_text_hash", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  const embedding = await repository.upsertEmbedding({
    sourceType: "APPLICATION_DOCUMENT",
    sourceText: "same text",
    embeddingModel: "text-embedding-3-small",
    embeddingDimension: 1536
  });

  assert.equal(calls[0].model, "embedding");
  assert.equal(calls[0].method, "upsert");
  assert.equal(calls[0].args.where.sourceTypeSourceTextHash.sourceType, "APPLICATION_DOCUMENT");
  assert.equal(calls[0].args.create.embeddingVector, "[]");
  assert.equal(embedding.sourceTextHash, calls[0].args.where.sourceTypeSourceTextHash.sourceTextHash);
});

test("PrismaAiResultRepository leaves generated draft output on the original process log", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveGeneratedDraft({
    kind: "QUESTION_GENERATE",
    sourceProcessLogId: 14,
    items: ["Question 1"],
    reviewRequired: true,
    reviewStatus: "PENDING_REVIEW",
    targetTables: ["question_bank"],
    postingId: 2
  });

  assert.deepEqual(calls, []);
});

test("PrismaAiResultRepository stores report scores without completing a report", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveReportScoresAndEvidences({
    reportId: 30,
    scores: [
      {
        criterionId: 1,
        criterionName: "Problem solving",
        score: 82,
        rationale: "evidence-based score",
        rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
        confidence: "MEDIUM",
        uncertaintyReasons: [],
        evidences: [{ sourceType: "INTERVIEW_ANSWER", answerId: 10, text: "answer evidence" }]
      }
    ]
  });

  assert.equal(calls[0].model, "reportEvidence");
  assert.equal(calls[0].method, "deleteMany");
  assert.deepEqual(calls[0].args.where, { score: { reportId: BigInt(30) } });
  assert.equal(calls[1].model, "reportScore");
  assert.equal(calls[1].method, "deleteMany");
  assert.equal(calls[2].model, "evaluationCriterion");
  assert.equal(calls[2].method, "findUnique");
  assert.equal(calls[3].model, "reportScore");
  assert.equal(calls[3].method, "create");
  assert.equal(calls.some((call) => call.model === "evaluationReport"), false);
});

test("PrismaAiResultRepository rejects scores without evidence before deleting existing scores", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await assert.rejects(
    () =>
      repository.saveReportScoresAndEvidences({
        reportId: 30,
        scores: [
          {
            criterionId: 1,
            criterionName: "Problem solving",
            score: 82,
            rationale: "evidence is missing",
            rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
            confidence: "MEDIUM",
            uncertaintyReasons: [],
            evidences: []
          }
        ]
      }),
    {
      name: "NonRetryableAiWorkerFailure",
      message: "evidence is required for criterion 1"
    }
  );
  assert.deepEqual(calls, []);
});

test("PrismaAiResultRepository rejects generated reports without evidence before completing the report", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await assert.rejects(
    () =>
      repository.saveGeneratedReport({
        reportId: 30,
        reportType: "RECRUITING_REPORT",
        summary: "summary",
        totalScore: 82,
        scores: [
          {
            criterionId: 1,
            criterionName: "Problem solving",
            score: 82,
            rationale: "evidence is missing",
            rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
            confidence: "MEDIUM",
            uncertaintyReasons: [],
            evidences: []
          }
        ],
        questionEvaluations: []
      }),
    {
      name: "NonRetryableAiWorkerFailure",
      message: "evidence is required for criterion 1"
    }
  );
  assert.deepEqual(calls, []);
});

test("PrismaAiResultRepository stores communication analysis only on process output", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveCommunicationAnalysis({
    processLogId: 32,
    reportId: 30,
    reportType: "RECRUITING_REPORT",
    analysis: {
      usage: "AUXILIARY_ONLY",
      mediaQuality: "LOW_AUDIO",
      metrics: { speechRate: "FAST" },
      notes: ["Communication metrics are auxiliary only."],
      decisionWeight: 0
    }
  });

  assert.equal(calls[0].model, "aiProcessLog");
  assert.equal(calls[0].method, "update");
  assert.deepEqual(calls[0].args.where, { processLogId: BigInt(32) });

  const output = JSON.parse(calls[0].args.data.outputRef);
  assert.equal(output.report.reportId, 30);
  assert.equal(output.communicationAnalysis.usage, "AUXILIARY_ONLY");
  assert.equal(output.communicationAnalysis.decisionWeight, 0);
  assert.equal(calls.some((call) => call.model === "reportScore"), false);
  assert.equal(calls.some((call) => call.model === "evaluationReport"), false);
});

test("PrismaAiResultRepository stores generated reports after guardrail pass", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveGeneratedReport({
    reportId: 30,
    reportType: "RECRUITING_REPORT",
    summary: "summary",
    totalScore: 82,
    scores: [
      {
        criterionId: 1,
        criterionName: "Problem solving",
        score: 82,
        rationale: "evidence-based score",
        rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
        confidence: "MEDIUM",
        uncertaintyReasons: [],
        evidences: [{ sourceType: "INTERVIEW_ANSWER", answerId: 10, text: "answer evidence" }]
      }
    ],
    questionEvaluations: [
      {
        criterionId: 1,
        criterionName: "Problem solving",
        answerId: 10,
        question: "Describe your Redis experience.",
        rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
        confidence: "MEDIUM",
        uncertaintyReasons: [],
        evidences: [{ sourceType: "INTERVIEW_ANSWER", answerId: 10, text: "answer evidence" }]
      }
    ]
  });

  assert.equal(calls[0].model, "evaluationReport");
  assert.equal(calls[0].method, "upsert");
  assert.equal(calls[0].args.update.status, "COMPLETED");
  assert.equal(calls[1].model, "reportEvidence");
  assert.equal(calls[1].method, "deleteMany");
  assert.equal(calls[2].model, "reportScore");
  assert.equal(calls[2].method, "deleteMany");
  assert.equal(calls[3].model, "evaluationCriterion");
  assert.equal(calls[3].method, "findUnique");
  assert.equal(calls[4].model, "reportScore");
  assert.equal(calls[4].method, "create");
  assert.equal(calls[4].args.data.evidences.create[0].sourceType, "INTERVIEW_ANSWER");
});

test("PrismaAiResultRepository marks generated reports failed with retryability", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.markReportFailed({
    reportId: 30,
    reportType: "MOCK_INTERVIEW_REPORT",
    failureCategory: "NON_RETRYABLE",
    failureReason: "guardrail blocked output"
  });

  assert.equal(calls[0].model, "evaluationReport");
  assert.equal(calls[0].method, "upsert");
  assert.equal(calls[0].args.update.status, "FAILED");
  assert.equal(calls[0].args.update.failureCategory, "NON_RETRYABLE");
});

function fakePrisma(calls: Array<{ model: string; method: string; args: any }>) {
  return {
    applicationDocument: {
      async updateMany(args: any) {
        calls.push({ model: "applicationDocument", method: "updateMany", args });
      }
    },
    interviewAnswer: {
      async updateMany(args: any) {
        calls.push({ model: "interviewAnswer", method: "updateMany", args });
      }
    },
    followUpQuestion: {
      async upsert(args: any) {
        calls.push({ model: "followUpQuestion", method: "upsert", args });
      }
    },
    evaluationReport: {
      async upsert(args: any) {
        calls.push({ model: "evaluationReport", method: "upsert", args });
      }
    },
    evaluationCriterion: {
      async findUnique(args: any) {
        calls.push({ model: "evaluationCriterion", method: "findUnique", args });
        return { criterionId: args.where.criterionId };
      }
    },
    reportScore: {
      async deleteMany(args: any) {
        calls.push({ model: "reportScore", method: "deleteMany", args });
      },
      async create(args: any) {
        calls.push({ model: "reportScore", method: "create", args });
      }
    },
    reportEvidence: {
      async deleteMany(args: any) {
        calls.push({ model: "reportEvidence", method: "deleteMany", args });
      }
    },
    embedding: {
      async upsert(args: any) {
        calls.push({ model: "embedding", method: "upsert", args });
        return {
          sourceType: args.create.sourceType,
          sourceTextHash: args.create.sourceTextHash,
          embeddingModel: args.create.embeddingModel,
          embeddingDimension: args.create.embeddingDimension,
          metadataJson: args.create.metadataJson
        };
      }
    },
    aiProcessLog: {
      async create(args: any) {
        calls.push({ model: "aiProcessLog", method: "create", args });
      },
      async update(args: any) {
        calls.push({ model: "aiProcessLog", method: "update", args });
      }
    }
  };
}
