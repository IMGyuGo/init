import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import { MockAiTaskHandler } from "./mock-ai-task.handler";
import { InMemoryAiProcessLogRepository } from "./process-log.repository";
import { InMemoryAiJobQueue } from "./queue";
import { createDocumentExtractionStartHandler, createReportFailureHandler } from "./report-failure.handler";
import { SttProvider } from "./stt-provider";
import { AiWorkerRunner } from "./worker-runner";
import { AiProcessType, AiQueueMessage } from "./worker.types";

test("document extraction uses S3 reference and does not persist raw file content", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(10, "DOCUMENT_EXTRACT", {
      kind: "DOCUMENT_EXTRACT",
      payload: {
        documentId: 7,
        fileId: 9,
        s3Key: "candidate/1/resume.pdf"
      }
    })
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results), {
    onStart: createDocumentExtractionStartHandler(results),
    onFailure: createReportFailureHandler(results)
  }).processBatch();

  assert.deepEqual(results.documentExtractions, [
    {
      documentId: 7,
      fileId: 9,
      s3Key: "candidate/1/resume.pdf",
      extractedText: "Extracted text from candidate/1/resume.pdf"
    }
  ]);
  const output = JSON.parse(repository.get(10).outputRef ?? "{}") as {
    fileAsset?: { fileId?: number; storageKey?: string };
  };
  assert.equal(output.fileAsset?.fileId, 9);
  assert.equal(output.fileAsset?.storageKey, "candidate/1/resume.pdf");
  assert.equal("fileContent" in results.documentExtractions[0], false);
  assert.equal(results.documentParseStatuses.get(7), "EXTRACTED");
  assert.deepEqual(
    results.documentParseStatusEvents.map((event) => event.status),
    ["EXTRACTING", "EXTRACTED"]
  );
  assert.deepEqual(
    results.documentParseStatusEvents.map((event) => event.fileId),
    [9, 9]
  );
});

test("document extraction marks application document failed when input is invalid", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(24, "DOCUMENT_EXTRACT", {
      kind: "DOCUMENT_EXTRACT",
      payload: {
        documentId: 7,
        fileId: 9,
        s3Key: "candidate/1/resume.pdf",
        fileContent: "raw pdf bytes must not be here"
      }
    })
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results), {
    onStart: createDocumentExtractionStartHandler(results),
    onFailure: createReportFailureHandler(results)
  }).processBatch();

  assert.equal(repository.get(24).status, "FAILED");
  assert.equal(repository.get(24).failure?.category, "NON_RETRYABLE");
  assert.equal(results.documentParseStatuses.get(7), "FAILED");
  assert.deepEqual(
    results.documentParseStatusEvents.map((event) => event.status),
    ["EXTRACTING", "FAILED"]
  );
  assert.deepEqual(
    results.documentParseStatusEvents.map((event) => event.fileId),
    [9, 9]
  );
});

test("duplicate document extraction keeps the completed result", async () => {
  const results = new InMemoryAiResultRepository();

  await runDocumentExtraction({
    processLogId: 25,
    input: {
      kind: "DOCUMENT_EXTRACT",
      payload: {
        documentId: 7,
        fileId: 9,
        s3Key: "candidate/1/resume-first.pdf"
      }
    },
    results
  });

  await runDocumentExtraction({
    processLogId: 26,
    input: {
      kind: "DOCUMENT_EXTRACT",
      payload: {
        documentId: 7,
        fileId: 9,
        s3Key: "candidate/1/resume-second.pdf"
      }
    },
    results
  });

  assert.equal(results.documentExtractions.length, 1);
  assert.equal(results.documentExtractions[0].s3Key, "candidate/1/resume-first.pdf");
  assert.equal(results.documentParseStatuses.get(7), "EXTRACTED");
  assert.deepEqual(
    results.documentParseStatusEvents.map((event) => event.status),
    ["EXTRACTING", "EXTRACTED"]
  );
  assert.deepEqual(
    results.documentParseStatusEvents.map((event) => event.fileId),
    [9, 9]
  );
});

test("STT stores transcript against the target interview answer", async () => {
  const results = new InMemoryAiResultRepository();

  const repository = await run({
    processLogId: 11,
    processType: "STT",
    input: {
      kind: "MOCK_INTERVIEW_STT",
      payload: {
        answerId: 42,
        audioFileId: 11,
        audioS3Key: "candidate/1/answer-42.wav"
      }
    },
    results
  });

  assert.deepEqual(results.transcripts, [
    {
      answerId: 42,
      audioFileId: 11,
      audioS3Key: "candidate/1/answer-42.wav",
      transcript: "Transcript generated from candidate/1/answer-42.wav"
    }
  ]);
  const output = JSON.parse(repository.get(11).outputRef ?? "{}") as {
    fileAsset?: { fileId?: number; storageKey?: string };
    transcriptTarget?: string;
    dedupeKey?: string;
    duplicatePolicy?: string;
  };
  assert.equal(output.fileAsset?.fileId, 11);
  assert.equal(output.fileAsset?.storageKey, "candidate/1/answer-42.wav");
  assert.equal(output.transcriptTarget, "interview_answers.transcript");
  assert.equal(output.dedupeKey, "answer:42:transcript");
  assert.equal(output.duplicatePolicy, "KEEP_EXISTING_TRANSCRIPT");
});

