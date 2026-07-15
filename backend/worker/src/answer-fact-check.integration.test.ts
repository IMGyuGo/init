import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import {
  AnswerFactCheckProvider,
  AnswerFactCheckTimeoutError,
} from "./answer-fact-check.types";
import { MockAiTaskHandler } from "./mock-ai-task.handler";

test("NCS score stays unchanged when a core technical claim requires fact clarification", async () => {
  const baseline = await evaluateWithFactProvider(undefined);
  const contradicted = await evaluateWithFactProvider(contradictedProvider());

  assert.deepEqual(contradicted.output.scores, baseline.output.scores);
  assert.equal(
    contradicted.output.ncsAnswerEvaluations[0]?.baseScore,
    baseline.output.ncsAnswerEvaluations[0]?.baseScore,
  );
  assert.deepEqual(contradicted.output.factCheckSummary.gateStatuses, { FACT_CHECK_REQUIRED: 1 });
  assert.equal("answerFactChecks" in contradicted.output, false);

  await contradicted.task.finalSave?.();
  const stored = contradicted.results.answerFactChecks.get(71)?.[0];
  assert.equal(stored?.providerStatus, "COMPLETED");
  assert.equal(stored?.gateStatus, "FACT_CHECK_REQUIRED");
  assert.equal(stored?.claims[0]?.evidences[0]?.sourceSnapshotId, "knowledge:c-language:v1");
});

test("fact provider timeout is persisted separately and does not discard NCS scores", async () => {
  const timeoutProvider: AnswerFactCheckProvider = {
    async evaluate() {
      throw new AnswerFactCheckTimeoutError("fact provider timed out");
    },
  };
  const evaluated = await evaluateWithFactProvider(timeoutProvider);

  assert.equal(evaluated.output.ncsAnswerEvaluations[0]?.output.scoreStatus, "SCORED");
  assert.equal(evaluated.output.scores.length, 1);
  assert.deepEqual(evaluated.output.factCheckSummary.providerStatuses, { TIMEOUT: 1 });
  assert.deepEqual(evaluated.output.factCheckSummary.gateStatuses, { NOT_DETERMINED: 1 });

  await evaluated.task.finalSave?.();
  const stored = evaluated.results.answerFactChecks.get(71)?.[0];
  assert.equal(stored?.providerStatus, "TIMEOUT");
  assert.equal(stored?.gateStatus, null);
  assert.deepEqual(stored?.claims, []);
});

async function evaluateWithFactProvider(provider?: AnswerFactCheckProvider): Promise<{
  task: Awaited<ReturnType<MockAiTaskHandler["handle"]>>;
  results: InMemoryAiResultRepository;
  output: {
    scores: unknown[];
    ncsAnswerEvaluations: Array<{ baseScore: number | null; output: { scoreStatus: string } }>;
    factCheckSummary: {
      providerStatuses: Record<string, number>;
      gateStatuses: Record<string, number>;
    };
  };
}> {
  const results = new InMemoryAiResultRepository();
  const handler = new MockAiTaskHandler(results, {
    answerFactCheckProvider: provider,
    answerFactCheckProviderMode: "mock",
    answerFactCheckModelVersion: "fixture-fact-v1",
  });
  const answerText = "C는 객체지향 언어입니다. 장애 원인을 로그로 분석하고 대안을 비교한 뒤 결과를 검증했습니다.";
  const evidenceText = "C is a procedural language without built-in class-based object orientation.";
  const task = await handler.handle({
    processLogId: 971,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      payload: {
        reportId: 71,
        applicationId: 31,
        sessionId: 41,
        reportType: "RECRUITING_REPORT",
        jobDescription: "장애 대응 역량을 갖춘 백엔드 엔지니어",
        criteria: [{ criterionId: 11, name: "문제해결능력", weight: 100 }],
        answers: [{
          answerId: 101,
          question: "장애 원인과 해결 결과를 설명해 주세요.",
          transcript: answerText,
          evaluationStatus: "EVALUATED",
          sessionQuestionId: 501,
          criterionId: 11,
          criterionTitleSnapshot: "문제해결능력",
          ncsProfileId: "PROBLEM_SOLVING",
          ncsQuestionMode: "SITUATIONAL_DESIGN",
          ncsProfileVersion: "2025.12-v1",
          alignmentStatus: "ALIGNED",
        }],
        factCheckContext: {
          knowledgeSnapshotVersion: "NCS_FACT_GOLDEN_2026_07_V1",
          evidenceLedger: [{
            evidenceId: "K1",
            sourceKind: "KNOWLEDGE_SNAPSHOT",
            sourceSnapshotId: "knowledge:c-language:v1",
            startOffset: 0,
            endOffset: evidenceText.length,
            text: evidenceText,
          }],
        },
      },
    }),
  });
  return {
    task,
    results,
    output: JSON.parse(task.outputRef ?? "{}") as {
      scores: unknown[];
      ncsAnswerEvaluations: Array<{ baseScore: number | null; output: { scoreStatus: string } }>;
      factCheckSummary: {
        providerStatuses: Record<string, number>;
        gateStatuses: Record<string, number>;
      };
    },
  };
}

function contradictedProvider(): AnswerFactCheckProvider {
  return {
    async evaluate(input) {
      const claimText = "C는 객체지향 언어입니다.";
      return {
        model: "fixture-fact-v1",
        claims: [{
          claimText,
          startOffset: input.answerText.indexOf(claimText),
          endOffset: input.answerText.indexOf(claimText) + claimText.length,
          claimType: "TECHNICAL_FACT",
          claimRole: "ANSWER_CORE",
          verdict: "CONTRADICTED",
          confidence: 0.98,
          evidenceIds: ["K1"],
          rationale: "승인된 지식 snapshot과 모순됩니다.",
        }],
      };
    },
  };
}
