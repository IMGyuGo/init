import test from "node:test";
import assert from "node:assert/strict";
import { PrismaAiResultRepository } from "./prisma-ai-result.repository";
import { evaluateNcsTextDeterministically } from "./ncs-text-evaluator";

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

test("PrismaAiResultRepository creates one idempotent resume-question job per input snapshot", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  let batch: any = null;
  const document = {
    documentId: BigInt(7),
    documentType: "RESUME",
    parseStatus: "EXTRACTED",
    extractedText: "PRIVATE_RESUME_TEXT",
    application: {
      applicationId: BigInt(101),
      applicationStatus: "SUBMITTED",
      submittedAt: new Date("2026-07-14T00:00:00.000Z"),
      posting: {
        postingId: BigInt(1),
        jobDescription: "NestJS와 PostgreSQL 기반 백엔드 개발",
        questionGenerationPolicy: {
          evaluationFramework: "NCS_3_PROFILE_V1",
          jdCriteriaQuestionCount: 3,
          resumeQuestionCount: 3,
          policyVersion: 2,
          criteriaVersion: 4,
        },
        criteria: [
          ncsCriterion(1, "문제해결능력", "PROBLEM_SOLVING", "EXPERIENCE_BEHAVIOR"),
          ncsCriterion(2, "의사소통능력", "COMMUNICATION", "EXPERIENCE_BEHAVIOR"),
          ncsCriterion(3, "디지털역량", "DIGITAL", "TECHNICAL_KNOWLEDGE"),
        ],
      },
    },
  };
  const prisma: any = {
    applicationDocument: {
      async updateMany(args: any) {
        calls.push({ model: "applicationDocument", method: "updateMany", args });
      },
      async findUnique(args: any) {
        calls.push({ model: "applicationDocument", method: "findUnique", args });
        return document;
      },
    },
    applicationInterviewQuestionBatch: {
      async updateMany(args: any) {
        calls.push({ model: "applicationInterviewQuestionBatch", method: "updateMany", args });
      },
      async findUnique(args: any) {
        calls.push({ model: "applicationInterviewQuestionBatch", method: "findUnique", args });
        return batch;
      },
      async create(args: any) {
        calls.push({ model: "applicationInterviewQuestionBatch", method: "create", args });
        batch = {
          batchId: BigInt(701),
          applicationId: BigInt(101),
          latestProcessLogId: BigInt(901),
          status: "GENERATING",
          ...args.data,
        };
        return batch;
      },
    },
    aiProcessLog: {
      async create(args: any) {
        calls.push({ model: "aiProcessLog", method: "create", args });
        return { processLogId: BigInt(901) };
      },
      async update(args: any) {
        calls.push({ model: "aiProcessLog", method: "update", args });
      },
    },
  };
  prisma.$transaction = async (operation: (transaction: unknown) => Promise<unknown>) => operation(prisma);
  const repository = new PrismaAiResultRepository(prisma);
  const extraction = {
    documentId: 7,
    fileId: 9,
    s3Key: "candidate/1/resume.pdf",
    extractedText: "PRIVATE_RESUME_TEXT",
  };

  const firstJobs = await repository.saveDocumentExtraction(extraction);
  const duplicateJobs = await repository.saveDocumentExtraction(extraction);

  assert.equal(firstJobs.length, 1);
  assert.equal(firstJobs[0].processType, "RESUME_QUESTION_GENERATE");
  assert.equal(firstJobs[0].inputRef.includes("PRIVATE_RESUME_TEXT"), false);
  assert.equal(firstJobs[0].inputRef.includes("NestJS와 PostgreSQL"), false);
  assert.equal(duplicateJobs.length, 0);
  assert.equal(calls.filter((call) => call.model === "aiProcessLog" && call.method === "create").length, 1);
  assert.equal(calls.filter((call) => call.model === "applicationInterviewQuestionBatch" && call.method === "create").length, 1);
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

test("PrismaAiResultRepository stores an insufficient NCS answer without creating a report score", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));
  const output = evaluateNcsTextDeterministically({
    questionMode: "TECHNICAL_KNOWLEDGE",
    question: "Redis 장애 위험과 검증 방법을 설명해 주세요.",
    answerText: "잘 모르겠습니다.",
    profileIds: ["digital"],
  });

  await repository.saveReportScoresAndEvidences({
    reportId: 30,
    scores: [],
    ncsAnswerEvaluations: [
      {
        reportId: 30,
        answerId: 10,
        sessionQuestionId: 501,
        criterionId: 3,
        criterionTitleSnapshot: "디지털역량",
        ncsProfileId: "JOB_TECHNICAL",
        ncsQuestionMode: "TECHNICAL_KNOWLEDGE",
        ncsProfileVersion: "2025.12-v1",
        output,
        question: "Redis 장애 위험과 검증 방법을 설명해 주세요.",
        behaviorPoints: null,
        logicPoints: null,
        baseScore: null,
        effectiveScore: null,
        followUpApplied: false,
        evidences: [],
      },
    ],
  });

  assert.equal(output.scoreStatus, "INSUFFICIENT_INPUT");
  assert.equal(calls.filter((call) => call.model === "reportScore" && call.method === "create").length, 0);
  const created = calls.find((call) => call.model === "ncsAnswerEvaluation" && call.method === "create");
  assert.equal(created?.args.data.scoreStatus, "INSUFFICIENT_INPUT");
  assert.equal(created?.args.data.ncsProfileId, "JOB_TECHNICAL");
  assert.equal(created?.args.data.competencyScore, null);
  assert.equal(created?.args.data.evidenceScore, null);
  assert.equal(created?.args.data.totalScore, null);
  assert.equal(created?.args.data.behaviorPoints, null);
  assert.equal(created?.args.data.logicPoints, null);
  assert.equal(created?.args.data.baseScore, null);
  assert.equal(created?.args.data.effectiveScore, null);
  assert.equal(created?.args.data.followUpApplied, false);
  assert.deepEqual(created?.args.data.evidences.create, []);
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