test("STT stores transcript returned by the configured STT provider", async () => {
  const results = new InMemoryAiResultRepository();
  const sttProvider: SttProvider = {
    transcribe: async (input) => ({
      transcript: `provider transcript for ${input.audioS3Key}`,
      transcriptSource: "OPENAI_AUDIO_TRANSCRIPTION",
      model: "test-stt-model"
    })
  };

  const repository = await run({
    processLogId: 111,
    processType: "STT",
    input: {
      kind: "RECRUITING_INTERVIEW_STT",
      payload: {
        answerId: 42,
        audioFileId: 11,
        audioS3Key: "candidate/1/answer-42.wav",
        transcript: "This payload value must not be trusted by the STT worker."
      }
    },
    results,
    sttProvider
  });

  assert.deepEqual(results.transcripts, [
    {
      answerId: 42,
      audioFileId: 11,
      audioS3Key: "candidate/1/answer-42.wav",
      transcript: "provider transcript for candidate/1/answer-42.wav"
    }
  ]);
  const output = JSON.parse(repository.get(111).outputRef ?? "{}");
  assert.equal(output.transcriptSource, "OPENAI_AUDIO_TRANSCRIPTION");
  assert.equal(output.model, "test-stt-model");
});

test("duplicate STT requests keep the existing transcript result", async () => {
  const results = new InMemoryAiResultRepository();

  const firstRepository = await run({
    processLogId: 18,
    processType: "STT",
    input: {
      kind: "MOCK_INTERVIEW_STT",
      payload: {
        answerId: 42,
        audioFileId: 11,
        audioS3Key: "candidate/1/answer-42-first.wav"
      }
    },
    results
  });

  const secondRepository = await run({
    processLogId: 19,
    processType: "STT",
    input: {
      kind: "MOCK_INTERVIEW_STT",
      payload: {
        answerId: 42,
        audioFileId: 11,
        audioS3Key: "candidate/1/answer-42-second.wav"
      }
    },
    results
  });

  assert.equal(results.transcripts.length, 1);
  assert.deepEqual(results.transcripts[0], {
    answerId: 42,
    audioFileId: 11,
    audioS3Key: "candidate/1/answer-42-first.wav",
    transcript: "Transcript generated from candidate/1/answer-42-first.wav"
  });
  assert.equal(JSON.parse(firstRepository.get(18).outputRef ?? "{}").duplicatePolicy, "KEEP_EXISTING_TRANSCRIPT");
  assert.equal(JSON.parse(secondRepository.get(19).outputRef ?? "{}").duplicatePolicy, "KEEP_EXISTING_TRANSCRIPT");
});

test("STT failure records failed process status and reason", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(34, "STT", {
      kind: "MOCK_INTERVIEW_STT",
      payload: {
        answerId: 42,
        audioS3Key: "candidate/1/answer-42.wav"
      }
    })
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results)).processBatch();

  assert.equal(repository.get(34).status, "FAILED");
  assert.deepEqual(repository.get(34).failure, {
    category: "NON_RETRYABLE",
    reason: "audioFileId must be a positive integer",
    retryable: false
  });
  assert.deepEqual(results.transcripts, []);
});

test("follow-up question policy is separated for mock and recruiting interviews", async () => {
  const results = new InMemoryAiResultRepository();

  await run({
    processLogId: 12,
    processType: "FOLLOW_UP",
    input: {
      kind: "MOCK_FOLLOW_UP",
      payload: {
        sessionId: 3,
        answerId: 4,
        previousQuestion: "How did you use Redis?",
        transcript: "I used Redis cache invalidation."
      }
    },
    results
  });

  await run({
    processLogId: 13,
    processType: "FOLLOW_UP",
    input: {
      kind: "RECRUITING_FOLLOW_UP",
      payload: {
        sessionId: 5,
        answerId: 6,
        previousQuestion: "How did you use Redis?",
        transcript: "I used Redis cache invalidation.",
        jobDescription: "Backend engineer with Redis operations.",
        documentSummary: "Candidate operated production cache systems."
      }
    },
    results
  });

  assert.equal(results.followUpQuestions[0].policy, "MOCK");
  assert.match(results.followUpQuestions[0].content, /Redis/);
  assert.match(results.followUpQuestions[0].content, /구체적으로/);
  assert.equal(results.followUpQuestions[1].policy, "RECRUITING");
  assert.match(results.followUpQuestions[1].content, /캐시/);
  assert.match(results.followUpQuestions[1].content, /TTL/);
  assert.match(results.followUpQuestions[1].content, /효과/);
});

