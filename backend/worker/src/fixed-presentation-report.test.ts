import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import {
  SALTLUX_FIXED_PRESENTATION_FIXTURE_ID,
  buildSaltluxFixedPresentationReport,
} from "./fixed-presentation-report";
import { MockAiTaskHandler } from "./mock-ai-task.handler";
import { OpenAiAiTaskHandler } from "./openai-ai-task.handler";

const commonQuestion = "AI 검색 품질 기준을 팀과 합의한 과정을 설명해 주세요.";
const personalizedQuestion = "RAG 검색 정확도를 개선한 방법과 검증 결과를 설명해 주세요.";
const followUpQuestion = "개선 과정에서 품질 회귀는 어떻게 방지했나요?";

const criteria = [
  { criterionId: 11, name: "직무 전문성", weight: 30 },
  { criterionId: 12, name: "협업·의사소통", weight: 30 },
  { criterionId: 13, name: "문제 해결력", weight: 40 },
];

const policies = [
  { ncsProfileId: "JOB_TECHNICAL" as const, criterionId: 11, criterionTitleSnapshot: "직무 전문성", weight: 30, minimumAverageScore: 3, requiredQuestionCount: 1, ncsProfileVersion: "2025.12-v1" },
  { ncsProfileId: "COLLABORATION_COMMUNICATION" as const, criterionId: 12, criterionTitleSnapshot: "협업·의사소통", weight: 30, minimumAverageScore: 3, requiredQuestionCount: 1, ncsProfileVersion: "2025.12-v1" },
  { ncsProfileId: "PROBLEM_SOLVING" as const, criterionId: 13, criterionTitleSnapshot: "문제 해결력", weight: 40, minimumAverageScore: 3, requiredQuestionCount: 1, ncsProfileVersion: "2025.12-v1" },
];

const answers = [
  {
    answerId: 101,
    question: commonQuestion,
    sessionQuestionId: 201,
    ncsQuestionMode: "EXPERIENCE_BEHAVIOR" as const,
    ncsBindings: [{ criterionId: 12, criterionTitleSnapshot: "협업·의사소통", ncsProfileId: "COLLABORATION_COMMUNICATION", ncsProfileVersion: "2025.12-v1" }],
  },
  {
    answerId: 102,
    question: personalizedQuestion,
    sessionQuestionId: 202,
    ncsQuestionMode: "TECHNICAL_KNOWLEDGE" as const,
    ncsBindings: [
      { criterionId: 11, criterionTitleSnapshot: "직무 전문성", ncsProfileId: "JOB_TECHNICAL", ncsProfileVersion: "2025.12-v1" },
      { criterionId: 13, criterionTitleSnapshot: "문제 해결력", ncsProfileId: "PROBLEM_SOLVING", ncsProfileVersion: "2025.12-v1" },
    ],
  },
  {
    answerId: 103,
    question: followUpQuestion,
    sessionQuestionId: 203,
    isFollowUpAnswer: true,
    parentAnswerId: 102,
  },
];

test("fixed Saltlux report produces the precomputed 88 point NCS result", () => {
  const report = buildSaltluxFixedPresentationReport({
    reportId: 77,
    applicationId: 88,
    sessionId: 99,
    answers,
    criteria,
    policies,
  });

  assert.equal(report.totalScore, 88);
  assert.equal(report.ncsFinalEvaluation?.completionStatus, "COMPLETE");
  assert.equal(report.ncsFinalEvaluation?.aiDecision, "PASS");
  assert.equal(report.ncsAnswerEvaluations?.length, 3);
  assert.ok(report.ncsAnswerEvaluations?.every((evaluation) => evaluation.output.providerMode === "fixed"));
  assert.equal(
    report.ncsAnswerEvaluations?.find((evaluation) => evaluation.ncsProfileId === "PROBLEM_SOLVING")?.effectiveScore,
    5,
  );
});

test("OpenAI handler bypasses providers and persists the fixed report fixture", async () => {
  const results = new InMemoryAiResultRepository();
  let reportProviderCalls = 0;
  const fallback = new MockAiTaskHandler(results);
  const handler = new OpenAiAiTaskHandler(
    fallback,
    results,
    { async generateFollowUpQuestion() { throw new Error("not used"); } },
    {
      async generateReport() {
        reportProviderCalls += 1;
        throw new Error("fixed fixture must not call report provider");
      },
    },
  );
  const handled = await handler.handle({
    processLogId: 700,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      payload: {
        presentationFixtureId: SALTLUX_FIXED_PRESENTATION_FIXTURE_ID,
        reportId: 77,
        applicationId: 88,
        sessionId: 99,
        reportType: "RECRUITING_REPORT",
        jobDescription: "AI Backend Engineer",
        criteria,
        answers: answers.map((answer) => ({
          ...answer,
          transcript: "실제 STT는 고정 리포트 점수에 사용하지 않습니다.",
          ncsBindings: answer.ncsBindings?.map((binding, index) => ({
            ...binding,
            alignmentStatus: "ALIGNED",
            alignmentScore: 1,
            bindingOrder: index + 1,
          })),
        })),
        ncsSessionPolicy: policies,
      },
    }),
  });

  await handled.finalSave?.();
  assert.equal(reportProviderCalls, 0);
  assert.equal(results.generatedReports.get(77)?.totalScore, 88);
  assert.equal(JSON.parse(handled.outputRef ?? "{}").providerMode, "fixed");
});
