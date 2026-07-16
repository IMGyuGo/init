import { strict as assert } from "node:assert";
import test from "node:test";
import { buildFollowUpMessages, ensureAnswerAnchoredQuestion } from "./openai-follow-up.provider";

const input = {
  kind: "RECRUITING_FOLLOW_UP",
  previousQuestion: "프로젝트에서 사용한 기술과 선택 이유를 설명해 주세요.",
  transcript: "객체지향 언어인 Java로 Spring 웹 프로젝트를 진행했습니다.",
  jobDescription: "Java와 Spring 기반 웹 서비스 개발",
  questionMode: "TECHNICAL_KNOWLEDGE" as const,
  focusPoints: ["기술 선택 근거", "적용 및 검증"],
};

test("follow-up prompt requires one answer-specific and self-contained question", () => {
  const messages = buildFollowUpMessages(input);
  const systemPrompt = messages[0]?.content ?? "";
  assert.match(systemPrompt, /must explicitly include or naturally paraphrase/);
  assert.match(systemPrompt, /without remembering the previous turn/);
  assert.match(systemPrompt, /Do not repeat the original question/);
});

test("follow-up output receives a short transcript anchor when provider returns a generic question", () => {
  const question = ensureAnswerAnchoredQuestion(
    "선택한 기술을 실제 프로젝트에서 어떻게 검증했는지 설명해 주세요?",
    input.transcript,
  );

  assert.match(question, /Java/);
  assert.match(question, /Spring/);
  assert.match(question, /선택한 기술/);
});

test("follow-up output keeps an already answer-anchored question unchanged", () => {
  const question = "Spring 웹 프로젝트에서 MVC 패턴을 어떻게 적용했는지 설명해 주세요?";
  assert.equal(ensureAnswerAnchoredQuestion(question, input.transcript), question);
});
