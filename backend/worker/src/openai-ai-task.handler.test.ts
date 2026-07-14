import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import { MockAiTaskHandler } from "./mock-ai-task.handler";
import { OpenAiAiTaskHandler } from "./openai-ai-task.handler";
import { FollowUpAiProvider, FollowUpGenerationInput } from "./openai-follow-up.provider";
import { PostingDraftAiProvider, PostingDraftGenerationInput } from "./openai-posting-draft.provider";
import { QuestionAiProvider } from "./openai-question.provider";
import { ReportAiProvider, ReportGenerationInput } from "./openai-report.provider";
import { InMemoryAiProcessLogRepository } from "./process-log.repository";
import { InMemoryAiJobQueue } from "./queue";
import { AiWorkerRunner } from "./worker-runner";

const provider: FollowUpAiProvider = {
  async generateFollowUpQuestion() {
    return {
      content: "해당 문제를 다시 겪지 않도록 어떤 검증 절차를 추가했나요?",
      model: "test-model"
    };
  }
};

test("OpenAiAiTaskHandler uses provider for follow-up and keeps existing save contract", async () => {
  const results = new InMemoryAiResultRepository();
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider);

  const handled = await handler.handle({
    processLogId: 1,
    processType: "FOLLOW_UP",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "MOCK_FOLLOW_UP",
      payload: {
        sessionId: 7,
        answerId: 11,
        previousQuestion: "장애 대응 경험을 설명해주세요.",
        transcript: "로그를 보고 원인을 좁혀 쿼리를 수정했습니다."
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as { content?: string; model?: string };

  assert.equal(output.content, "해당 문제를 다시 겪지 않도록 어떤 검증 절차를 추가했나요?");
  assert.equal(output.model, "test-model");
  assert.equal(results.followUpQuestions[0]?.content, output.content);
  assert.equal(handled.guardrail?.result, "PASS");
});

test("OpenAiAiTaskHandler passes safe profile context as secondary follow-up evidence", async () => {
  const results = new InMemoryAiResultRepository();
  const inputs: FollowUpGenerationInput[] = [];
  const capturingProvider: FollowUpAiProvider = {
    async generateFollowUpQuestion(input) {
      inputs.push(input);
      return { content: "Redis 캐시 무효화 기준을 어떻게 정했나요?", model: "test-model" };
    },
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, capturingProvider);
  const profileContext = {
    schemaVersion: 1,
    summary: "백엔드 개발자",
    githubUrl: "https://github.com/tester",
    blogUrl: null,
    portfolioUrl: null,
    educations: [],
    careers: [{ companyName: "정글랩", responsibilities: "Redis 캐시 운영" }],
    activities: [],
    credentials: [],
  };

  const handled = await handler.handle({
    processLogId: 30,
    processType: "FOLLOW_UP",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "MOCK_FOLLOW_UP",
      payload: {
        sessionId: 7,
        answerId: 11,
        previousQuestion: "캐시 경험을 설명해주세요.",
        transcript: "Redis 캐시를 적용했습니다.",
        profileContext,
      },
    }),
  });

  assert.deepEqual(inputs[0]?.profileContext, profileContext);
  assert.equal(handled.guardrail?.result, "PASS");
});

test("OpenAiAiTaskHandler blocks follow-up output that leaks contact information or URL", async () => {
  const results = new InMemoryAiResultRepository();
  const leakingProvider: FollowUpAiProvider = {
    async generateFollowUpQuestion() {
      return { content: "https://github.com/tester에 적힌 전화번호를 설명해주세요?", model: "test-model" };
    },
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, leakingProvider);
  const handled = await handler.handle({
    processLogId: 31,
    processType: "FOLLOW_UP",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "MOCK_FOLLOW_UP",
      payload: {
        sessionId: 7,
        answerId: 11,
        previousQuestion: "프로젝트를 설명해주세요.",
        transcript: "프로젝트를 진행했습니다.",
      },
    }),
  });

  assert.equal(handled.guardrail?.result, "BLOCKED");
  assert.match(handled.guardrail?.reason ?? "", /contact information|URL/);
});