test("PrismaAiResultRepository stores NCS decision header and normalized profile scores", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveGeneratedReport({
    reportId: 30,
    reportType: "RECRUITING_REPORT",
    applicationId: 22,
    sessionId: 65,
    summary: "NCS evaluation completed",
    totalScore: 83,
    scores: [],
    questionEvaluations: [],
    ncsFinalEvaluation: {
      scoringVersion: "NCS_RECRUITING_SCORING_V1",
      decisionPolicyVersion: "NCS_INCOMPLETE_AS_FAIL_DEMO_V1",
      completionStatus: "COMPLETE",
      thresholdResult: "MEETS_THRESHOLD",
      aiDecision: "PASS",
      decisionReasonCode: "THRESHOLD_MET",
      totalScore: 83,
      profiles: [
        finalProfile("JOB_TECHNICAL", 1, "기술·직무", 4.5, 30, 27),
        finalProfile("COLLABORATION_COMMUNICATION", 2, "협업·의사소통", 4, 30, 24),
        finalProfile("PROBLEM_SOLVING", 3, "문제 해결력", 4, 40, 32),
      ],
      incompleteReasons: [],
    },
  });

  const reportUpsert = calls.find((call) => call.model === "evaluationReport" && call.method === "upsert");
  assert.equal(reportUpsert?.args.create.applicationId, BigInt(22));
  assert.equal(reportUpsert?.args.create.sessionId, BigInt(65));
  assert.equal(reportUpsert?.args.update.ncsThresholdResult, "MEETS_THRESHOLD");
  assert.equal(reportUpsert?.args.update.ncsAiDecision, "PASS");
  assert.equal(reportUpsert?.args.update.ncsSummaryJson.schemaVersion, "ncs-report-evaluation-output-v1");
  const profileRows = calls.filter((call) =>
    call.model === "reportScore" && call.method === "create" && call.args.data.ncsProfileId,
  );
  assert.equal(profileRows.length, 3);
  assert.equal(profileRows[0]?.args.data.averageScore, 4.5);
  assert.equal(profileRows[2]?.args.data.weightedScore, 32);
});

test("PrismaAiResultRepository marks recruiting application report completed with generated report", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.saveGeneratedReport({
    reportId: 30,
    reportType: "RECRUITING_REPORT",
    applicationId: 22,
    sessionId: 65,
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

  const applicationUpdate = calls.find((call) => call.model === "application" && call.method === "updateMany");
  assert.deepEqual(applicationUpdate?.args.where, { applicationId: BigInt(22) });
  assert.deepEqual(applicationUpdate?.args.data, { reportStatus: "COMPLETED" });
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

test("PrismaAiResultRepository marks recruiting application report failed with generated report failure", async () => {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const repository = new PrismaAiResultRepository(fakePrisma(calls));

  await repository.markReportFailed({
    reportId: 30,
    reportType: "RECRUITING_REPORT",
    applicationId: 22,
    sessionId: 65,
    failureCategory: "RETRYABLE",
    failureReason: "provider timeout"
  });

  const applicationUpdate = calls.find((call) => call.model === "application" && call.method === "updateMany");
  assert.deepEqual(applicationUpdate?.args.where, { applicationId: BigInt(22) });
  assert.deepEqual(applicationUpdate?.args.data, { reportStatus: "FAILED" });
});

function fakePrisma(calls: Array<{ model: string; method: string; args: any }>) {
  return {
    application: {
      async updateMany(args: any) {
        calls.push({ model: "application", method: "updateMany", args });
      }
    },
    applicationDocument: {
      async updateMany(args: any) {
        calls.push({ model: "applicationDocument", method: "updateMany", args });
      },
      async findUnique(args: any) {
        calls.push({ model: "applicationDocument", method: "findUnique", args });
        return null;
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
    ncsAnswerEvaluation: {
      async deleteMany(args: any) {
        calls.push({ model: "ncsAnswerEvaluation", method: "deleteMany", args });
      },
      async create(args: any) {
        calls.push({ model: "ncsAnswerEvaluation", method: "create", args });
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

function ncsCriterion(
  criterionId: number,
  name: string,
  ncsProfileId: string,
  ncsQuestionMode: string,
) {
  return {
    criterionId: BigInt(criterionId),
    description: `${name} 설명`,
    sortOrder: criterionId,
    ncsProfileId,
    ncsQuestionMode,
    ncsProfileVersion: "2025.12-v1",
    tag: { name, category: "NCS" },
  };
}

function finalProfile(
  ncsProfileId: "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING",
  profileOrder: 1 | 2 | 3,
  displayName: string,
  averageScore: number,
  weight: number,
  weightedScore: number,
) {
  return {
    ncsProfileId,
    profileOrder,
    displayName,
    criterionId: profileOrder,
    criterionTitleSnapshot: displayName,
    status: "SCORED" as const,
    averageScore,
    normalizedScore: Math.round(averageScore * 20),
    weight,
    weightedScore,
    minimumAverageScore: 3,
    assignedQuestionCount: 2,
    validQuestionCount: 2,
    requiredQuestionCount: 2,
  };
}