test("mock follow-up questions vary by previous question intent", async () => {
  const transcript =
    "NestJS와 PostgreSQL 프로젝트에서 답변 저장과 STT, 꼬리질문 연결 흐름을 구현했고 로그와 데이터 흐름으로 문제를 좁혔습니다.";
  const cases = [
    {
      processLogId: 40,
      previousQuestion: "자기소개와 현재 준비 중인 직무를 함께 설명해주세요.",
      expected: /주도적으로 맡았던 부분/,
    },
    {
      processLogId: 41,
      previousQuestion: "기술적으로 가장 신경 쓴 구현 경험을 설명해주세요.",
      expected: /설계 선택/,
    },
    {
      processLogId: 42,
      previousQuestion: "문제가 생겼을 때 어떻게 해결했는지 설명해주세요.",
      expected: /원인을 좁힌 순서/,
    },
  ];

  const generated = [];
  for (const item of cases) {
    const results = new InMemoryAiResultRepository();
    await run({
      processLogId: item.processLogId,
      processType: "FOLLOW_UP",
      input: {
        kind: "MOCK_FOLLOW_UP",
        payload: {
          sessionId: 3,
          answerId: item.processLogId,
          previousQuestion: item.previousQuestion,
          transcript,
        },
      },
      results,
    });

    const content = results.followUpQuestions[0]?.content ?? "";
    generated.push(content);
    assert.match(content, item.expected);
  }

  assert.equal(new Set(generated).size, cases.length);
});

test("duplicate follow-up requests keep one result per session, answer and policy", async () => {
  const results = new InMemoryAiResultRepository();
  const input = {
    kind: "MOCK_FOLLOW_UP",
    payload: {
      sessionId: 3,
      answerId: 4,
      previousQuestion: "How did you use Redis?",
      transcript: "I used Redis cache invalidation."
    }
  };

  const firstRepository = await run({ processLogId: 20, processType: "FOLLOW_UP", input, results });
  const secondRepository = await run({ processLogId: 21, processType: "FOLLOW_UP", input, results });

  assert.equal(results.followUpQuestions.length, 1);
  assert.equal(results.followUpQuestions[0].policy, "MOCK");
  assert.equal(JSON.parse(firstRepository.get(20).outputRef ?? "{}").dedupeKey, "MOCK:3:4");
  assert.equal(JSON.parse(firstRepository.get(20).outputRef ?? "{}").duplicatePolicy, "KEEP_EXISTING_FOLLOW_UP");
  assert.equal(JSON.parse(secondRepository.get(21).outputRef ?? "{}").dedupeKey, "MOCK:3:4");
  assert.equal(JSON.parse(secondRepository.get(21).outputRef ?? "{}").duplicatePolicy, "KEEP_EXISTING_FOLLOW_UP");
});

test("recruiting follow-up failure records missing JD or document context", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(35, "FOLLOW_UP", {
      kind: "RECRUITING_FOLLOW_UP",
      payload: {
        sessionId: 5,
        answerId: 6,
        previousQuestion: "How did you use Redis?",
        transcript: "I used Redis cache invalidation."
      }
    })
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results)).processBatch();

  assert.equal(repository.get(35).status, "FAILED");
  assert.deepEqual(repository.get(35).failure, {
    category: "NON_RETRYABLE",
    reason: "jobDescription or documentSummary is required",
    retryable: false
  });
  assert.deepEqual(results.followUpQuestions, []);
});

test("question generation stores review-required drafts after guardrail pass", async () => {
  const results = new InMemoryAiResultRepository();

  const repository = await run({
    processLogId: 14,
    processType: "QUESTION_GENERATE",
    input: {
      kind: "RECRUITING_QUESTION_GENERATE",
      payload: {
        postingId: 2,
        jobDescription: "Backend engineer with NestJS and PostgreSQL.",
        questionCount: 2
      }
    },
    results
  });

  assert.equal(results.generatedDrafts.length, 1);
  assert.equal(results.generatedDrafts[0].sourceProcessLogId, 14);
  assert.equal(results.generatedDrafts[0].reviewRequired, true);
  assert.equal(results.generatedDrafts[0].reviewStatus, "PENDING_REVIEW");
  assert.deepEqual(results.generatedDrafts[0].targetTables, ["question_bank"]);
  assert.deepEqual(results.generatedDrafts[0].items.length, 2);

  const output = JSON.parse(repository.get(14).outputRef ?? "{}") as {
    items?: string[];
    sourceProcessLogId?: number;
    reviewRequired?: boolean;
    reviewStatus?: string;
    targetTables?: string[];
    postingId?: number;
  };
  assert.equal(output.sourceProcessLogId, 14);
  assert.equal(output.reviewRequired, true);
  assert.equal(output.reviewStatus, "PENDING_REVIEW");
  assert.deepEqual(output.targetTables, ["question_bank"]);
  assert.equal(output.postingId, 2);
  assert.equal(output.items?.length, 2);
});

