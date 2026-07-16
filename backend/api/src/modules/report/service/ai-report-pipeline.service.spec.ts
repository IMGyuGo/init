import { BadRequestException } from "@nestjs/common";
import { AiReportPipelineService } from "./ai-report-pipeline.service";
import { GuardrailService } from "./guardrail.service";
import { InMemoryReportRepository } from "../repository/in-memory-report.repository";
import { MockAiReportProvider } from "./mock-ai-report.provider";
import {
  EvaluationContextRequest,
  GenerateReportRequest,
  GeneratedReport,
  ReportScore
} from "../report.types";

describe("AiReportPipelineService", () => {
  let service: AiReportPipelineService;
  let guardrailService: GuardrailService;
  let repository: InMemoryReportRepository;

  beforeEach(() => {
    guardrailService = new GuardrailService();
    repository = new InMemoryReportRepository();
    service = new AiReportPipelineService(new MockAiReportProvider(), guardrailService, repository);
  });

  it("builds evaluation context from company, posting, criteria, application, answers, and manual evaluation", async () => {
    const result = await service.buildEvaluationContext({
      currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
      reportId: 1,
      body: validContextRequest()
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.report.status).toBe("GENERATING");
    expect(result.context.companyId).toBe(1);
    expect(result.context.postingId).toBe(2);
    expect(result.context.applicationId).toBe(3);
    expect(result.context.manualEvaluations).toHaveLength(1);
    await expect(repository.countStored(1)).resolves.toMatchObject({
      guardrailLogCount: 1
    });
  });

  it("saves answer scores only when every score has rationale and evidence", async () => {
    const result = await service.evaluateAnswers({
      currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
      reportId: 1,
      body: {
        reportType: "RECRUITING_REPORT",
        criteria: validGenerateRequest().criteria,
        answers: validGenerateRequest().answers,
        documentText: validGenerateRequest().documentText
      }
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.guardrail.result).toBe("PASS");
    expect(result.stored.scoreCount).toBe(1);
    expect(result.stored.evidenceCount).toBe(2);
    expect(result.scores[0]).toMatchObject({
      rubricAnchor: expect.any(String),
      confidence: expect.stringMatching(/HIGH|MEDIUM|LOW/),
      uncertaintyReasons: expect.any(Array)
    });
    expect(result.questionEvaluations).toHaveLength(1);
    expect(result.questionEvaluations[0]).toMatchObject({
      answerId: 10,
      question: "Describe your Redis experience.",
      criterionId: 1
    });
    expect(result.scores[0].evidences.map((evidence) => evidence.sourceType)).toEqual([
      "INTERVIEW_ANSWER",
      "APPLICATION_DOCUMENT"
    ]);
  });

  it("does not store scores or evidences when guardrail blocks final report generation", async () => {
    const blockedReport: GeneratedReport = {
      summary: "Generated summary.",
      totalScore: 80,
      scores: [
        {
          criterionId: 1,
          criterionName: "Problem solving",
          score: 80,
          rationale: "Reason exists.",
          rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
          confidence: "MEDIUM",
          uncertaintyReasons: [],
          evidences: []
        }
      ],
      questionEvaluations: []
    };
    const blockedProvider = new MockAiReportProvider();
    jest.spyOn(blockedProvider, "generate").mockReturnValue(blockedReport);
    const blockedService = new AiReportPipelineService(blockedProvider, guardrailService, new InMemoryReportRepository());

    const result = await blockedService.generate({
      currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
      reportId: 1,
      body: validGenerateRequest()
    });

    expect(result.status).toBe("FAILED");
    expect(result.report.status).toBe("FAILED");
    expect(result.failure?.category).toBe("NON_RETRYABLE");
    expect(result.guardrail.result).toBe("BLOCKED");
    expect(result.guardrail.failureCategory).toBe("NON_RETRYABLE");
    expect(result.stored.scoreCount).toBe(0);
    expect(result.stored.evidenceCount).toBe(0);
  });

  it("stores final report output when guardrail marks it regenerated", async () => {
    jest.spyOn(guardrailService, "validateReport").mockReturnValue({
      result: "REGENERATED",
      reason: "Unsafe wording was regenerated before final validation."
    });

    const result = await service.generate({
      currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
      reportId: 1,
      body: validGenerateRequest()
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.report.status).toBe("COMPLETED");
    expect(result.guardrail.result).toBe("REGENERATED");
    expect(result.stored.scoreCount).toBe(1);
    expect(result.stored.evidenceCount).toBe(2);
    expect(result.questionEvaluations).toHaveLength(1);
  });

  it("does not store a score or evidence when every STT transcript is unavailable", async () => {
    const request = validGenerateRequest();
    request.answers = [
      {
        answerId: 10,
        question: "Describe your Redis experience.",
        evaluationStatus: "STT_UNAVAILABLE",
        transcriptUnavailableReason: "STT failed because the audio file was unsupported."
      }
    ];

    const result = await service.generate({
      currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
      reportId: 1,
      body: request
    });

    expect(result.status).toBe("FAILED");
    expect(result.report.status).toBe("FAILED");
    expect(result.scores).toEqual([]);
    expect(result.questionEvaluations).toEqual([]);
    expect(result.stored.scoreCount).toBe(0);
    expect(result.stored.evidenceCount).toBe(0);
  });

  it("excludes unavailable transcripts when other answers can be evaluated", async () => {
    const request = validGenerateRequest();
    request.answers = [
      ...request.answers,
      {
        answerId: 11,
        question: "Describe your cache invalidation policy.",
        evaluationStatus: "STT_UNAVAILABLE",
        transcriptUnavailableReason: "STT failed because speech was not detected."
      }
    ];

    const result = await service.generate({
      currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
      reportId: 1,
      body: request
    });

    const unavailableQuestion = result.questionEvaluations.find((evaluation) => evaluation.answerId === 11);
    expect(result.status).toBe("COMPLETED");
    expect(result.scores).toHaveLength(1);
    expect(result.questionEvaluations).toHaveLength(1);
    expect(unavailableQuestion).toBeUndefined();
    expect(result.scores.some((score) => score.score === 0 && score.rationale.includes("STT"))).toBe(false);
  });

  it("records unexpected report generation failures as retryable without storing final scores", async () => {
    const failedProvider = new MockAiReportProvider();
    jest.spyOn(failedProvider, "generate").mockImplementation(() => {
      throw new Error("AI provider timeout");
    });
    const failedService = new AiReportPipelineService(failedProvider, guardrailService, new InMemoryReportRepository());

    const result = await failedService.generate({
      currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
      reportId: 2,
      body: validGenerateRequest()
    });

    expect(result.status).toBe("FAILED");
    expect(result.report.status).toBe("FAILED");
    expect(result.failure).toEqual({
      category: "RETRYABLE",
      reason: "AI provider timeout",
      retryable: true
    });
    expect(result.stored.scoreCount).toBe(0);
    expect(result.stored.evidenceCount).toBe(0);
  });

  it("marks communication analysis as auxiliary only with zero decision weight", async () => {
    const result = await service.analyzeCommunication({
      currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
      reportId: 1,
      body: {
        reportType: "RECRUITING_REPORT",
        consentConfirmed: true,
        mediaQuality: "LOW_AUDIO",
        metrics: { speechPace: "NORMAL", audioClarity: 45 },
        notes: ["Audio quality is not sufficient for decisive scoring."]
      }
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.communicationAnalysis.usage).toBe("AUXILIARY_ONLY");
    expect(result.communicationAnalysis.decisionWeight).toBe(0);
    await expect(repository.countStored(1)).resolves.toMatchObject({
      guardrailLogCount: 1
    });
  });

  it("separates recruiting and mock interview expression policy", () => {
    const scores: ReportScore[] = [
      {
        criterionId: 1,
        criterionName: "Communication",
        score: 80,
        rationale: "이 지원자는 합격 가능성이 높습니다.",
        rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
        confidence: "MEDIUM",
        uncertaintyReasons: [],
        evidences: [{ sourceType: "INTERVIEW_ANSWER", answerId: 10, text: "Clear answer." }]
      }
    ];

    expect(guardrailService.validateScores("RECRUITING_REPORT", scores).result).toBe("PASS");
    expect(guardrailService.validateScores("MOCK_INTERVIEW_REPORT", scores).result).toBe("BLOCKED");
  });

  it("rejects missing communication-analysis consent as a validation error", async () => {
    await expect(
      service.analyzeCommunication({
        currentUser: { userId: 1, userType: "COMPANY", companyId: 1 },
        reportId: 1,
        body: {
          reportType: "RECRUITING_REPORT",
          consentConfirmed: false,
          mediaQuality: "GOOD"
        }
      })
    ).rejects.toThrow(BadRequestException);
  });
});

function validContextRequest(): EvaluationContextRequest {
  return {
    reportType: "RECRUITING_REPORT",
    company: { companyId: 1, name: "Init Corp", talentProfile: "Pragmatic problem solver" },
    posting: {
      postingId: 2,
      title: "Backend Engineer",
      jobDescription: "Backend engineer with NestJS, PostgreSQL, and Redis experience."
    },
    application: {
      applicationId: 3,
      candidateId: 4,
      documentText: "The candidate has worked on NestJS APIs and Redis cache policies."
    },
    criteria: validGenerateRequest().criteria,
    answers: validGenerateRequest().answers,
    manualEvaluations: [{ reviewerUserId: 9, decision: "HOLD", memo: "Needs human review." }]
  };
}

function validGenerateRequest(): GenerateReportRequest {
  return {
    reportType: "RECRUITING_REPORT",
    jobDescription: "Backend engineer with NestJS, PostgreSQL, and Redis experience.",
    documentText: "The candidate has worked on NestJS APIs and Redis cache policies.",
    criteria: [
      {
        criterionId: 1,
        name: "Problem solving",
        description: "Ability to analyze and solve technical problems.",
        weight: 40
      }
    ],
    answers: [
      {
        answerId: 10,
        question: "Describe your Redis experience.",
        transcript: "I improved read performance with Redis cache, TTL, and invalidation policies."
      }
    ]
  };
}
