import assert from "node:assert/strict";

import type { InterviewAnswer, InterviewQuestion } from "../../interview";
import type { CandidateFollowUpQuestionRecord } from "../repository/candidate-report.repository";
import type { InterviewAnswerInput } from "../report.types";
import { ReportService } from "./report.service";

describe("ReportService follow-up linkage", () => {
  it("links a private follow-up answer by inserted session question ID instead of question text", async () => {
    const questions = new Map<number, InterviewQuestion>([
      [101, {
        questionId: 101,
        questionType: "TECHNICAL",
        content: "기술 선택의 근거를 설명해 주세요.",
        sortOrder: 1,
        interviewType: "RECRUITING",
        isActive: false,
      }],
      [900_001, {
        questionId: 900_001,
        questionType: "FOLLOW_UP",
        content: "세션에 저장된 실제 꼬리질문 문장입니다.",
        sortOrder: 2,
        interviewType: "RECRUITING",
        isActive: false,
      }],
    ]);
    const followUps: CandidateFollowUpQuestionRecord[] = [{
      followUpId: 701,
      answerId: 1001,
      insertedSessionQuestionId: 502,
      content: "문자열이 달라도 ID로 연결되어야 합니다.",
      generationStatus: "INSERTED",
      policy: "RECRUITING",
      reason: "NCS_EVIDENCE_GAP",
      createdAt: "2026-07-18T00:00:00.000Z",
    }];
    const answers: InterviewAnswer[] = [
      {
        answerId: 1001,
        sessionId: 901,
        questionId: 101,
        sessionQuestionId: 501,
        transcript: "성능 병목을 확인한 뒤 캐시를 적용하고 지연 시간을 비교했습니다.",
        durationSeconds: 30,
        submittedAt: "2026-07-18T00:01:00.000Z",
      },
      {
        answerId: 1002,
        sessionId: 901,
        questionId: 900_001,
        sessionQuestionId: 502,
        transcript: "적용 전후의 p95 지연 시간을 비교해 개선 결과를 확인했습니다.",
        durationSeconds: 20,
        submittedAt: "2026-07-18T00:02:00.000Z",
      },
    ];
    const service = new ReportService(
      {} as never,
      {
        findQuestion: async (questionId: number) => questions.get(questionId),
        listTranscriptProcesses: async () => [],
      } as never,
      {
        listFollowUpQuestionsByAnswerIds: async () => followUps,
      } as never,
      {} as never,
    );

    const inputs = await (service as unknown as {
      reportAnswerInputs(answers: InterviewAnswer[], reportType: "RECRUITING_REPORT"): Promise<InterviewAnswerInput[]>;
    }).reportAnswerInputs(answers, "RECRUITING_REPORT");

    assert.equal(inputs[1]?.isFollowUpAnswer, true);
    assert.equal(inputs[1]?.parentAnswerId, 1001);
    assert.equal(inputs[1]?.followUpReason, "NCS_EVIDENCE_GAP");
    assert.equal(inputs[1]?.sessionQuestionId, 502);
  });

  it("treats a latest FAILED NON_RETRYABLE STT process as terminally unavailable", async () => {
    const answer: InterviewAnswer = {
      answerId: 1003,
      sessionId: 901,
      questionId: 102,
      sessionQuestionId: 503,
      durationSeconds: 30,
      submittedAt: "2026-07-18T00:03:00.000Z",
    };
    const service = new ReportService(
      {} as never,
      {
        findQuestion: async () => ({
          questionId: 102,
          questionType: "TECHNICAL",
          content: "장애 대응 경험을 설명해 주세요.",
          sortOrder: 1,
          interviewType: "RECRUITING",
          isActive: false,
        }),
        listTranscriptProcesses: async () => [{
          processLogId: 801,
          status: "FAILED",
          failureCategory: "NON_RETRYABLE",
          failureReason: "STT retry limit exceeded after 3 total attempts",
          createdAt: "2026-07-18T00:04:00.000Z",
        }],
      } as never,
      {
        listFollowUpQuestionsByAnswerIds: async () => [],
      } as never,
      {} as never,
    );

    const inputs = await (service as unknown as {
      reportAnswerInputs(answers: InterviewAnswer[], reportType: "RECRUITING_REPORT"): Promise<InterviewAnswerInput[]>;
    }).reportAnswerInputs([answer], "RECRUITING_REPORT");

    assert.equal(inputs[0]?.evaluationStatus, "STT_UNAVAILABLE");
    assert.match(inputs[0]?.transcriptUnavailableReason ?? "", /retry limit exceeded/);
  });

  it("treats a latest FAILED RETRY_EXHAUSTED STT process as terminally unavailable", async () => {
    const answer: InterviewAnswer = {
      answerId: 1010,
      sessionId: 901,
      questionId: 110,
      sessionQuestionId: 510,
      durationSeconds: 30,
      submittedAt: "2026-07-18T00:03:00.000Z",
    };
    const service = new ReportService(
      {} as never,
      {
        findQuestion: async () => ({
          questionId: 110,
          questionType: "TECHNICAL",
          content: "장애 대응 경험을 설명해 주세요.",
          sortOrder: 1,
          interviewType: "RECRUITING",
          isActive: false,
        }),
        listAnswersBySession: async () => [answer],
        listTranscriptProcesses: async () => [{
          processLogId: 810,
          status: "FAILED",
          failureCategory: "RETRY_EXHAUSTED",
          failureReason: "Automatic retry limit exhausted after 3 total attempts.",
          createdAt: "2026-07-18T00:04:00.000Z",
        }],
      } as never,
      {
        listFollowUpQuestionsByAnswerIds: async () => [],
      } as never,
      {} as never,
    );

    const inputs = await (service as unknown as {
      reportAnswerInputs(answers: InterviewAnswer[], reportType: "RECRUITING_REPORT"): Promise<InterviewAnswerInput[]>;
    }).reportAnswerInputs([answer], "RECRUITING_REPORT");

    assert.equal(inputs[0]?.evaluationStatus, "STT_UNAVAILABLE");
    assert.match(inputs[0]?.transcriptUnavailableReason ?? "", /retry limit exhausted/);

    const built = await (service as unknown as {
      buildReportGenerationInput(args: unknown): Promise<{
        input: { payload: { answers: InterviewAnswerInput[] } };
      }>;
    }).buildReportGenerationInput({
      reportId: 301,
      applicationId: 201,
      reportType: "RECRUITING_REPORT",
      kind: "RECRUITING_REPORT_GENERATE",
      session: {
        sessionId: 901,
        interviewType: "RECRUITING",
        showQuestionText: true,
        ncsScoringVersion: "NCS_RECRUITING_SCORING_V1",
        sessionMode: "STANDARD",
      },
      jobDescription: "Backend engineer",
      currentUser: { userId: 1, userType: "CANDIDATE", candidateId: 1 },
    });

    assert.equal(built.input.payload.answers[0]?.evaluationStatus, "STT_UNAVAILABLE");
  });

  it("does not let an older terminal STT failure override a newer pending attempt", async () => {
    const answer: InterviewAnswer = {
      answerId: 1004,
      sessionId: 901,
      questionId: 103,
      sessionQuestionId: 504,
      durationSeconds: 30,
      submittedAt: "2026-07-18T00:05:00.000Z",
    };
    const service = new ReportService(
      {} as never,
      {
        findQuestion: async () => ({
          questionId: 103,
          questionType: "TECHNICAL",
          content: "재시도 정책을 설명해 주세요.",
          sortOrder: 1,
          interviewType: "RECRUITING",
          isActive: false,
        }),
        listTranscriptProcesses: async () => [
          {
            processLogId: 803,
            status: "PENDING",
            createdAt: "2026-07-18T00:07:00.000Z",
          },
          {
            processLogId: 802,
            status: "FAILED",
            failureCategory: "REANSWER_REQUIRED",
            failureReason: "이전 음성 인식 실패",
            createdAt: "2026-07-18T00:06:00.000Z",
          },
        ],
      } as never,
      {
        listFollowUpQuestionsByAnswerIds: async () => [],
      } as never,
      {} as never,
    );

    const inputs = await (service as unknown as {
      reportAnswerInputs(answers: InterviewAnswer[], reportType: "RECRUITING_REPORT"): Promise<InterviewAnswerInput[]>;
    }).reportAnswerInputs([answer], "RECRUITING_REPORT");

    assert.equal(inputs[0]?.evaluationStatus, undefined);
    assert.equal(inputs[0]?.transcriptUnavailableReason, undefined);
  });

  it("excludes a saved transcript after semantic quality failure", async () => {
    const answer: InterviewAnswer = {
      answerId: 1005,
      sessionId: 901,
      questionId: 104,
      sessionQuestionId: 505,
      transcript: "캐시 캐시 장애를 하고 하고 해결 말이 끊긴 문장입니다.",
      durationSeconds: 30,
      submittedAt: "2026-07-18T00:08:00.000Z",
    };
    const service = new ReportService(
      {} as never,
      {
        findQuestion: async () => ({
          questionId: 104,
          questionType: "TECHNICAL",
          content: "장애 대응 경험을 설명해 주세요.",
          sortOrder: 1,
          interviewType: "RECRUITING",
          isActive: false,
        }),
        listTranscriptProcesses: async () => [{
          processLogId: 804,
          status: "FAILED",
          failureCategory: "REANSWER_REQUIRED",
          failureReason: "음성 인식 결과의 문맥을 신뢰하기 어려워 답변을 평가할 수 없습니다.",
          createdAt: "2026-07-18T00:09:00.000Z",
        }],
      } as never,
      { listFollowUpQuestionsByAnswerIds: async () => [] } as never,
      {} as never,
    );

    const inputs = await (service as unknown as {
      reportAnswerInputs(answers: InterviewAnswer[], reportType: "RECRUITING_REPORT"): Promise<InterviewAnswerInput[]>;
    }).reportAnswerInputs([answer], "RECRUITING_REPORT");

    assert.equal(inputs[0]?.evaluationStatus, "STT_UNAVAILABLE");
    assert.equal(inputs[0]?.transcript, undefined);
    assert.match(inputs[0]?.transcriptUnavailableReason ?? "", /문맥을 신뢰하기 어려워/);
  });

  it("finalizes the fixed Saltlux demo report synchronously without dispatching SQS", async () => {
    let dispatched = false;
    let finalizedInput: Record<string, unknown> | undefined;
    const answer: InterviewAnswer = {
      answerId: 2001,
      sessionId: 3001,
      questionId: 4001,
      sessionQuestionId: 5001,
      durationSeconds: 20,
      submittedAt: "2026-07-20T00:00:00.000Z",
    };
    const service = new ReportService(
      {
        getOwnedApplicationReportContext: async () => ({
          application: { applicationId: 6001, postingId: 7001 },
          session: {
            sessionId: 3001,
            interviewType: "RECRUITING",
            showQuestionText: true,
            sessionMode: "DEMO_PRESET",
            status: "COMPLETED",
          },
          job: {
            companyName: "솔트룩스",
            title: "[Product Center] AI Backend Engineer (신입/경력)",
            jobRole: "AI Backend Engineer",
            jobDescription: "AI 검색 백엔드 개발",
          },
        }),
      } as never,
      {
        listAnswersBySession: async () => [answer],
        findQuestion: async () => ({
          questionId: 4001,
          questionType: "EXPERIENCE",
          content: "AI 검색 품질 기준을 팀과 합의한 과정을 설명해 주세요.",
          sortOrder: 1,
          interviewType: "RECRUITING",
          isActive: false,
        }),
        listTranscriptProcesses: async () => [{
          processLogId: 8001,
          status: "RUNNING",
          createdAt: "2026-07-20T00:00:01.000Z",
        }],
        listNcsSessionPolicies: async () => [],
      } as never,
      {
        listFollowUpQuestionsByAnswerIds: async () => [],
        listEvaluationCriteriaByPosting: async () => [],
      } as never,
      {
        dispatchReportGeneration: async () => {
          dispatched = true;
          throw new Error("fixed demo must not be dispatched");
        },
      } as never,
      undefined,
      {
        finalizeSaltluxFixedDemo: async (input: Record<string, unknown>) => {
          finalizedInput = input;
          return { processLogId: 9001, inputRef: "fixed-demo-report" };
        },
      } as never,
    );

    const result = await service.requestApplicationReportGeneration(6001, {
      userId: 77,
      candidateId: 66,
      userType: "CANDIDATE",
    });

    assert.equal(dispatched, false);
    assert.equal(finalizedInput?.applicationId, 6001);
    assert.equal(result.data.queued, false);
    assert.equal(result.data.status, "COMPLETED");
    assert.equal(result.data.reportStatus, "COMPLETED");
  });
});
