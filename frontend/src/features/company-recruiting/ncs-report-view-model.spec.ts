import {
  NCS_COMPLETE_FAIL_FIXTURE,
  NCS_COMPLETE_PASS_FIXTURE,
  NCS_INCOMPLETE_FIXTURE,
  NCS_PROFILE_THRESHOLD_FAIL_FIXTURE,
} from "./ncs-report.fixtures";
import {
  formatNcsScore,
  getNcsEvaluationEvidences,
  getValidNcsFindings,
} from "./ncs-report-view-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(NCS_COMPLETE_PASS_FIXTURE.result.totalScore === 84, "PASS fixture 총점은 84여야 한다.");
assert(NCS_COMPLETE_PASS_FIXTURE.result.aiDecision === "PASS", "PASS fixture 판정이 잘못됐다.");
assert(NCS_COMPLETE_FAIL_FIXTURE.result.thresholdResult === "BELOW_THRESHOLD", "FAIL fixture 기준 상태가 잘못됐다.");
assert(NCS_COMPLETE_FAIL_FIXTURE.result.totalScore === 72, "FAIL fixture 총점은 profile 반영 점수 합계와 일치해야 한다.");
assert(NCS_COMPLETE_FAIL_FIXTURE.result.decisionReasonCode === "OVERALL_SCORE_BELOW_THRESHOLD", "총점 미달 사유가 잘못됐다.");
assert((NCS_PROFILE_THRESHOLD_FAIL_FIXTURE.result.totalScore ?? 0) >= 80, "역량 미달 fixture 총점은 80점 이상이어야 한다.");
assert(NCS_PROFILE_THRESHOLD_FAIL_FIXTURE.result.decisionReasonCode === "PROFILE_SCORE_BELOW_THRESHOLD", "역량 미달 사유가 잘못됐다.");
assert(NCS_PROFILE_THRESHOLD_FAIL_FIXTURE.profiles.some((profile) => (profile.averageScore ?? 5) < 3), "최소 역량 기준 미달 profile이 없다.");
assert(NCS_INCOMPLETE_FIXTURE.result.totalScore === null, "INCOMPLETE는 totalScore가 null이어야 한다.");
assert(NCS_INCOMPLETE_FIXTURE.result.decisionReasonCode === "EVALUATION_INCOMPLETE", "INCOMPLETE 사유가 잘못됐다.");
assert(NCS_INCOMPLETE_FIXTURE.notices.some((notice) => notice.code === "INCOMPLETE_FAIL_CLOSED"), "INCOMPLETE 정책 안내가 누락됐다.");
assert(formatNcsScore(0) === "0점", "0점은 유효한 점수로 표시해야 한다.");
assert(formatNcsScore(null) === "점수 산정 불가", "null은 점수 산정 불가로 표시해야 한다.");

const dualProfileQuestion = NCS_COMPLETE_PASS_FIXTURE.questions[0];
assert(NCS_COMPLETE_PASS_FIXTURE.questions.length === 3, "질문은 profile 수만큼 중복되면 안 된다.");
assert(dualProfileQuestion.profileEvaluations.length === 2, "한 질문에서 두 profile 평가를 유지해야 한다.");

const followUpEvaluation = NCS_COMPLETE_PASS_FIXTURE.questions[2].profileEvaluations[0];
const followUpEvidence = getNcsEvaluationEvidences(
  NCS_COMPLETE_PASS_FIXTURE,
  NCS_COMPLETE_PASS_FIXTURE.questions[2].sessionQuestionId,
  followUpEvaluation.ncsProfileId,
  followUpEvaluation.evidenceIds,
  followUpEvaluation.ncsEvaluationId,
);
assert(followUpEvidence.some((evidence) => evidence.sourceKind === "BASE"), "기본 답변 근거가 누락됐다.");
assert(followUpEvidence.some((evidence) => evidence.sourceKind === "FOLLOW_UP"), "꼬리답변 근거가 누락됐다.");
assert((followUpEvaluation.effectiveScore ?? 0) >= (followUpEvaluation.baseScore ?? 0), "전달된 effectiveScore가 baseScore보다 낮다.");

const mismatchedEvaluationEvidence = getNcsEvaluationEvidences(
  NCS_COMPLETE_PASS_FIXTURE,
  NCS_COMPLETE_PASS_FIXTURE.questions[2].sessionQuestionId,
  followUpEvaluation.ncsProfileId,
  followUpEvaluation.evidenceIds,
  999999,
);
assert(mismatchedEvaluationEvidence.length === 0, "다른 평가에 속한 evidence가 노출된다.");

const withInvalidFinding = {
  ...NCS_COMPLETE_PASS_FIXTURE,
  findings: [
    ...NCS_COMPLETE_PASS_FIXTURE.findings,
    {
      ...NCS_COMPLETE_PASS_FIXTURE.findings[0],
      findingId: "invalid-evidence",
      evidenceIds: [999999],
    },
  ],
};
assert(getValidNcsFindings(withInvalidFinding).length === NCS_COMPLETE_PASS_FIXTURE.findings.length, "존재하지 않는 evidence ID의 finding이 노출된다.");

const withMismatchedProfileFinding = {
  ...NCS_COMPLETE_PASS_FIXTURE,
  findings: [
    ...NCS_COMPLETE_PASS_FIXTURE.findings,
    {
      ...NCS_COMPLETE_PASS_FIXTURE.findings[0],
      findingId: "mismatched-profile",
      ncsProfileId: "COLLABORATION_COMMUNICATION" as const,
      evidenceIds: [2001],
    },
  ],
};
assert(
  getValidNcsFindings(withMismatchedProfileFinding).length === NCS_COMPLETE_PASS_FIXTURE.findings.length,
  "다른 역량의 evidence를 참조한 finding이 노출된다.",
);

console.log("ncs-report-view-model.spec: all assertions passed");