test("posting draft generation returns review-required posting draft without final save", async () => {
  const results = new InMemoryAiResultRepository();

  const repository = await run({
    processLogId: 36,
    processType: "POSTING_DRAFT_GENERATE",
    input: {
      kind: "POSTING_DRAFT_GENERATE",
      payload: {
        title: "2026 신입 백엔드 채용",
        jobRole: "Backend Developer",
        keywords: ["NestJS", "PostgreSQL", "Redis"],
        summary: "대용량 채용 플랫폼 API를 함께 설계하고 운영합니다.",
        careerRequirement: "신입 이상",
        employmentType: "정규직",
        workLocation: "서울"
      }
    },
    results
  });

  assert.equal(results.generatedDrafts.length, 1);
  assert.equal(results.generatedDrafts[0].kind, "POSTING_DRAFT_GENERATE");
  assert.equal(results.generatedDrafts[0].sourceProcessLogId, 36);
  assert.equal(results.generatedDrafts[0].reviewRequired, true);
  assert.equal(results.generatedDrafts[0].reviewStatus, "PENDING_REVIEW");
  assert.deepEqual(results.generatedDrafts[0].targetTables, ["postings"]);

  const output = JSON.parse(repository.get(36).outputRef ?? "{}") as {
    items?: string[];
    sourceProcessLogId?: number;
    reviewRequired?: boolean;
    reviewStatus?: string;
    targetTables?: string[];
    postingDraft?: {
      title?: string;
      jobRole?: string;
      sections?: Record<string, string>;
      tags?: string[];
    };
  };
  assert.equal(output.sourceProcessLogId, 36);
  assert.equal(output.reviewRequired, true);
  assert.equal(output.reviewStatus, "PENDING_REVIEW");
  assert.deepEqual(output.targetTables, ["postings"]);
  assert.equal(output.postingDraft?.title, "2026 신입 백엔드 채용");
  assert.equal(output.postingDraft?.jobRole, "Backend Developer");
  assert.match(output.postingDraft?.sections?.positionDetail ?? "", /Backend Developer/);
  assert.match(output.postingDraft?.sections?.responsibilities ?? "", /NestJS/);
  assert.deepEqual(output.postingDraft?.tags, ["NestJS", "PostgreSQL", "Redis"]);
  assert.deepEqual(output.items, ["포지션 상세", "주요 업무", "자격 요건", "우대 사항", "복지 및 혜택", "채용 절차"]);
});

test("criteria suggestion uses JD, talent profile and evaluation policy", async () => {
  const results = new InMemoryAiResultRepository();

  const repository = await run({
    processLogId: 28,
    processType: "CRITERIA_SUGGEST",
    input: {
      payload: {
        postingId: 2,
        jobDescription: "Backend engineer with NestJS and PostgreSQL.",
        talentProfile: "Pragmatic problem solver",
        evaluationPolicy: "Evidence-backed backend ownership"
      }
    },
    results
  });

  const output = JSON.parse(repository.get(28).outputRef ?? "{}") as {
    items?: string[];
    criteriaSuggestions?: Array<{
      title?: string;
      description?: string;
      suggestionReason?: string;
    }>;
    sourceProcessLogId?: number;
    reviewRequired?: boolean;
    reviewStatus?: string;
    targetTables?: string[];
    postingId?: number;
  };
  assert.equal(output.sourceProcessLogId, 28);
  assert.equal(output.reviewRequired, true);
  assert.equal(output.reviewStatus, "PENDING_REVIEW");
  assert.deepEqual(output.targetTables, ["criterion_tags", "evaluation_criteria"]);
  assert.equal(output.postingId, 2);
  assert.deepEqual(output.items, results.generatedDrafts[0].items);
  assert.equal(output.criteriaSuggestions?.length, 6);
  assert.deepEqual(output.items, ["직무 적합성", "문제 해결력", "실행력과 성과", "학습 민첩성", "커뮤니케이션", "성장 가능성"]);
  assert.match(
    output.criteriaSuggestions?.map((item) => `${item.description}\n${item.suggestionReason}`).join("\n") ?? "",
    /Pragmatic problem solver/,
  );
  assert.match(
    output.criteriaSuggestions?.map((item) => `${item.description}\n${item.suggestionReason}`).join("\n") ?? "",
    /Evidence-backed backend ownership/,
  );
});

