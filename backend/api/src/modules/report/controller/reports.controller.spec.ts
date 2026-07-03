import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../../shared/api-exception.filter";
import { ApiResponseInterceptor } from "../../../shared/api-response.interceptor";
import { PrismaService } from "../../../shared/prisma.service";
import { InMemoryInterviewRepository } from "../../interview/repository/in-memory-interview.repository";
import { INTERVIEW_REPOSITORY } from "../../interview/repository/interview.repository";
import { InMemoryReportRepository } from "../repository/in-memory-report.repository";

describe("ReportsController", () => {
  let app: INestApplication;
  let repository: InMemoryReportRepository;
  let mockAiFixture: AiInterviewFixture;
  let mockAnswerWithoutFileFixture: AiInterviewFixture;
  let recruitingAiFixture: AiInterviewFixture;
  const previousEnv = {
    candidateRepositoryMode: process.env.CANDIDATE_REPOSITORY_MODE,
    candidateDemoNoAuth: process.env.CANDIDATE_DEMO_NO_AUTH,
    disablePrismaConnect: process.env.DISABLE_PRISMA_CONNECT,
    interviewRepositoryMode: process.env.INTERVIEW_REPOSITORY_MODE,
  };

  beforeAll(async () => {
    process.env.CANDIDATE_REPOSITORY_MODE = "memory";
    process.env.CANDIDATE_DEMO_NO_AUTH = "true";
    process.env.DISABLE_PRISMA_CONNECT = "true";
    process.env.INTERVIEW_REPOSITORY_MODE = "memory";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();
    repository = app.get(InMemoryReportRepository);
    const interviewRepository = app.get<InMemoryInterviewRepository>(INTERVIEW_REPOSITORY);
    ({ mockAiFixture, mockAnswerWithoutFileFixture, recruitingAiFixture } = seedInterviewAiFixtures(interviewRepository));
  });

  afterAll(async () => {
    await app.close();
    restoreEnv("CANDIDATE_REPOSITORY_MODE", previousEnv.candidateRepositoryMode);
    restoreEnv("CANDIDATE_DEMO_NO_AUTH", previousEnv.candidateDemoNoAuth);
    restoreEnv("DISABLE_PRISMA_CONNECT", previousEnv.disablePrismaConnect);
    restoreEnv("INTERVIEW_REPOSITORY_MODE", previousEnv.interviewRepositoryMode);
  });

  it("queues evaluation context work for a company dev user", async () => {
    const response = await companyRequest("/api/v1/reports/1/evaluation-context")
      .send(validContextPayload())
      .expect(202);

    expect(response.body.data.processType).toBe("REPORT_GENERATE");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.queued).toBe(true);
    expect(response.body.data.report.status).toBe("GENERATING");
    expect(response.body.data.inputRef).toContain("\"step\":\"EVALUATION_CONTEXT\"");
    expect(response.body.data.inputRef).toContain("\"reportId\":1");
  });

  it("queues answer evaluation work for a company dev user", async () => {
    const response = await companyRequest("/api/v1/reports/1/answer-evaluation")
      .send({
        reportType: "RECRUITING_REPORT",
        criteria: validGeneratePayload().criteria,
        answers: validGeneratePayload().answers,
        documentText: validGeneratePayload().documentText
      })
      .expect(202);

    expect(response.body.data.processType).toBe("REPORT_GENERATE");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.queued).toBe(true);
    expect(response.body.data.report.status).toBe("GENERATING");
    expect(response.body.data.inputRef).toContain("\"step\":\"ANSWER_EVALUATION\"");
  });

  it("queues communication analysis work for a company dev user", async () => {
    const response = await companyRequest("/api/v1/reports/1/communication-analysis")
      .send({
        reportType: "RECRUITING_REPORT",
        consentConfirmed: true,
        mediaQuality: "LOW_AUDIO",
        metrics: { speechPace: "NORMAL", audioClarity: 45 }
      })
      .expect(202);

    expect(response.body.data.processType).toBe("REPORT_GENERATE");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.queued).toBe(true);
    expect(response.body.data.report.status).toBe("GENERATING");
    expect(response.body.data.inputRef).toContain("\"step\":\"COMMUNICATION_ANALYSIS\"");
  });

  it("generates a recruiting report for a company dev user", async () => {
    const response = await companyRequest("/api/v1/reports/1/generate").send(validGeneratePayload()).expect(202);

    expect(response.body.data.processType).toBe("REPORT_GENERATE");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.queued).toBe(true);
    expect(response.body.data.report.status).toBe("GENERATING");
    expect(response.body.data.inputRef).toContain("\"reportId\":1");
    expect(response.body.data.inputRef).toContain("Redis cache");
    expect(response.body.meta.traceId).toBeTruthy();
  });

  it("validates guardrails for an admin dev user", async () => {
    const response = await adminRequest("/api/v1/ai/guardrails/validate")
      .send({
        reportType: "MOCK_INTERVIEW_REPORT",
        target: "SCORES",
        scores: [
          {
            criterionId: 1,
            criterionName: "Communication",
            score: 80,
            rationale: "This candidate is 합격.",
            rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
            confidence: "MEDIUM",
            uncertaintyReasons: [],
            evidences: [{ sourceType: "INTERVIEW_ANSWER", answerId: 10, text: "Clear answer." }]
          }
        ]
      })
      .expect(200);

    expect(response.body.data.target).toBe("SCORES");
    expect(response.body.data.processLogId).toBeGreaterThan(0);
    expect(response.body.data.guardrailLogId).toBeGreaterThan(0);
    expect(response.body.data.guardrail.result).toBe("BLOCKED");
    expect(response.body.data.guardrail.failureCategory).toBe("NON_RETRYABLE");

    const statusResponse = await adminGet(`/api/v1/ai/jobs/${response.body.data.processLogId}/status`).expect(200);
    expect(statusResponse.body.data.processType).toBe("GUARDRAIL_VALIDATE");
    expect(statusResponse.body.data.status).toBe("COMPLETED");
    expect(statusResponse.body.data.output.guardrail.result).toBe("BLOCKED");
  });

  it("records regenerated guardrail results for passing regenerated output", async () => {
    const response = await adminRequest("/api/v1/ai/guardrails/validate")
      .send({
        reportType: "RECRUITING_REPORT",
        target: "SCORES",
        regenerated: true,
        regenerationReason: "Unsafe wording was regenerated before final validation.",
        scores: [
          {
            criterionId: 1,
            criterionName: "Communication",
            score: 80,
            rationale: "The answer is clear and evidence-backed.",
            rubricAnchor: "Structured interview evidence is mapped to the requested evaluation criterion.",
            confidence: "MEDIUM",
            uncertaintyReasons: [],
            evidences: [{ sourceType: "INTERVIEW_ANSWER", answerId: 10, text: "Clear answer." }]
          }
        ]
      })
      .expect(200);

    expect(response.body.data.guardrail).toEqual({
      result: "REGENERATED",
      reason: "Unsafe wording was regenerated before final validation."
    });
  });

  it("queues candidate document extraction without storing raw file content", async () => {
    const response = await candidateRequest("/api/v1/candidate/documents/extract")
      .send({
        applicationId: 3,
        documentId: 8,
        fileId: 9,
        s3Key: "candidate/4/resume.pdf"
      })
      .expect(202);

    expect(response.body.data.processType).toBe("DOCUMENT_EXTRACT");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.queued).toBe(true);
    expect(response.body.data.inputRef).toContain("candidate/4/resume.pdf");
    expect(response.body.data.inputRef).not.toContain("fileContent");

    const statusResponse = await candidateGet(`/api/v1/ai/jobs/${response.body.data.processLogId}/status`).expect(200);
    expect(statusResponse.body.data.processType).toBe("DOCUMENT_EXTRACT");
    expect(statusResponse.body.data.status).toBe("PENDING");
  });

  it("rejects document extraction without a file asset reference", async () => {
    await candidateRequest("/api/v1/candidate/documents/extract")
      .send({
        applicationId: 3,
        documentId: 8,
        s3Key: "candidate/4/resume.pdf"
      })
      .expect(400);
  });

  it("rejects document extraction raw file content before it can enter process logs", async () => {
    await candidateRequest("/api/v1/candidate/documents/extract")
      .send({
        applicationId: 3,
        documentId: 8,
        fileId: 9,
        s3Key: "candidate/4/resume.pdf",
        fileContent: "raw pdf bytes"
      })
      .expect(400);
  });

  it("queues candidate STT work for worker processing", async () => {
    const response = await candidateRequest(`/api/v1/candidate/mock-interviews/${mockAiFixture.sessionId}/stt`)
      .send({
        answerId: mockAiFixture.answerId,
        audioFileId: mockAiFixture.audioFileId,
        audioS3Key: mockAiFixture.audioS3Key
      })
      .expect(202);

    expect(response.body.data.processType).toBe("STT");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.queued).toBe(true);
  });

  it("rejects STT without an audio file asset reference", async () => {
    await candidateRequest(`/api/v1/candidate/mock-interviews/${mockAnswerWithoutFileFixture.sessionId}/stt`)
      .send({
        answerId: mockAnswerWithoutFileFixture.answerId,
        audioS3Key: mockAnswerWithoutFileFixture.audioS3Key
      })
      .expect(400);
  });

  it("rejects STT raw audio content before it can enter process logs", async () => {
    await candidateRequest(`/api/v1/candidate/mock-interviews/${mockAiFixture.sessionId}/stt`)
      .send({
        answerId: mockAiFixture.answerId,
        audioFileId: mockAiFixture.audioFileId,
        audioS3Key: mockAiFixture.audioS3Key,
        audioContent: "raw wav bytes"
      })
      .expect(400);
  });

  it("queues mock follow-up work with previous question context", async () => {
    const response = await candidateRequest(`/api/v1/candidate/mock-interviews/${mockAiFixture.sessionId}/follow-up-question`)
      .send({
        answerId: mockAiFixture.answerId,
        previousQuestion: "How did you use Redis?",
        transcript: "I improved read performance with Redis cache."
      })
      .expect(202);

    expect(response.body.data.processType).toBe("FOLLOW_UP");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.inputRef).toContain("How did you use Redis?");
  });

  it("queues recruiting follow-up work with JD or document context", async () => {
    const response = await candidateRequest(`/api/v1/candidate/interviews/${recruitingAiFixture.sessionId}/follow-up-question`)
      .send({
        answerId: recruitingAiFixture.answerId,
        previousQuestion: "How did you use Redis?",
        transcript: "I improved read performance with Redis cache.",
        jobDescription: "Backend engineer with Redis operations."
      })
      .expect(202);

    expect(response.body.data.processType).toBe("FOLLOW_UP");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.inputRef).toContain("Backend engineer with Redis operations.");
  });

  it("rejects recruiting follow-up without JD or document context", async () => {
    await candidateRequest(`/api/v1/candidate/interviews/${recruitingAiFixture.sessionId}/follow-up-question`)
      .send({
        answerId: recruitingAiFixture.answerId,
        previousQuestion: "How did you use Redis?",
        transcript: "I improved read performance with Redis cache."
      })
      .expect(400);
  });

  it("queues company AI criteria suggestions", async () => {
    const response = await companyRequest("/api/v1/company/interviews/evaluation-criteria/suggest")
      .send({
        postingId: 2,
        jobDescription: "Backend engineer with NestJS and PostgreSQL experience.",
        talentProfile: "Pragmatic problem solver",
        evaluationPolicy: "Prefer evidence-backed backend ownership."
      })
      .expect(202);

    expect(response.body.data.processType).toBe("CRITERIA_SUGGEST");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.queued).toBe(true);
    expect(response.body.data.inputRef).toContain("Pragmatic problem solver");
    expect(response.body.data.inputRef).toContain("Prefer evidence-backed backend ownership.");
  });

  it("exposes parsed criteria suggestion output for review before final criteria save", async () => {
    const response = await companyRequest("/api/v1/company/interviews/evaluation-criteria/suggest")
      .send({
        postingId: 2,
        jobDescription: "Backend engineer with NestJS and PostgreSQL experience.",
        talentProfile: "Pragmatic problem solver",
        evaluationPolicy: "Prefer evidence-backed backend ownership."
      })
      .expect(202);

    await repository.markQueuedProcessCompleted(
      response.body.data.processLogId,
      JSON.stringify({
        kind: "CRITERIA_SUGGEST",
        sourceProcessLogId: response.body.data.processLogId,
        items: ["Problem solving", "Backend ownership"],
        reviewRequired: true,
        reviewStatus: "PENDING_REVIEW",
        targetTables: ["criterion_tags", "evaluation_criteria"],
        postingId: 2
      })
    );

    const statusResponse = await companyGet(`/api/v1/ai/jobs/${response.body.data.processLogId}/status`).expect(200);

    expect(statusResponse.body.data.status).toBe("COMPLETED");
    expect(statusResponse.body.data.output.sourceProcessLogId).toBe(response.body.data.processLogId);
    expect(statusResponse.body.data.output.items).toEqual(["Problem solving", "Backend ownership"]);
    expect(statusResponse.body.data.output.reviewRequired).toBe(true);
    expect(statusResponse.body.data.output.reviewStatus).toBe("PENDING_REVIEW");
    expect(statusResponse.body.data.output.targetTables).toEqual(["criterion_tags", "evaluation_criteria"]);
    expect(statusResponse.body.data.output.postingId).toBe(2);
  });

  it("exposes parsed company generation output through AI job status", async () => {
    const response = await companyRequest("/api/v1/company/interviews/questions/generate")
      .send({
        postingId: 2,
        jobDescription: "Backend engineer with NestJS and PostgreSQL experience.",
        questionCount: 2
      })
      .expect(202);

    await repository.markQueuedProcessCompleted(
      response.body.data.processLogId,
      JSON.stringify({
        kind: "RECRUITING_QUESTION_GENERATE",
        sourceProcessLogId: response.body.data.processLogId,
        items: ["Question 1", "Question 2"],
        reviewRequired: true,
        reviewStatus: "PENDING_REVIEW",
        targetTables: ["question_bank"],
        postingId: 2
      })
    );

    const statusResponse = await companyGet(`/api/v1/ai/jobs/${response.body.data.processLogId}/status`).expect(200);

    expect(statusResponse.body.data.status).toBe("COMPLETED");
    expect(statusResponse.body.data.output.sourceProcessLogId).toBe(response.body.data.processLogId);
    expect(statusResponse.body.data.output.items).toEqual(["Question 1", "Question 2"]);
    expect(statusResponse.body.data.output.reviewRequired).toBe(true);
    expect(statusResponse.body.data.output.reviewStatus).toBe("PENDING_REVIEW");
    expect(statusResponse.body.data.output.targetTables).toEqual(["question_bank"]);
    expect(statusResponse.body.data.output.postingId).toBe(2);
  });

  it("queues question-set generation with criteria and question type conditions", async () => {
    const response = await companyRequest("/api/v1/company/interviews/question-sets")
      .send({
        postingId: 2,
        questionCount: 2,
        criteria: [{ criterionId: 1, name: "Problem solving", weight: 40 }],
        questionTypes: ["TECHNICAL", "EXPERIENCE"]
      })
      .expect(202);

    expect(response.body.data.processType).toBe("QUESTION_SET_GENERATE");
    expect(response.body.data.status).toBe("PENDING");
    expect(response.body.data.inputRef).toContain("Problem solving");
    expect(response.body.data.inputRef).toContain("TECHNICAL");
  });

  it("exposes parsed question-set output for C screen consumption", async () => {
    const response = await companyRequest("/api/v1/company/interviews/question-sets")
      .send({
        postingId: 2,
        questionCount: 2,
        criteria: [{ criterionId: 1, name: "Problem solving", weight: 40 }],
        questionTypes: ["TECHNICAL", "EXPERIENCE"]
      })
      .expect(202);

    await repository.markQueuedProcessCompleted(
      response.body.data.processLogId,
      JSON.stringify({
        kind: "QUESTION_SET_GENERATE",
        sourceProcessLogId: response.body.data.processLogId,
        items: ["TECHNICAL question 1", "EXPERIENCE question 2"],
        reviewRequired: true,
        reviewStatus: "PENDING_REVIEW",
        targetTables: ["question_bank"],
        postingId: 2
      })
    );

    const statusResponse = await companyGet(`/api/v1/ai/jobs/${response.body.data.processLogId}/status`).expect(200);

    expect(statusResponse.body.data.status).toBe("COMPLETED");
    expect(statusResponse.body.data.output.sourceProcessLogId).toBe(response.body.data.processLogId);
    expect(statusResponse.body.data.output.items).toEqual(["TECHNICAL question 1", "EXPERIENCE question 2"]);
    expect(statusResponse.body.data.output.reviewRequired).toBe(true);
    expect(statusResponse.body.data.output.reviewStatus).toBe("PENDING_REVIEW");
    expect(statusResponse.body.data.output.targetTables).toEqual(["question_bank"]);
    expect(statusResponse.body.data.output.postingId).toBe(2);
  });

  it("rejects criteria suggestion without talent profile and evaluation policy", async () => {
    await companyRequest("/api/v1/company/interviews/evaluation-criteria/suggest")
      .send({
        postingId: 2,
        jobDescription: "Backend engineer with NestJS and PostgreSQL experience."
      })
      .expect(400);
  });

  it("exposes parsed candidate mock-question output through AI job status", async () => {
    const response = await candidateRequest("/api/v1/candidate/mock-interviews/questions/generate")
      .send({
        questionCount: 2
      })
      .expect(202);

    expect(response.body.data.inputRef).not.toContain("postingId");
    expect(response.body.data.inputRef).not.toContain("jobDescription");
    expect(response.body.data.inputRef).not.toContain("criteria");

    await repository.markQueuedProcessCompleted(
      response.body.data.processLogId,
      JSON.stringify({
        kind: "MOCK_QUESTION_GENERATE",
        sourceProcessLogId: response.body.data.processLogId,
        items: ["Mock question 1", "Mock question 2"],
        reviewRequired: true,
        reviewStatus: "PENDING_REVIEW",
        targetTables: ["question_bank"]
      })
    );

    const statusResponse = await candidateGet(`/api/v1/ai/jobs/${response.body.data.processLogId}/status`).expect(200);

    expect(statusResponse.body.data.status).toBe("COMPLETED");
    expect(statusResponse.body.data.output.sourceProcessLogId).toBe(response.body.data.processLogId);
    expect(statusResponse.body.data.output.items).toEqual(["Mock question 1", "Mock question 2"]);
    expect(statusResponse.body.data.output.reviewRequired).toBe(true);
    expect(statusResponse.body.data.output.reviewStatus).toBe("PENDING_REVIEW");
    expect(statusResponse.body.data.output.targetTables).toEqual(["question_bank"]);
  });

  it("enforces auth and processLogId validation on AI job status lookup", async () => {
    const unauthorized = await request(app.getHttpServer()).get("/api/v1/ai/jobs/1/status").expect(401);
    expect(unauthorized.body.error.code).toBe("COMMON_UNAUTHORIZED");

    const invalid = await companyGet("/api/v1/ai/jobs/not-a-number/status").expect(400);
    expect(invalid.body.error.code).toBe("COMMON_VALIDATION_FAILED");

    const missing = await companyGet("/api/v1/ai/jobs/999999/status").expect(404);
    expect(missing.body.error.code).toBe("AI_PROCESS_NOT_FOUND");
  });

  it("allows bearer authenticated users to poll AI job status", async () => {
    const response = await companyRequest("/api/v1/company/interviews/evaluation-criteria/suggest")
      .send({
        postingId: 2,
        jobDescription: "Backend engineer with NestJS and PostgreSQL experience.",
        talentProfile: "Pragmatic problem solver",
        evaluationPolicy: "Prefer evidence-backed backend ownership."
      })
      .expect(202);

    const accessToken = jwt.sign(
      {
        sub: 1,
        userType: "COMPANY",
        companyId: 1,
        candidateId: null,
        tokenType: "access"
      },
      process.env.JWT_SECRET ?? "local-dev-jwt-secret-change-me"
    );

    const statusResponse = await request(app.getHttpServer())
      .get(`/api/v1/ai/jobs/${response.body.data.processLogId}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(statusResponse.body.data.processLogId).toBe(response.body.data.processLogId);
    expect(statusResponse.body.data.status).toBe("PENDING");
  });

  it("separates recruiting and mock report endpoint report types", async () => {
    await companyRequest("/api/v1/reports/1/evaluation-context")
      .send({ ...validContextPayload(), reportType: "MOCK_INTERVIEW_REPORT" })
      .expect(400);

    await companyRequest("/api/v1/reports/1/answer-evaluation")
      .send({
        reportType: "MOCK_INTERVIEW_REPORT",
        criteria: validGeneratePayload().criteria,
        answers: validGeneratePayload().answers
      })
      .expect(400);

    await companyRequest("/api/v1/reports/1/communication-analysis")
      .send({
        reportType: "MOCK_INTERVIEW_REPORT",
        consentConfirmed: true,
        mediaQuality: "LOW_AUDIO"
      })
      .expect(400);

    await companyRequest("/api/v1/reports/1/generate")
      .send({ ...validGeneratePayload(), reportType: "MOCK_INTERVIEW_REPORT" })
      .expect(400);

  });

  it("returns unauthorized when dev auth headers are missing", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/reports/1/generate")
      .send(validGeneratePayload())
      .expect(401);

    expect(response.body.error).toEqual({
      code: "COMMON_UNAUTHORIZED",
      message: "Dev auth headers are required.",
      details: []
    });
  });

  it("returns forbidden for candidate users on recruiting report generation", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/reports/1/generate")
      .set("X-Dev-User-Id", "2")
      .set("X-Dev-User-Type", "CANDIDATE")
      .set("X-Dev-Candidate-Id", "1")
      .send(validGeneratePayload())
      .expect(403);
  });

  it("returns forbidden for company users on guardrail validation", async () => {
    await companyRequest("/api/v1/ai/guardrails/validate")
      .send({
        reportType: "RECRUITING_REPORT",
        target: "SCORES",
        scores: []
      })
      .expect(403);
  });

  function companyRequest(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set("X-Dev-User-Id", "1")
      .set("X-Dev-User-Type", "COMPANY")
      .set("X-Dev-Company-Id", "1");
  }

  function candidateRequest(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set("X-Dev-User-Id", "2")
      .set("X-Dev-User-Type", "CANDIDATE")
      .set("X-Dev-Candidate-Id", "1");
  }

  function candidateGet(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set("X-Dev-User-Id", "2")
      .set("X-Dev-User-Type", "CANDIDATE")
      .set("X-Dev-Candidate-Id", "1");
  }

  function companyGet(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set("X-Dev-User-Id", "1")
      .set("X-Dev-User-Type", "COMPANY")
      .set("X-Dev-Company-Id", "1");
  }

  function adminRequest(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set("X-Dev-User-Id", "9")
      .set("X-Dev-User-Type", "ADMIN");
  }

  function adminGet(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set("X-Dev-User-Id", "9")
      .set("X-Dev-User-Type", "ADMIN");
  }
});

function validContextPayload() {
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
    criteria: validGeneratePayload().criteria,
    answers: validGeneratePayload().answers,
    manualEvaluations: [{ reviewerUserId: 9, decision: "HOLD", memo: "Needs human review." }]
  };
}

function validGeneratePayload() {
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

type AiInterviewFixture = {
  sessionId: number;
  answerId: number;
  audioFileId?: number;
  audioS3Key: string;
};

function seedInterviewAiFixtures(interviewRepository: InMemoryInterviewRepository) {
  const now = new Date().toISOString();
  const mockSession = interviewRepository.createMockSession({
    candidateId: 1,
    showQuestionText: true,
    questionIds: [1],
    startedAt: now,
    updatedAt: now
  });
  const mockAnswer = interviewRepository.createAnswer({
    sessionId: mockSession.sessionId,
    questionId: 1,
    audioFileId: 11,
    durationSeconds: 30,
    submittedAt: now
  });

  const mockSessionWithoutFile = interviewRepository.createMockSession({
    candidateId: 1,
    showQuestionText: true,
    questionIds: [2],
    startedAt: now,
    updatedAt: now
  });
  const mockAnswerWithoutFile = interviewRepository.createAnswer({
    sessionId: mockSessionWithoutFile.sessionId,
    questionId: 2,
    durationSeconds: 30,
    submittedAt: now
  });

  interviewRepository.saveRecruitingRuntimeSession({
    sessionId: 1,
    applicationId: 1,
    candidateId: 1,
    interviewType: "RECRUITING",
    status: "IN_PROGRESS",
    showQuestionText: true,
    currentQuestionIndex: 0,
    questionIds: [101],
    startedAt: now,
    updatedAt: now
  });
  const recruitingAnswer = interviewRepository.createAnswer({
    sessionId: 1,
    questionId: 101,
    audioFileId: 12,
    durationSeconds: 45,
    submittedAt: now
  });

  return {
    mockAiFixture: {
      sessionId: mockSession.sessionId,
      answerId: mockAnswer.answerId,
      audioFileId: mockAnswer.audioFileId,
      audioS3Key: "candidate/1/answer-mock.wav"
    },
    mockAnswerWithoutFileFixture: {
      sessionId: mockSessionWithoutFile.sessionId,
      answerId: mockAnswerWithoutFile.answerId,
      audioS3Key: "candidate/1/answer-without-file.wav"
    },
    recruitingAiFixture: {
      sessionId: 1,
      answerId: recruitingAnswer.answerId,
      audioFileId: recruitingAnswer.audioFileId,
      audioS3Key: "candidate/1/answer-recruiting.wav"
    }
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
