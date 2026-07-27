import type { CurrentUser } from "@init/common";
import {
  CandidateDomainError,
  CandidateService,
  DEV_CANDIDATE_USER,
  InMemoryCandidateRepository,
} from "../../candidate";
import { InMemoryInterviewRepository } from "../repository/in-memory-interview.repository";
import { InterviewService } from "./interview.service";
import type { IssueOpenAiRealtimeCredentialsInput } from "./realtime-session-credential.service";
import { InterviewerPreviewRealtimeService } from "./interviewer-preview-realtime.service";

describe("InterviewerPreviewRealtimeService", () => {
  const credentials = {
    accepted: true as const,
    mode: "realtime-voice" as const,
    provider: "openai" as const,
    model: "gpt-realtime-2",
    voice: "marin",
    transport: "webrtc" as const,
    clientSecret: "ephemeral-preview-secret",
    clientSecretType: "ephemeral" as const,
    expiresAt: "2026-07-24T00:02:00.000Z",
    endpoint: "https://api.openai.com/v1/realtime/calls",
  };

  it("issues standalone OpenAI credentials for candidate, company, and admin users", async () => {
    const issueCalls: IssueOpenAiRealtimeCredentialsInput[] = [];
    const service = new InterviewerPreviewRealtimeService({
      issueOpenAi: async (input: IssueOpenAiRealtimeCredentialsInput) => {
        issueCalls.push(input);
        return credentials;
      },
    } as never);
    const users: CurrentUser[] = [
      { userId: 7, userType: "CANDIDATE", candidateId: 11, companyId: null },
      { userId: 8, userType: "COMPANY", candidateId: null, companyId: 12 },
      { userId: 9, userType: "ADMIN", candidateId: null, companyId: null },
    ];

    const [candidate, company, admin] = await Promise.all(
      users.map((user) => service.createSession({}, user)),
    );

    expect(candidate.data).not.toHaveProperty("sessionId");
    expect(candidate.data.provider).toBe("openai");
    expect(company.data).not.toHaveProperty("sessionId");
    expect(admin.data).not.toHaveProperty("sessionId");
    expect(issueCalls[0]?.safetyIdentifier).toBe("preview-candidate-7");
    expect(issueCalls[1]?.safetyIdentifier).toBe("preview-company-8");
    expect(issueCalls[2]?.safetyIdentifier).toBe("preview-admin-9");
    expect(issueCalls[0]?.instructions).toMatch(/Stay silent until.*response\.create/i);
    expect(candidate.meta.traceId).toEqual(expect.any(String));
    expect(candidate.meta.timestamp).toEqual(expect.any(String));
  });

  it.each([
    {
      dto: { mode: "text" },
      field: "mode",
      reason: "mode must be realtime-voice",
    },
    {
      dto: { transport: "websocket" },
      field: "transport",
      reason: "transport must be webrtc",
    },
  ])("rejects an invalid $field before issuing credentials", async ({ dto, field, reason }) => {
    const issueOpenAi = jest.fn();
    const service = new InterviewerPreviewRealtimeService({ issueOpenAi } as never);

    await expect(service.createSession(
      dto as never,
      { userId: 7, userType: "CANDIDATE", candidateId: 11, companyId: null },
    )).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_VALIDATION_FAILED",
      statusCode: 400,
      details: [{ field, reason }],
    });
    expect(issueOpenAi).not.toHaveBeenCalled();
  });

  it.each([
    { label: "null", dto: null },
    { label: "number", dto: 42 },
    { label: "string", dto: "invalid" },
    { label: "boolean", dto: true },
    { label: "array", dto: [] },
  ])("rejects a $label preview body before issuing credentials", async ({ dto }) => {
    const issueOpenAi = jest.fn();
    const service = new InterviewerPreviewRealtimeService({ issueOpenAi } as never);

    await expect(service.createSession(
      dto as never,
      { userId: 7, userType: "CANDIDATE", candidateId: 11, companyId: null },
    )).rejects.toMatchObject<Partial<CandidateDomainError>>({
      code: "COMMON_VALIDATION_FAILED",
      statusCode: 400,
      message: "Request body is invalid.",
      details: [{ field: "realtimeSession", reason: "realtimeSession must be an object" }],
    });
    expect(issueOpenAi).not.toHaveBeenCalled();
  });

  it("preserves object-shape validation for existing interview realtime sessions", async () => {
    const originalProvider = process.env.AI_INTERVIEWER_REALTIME_PROVIDER;
    const issueOpenAi = jest.fn().mockResolvedValue(credentials);
    const candidateService = new CandidateService(new InMemoryCandidateRepository());
    const interviewService = new InterviewService(
      candidateService,
      new InMemoryInterviewRepository(),
      undefined,
      undefined,
      undefined,
      undefined,
      { issueOpenAi } as never,
    );
    const started = await interviewService.startMockInterview(
      { questionTypes: ["INTRO"], showQuestionText: false },
      DEV_CANDIDATE_USER,
    );
    process.env.AI_INTERVIEWER_REALTIME_PROVIDER = "openai";

    try {
      for (const dto of [null, 42, "invalid", true, []]) {
        await expect(interviewService.createMockRealtimeSession(
          started.data.sessionId,
          dto as never,
          DEV_CANDIDATE_USER,
        )).rejects.toMatchObject<Partial<CandidateDomainError>>({
          code: "COMMON_VALIDATION_FAILED",
          statusCode: 400,
          details: [{ field: "realtimeSession", reason: "realtimeSession must be an object" }],
        });
      }
      expect(issueOpenAi).not.toHaveBeenCalled();
    } finally {
      if (originalProvider === undefined) {
        delete process.env.AI_INTERVIEWER_REALTIME_PROVIDER;
      } else {
        process.env.AI_INTERVIEWER_REALTIME_PROVIDER = originalProvider;
      }
    }
  });
});