test("question set generation reflects criteria and question type conditions", async () => {
  const results = new InMemoryAiResultRepository();

  const repository = await run({
    processLogId: 29,
    processType: "QUESTION_SET_GENERATE",
    input: {
      payload: {
        postingId: 2,
        questionCount: 2,
        criteria: [
          {
            criterionId: 1,
            name: "Problem solving",
            weight: 40
          }
        ],
        questionTypes: ["TECHNICAL", "EXPERIENCE"]
      }
    },
    results
  });

  const output = JSON.parse(repository.get(29).outputRef ?? "{}") as {
    items?: string[];
    questionCandidates?: unknown[];
    questionSetPreview?: unknown[];
    sourceProcessLogId?: number;
    reviewStatus?: string;
    targetTables?: string[];
    postingId?: number;
  };
  assert.equal(output.sourceProcessLogId, 29);
  assert.equal(output.reviewStatus, "PENDING_REVIEW");
  assert.deepEqual(output.targetTables, ["question_bank"]);
  assert.equal(output.postingId, 2);
  assert.deepEqual(output.items, ["TECHNICAL question 1 for Problem solving", "EXPERIENCE question 2 for Problem solving"]);
  assert.equal(output.questionCandidates?.length, 2);
  assert.equal(output.questionSetPreview?.length, 1);
});

test("evaluation context records every required source group", async () => {
  const results = new InMemoryAiResultRepository();

  const repository = await run({
    processLogId: 33,
    processType: "REPORT_GENERATE",
    input: {
      payload: {
        step: "EVALUATION_CONTEXT",
        reportId: 33,
        reportType: "RECRUITING_REPORT",
        company: {
          companyId: 1,
          name: "Init Corp"
        },
        posting: {
          postingId: 2,
          jobDescription: "Backend engineer with NestJS and PostgreSQL."
        },
        application: {
          applicationId: 3,
          candidateId: 4,
          documentText: "The candidate has worked on NestJS APIs."
        },
        criteria: [
          {
            criterionId: 1,
            name: "Problem solving",
            weight: 40
          }
        ],
        answers: [
          {
            answerId: 10,
            transcript: "I improved read performance with Redis cache."
          }
        ],
        manualEvaluations: [
          {
            reviewerUserId: 9,
            decision: "HOLD",
            memo: "Needs human review."
          }
        ]
      }
    },
    results
  });

  const output = JSON.parse(repository.get(33).outputRef ?? "{}") as {
    context?: {
      manualEvaluations?: unknown[];
    };
    inputSources?: {
      company?: boolean;
      posting?: boolean;
      criteriaCount?: number;
      application?: boolean;
      answersCount?: number;
      manualEvaluationCount?: number;
    };
  };
  assert.equal(output.inputSources?.company, true);
  assert.equal(output.inputSources?.posting, true);
  assert.equal(output.inputSources?.criteriaCount, 1);
  assert.equal(output.inputSources?.application, true);
  assert.equal(output.inputSources?.answersCount, 1);
  assert.equal(output.inputSources?.manualEvaluationCount, 1);
  assert.equal(output.context?.manualEvaluations?.length, 1);
});

test("answer evaluation step stores scores and evidences without completing the final report", async () => {
  const results = new InMemoryAiResultRepository();

  const repository = await run({
    processLogId: 27,
    processType: "REPORT_GENERATE",
    input: {
      payload: {
        step: "ANSWER_EVALUATION",
        reportId: 31,
        reportType: "RECRUITING_REPORT",
        criteria: [
          {
            criterionId: 1,
            name: "Problem solving",
            weight: 40
          }
        ],
        answers: [
          {
            answerId: 10,
            transcript: "I improved read performance with Redis cache and invalidation policies."
          }
        ],
        documentText: "The candidate has worked on NestJS APIs."
      }
    },
    results
  });

  const output = JSON.parse(repository.get(27).outputRef ?? "{}") as {
    scores?: unknown[];
    questionEvaluations?: unknown[];
    evidences?: unknown[];
    guardrail?: { result?: string };
  };
  assert.equal(output.guardrail?.result, "PASS");
  assert.equal(output.scores?.length, 1);
  assert.equal(output.questionEvaluations?.length, 1);
  assert.equal(output.evidences?.length, 2);
  assert.equal(results.reportScores.get(31)?.length, 1);
  assert.equal(results.generatedReports.has(31), false);
});

