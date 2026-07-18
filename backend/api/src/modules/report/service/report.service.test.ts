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
        listSttProcesses: async () => [],
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
});
