import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNcsReportAnswers } from "./ncs-report-evaluation.adapter";

const PROFILE_VERSION = "2025.12-v1";

test("NCS report evaluation stores exact answer evidence and aggregates only scored answers", async () => {
  const result = await evaluateNcsReportAnswers(
    77,
    [
      {
        answerId: 101,
        question: "Redis 캐시 장애가 발생했을 때 원인을 분석하고 대안을 비교한 뒤 결과를 어떻게 검증하겠습니까?",
        transcript:
          "Redis 장애 원인을 로그와 캐시 미스 지표로 분석했습니다. DB 우회와 캐시 복구 대안을 비교해 circuit breaker를 선택했습니다. 적용 뒤 DB CPU와 p95 응답 시간을 측정해 결과를 검증했습니다.",
        sessionQuestionId: 501,
        criterionId: 11,
        criterionTitleSnapshot: "문제해결능력",
        ncsProfileId: "PROBLEM_SOLVING",
        ncsQuestionMode: "SITUATIONAL_DESIGN",
        ncsProfileVersion: PROFILE_VERSION,
        alignmentStatus: "ALIGNED",
      },
    ],
    [11],
  );

  assert.equal(result.evaluations[0]?.reportId, 77);
  assert.equal(result.evaluations[0]?.output.scoreStatus, "SCORED");
  assert.equal(result.scores.length, 1);
  assert.equal(result.questionEvaluations.length, 1);
  assert.equal(result.allProfilesScored, true);
  assert.ok(result.scores[0]!.evidences.length > 0);
  for (const evidence of result.scores[0]!.evidences) {
    assert.ok(result.evaluations[0]!.output.scoreStatus === "SCORED");
    assert.ok(result.evaluations[0]!.question.length > 0);
    assert.ok(
      "Redis 장애 원인을 로그와 캐시 미스 지표로 분석했습니다. DB 우회와 캐시 복구 대안을 비교해 circuit breaker를 선택했습니다. 적용 뒤 DB CPU와 p95 응답 시간을 측정해 결과를 검증했습니다."
        .includes(evidence.text),
    );
  }
});

test("insufficient NCS answers keep nullable scores and are excluded from report averages", async () => {
  const result = await evaluateNcsReportAnswers(
    78,
    [
      {
        answerId: 102,
        question: "협업 갈등에서 상대에게 설명하고 합의를 어떻게 확인했습니까?",
        transcript: "잘했습니다.",
        sessionQuestionId: 502,
        criterionId: 12,
        criterionTitleSnapshot: "의사소통능력",
        ncsProfileId: "COMMUNICATION",
        ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
        ncsProfileVersion: PROFILE_VERSION,
        alignmentStatus: "ALIGNED",
      },
    ],
    [12],
  );

  assert.equal(result.evaluations[0]?.output.scoreStatus, "INSUFFICIENT_INPUT");
  assert.deepEqual(result.evaluations[0]?.output.scores, { competency: null, evidence: null, total: null });
  assert.deepEqual(result.scores, []);
  assert.deepEqual(result.questionEvaluations, []);
  assert.equal(result.allProfilesScored, false);
});

test("unaligned session snapshots never invoke scoring or produce a zero score", async () => {
  const result = await evaluateNcsReportAnswers(
    79,
    [
      {
        answerId: 103,
        question: "기술 시스템의 원리와 구현, 위험 검증을 설명해주세요.",
        transcript:
          "API 구조를 설계하고 구현했습니다. 장애 위험은 부하 테스트와 모니터링으로 검증하고 실패 시 롤백했습니다.",
        sessionQuestionId: 503,
        criterionId: 13,
        criterionTitleSnapshot: "디지털능력",
        ncsProfileId: "DIGITAL",
        ncsQuestionMode: "TECHNICAL_KNOWLEDGE",
        ncsProfileVersion: PROFILE_VERSION,
        alignmentStatus: "REVIEW_REQUIRED",
        alignmentScore: 0.4,
      },
    ],
    [13],
  );

  assert.equal(result.evaluations[0]?.output.scoreStatus, "LOW_ALIGNMENT");
  assert.deepEqual(result.evaluations[0]?.output.scores, { competency: null, evidence: null, total: null });
  assert.equal(result.scores.length, 0);
});

test("unsupported profile versions fail before evaluation", async () => {
  await assert.rejects(
    () =>
      evaluateNcsReportAnswers(
        80,
        [
          {
            answerId: 104,
            question: "문제 원인과 해결 결과를 설명해주세요.",
            transcript: "문제 원인을 로그로 분석하고 해결한 뒤 결과를 테스트로 확인했습니다.",
            sessionQuestionId: 504,
            criterionId: 11,
            criterionTitleSnapshot: "문제해결능력",
            ncsProfileId: "PROBLEM_SOLVING",
            ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
            ncsProfileVersion: "unsupported",
            alignmentStatus: "ALIGNED",
          },
        ],
        [11],
      ),
    /unsupported NCS profile version/,
  );
});