test("communication analysis is saved only as auxiliary report output", async () => {
  const results = new InMemoryAiResultRepository();

  const repository = await run({
    processLogId: 32,
    processType: "REPORT_GENERATE",
    input: {
      payload: {
        step: "COMMUNICATION_ANALYSIS",
        reportId: 32,
        reportType: "RECRUITING_REPORT",
        consentConfirmed: true,
        mediaQuality: "LOW_AUDIO",
        metrics: {
          speechRate: "FAST"
        },
        notes: ["Audio volume was unstable."]
      }
    },
    results
  });

  const saved = results.communicationAnalyses.get(32);
  const output = JSON.parse(repository.get(32).outputRef ?? "{}") as {
    communicationAnalysis?: {
      usage?: string;
      mediaQuality?: string;
      decisionWeight?: number;
    };
  };
  assert.equal(saved?.processLogId, 32);
  assert.equal(saved?.analysis.usage, "AUXILIARY_ONLY");
  assert.equal(saved?.analysis.decisionWeight, 0);
  assert.equal(output.communicationAnalysis?.usage, "AUXILIARY_ONLY");
  assert.equal(output.communicationAnalysis?.mediaQuality, "LOW_AUDIO");
  assert.equal(output.communicationAnalysis?.decisionWeight, 0);
  assert.equal(results.reportScores.has(32), false);
  assert.equal(results.generatedReports.has(32), false);
});

test("report generation stores scores and evidences after guardrail pass", async () => {
  const results = new InMemoryAiResultRepository();

  await run({
    processLogId: 22,
    processType: "REPORT_GENERATE",
    input: reportGenerateInput("RECRUITING_REPORT", "Redis cache evidence."),
    results
  });

  const report = results.generatedReports.get(30);
  assert.equal(report?.reportType, "RECRUITING_REPORT");
  assert.equal(report?.scores.length, 1);
  assert.equal(report?.questionEvaluations.length, 1);
  assert.equal(report?.scores[0].evidences.length, 2);
});

test("mock report generation applies nonverbal metadata as auxiliary practice signal", async () => {
  const results = new InMemoryAiResultRepository();

  await run({
    processLogId: 37,
    processType: "REPORT_GENERATE",
    input: {
      payload: {
        reportId: 37,
        reportType: "MOCK_INTERVIEW_REPORT",
        jobDescription: "Mock interview practice session",
        criteria: [
          {
            criterionId: 1,
            name: "Problem solving",
            weight: 40
          }
        ],
        answers: [
          {
            answerId: 10,
            question: "Describe a technical problem and how you solved it.",
            transcript:
              "I separated the upload request, server logs, database update, queue handoff, and worker result, then fixed the missing state update and verified the result with tests.",
            nonverbalMetadata: {
              cameraWarnings: 1,
              microphoneWarnings: 1,
              longSilenceCount: 1,
              shortAnswerCount: 1
            }
          }
        ]
      }
    },
    results
  });

  const report = results.generatedReports.get(37);
  const score = report?.scores[0];
  assert.equal(report?.reportType, "MOCK_INTERVIEW_REPORT");
  assert.ok((score?.score ?? 100) <= 74);
  assert.ok((score?.uncertaintyReasons.length ?? 0) >= 2);
});

test("recruiting report summarizes answer evidence while mock report keeps transcript evidence", async () => {
  const transcript = "I implemented NestJS APIs and confirmed the result with PostgreSQL query logs.";
  const recruitingResults = new InMemoryAiResultRepository();
  const mockResults = new InMemoryAiResultRepository();

  await run({
    processLogId: 35,
    processType: "REPORT_GENERATE",
    input: reportGenerateInput("RECRUITING_REPORT", transcript),
    results: recruitingResults
  });
  await run({
    processLogId: 36,
    processType: "REPORT_GENERATE",
    input: reportGenerateInput("MOCK_INTERVIEW_REPORT", transcript),
    results: mockResults
  });

  const recruitingEvidence = recruitingResults.generatedReports.get(30)?.scores[0]?.evidences[0]?.text ?? "";
  const mockEvidence = mockResults.generatedReports.get(30)?.scores[0]?.evidences[0]?.text ?? "";
  assert.match(recruitingEvidence, /답변 #10/);
  assert.doesNotMatch(recruitingEvidence, /I implemented NestJS APIs/);
  assert.match(recruitingResults.generatedReports.get(30)?.scores[0]?.rationale ?? "", /문제를 나누어 원인을 좁힌 과정/);
  assert.match(mockEvidence, /I implemented NestJS APIs/);
});

test("report generation uses temporary zero score when STT transcript is unavailable", async () => {
  const results = new InMemoryAiResultRepository();

  await run({
    processLogId: 34,
    processType: "REPORT_GENERATE",
    input: {
      payload: {
        reportId: 34,
        reportType: "MOCK_INTERVIEW_REPORT",
        jobDescription: "Mock interview practice session",
        criteria: [
          {
            criterionId: 1,
            name: "Communication",
            weight: 40
          }
        ],
        answers: [
          {
            answerId: 10,
            question: "Describe the project.",
            evaluationStatus: "STT_UNAVAILABLE",
            transcriptUnavailableReason: "STT failed because the audio file was unsupported."
          }
        ]
      }
    },
    results
  });

  const report = results.generatedReports.get(34);
  assert.equal(report?.reportType, "MOCK_INTERVIEW_REPORT");
  assert.equal(report?.totalScore, 0);
  assert.equal(report?.scores[0]?.score, 0);
  assert.equal(report?.scores[0]?.rubricAnchor, "STT_UNAVAILABLE_TEMP_ZERO");
  assert.match(report?.scores[0]?.rationale ?? "", /STT failed/);
  assert.equal(report?.questionEvaluations[0]?.answerId, 10);
});

test("mock report generation marks report failed when expression policy is blocked", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(23, "REPORT_GENERATE", reportGenerateInput("MOCK_INTERVIEW_REPORT", "합격 가능성이 높습니다."))
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results), {
    onFailure: createReportFailureHandler(results)
  }).processBatch();

  assert.equal(repository.get(23).status, "FAILED");
  assert.equal(results.generatedReports.has(30), false);
  assert.equal(results.failedReports.get(30)?.failureCategory, "NON_RETRYABLE");
});

