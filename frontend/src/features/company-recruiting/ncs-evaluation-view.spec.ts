import { strict as assert } from "node:assert";

import { buildNcsEvaluationViews } from "./ncs-evaluation-view";
import type { ApplicantEvaluation } from "./types";

const answer = {
  answerId: 101,
  questionId: 201,
  videoFileId: null,
  audioFileId: null,
  videoFile: null,
  audioFile: null,
  questionType: "TECHNICAL",
  questionContent: "Redis 장애 대응 과정과 검증 방법을 설명해주세요.",
  transcript: "로그로 원인을 찾고 복구 후 지표를 검증했습니다.",
  durationSeconds: 60,
  submittedAt: "2026-07-14T00:00:00.000Z",
  followUpQuestions: [],
} satisfies ApplicantEvaluation["answers"][number];

function evaluation(
  scoreStatus: "SCORED" | "INSUFFICIENT_INPUT" | "LOW_ALIGNMENT" | "BLOCKED",
): NonNullable<ApplicantEvaluation["report"]>["ncsAnswerEvaluations"][number] {
  const scored = scoreStatus === "SCORED";
  return {
    ncsEvaluationId: 1,
    answerId: 101,
    sessionQuestionId: 301,
    criterionId: 401,
    criterionTitleSnapshot: "디지털역량",
    ncsProfileId: "DIGITAL",
    ncsQuestionMode: "TECHNICAL_KNOWLEDGE",
    ncsProfileVersion: "2025.12-v1",
    scoreStatus,
    scores: {
      competency: scored ? 0 : null,
      evidence: scored ? 60 : null,
      total: scored ? 30 : null,
    },
    coverage: 0.75,
    confidence: "MEDIUM",
    rubricVersion: "ncs-evidence-growth-v1",
    promptVersion: "ncs-text-evaluation-playground-v1",
    providerMode: "mock",
    model: null,
    result: scored
      ? {
          competencies: [
            { behaviors: [{ evidenceQuotes: ["로그로 원인을 찾고", "복구 후 지표를 검증했습니다."] }] },
          ],
          evidenceMaturity: {
            dimensions: [{ evidenceQuotes: ["복구 후 지표를 검증했습니다."] }],
          },
          growth: {
            strengths: ["원인 확인 절차를 설명했습니다."],
            gaps: ["대안 비교 근거가 부족합니다."],
            nextAction: "대안별 장단점과 선택 근거를 보강하세요.",
          },
        }
      : { competencies: [{ behaviors: [{ evidenceQuotes: ["노출하면 안 되는 내부 결과"] }] }] },
    updatedAt: "2026-07-14T00:01:00.000Z",
  };
}

function testScoredViewPreservesZeroAndExactEvidence() {
  const [view] = buildNcsEvaluationViews([evaluation("SCORED")], [answer]);

  assert.equal(view?.question, answer.questionContent);
  assert.equal(view?.profileLabel, "디지털");
  assert.equal(view?.questionModeLabel, "기술 지식");
  assert.equal(view?.competencyScore, 0);
  assert.equal(view?.coveragePercent, 75);
  assert.deepEqual(view?.evidenceQuotes, ["로그로 원인을 찾고", "복구 후 지표를 검증했습니다."]);
  assert.equal(view?.nextAction, "대안별 장단점과 선택 근거를 보강하세요.");
}

function testUnscoredViewNeverProjectsInternalResultAsEvidence() {
  for (const status of ["INSUFFICIENT_INPUT", "LOW_ALIGNMENT", "BLOCKED"] as const) {
    const [view] = buildNcsEvaluationViews([evaluation(status)], [answer]);
    assert.equal(view?.totalScore, null);
    assert.deepEqual(view?.evidenceQuotes, []);
    assert.notEqual(view?.statusLabel, "평가 완료");
    assert.ok(view?.statusMessage);
  }
}

testScoredViewPreservesZeroAndExactEvidence();
testUnscoredViewNeverProjectsInternalResultAsEvidence();
