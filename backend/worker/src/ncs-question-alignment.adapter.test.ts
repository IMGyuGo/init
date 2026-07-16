import { strict as assert } from "node:assert";
import test from "node:test";
import {
  alignNcsQuestion,
  canonicalNcsProfileIdOf,
  markQuestionReviewRequired,
  NCS_QUESTION_ALIGNMENT_EVALUATOR_VERSION,
  NCS_QUESTION_PROFILE_VERSION,
} from "./ncs-question-alignment.adapter";

test("aligns a problem-solving question using the versioned worker contract", () => {
  const result = alignNcsQuestion({
    question: "운영 장애의 원인을 분석하고 대안을 비교해 선택한 뒤 결과를 어떻게 검증했나요?",
    profileId: "PROBLEM_SOLVING",
    questionMode: "EXPERIENCE_BEHAVIOR",
    profileVersion: NCS_QUESTION_PROFILE_VERSION,
  });

  assert.equal(result.status, "ALIGNED");
  assert.ok((result.score ?? 0) >= 0.6);
  assert.equal(result.evaluatorVersion, NCS_QUESTION_ALIGNMENT_EVALUATOR_VERSION);
});

test("keeps low-alignment and exhausted retry states distinct", () => {
  const low = alignNcsQuestion({
    question: "자기소개를 해주세요.",
    profileId: "COLLABORATION_COMMUNICATION",
    questionMode: "EXPERIENCE_BEHAVIOR",
    profileVersion: NCS_QUESTION_PROFILE_VERSION,
  });

  assert.equal(low.status, "LOW_ALIGNMENT");
  assert.equal(markQuestionReviewRequired(low).status, "REVIEW_REQUIRED");
});

test("requires the canonical profile version", () => {
  const result = alignNcsQuestion({
    question: "Redis의 동작 원리와 장애 위험 검증 방법을 설명해주세요.",
    profileId: "JOB_TECHNICAL",
    questionMode: "TECHNICAL_KNOWLEDGE",
    profileVersion: "NCS_3_PROFILE_V1",
  });

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.score, null);
});

test("normalizes legacy question profile ids to the canonical API contract", () => {
  assert.equal(canonicalNcsProfileIdOf("DIGITAL"), "JOB_TECHNICAL");
  assert.equal(
    canonicalNcsProfileIdOf("COMMUNICATION"),
    "COLLABORATION_COMMUNICATION",
  );
  assert.equal(canonicalNcsProfileIdOf("PROBLEM_SOLVING"), "PROBLEM_SOLVING");
});