test("mock report generation blocks Korean hiring decision expressions", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(30, "REPORT_GENERATE", reportGenerateInput("MOCK_INTERVIEW_REPORT", "합격 가능성이 높습니다."))
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results), {
    onFailure: createReportFailureHandler(results)
  }).processBatch();

  assert.equal(repository.get(30).status, "FAILED");
  assert.equal(repository.get(30).failure?.category, "NON_RETRYABLE");
  assert.equal(results.generatedReports.has(30), false);
});

test("mock interview generated output is not saved when expression policy is blocked", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(15, "FOLLOW_UP", {
      kind: "MOCK_FOLLOW_UP",
      payload: {
        sessionId: 3,
        answerId: 4,
        previousQuestion: "합격 가능성을 말해주세요.",
        transcript: "합격 가능성을 말해주세요."
      }
    })
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results)).processBatch();

  assert.equal(repository.get(15).status, "FAILED");
  assert.equal(repository.get(15).failure?.category, "NON_RETRYABLE");
  assert.equal(results.followUpQuestions.length, 0);
});

test("mock follow-up generation blocks Korean hiring decision expressions", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(31, "FOLLOW_UP", {
      kind: "MOCK_FOLLOW_UP",
      payload: {
        sessionId: 3,
        answerId: 4,
        previousQuestion: "합격 가능성을 말해주세요.",
        transcript: "합격 가능성을 말해주세요."
      }
    })
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results)).processBatch();

  assert.equal(repository.get(31).status, "FAILED");
  assert.equal(repository.get(31).failure?.category, "NON_RETRYABLE");
  assert.equal(results.followUpQuestions.length, 0);
});

test("embedding generation reuses source_text_hash and avoids duplicate records", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([
    message(16, "EMBEDDING", {
      payload: {
        sourceType: "APPLICATION_DOCUMENT",
        sourceText: "Same resume text",
        embeddingModel: "text-embedding-3-small",
        embeddingDimension: 1536
      }
    }),
    message(17, "EMBEDDING", {
      payload: {
        sourceType: "APPLICATION_DOCUMENT",
        sourceText: "Same resume text",
        embeddingModel: "text-embedding-3-small",
        embeddingDimension: 1536
      }
    })
  ]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results), {
    maxMessages: 2,
    guardrailPolicyName: "AI_WORKER_OUTPUT_VALIDATE"
  }).processBatch();

  assert.equal(results.embeddings.size, 1);
  assert.equal(repository.get(16).status, "COMPLETED");
  assert.equal(repository.get(17).status, "COMPLETED");
  assert.equal(repository.guardrailLogs.length, 2);
  assert.deepEqual(
    repository.guardrailLogs.map((log) => log.decision.result),
    ["PASS", "PASS"]
  );

  const firstOutput = JSON.parse(repository.get(16).outputRef ?? "{}") as {
    sourceTextHash?: string;
    dedupeKey?: string;
    duplicatePolicy?: string;
    targetTable?: string;
    sourceText?: string;
  };
  const secondOutput = JSON.parse(repository.get(17).outputRef ?? "{}") as typeof firstOutput;
  assert.equal(firstOutput.sourceTextHash, secondOutput.sourceTextHash);
  assert.equal(firstOutput.targetTable, "embeddings");
  assert.equal(firstOutput.duplicatePolicy, "UPSERT_BY_SOURCE_TEXT_HASH");
  assert.equal(firstOutput.dedupeKey, `embedding:APPLICATION_DOCUMENT:${firstOutput.sourceTextHash}`);
  assert.equal("sourceText" in firstOutput, false);
});

