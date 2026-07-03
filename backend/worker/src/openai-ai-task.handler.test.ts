import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import { MockAiTaskHandler } from "./mock-ai-task.handler";
import { OpenAiAiTaskHandler } from "./openai-ai-task.handler";
import { FollowUpAiProvider } from "./openai-follow-up.provider";

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
