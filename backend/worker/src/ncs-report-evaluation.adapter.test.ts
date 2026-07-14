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

test("one question with two canonical bindings creates two 0-to-5 evaluation rows", async () => {
  const transcript =
    "배포 일정 갈등에서 오류 로그와 고객 영향 자료를 먼저 공유했습니다. 백엔드와 운영팀의 우선순위를 확인하고 단계 배포와 전체 롤백 대안을 비교했습니다. 합의한 단계 배포를 적용한 뒤 오류율과 응답 시간을 함께 확인해 결과를 검증했습니다.";
  const result = await evaluateNcsReportAnswers(
    81,
    [{
      answerId: 105,
      question: "배포 장애 갈등 상황에서 정보를 공유하고 대안을 조율해 문제를 해결한 과정을 설명해주세요.",
      transcript,
      sessionQuestionId: 505,
      ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
      ncsBindings: [
        {
          criterionId: 14,
          criterionTitleSnapshot: "협업·의사소통",
          ncsProfileId: "COLLABORATION_COMMUNICATION",
          ncsProfileVersion: PROFILE_VERSION,
          alignmentStatus: "ALIGNED",
          bindingOrder: 1,
        },
        {
          criterionId: 15,
          criterionTitleSnapshot: "문제 해결력",
          ncsProfileId: "PROBLEM_SOLVING",
          ncsProfileVersion: PROFILE_VERSION,
          alignmentStatus: "ALIGNED",
          bindingOrder: 2,
        },
      ],
    }],
    [14, 15],
  );

  assert.equal(result.evaluations.length, 2);
  assert.deepEqual(
    result.evaluations.map((evaluation) => evaluation.ncsProfileId),
    ["COLLABORATION_COMMUNICATION", "PROBLEM_SOLVING"],
  );
  for (const evaluation of result.evaluations) {
    assert.equal(evaluation.output.scoreStatus, "SCORED");
    assert.ok(evaluation.behaviorPoints !== null && evaluation.behaviorPoints >= 0 && evaluation.behaviorPoints <= 3);
    assert.ok(evaluation.logicPoints !== null && evaluation.logicPoints >= 0 && evaluation.logicPoints <= 2);
    assert.equal(evaluation.baseScore, evaluation.behaviorPoints! + evaluation.logicPoints!);
    assert.equal(evaluation.effectiveScore, evaluation.baseScore);
    assert.equal(evaluation.followUpApplied, false);
    assert.ok(evaluation.evidences.length > 0);
    assert.ok(evaluation.evidences.every((evidence) =>
      evidence.sourceAnswerId === 105 && evidence.sourceKind === "BASE" && transcript.includes(evidence.quote),
    ));
  }
});
