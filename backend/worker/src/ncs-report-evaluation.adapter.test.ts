import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateNcsReportAnswers,
  planFactClarification,
  planNcsFollowUp,
} from "./ncs-report-evaluation.adapter";
import type { AnswerFactCheckProvider, AnswerFactCheckInput } from "./answer-fact-check.types";

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

test("current sessions convert unsupported profile versions to an incomplete fail-closed result", async () => {
  const result = await evaluateNcsReportAnswers(
    800,
    [{
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
    }],
    [11],
    undefined,
    sessionPolicies(),
  );

  assert.equal(result.evaluations.length, 0);
  assert.equal(result.finalEvaluation?.completionStatus, "INCOMPLETE");
  assert.equal(result.finalEvaluation?.totalScore, null);
  assert.equal(
    result.finalEvaluation?.incompleteReasons.some((reason) => reason.code === "UNSUPPORTED_PROFILE_VERSION"),
    true,
  );
});

test("current sessions expose STT and duplicate follow-up linkage as structured incomplete reasons", async () => {
  const base = {
    answerId: 120,
    question: "장애 원인과 해결 결과를 설명해주세요.",
    transcript: "",
    evaluationStatus: "STT_UNAVAILABLE" as const,
    transcriptUnavailableReason: "speech was not detected after the allowed reanswer",
    sessionQuestionId: 520,
    criterionId: 13,
    criterionTitleSnapshot: "문제 해결력",
    ncsProfileId: "PROBLEM_SOLVING" as const,
    ncsQuestionMode: "EXPERIENCE_BEHAVIOR" as const,
    ncsProfileVersion: PROFILE_VERSION,
    alignmentStatus: "ALIGNED",
  };
  const result = await evaluateNcsReportAnswers(
    801,
    [
      base,
      { answerId: 121, transcript: "첫 번째 보완 답변", isFollowUpAnswer: true, parentAnswerId: 120 },
      { answerId: 122, transcript: "두 번째 보완 답변", isFollowUpAnswer: true, parentAnswerId: 120 },
    ],
    [13],
    undefined,
    sessionPolicies(),
  );

  const reasons = result.finalEvaluation?.incompleteReasons ?? [];
  const sttReasons = reasons.filter((reason) => reason.code === "STT_UNAVAILABLE");
  assert.equal(sttReasons.length, 1);
  assert.deepEqual(sttReasons[0], {
    code: "STT_UNAVAILABLE",
    message: "Answer 120 cannot be evaluated because STT is unavailable: speech was not detected after the allowed reanswer",
    ncsProfileId: "PROBLEM_SOLVING",
    sessionQuestionId: 520,
    answerId: 120,
    retryable: false,
  });
  assert.equal(
    reasons.some((reason) => reason.code === "INSUFFICIENT_INPUT" && reason.answerId === 120),
    false,
  );
  assert.equal(reasons.some((reason) => reason.code === "FOLLOW_UP_LINK_INVALID"), true);
  assert.equal(result.evaluations.length, 1);
  assert.equal(result.evaluations[0]?.output.scoreStatus, "INSUFFICIENT_INPUT");
  assert.deepEqual(result.evaluations[0]?.output.scores, {
    competency: null,
    evidence: null,
    total: null,
  });
  assert.equal(result.evaluations[0]?.behaviorPoints, null);
  assert.equal(result.evaluations[0]?.logicPoints, null);
  assert.equal(result.evaluations[0]?.baseScore, null);
  assert.equal(result.evaluations[0]?.effectiveScore, null);
  assert.deepEqual(result.evaluations[0]?.evidences, []);
  assert.deepEqual(result.scores, []);
  assert.deepEqual(result.questionEvaluations, []);
  assert.equal(result.finalEvaluation?.completionStatus, "INCOMPLETE");
  assert.equal(result.finalEvaluation?.thresholdResult, "INCOMPLETE");
  assert.equal(result.finalEvaluation?.aiDecision, "FAIL");
  assert.equal(result.finalEvaluation?.totalScore, null);
  assert.equal(
    result.finalEvaluation?.profiles.find((profile) => profile.ncsProfileId === "PROBLEM_SOLVING")?.averageScore,
    null,
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

test("NCS follow-up planning keeps the session mode and answer time while targeting missing evidence", () => {
  const plan = planNcsFollowUp({
    answerId: 106,
    sessionQuestionId: 506,
    previousQuestion: "운영 장애의 원인을 분석하고 대안을 선택한 과정을 설명해주세요.",
    transcript: "로그를 확인하고 캐시 우회 대안을 선택했습니다.",
    ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
    answerTimeSec: 90,
    ncsBindings: [{
      criterionId: 15,
      criterionTitleSnapshot: "문제 해결력",
      ncsProfileId: "PROBLEM_SOLVING",
      ncsProfileVersion: PROFILE_VERSION,
      alignmentStatus: "ALIGNED",
      bindingOrder: 1,
    }],
  });

  assert.equal(plan?.required, true);
  assert.equal(plan?.questionMode, "EXPERIENCE_BEHAVIOR");
  assert.equal(plan?.answerTimeSec, 90);
  assert.ok((plan?.focusPoints.length ?? 0) > 0);
  assert.ok((plan?.baseScores[0]?.baseScore ?? 5) < 5);
});

test("follow-up answer is combined once and can only preserve or improve the base score", async () => {
  const baseTranscript =
    "결제 장애에서 오류 로그와 트래픽 지표를 분석했습니다. 캐시 우회와 즉시 롤백 대안을 비교해 캐시 우회를 선택하고 직접 적용했습니다.";
  const followUpTranscript =
    "적용 후 오류율이 8퍼센트에서 1퍼센트로 줄고 p95 응답 시간이 회복된 것을 대시보드와 회귀 테스트로 확인했습니다.";
  const result = await evaluateNcsReportAnswers(
    82,
    [
      {
        answerId: 107,
        question: "결제 장애의 원인을 분석하고 대안을 선택해 검증한 경험을 설명해주세요.",
        transcript: baseTranscript,
        sessionQuestionId: 507,
        ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
        ncsBindings: [{
          criterionId: 15,
          criterionTitleSnapshot: "문제 해결력",
          ncsProfileId: "PROBLEM_SOLVING",
          ncsProfileVersion: PROFILE_VERSION,
          alignmentStatus: "ALIGNED",
          bindingOrder: 1,
        }],
      },
      {
        answerId: 108,
        transcript: followUpTranscript,
        isFollowUpAnswer: true,
        parentAnswerId: 107,
      },
    ],
    [15],
  );

  const evaluation = result.evaluations[0]!;
  assert.equal(evaluation.followUpApplied, true);
  assert.ok(evaluation.baseScore !== null);
  assert.equal(evaluation.baseScore, evaluation.behaviorPoints! + evaluation.logicPoints!);
  assert.ok(evaluation.effectiveScore !== null && evaluation.effectiveScore >= evaluation.baseScore);
  assert.ok(evaluation.evidences.some((evidence) =>
    evidence.sourceAnswerId === 108 &&
    evidence.sourceKind === "FOLLOW_UP" &&
    followUpTranscript.includes(evidence.quote),
  ));
});

test("fact clarification plan requests one neutral confirmation for a core contradiction", async () => {
  const provider: AnswerFactCheckProvider = {
    async evaluate(input) {
      const claimText = "C는 객체지향 언어입니다.";
      return {
        model: "fact-fixture-v1",
        claims: [{
          claimText,
          startOffset: input.answerText.indexOf(claimText),
          endOffset: input.answerText.indexOf(claimText) + claimText.length,
          claimType: "TECHNICAL_FACT",
          claimRole: "ANSWER_CORE",
          verdict: "CONTRADICTED",
          confidence: 0.98,
          evidenceIds: [],
          rationale: "검증 근거와 모순됩니다.",
        }],
      };
    },
  };
  const plan = await planFactClarification({
    answerId: 200,
    previousQuestion: "C 프로젝트의 객체지향 설계를 설명해주세요.",
    transcript: "C는 객체지향 언어입니다. 그래서 클래스를 사용했습니다.",
    ncsQuestionMode: "TECHNICAL_KNOWLEDGE",
  }, {
    provider,
    providerMode: "mock",
    configuredModelVersion: "fact-fixture-v1",
    knowledgeSnapshotVersion: "FACT_GOLDEN_V1",
    evidenceLedger: [],
  });

  assert.equal(plan.required, true);
  assert.equal(plan.gateStatus, "FACT_CHECK_REQUIRED");
  assert.equal(plan.clarificationClaims.length, 1);
});

test("fact provider failure is recorded but does not force a clarification", async () => {
  const provider: AnswerFactCheckProvider = {
    async evaluate() {
      throw new Error("provider unavailable");
    },
  };
  const plan = await planFactClarification({
    answerId: 201,
    previousQuestion: "기술 선택의 근거를 설명해주세요.",
    transcript: "요구사항을 검토하고 구현했습니다.",
    ncsQuestionMode: "TECHNICAL_KNOWLEDGE",
  }, {
    provider,
    providerMode: "mock",
    configuredModelVersion: "fact-fixture-v1",
    knowledgeSnapshotVersion: "FACT_GOLDEN_V1",
    evidenceLedger: [],
  });

  assert.equal(plan.required, false);
  assert.equal(plan.providerStatus, "FAILED");
  assert.equal(plan.gateStatus, null);
});

test("final report fact-check uses the deterministic base and follow-up composition once", async () => {
  const inputs: AnswerFactCheckInput[] = [];
  const provider: AnswerFactCheckProvider = {
    async evaluate(input) {
      inputs.push(input);
      return { model: "fact-fixture-v1", claims: [] };
    },
  };
  const baseTranscript = "장애 원인을 로그로 분석하고 캐시 우회를 적용했습니다.";
  const followUpTranscript = "오류율이 8퍼센트에서 1퍼센트로 줄어든 것을 확인했습니다.";
  const result = await evaluateNcsReportAnswers(
    83,
    [{
      answerId: 109,
      question: "장애 원인과 대안 적용 결과를 설명해주세요.",
      transcript: baseTranscript,
      sessionQuestionId: 509,
      ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
      ncsBindings: [{
        criterionId: 15,
        criterionTitleSnapshot: "문제 해결력",
        ncsProfileId: "PROBLEM_SOLVING",
        ncsProfileVersion: PROFILE_VERSION,
        alignmentStatus: "ALIGNED",
        bindingOrder: 1,
      }],
    }, {
      answerId: 110,
      transcript: followUpTranscript,
      isFollowUpAnswer: true,
      parentAnswerId: 109,
      followUpReason: "FACT_CLARIFICATION",
    }],
    [15],
    undefined,
    undefined,
    {
      provider,
      providerMode: "mock",
      configuredModelVersion: "fact-fixture-v1",
      knowledgeSnapshotVersion: "FACT_GOLDEN_V1",
      evidenceLedger: [],
    },
  );

  assert.equal(inputs.length, 1);
  assert.equal(inputs[0]?.answerText, `${baseTranscript}\n${followUpTranscript}`);
  assert.equal(result.factChecks[0]?.answerId, 109);
  assert.equal(result.factChecks[0]?.followUpAnswerId, 110);
  assert.equal(result.factChecks[0]?.inputCompositionVersion, "BASE_FOLLOW_UP_V1");
  assert.equal(result.evaluations[0]?.followUpApplied, true);
  assert.ok(result.evaluations[0]!.effectiveScore! >= result.evaluations[0]!.baseScore!);
});

function sessionPolicies() {
  return [
    {
      ncsProfileId: "JOB_TECHNICAL" as const,
      criterionId: 11,
      criterionTitleSnapshot: "기술·직무",
      weight: 30,
      minimumAverageScore: 3,
      requiredQuestionCount: 2,
      ncsProfileVersion: PROFILE_VERSION,
    },
    {
      ncsProfileId: "COLLABORATION_COMMUNICATION" as const,
      criterionId: 12,
      criterionTitleSnapshot: "협업·의사소통",
      weight: 30,
      minimumAverageScore: 3,
      requiredQuestionCount: 2,
      ncsProfileVersion: PROFILE_VERSION,
    },
    {
      ncsProfileId: "PROBLEM_SOLVING" as const,
      criterionId: 13,
      criterionTitleSnapshot: "문제 해결력",
      weight: 40,
      minimumAverageScore: 3,
      requiredQuestionCount: 2,
      ncsProfileVersion: PROFILE_VERSION,
    },
  ];
}