test("OpenAiAiTaskHandler uses provider for final report generation and keeps save contract", async () => {
  const results = new InMemoryAiResultRepository();
  const reportInputs: ReportGenerationInput[] = [];
  const reportProvider: ReportAiProvider = {
    async generateReport(input) {
      reportInputs.push(input);
      return {
        summary: "지원자는 백엔드 직무와 관련된 경험을 답변에서 설명했습니다.",
        feedback: "다음 연습에서는 문제 해결 과정의 결과를 더 구체적으로 말해보세요.",
        model: "report-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider, reportProvider);

  const handled = await handler.handle({
    processLogId: 2,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "MOCK_REPORT_GENERATE",
      payload: {
        reportId: 50,
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
            nonverbalMetadata: {
              microphoneWarnings: 1,
              longSilenceCount: 1,
              shortAnswerCount: 0
            },
            question: "프로젝트 경험을 설명해주세요.",
            transcript: "NestJS와 PostgreSQL을 사용해 답변 저장 흐름을 구현했습니다."
          }
        ]
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as {
    summary?: string;
    summarySource?: string;
    model?: string;
    reportFeedback?: string;
  };
  const report = results.generatedReports.get(50);

  assert.equal(reportInputs.length, 1);
  assert.equal(reportInputs[0]?.policy, "MOCK");
  assert.equal(reportInputs[0]?.answers[0]?.answerId, 10);
  assert.deepEqual(reportInputs[0]?.answers[0]?.nonverbalMetadata, {
    microphoneWarnings: 1,
    longSilenceCount: 1,
    shortAnswerCount: 0
  });
  assert.equal(output.summarySource, "OPENAI_REPORT_GENERATION");
  assert.equal(output.model, "report-model");
  assert.equal(output.reportFeedback, "다음 연습에서는 문제 해결 과정의 결과를 더 구체적으로 말해보세요.");
  assert.match(output.summary ?? "", /지원자는 백엔드 직무/);
  assert.match(report?.summary ?? "", /다음 연습 피드백/);
  assert.equal(report?.scores.length, 1);
  assert.equal(report?.questionEvaluations.length, 1);
  assert.equal(handled.guardrail?.result, "PASS");
});

test("OpenAiAiTaskHandler stores recruiting report provider notes as company review points", async () => {
  const results = new InMemoryAiResultRepository();
  const reportInputs: ReportGenerationInput[] = [];
  const reportProvider: ReportAiProvider = {
    async generateReport(input) {
      reportInputs.push(input);
      return {
        summary: "지원자의 답변은 JD의 백엔드 API 운영 경험과 일부 연결됩니다.",
        feedback: "추가 면접에서는 실제 운영 장애 대응 범위를 확인하는 것이 좋습니다.",
        model: "report-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider, reportProvider);

  const handled = await handler.handle({
    processLogId: 22,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      payload: {
        reportId: 52,
        reportType: "RECRUITING_REPORT",
        applicationId: 7,
        companyName: "테스트 기업",
        jobTitle: "백엔드 개발자",
        jobDescription: "NestJS API와 PostgreSQL 기반 백엔드 운영 경험을 요구합니다.",
        criteria: [
          {
            criterionId: 1,
            name: "직무 적합성",
            weight: 40
          }
        ],
        answers: [
          {
            answerId: 10,
            question: "지원 직무와 관련된 경험을 설명해주세요.",
            transcript: "NestJS API와 PostgreSQL 기반 답변 저장 흐름을 구현하고 운영 로그를 확인했습니다.",
            nonverbalMetadata: {
              source: "CLIENT_RUNTIME_UNVERIFIED",
              integrityEvents: [{ type: "TAB_HIDDEN", occurredAt: "2026-07-10T10:00:00.000Z" }]
            }
          }
        ]
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as {
    reportFeedback?: string;
    reportReviewNote?: string;
  };
  const report = results.generatedReports.get(52);

  assert.equal(output.reportFeedback, undefined);
  assert.equal(output.reportReviewNote, "추가 면접에서는 실제 운영 장애 대응 범위를 확인하는 것이 좋습니다.");
  assert.equal(reportInputs[0]?.answers[0]?.nonverbalMetadata, undefined);
  assert.match(report?.summary ?? "", /기업 검토 포인트/);
  assert.doesNotMatch(report?.summary ?? "", /다음 연습 피드백/);
});

test("OpenAiAiTaskHandler uses provider for recruiting question generation and keeps criterion links", async () => {
  const results = new InMemoryAiResultRepository();
  const questionProvider: QuestionAiProvider = {
    async generateQuestions(input) {
      const criterion = input.criteria[0]!;
      return {
        questionCandidates: [
          {
            content: "NestJS API 운영 중 문제를 구조화해 해결한 경험을 설명해주세요?",
            category: "직무역량",
            difficulty: "MEDIUM",
            criterionId: criterion.criterionId,
            criterionTitle: criterion.name,
            expectedKeywords: ["상황", "행동", "결과"],
            suggestionReason: "JD의 NestJS 운영 경험과 문제 해결 기준을 함께 확인합니다.",
            questionType: "EXPERIENCE"
          }
        ],
        model: "question-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(
    new MockAiTaskHandler(results),
    results,
    provider,
    undefined,
    undefined,
    questionProvider
  );

  const handled = await handler.handle({
    processLogId: 24,
    processType: "QUESTION_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_QUESTION_GENERATE",
      payload: {
        postingId: 2,
        jobDescription: "NestJS API와 PostgreSQL 기반 백엔드 운영 경험을 요구합니다.",
        questionCount: 1,
        criteria: [
          {
            criterionId: 1,
            name: "문제 해결력",
            category: "직무역량",
            weight: 40
          }
        ]
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as {
    draftSource?: string;
    model?: string;
    questionCandidates?: Array<{ criterionId?: number; criterionTitle?: string; category?: string }>;
  };

  assert.equal(output.draftSource, "OPENAI_QUESTION_GENERATION");
  assert.equal(output.model, "question-model");
  assert.equal(output.questionCandidates?.[0]?.criterionId, 1);
  assert.equal(output.questionCandidates?.[0]?.criterionTitle, "문제 해결력");
  assert.equal(output.questionCandidates?.[0]?.category, "직무역량");
  assert.equal(results.generatedDrafts[0]?.questionCandidates?.[0]?.criterionId, 1);
  assert.equal(handled.guardrail?.result, "PASS");
});

test("OpenAiAiTaskHandler rejects provider question candidates without criterionId", async () => {
  const results = new InMemoryAiResultRepository();
  const questionProvider: QuestionAiProvider = {
    async generateQuestions() {
      return {
        questionCandidates: [
          {
            content: "기준 없는 질문입니다?",
            category: "직무역량",
            difficulty: "MEDIUM",
            criterionId: 0,
            criterionTitle: "",
            expectedKeywords: [],
            suggestionReason: "invalid"
          }
        ],
        model: "question-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(
    new MockAiTaskHandler(results),
    results,
    provider,
    undefined,
    undefined,
    questionProvider
  );

  await assert.rejects(
    () =>
      handler.handle({
        processLogId: 25,
        processType: "QUESTION_GENERATE",
        attempt: 1,
        inputRef: JSON.stringify({
          kind: "RECRUITING_QUESTION_GENERATE",
          payload: {
            postingId: 2,
            jobDescription: "NestJS API와 PostgreSQL 기반 백엔드 운영 경험을 요구합니다.",
            questionCount: 1,
            criteria: [
              {
                criterionId: 1,
                name: "문제 해결력",
                category: "직무역량",
                weight: 40
              }
            ]
          }
        })
      }),
    /question candidate criterionId and criterionTitle are required/
  );
  assert.equal(results.generatedDrafts.length, 0);
});

test("OpenAiAiTaskHandler leaves report pipeline steps on the fallback handler", async () => {
  const results = new InMemoryAiResultRepository();
  let reportProviderCalls = 0;
  const reportProvider: ReportAiProvider = {
    async generateReport() {
      reportProviderCalls += 1;
      throw new Error("report provider should not run for pipeline steps");
    }
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider, reportProvider);

  const handled = await handler.handle({
    processLogId: 3,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      payload: {
        step: "ANSWER_EVALUATION",
        reportId: 51,
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
            transcript: "I improved read performance with Redis cache."
          }
        ],
        documentText: "The candidate has worked on NestJS APIs."
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as { scores?: unknown[] };

  assert.equal(reportProviderCalls, 0);
  assert.equal(output.scores?.length, 1);
  assert.equal(results.reportScores.get(51)?.length, 1);
  assert.equal(results.generatedReports.has(51), false);
});

test("OpenAiAiTaskHandler uses provider for posting draft generation and keeps review contract", async () => {
  const results = new InMemoryAiResultRepository();
  const postingDraftInputs: PostingDraftGenerationInput[] = [];
  const postingDraftProvider: PostingDraftAiProvider = {
    async generatePostingDraft(input) {
      postingDraftInputs.push(input);
      return {
        title: "2026 신입 백엔드 채용",
        jobRole: "Backend Developer",
        sections: {
          positionDetail: "<p>Backend Developer 포지션입니다.</p>",
          responsibilities: "<ul><li>NestJS API를 개발합니다.</li></ul>",
          requirements: '<p onclick="alert(1)">TypeScript 경험<img src=x onerror="alert(1)"></p><script>alert(1)</script>',
          preferredQualifications: "<ul><li>PostgreSQL 운영 경험</li></ul>",
          benefits: "<ul><li>성장 지원</li></ul>",
          hiringProcess: "<ul><li>서류 검토</li></ul>"
        },
        tags: ["NestJS", "PostgreSQL"],
        model: "posting-draft-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(
    new MockAiTaskHandler(results),
    results,
    provider,
    undefined,
    postingDraftProvider
  );

  const handled = await handler.handle({
    processLogId: 5,
    processType: "POSTING_DRAFT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "POSTING_DRAFT_GENERATE",
      payload: {
        title: "2026 신입 백엔드 채용",
        jobRole: "Backend Developer",
        keywords: ["NestJS", "PostgreSQL"],
        summary: "채용 플랫폼 API를 함께 만듭니다."
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as {
    kind?: string;
    draftSource?: string;
    model?: string;
    postingDraft?: { title?: string; sections?: Record<string, string>; tags?: string[] };
  };

  assert.equal(postingDraftInputs.length, 1);
  assert.deepEqual(postingDraftInputs[0]?.keywords, ["NestJS", "PostgreSQL"]);
  assert.equal(output.kind, "POSTING_DRAFT_GENERATE");
  assert.equal(output.draftSource, "OPENAI_POSTING_DRAFT_GENERATION");
  assert.equal(output.model, "posting-draft-model");
  assert.equal(output.postingDraft?.title, "2026 신입 백엔드 채용");
  assert.match(output.postingDraft?.sections?.positionDetail ?? "", /Backend Developer/);
  assert.equal(output.postingDraft?.sections?.requirements, "<p>TypeScript 경험</p>");
  assert.deepEqual(output.postingDraft?.tags, ["NestJS", "PostgreSQL"]);
  assert.equal(results.generatedDrafts[0]?.postingDraft?.title, output.postingDraft?.title);
  assert.equal(results.generatedDrafts[0]?.reviewRequired, true);
  assert.equal(handled.guardrail?.result, "PASS");
});

test("OpenAiAiTaskHandler blocks unsafe posting draft language before final save", async () => {
  const results = new InMemoryAiResultRepository();
  const repository = new InMemoryAiProcessLogRepository();
  const postingDraftProvider: PostingDraftAiProvider = {
    async generatePostingDraft() {
      return {
        title: "젊고 에너지 넘치는 남성 백엔드 개발자 채용",
        jobRole: "Backend Developer",
        sections: {
          positionDetail: "<p>합격 보장형 채용 공고입니다.</p>",
          responsibilities: "<ul><li>NestJS API를 개발합니다.</li></ul>",
          requirements: "<ul><li>명문대 졸업자, 20대 우대</li></ul>",
          preferredQualifications: "<ul><li>PostgreSQL 운영 경험</li></ul>",
          benefits: "<ul><li>무조건 성장할 수 있는 최고의 회사입니다.</li></ul>",
          hiringProcess: "<ul><li>서류 검토</li></ul>"
        },
        tags: ["NestJS"],
        model: "posting-draft-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(
    new MockAiTaskHandler(results),
    results,
    provider,
    undefined,
    postingDraftProvider
  );

  await new AiWorkerRunner(
    new InMemoryAiJobQueue([
      {
        messageId: "message-6",
        receiptHandle: "receipt-6",
        job: {
          processLogId: 6,
          processType: "POSTING_DRAFT_GENERATE",
          attempt: 1,
          inputRef: JSON.stringify({
            kind: "POSTING_DRAFT_GENERATE",
            payload: {
              title: "2026 신입 백엔드 채용",
              jobRole: "Backend Developer",
              keywords: ["NestJS"]
            }
          })
        }
      }
    ]),
    repository,
    handler
  ).processBatch();

  assert.equal(repository.get(6).status, "FAILED");
  assert.equal(repository.guardrailLogs.at(-1)?.decision.result, "BLOCKED");
  assert.match(repository.get(6).failure?.reason ?? "", /posting draft contains unsafe hiring language/);
  assert.equal(results.generatedDrafts.length, 0);
});

test("OpenAiAiTaskHandler keeps mock report expression guardrail after provider output", async () => {
  const results = new InMemoryAiResultRepository();
  const reportProvider: ReportAiProvider = {
    async generateReport() {
      return {
        summary: "합격 가능성이 높습니다.",
        model: "report-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider, reportProvider);

  const handled = await handler.handle({
    processLogId: 4,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "MOCK_REPORT_GENERATE",
      payload: {
        reportId: 52,
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
            transcript: "답변을 차분하게 설명했습니다."
          }
        ]
      }
    })
  });

  assert.equal(handled.guardrail?.result, "BLOCKED");
  assert.equal(results.generatedReports.has(52), false);
});
