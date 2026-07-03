import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import { MockAiTaskHandler } from "./mock-ai-task.handler";
import { OpenAiAiTaskHandler } from "./openai-ai-task.handler";
import { FollowUpAiProvider } from "./openai-follow-up.provider";
import { ReportAiProvider, ReportGenerationInput } from "./openai-report.provider";

const provider: FollowUpAiProvider = {
  async generateFollowUpQuestion() {
    return {
      content: "해당 문제를 다시 겪지 않도록 어떤 검증 절차를 추가했나요?",
      model: "test-model"
    };
  }
};

test("OpenAiAiTaskHandler uses provider for follow-up and keeps existing save contract", async () => {
  const results = new InMemoryAiResultRepository();
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider);

  const handled = await handler.handle({
    processLogId: 1,
    processType: "FOLLOW_UP",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "MOCK_FOLLOW_UP",
      payload: {
        sessionId: 7,
        answerId: 11,
        previousQuestion: "장애 대응 경험을 설명해주세요.",
        transcript: "로그를 보고 원인을 좁혀 쿼리를 수정했습니다."
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as { content?: string; model?: string };

  assert.equal(output.content, "해당 문제를 다시 겪지 않도록 어떤 검증 절차를 추가했나요?");
  assert.equal(output.model, "test-model");
  assert.equal(results.followUpQuestions[0]?.content, output.content);
  assert.equal(handled.guardrail?.result, "PASS");
});

test("OpenAiAiTaskHandler uses provider for final report generation and keeps save contract", async () => {
  const results = new InMemoryAiResultRepository();
  const reportInputs: ReportGenerationInput[] = [];
  const reportProvider: ReportAiProvider = {
    async generateReport(input) {
      reportInputs.push(input);
      return {
        summary: "지원자는 백엔드 직무와 관련된 경험을 답변에서 설명했습니다.",
        feedback: "다음 연습에서는 문제 해결 과정의 결과를 더 구체적으로 말해보세요.",
        model: "report-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider, reportProvider);

  const handled = await handler.handle({
    processLogId: 2,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "MOCK_REPORT_GENERATE",
      payload: {
        reportId: 50,
        reportType: "MOCK_INTERVIEW_REPORT",
        jobDescription: "Mock interview practice session",
        criteria: [
          {
            criterionId: 1,
            name: "Problem solving",
            weight: 40
          }
        ],
        answers: [
          {
            answerId: 10,
            question: "프로젝트 경험을 설명해주세요.",
            transcript: "NestJS와 PostgreSQL을 사용해 답변 저장 흐름을 구현했습니다."
          }
        ]
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as {
    summary?: string;
    summarySource?: string;
    model?: string;
    reportFeedback?: string;
  };
  const report = results.generatedReports.get(50);

  assert.equal(reportInputs.length, 1);
  assert.equal(reportInputs[0]?.policy, "MOCK");
  assert.equal(reportInputs[0]?.answers[0]?.answerId, 10);
  assert.equal(output.summarySource, "OPENAI_REPORT_GENERATION");
  assert.equal(output.model, "report-model");
  assert.equal(output.reportFeedback, "다음 연습에서는 문제 해결 과정의 결과를 더 구체적으로 말해보세요.");
  assert.match(output.summary ?? "", /지원자는 백엔드 직무/);
  assert.match(report?.summary ?? "", /다음 연습 피드백/);
  assert.equal(report?.scores.length, 1);
  assert.equal(report?.questionEvaluations.length, 1);
  assert.equal(handled.guardrail?.result, "PASS");
});

test("OpenAiAiTaskHandler leaves report pipeline steps on the fallback handler", async () => {
  const results = new InMemoryAiResultRepository();
  let reportProviderCalls = 0;
  const reportProvider: ReportAiProvider = {
    async generateReport() {
      reportProviderCalls += 1;
      throw new Error("report provider should not run for pipeline steps");
    }
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider, reportProvider);

  const handled = await handler.handle({
    processLogId: 3,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "RECRUITING_REPORT_GENERATE",
      payload: {
        step: "ANSWER_EVALUATION",
        reportId: 51,
        reportType: "RECRUITING_REPORT",
        criteria: [
          {
            criterionId: 1,
            name: "Problem solving",
            weight: 40
          }
        ],
        answers: [
          {
            answerId: 10,
            transcript: "I improved read performance with Redis cache."
          }
        ],
        documentText: "The candidate has worked on NestJS APIs."
      }
    })
  });

  await handled.finalSave?.();
  const output = JSON.parse(handled.outputRef ?? "{}") as { scores?: unknown[] };

  assert.equal(reportProviderCalls, 0);
  assert.equal(output.scores?.length, 1);
  assert.equal(results.reportScores.get(51)?.length, 1);
  assert.equal(results.generatedReports.has(51), false);
});

test("OpenAiAiTaskHandler keeps mock report expression guardrail after provider output", async () => {
  const results = new InMemoryAiResultRepository();
  const reportProvider: ReportAiProvider = {
    async generateReport() {
      return {
        summary: "합격 가능성이 높습니다.",
        model: "report-model"
      };
    }
  };
  const handler = new OpenAiAiTaskHandler(new MockAiTaskHandler(results), results, provider, reportProvider);

  const handled = await handler.handle({
    processLogId: 4,
    processType: "REPORT_GENERATE",
    attempt: 1,
    inputRef: JSON.stringify({
      kind: "MOCK_REPORT_GENERATE",
      payload: {
        reportId: 52,
        reportType: "MOCK_INTERVIEW_REPORT",
        jobDescription: "Mock interview practice session",
        criteria: [
          {
            criterionId: 1,
            name: "Communication",
            weight: 40
          }
        ],
        answers: [
          {
            answerId: 10,
            transcript: "답변을 차분하게 설명했습니다."
          }
        ]
      }
    })
  });

  assert.equal(handled.guardrail?.result, "BLOCKED");
  assert.equal(results.generatedReports.has(52), false);
});