test("AI golden fixtures execute through the mock worker handler", async () => {
  const casesDir = goldenCasesDirectory();
  const files = readdirSync(casesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  assert.ok(files.length > 0);

  for (const [index, file] of files.entries()) {
    const golden = JSON.parse(readFileSync(resolve(casesDir, file), "utf8")) as {
      input: {
        type: AiProcessType;
        kind?: string;
        payload: Record<string, unknown>;
      };
      expected: {
        outputShape: Record<string, unknown>;
        guardrailResult?: string;
      };
    };
    const processLogId = 1000 + index;
    const results = new InMemoryAiResultRepository();
    const repository = new InMemoryAiProcessLogRepository();
    const queue = new InMemoryAiJobQueue([
      message(processLogId, golden.input.type, {
        kind: golden.input.kind,
        payload: golden.input.payload
      })
    ]);

    await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(results), {
      guardrailPolicyName: "AI_GOLDEN_VALIDATE"
    }).processBatch();

    const processLog = repository.get(processLogId);
    if (golden.expected.guardrailResult === "BLOCKED") {
      assert.equal(processLog.status, "FAILED", file);
      assert.equal(repository.guardrailLogs.at(-1)?.decision.result, "BLOCKED", file);
      continue;
    }

    assert.equal(processLog.status, "COMPLETED", file);
    const output = JSON.parse(processLog.outputRef ?? "{}") as Record<string, unknown>;
    assertOutputShape(file, output, golden.expected.outputShape);
  }
});

async function run(args: {
  processLogId: number;
  processType: AiProcessType;
  input: unknown;
  results: InMemoryAiResultRepository;
  sttProvider?: SttProvider;
}): Promise<InMemoryAiProcessLogRepository> {
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([message(args.processLogId, args.processType, args.input)]);

  await new AiWorkerRunner(
    queue,
    repository,
    new MockAiTaskHandler(args.results, { sttProvider: args.sttProvider })
  ).processBatch();

  assert.equal(repository.get(args.processLogId).status, "COMPLETED");
  return repository;
}

async function runDocumentExtraction(args: {
  processLogId: number;
  input: unknown;
  results: InMemoryAiResultRepository;
}): Promise<InMemoryAiProcessLogRepository> {
  const repository = new InMemoryAiProcessLogRepository();
  const queue = new InMemoryAiJobQueue([message(args.processLogId, "DOCUMENT_EXTRACT", args.input)]);

  await new AiWorkerRunner(queue, repository, new MockAiTaskHandler(args.results), {
    onStart: createDocumentExtractionStartHandler(args.results),
    onFailure: createReportFailureHandler(args.results)
  }).processBatch();

  assert.equal(repository.get(args.processLogId).status, "COMPLETED");
  return repository;
}

function goldenCasesDirectory(): string {
  const candidates = [
    resolve(process.cwd(), "../../docs/04_implementation/ai-golden"),
    resolve(process.cwd(), "docs/04_implementation/ai-golden")
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  assert.ok(found, "AI golden cases directory must exist");
  return found;
}

function assertOutputShape(file: string, output: Record<string, unknown>, outputShape: Record<string, unknown>): void {
  for (const [key, expected] of Object.entries(outputShape)) {
    const actual = key in output ? output[key] : nestedValue(output, key);

    if (expected === "array") {
      assert.ok(Array.isArray(actual), `${file}: ${key} must be an array`);
      continue;
    }

    if (["object", "string", "number"].includes(String(expected))) {
      assert.equal(typeof actual, expected, `${file}: ${key} must be ${expected}`);
      continue;
    }

    assert.equal(actual, expected, `${file}: ${key} must equal ${String(expected)}`);
  }
}

function nestedValue(output: Record<string, unknown>, key: string): unknown {
  for (const nestedKey of ["communicationAnalysis", "inputSources"]) {
    const nested = output[nestedKey];
    if (nested && typeof nested === "object" && key in nested) {
      return (nested as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

function message(processLogId: number, processType: AiProcessType, input: unknown): AiQueueMessage {
  return {
    messageId: `message-${processLogId}`,
    receiptHandle: `receipt-${processLogId}`,
    job: {
      processLogId,
      processType,
      inputRef: JSON.stringify(input),
      attempt: 1
    }
  };
}

function reportGenerateInput(reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT", transcript: string) {
  return {
    kind: reportType === "MOCK_INTERVIEW_REPORT" ? "MOCK_REPORT_GENERATE" : "RECRUITING_REPORT_GENERATE",
    payload: {
      reportId: 30,
      reportType,
      jobDescription: "Backend engineer with NestJS and PostgreSQL.",
      documentText: "The candidate has worked on NestJS APIs.",
      criteria: [
        {
          criterionId: 1,
          name: "Problem solving",
          weight: 40
        }
      ],
      answers: [
        {
          answerId: 10,
          transcript
        }
      ]
    }
  };
}
