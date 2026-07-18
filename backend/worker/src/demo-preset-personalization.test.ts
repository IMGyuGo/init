import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnswerAnchoredDemoFollowUp,
  buildAnchoredDemoQuestion,
  demoQuestionUnsafeReason,
  exactDemoBindingProfiles,
  extractDemoFactualAnchor,
  questionContainsFactualAnchor,
} from "./demo-preset-personalization";

test("extractDemoFactualAnchor selects concrete work evidence without contact data", () => {
  const anchor = extractDemoFactualAnchor(
    "email: candidate@example.com\nhttps://portfolio.example.com",
    "Redis 캐시를 설계하고 병목 원인을 분석해 API 응답 시간을 35% 단축했습니다.",
  );
  assert.equal(anchor, "Redis 캐시를 설계하고 병목 원인을 분석해 API 응답 시간을 35% 단축했습니다.");
  assert.equal(demoQuestionUnsafeReason(buildAnchoredDemoQuestion(anchor!)), null);
});

test("extractDemoFactualAnchor does not invent an anchor for generic or sensitive text", () => {
  assert.equal(extractDemoFactualAnchor("Extracted text from resume.pdf", "candidate@example.com"), null);
});

test("anchored safe question keeps the factual anchor and dual profile contract", () => {
  const anchor = "Kafka consumer 장애 원인을 분석하고 재처리 전략을 구현했습니다.";
  const question = buildAnchoredDemoQuestion(anchor);
  assert.equal(questionContainsFactualAnchor(question, anchor), true);
  assert.equal(exactDemoBindingProfiles([
    { ncsProfileId: "JOB_TECHNICAL" },
    { ncsProfileId: "PROBLEM_SOLVING" },
  ]), true);
});

test("demo follow-up fallback is grounded in the answer without contact data", () => {
  const question = buildAnswerAnchoredDemoFollowUp(
    "candidate@example.com Redis 장애 로그를 분석하고 우회 대안을 적용한 뒤 p95 지표를 검증했습니다.",
  );
  assert.equal(question.includes("candidate@example.com"), false);
  assert.match(question, /방금 답변|Redis|기술 선택/);
});
