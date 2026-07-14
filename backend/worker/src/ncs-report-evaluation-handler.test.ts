import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import { MockAiTaskHandler } from "./mock-ai-task.handler";

const PROFILE_VERSION = "2025.12-v1";

test("REPORT_GENERATE evaluates NCS answers from session snapshots and saves canonical results", async () => {
  const results = new InMemoryAiResultRepository();
  const handler = new MockAiTaskHandler(results);
  const task = await handler.handle({
    processLogId: 901,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      payload: {
        reportId: 71,
        applicationId: 31,
        sessionId: 41,
        reportType: "RECRUITING_REPORT",
        jobDescription: "Redis 기반 API 안정성을 운영하는 백엔드 엔지니어",
        criteria: [{ criterionId: 11, name: "문제해결능력", weight: 100 }],
        answers: [
          {
            answerId: 101,
            question: "Redis 장애 문제의 원인을 분석하고 대안을 비교한 뒤 결과를 어떻게 검증했습니까?",
            transcript:
              "Redis 장애 원인을 로그와 지표로 분석했습니다. DB 우회와 캐시 복구 대안을 비교해 circuit breaker를 선택했습니다. 적용 뒤 DB CPU와 p95 응답 시간을 측정해 결과를 검증했습니다.",
            evaluationStatus: "EVALUATED",
            sessionQuestionId: 501,
            criterionId: 11,
            criterionTitleSnapshot: "문제해결능력",
            ncsProfileId: "PROBLEM_SOLVING",
            ncsQuestionMode: "SITUATIONAL_DESIGN",
            ncsProfileVersion: PROFILE_VERSION,
            alignmentStatus: "ALIGNED",
          },
        ],
      },
    }),
  });

  const output = JSON.parse(task.outputRef ?? "{}") as Record<string, unknown>;
  assert.equal(task.guardrail?.result, "PASS");
  assert.equal(typeof output.totalScore, "number");
  assert.equal((output.ncsAnswerEvaluations as Array<{ output: { scoreStatus: string } }>)[0]?.output.scoreStatus, "SCORED");

  await task.finalSave?.();
  assert.equal(results.ncsAnswerEvaluations.get(71)?.length, 1);
  assert.equal(results.reportScores.get(71)?.length, 1);
  assert.notEqual(results.generatedReports.get(71)?.totalScore, null);
});

test("REPORT_GENERATE stores insufficient NCS answers without a report score or zero total", async () => {
  const results = new InMemoryAiResultRepository();
  const handler = new MockAiTaskHandler(results);
  const task = await handler.handle({
    processLogId: 902,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      payload: {
        reportId: 72,
        applicationId: 32,
        sessionId: 42,
        reportType: "RECRUITING_REPORT",
        jobDescription: "협업 중심 백엔드 엔지니어",
        criteria: [{ criterionId: 12, name: "의사소통능력", weight: 100 }],
        answers: [
          {
            answerId: 102,
            question: "협업 갈등에서 상대에게 설명하고 합의를 어떻게 확인했습니까?",
            transcript: "잘했습니다.",
            evaluationStatus: "EVALUATED",
            sessionQuestionId: 502,
            criterionId: 12,
            criterionTitleSnapshot: "의사소통능력",
            ncsProfileId: "COMMUNICATION",
            ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
            ncsProfileVersion: PROFILE_VERSION,
            alignmentStatus: "ALIGNED",
          },
        ],
      },
    }),
  });

  const output = JSON.parse(task.outputRef ?? "{}") as {
    totalScore: number | null;
    scores: unknown[];
    ncsAnswerEvaluations: Array<{ output: { scoreStatus: string; scores: Record<string, number | null> } }>;
  };
  assert.equal(output.totalScore, null);
  assert.deepEqual(output.scores, []);
  assert.equal(output.ncsAnswerEvaluations[0]?.output.scoreStatus, "INSUFFICIENT_INPUT");
  assert.deepEqual(output.ncsAnswerEvaluations[0]?.output.scores, {
    competency: null,
    evidence: null,
    total: null,
  });

  await task.finalSave?.();
  assert.deepEqual(results.reportScores.get(72), []);
  assert.equal(results.ncsAnswerEvaluations.get(72)?.[0]?.output.scoreStatus, "INSUFFICIENT_INPUT");
  assert.equal(results.generatedReports.get(72)?.totalScore, null);
});

test("REPORT_GENERATE treats an explicit empty current-session policy as incomplete instead of legacy", async () => {
  const results = new InMemoryAiResultRepository();
  const handler = new MockAiTaskHandler(results);
  const task = await handler.handle({
    processLogId: 903,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      payload: {
        reportId: 73,
        applicationId: 33,
        sessionId: 43,
        reportType: "RECRUITING_REPORT",
        jobDescription: "백엔드 엔지니어",
        criteria: [{ criterionId: 13, name: "문제해결능력", weight: 100 }],
        ncsSessionPolicy: [],
        answers: [{
          answerId: 103,
          question: "장애 원인과 해결 결과를 설명해주세요.",
          transcript: "로그로 원인을 분석하고 대안을 적용한 뒤 결과를 측정했습니다.",
          evaluationStatus: "EVALUATED",
          sessionQuestionId: 503,
          criterionId: 13,
          criterionTitleSnapshot: "문제해결능력",
          ncsProfileId: "PROBLEM_SOLVING",
          ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
          ncsProfileVersion: PROFILE_VERSION,
          alignmentStatus: "ALIGNED",
        }],
      },
    }),
  });

  const output = JSON.parse(task.outputRef ?? "{}") as {
    totalScore: number | null;
    ncsFinalEvaluation: { completionStatus: string; aiDecision: string; incompleteReasons: Array<{ code: string }> };
  };
  assert.equal(output.totalScore, null);
  assert.equal(output.ncsFinalEvaluation.completionStatus, "INCOMPLETE");
  assert.equal(output.ncsFinalEvaluation.aiDecision, "FAIL");
  assert.equal(
    output.ncsFinalEvaluation.incompleteReasons.some((reason) => reason.code === "SESSION_SNAPSHOT_MISSING"),
    true,
  );
});
