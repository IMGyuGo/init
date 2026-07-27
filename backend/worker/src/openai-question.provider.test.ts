import { strict as assert } from "node:assert";
import test from "node:test";
import { buildQuestionMessages, questionQualityIssue } from "./openai-question.provider";

test("recruiting question prompt requires concise natural Korean without repeated company context", () => {
  const messages = buildQuestionMessages({
    kind: "RECRUITING_QUESTION_GENERATE",
    postingId: 1,
    jobDescription: "[미리캔버스] 데브옵스 파트 리드 - AWS와 Kubernetes 운영",
    questionCount: 2,
    criteria: [{
      criterionId: 1,
      name: "기술 직무 역량",
      ncsProfileId: "JOB_TECHNICAL",
      ncsQuestionMode: "TECHNICAL_KNOWLEDGE",
      ncsProfileVersion: "2025.12-v1",
    }],
    source: "JD_CRITERIA",
  });

  const systemPrompt = messages[0]?.content ?? "";
  assert.match(systemPrompt, /real interviewer/i);
  assert.match(systemPrompt, /Do not prefix questions with a company name/);
  assert.match(systemPrompt, /Avoid comma-separated rubric checklists/);
  assert.match(systemPrompt, /Vary openings and endings/);
});

test("question quality gate rejects editor markup, duplicates and repeated endings", () => {
  assert.equal(
    questionQualityIssue('<blockquote data-init-posting-extra-info="true">질문입니다</blockquote>'),
    "HTML_OR_EDITOR_MARKUP",
  );
  assert.equal(
    questionQualityIssue("장애 원인을 좁힌 경험을 말씀해 주세요?", ["장애 원인을 좁힌 경험을 말씀해 주세요?"]),
    "DUPLICATE_QUESTION",
  );
  assert.equal(
    questionQualityIssue("결과를 검증한 방법을 설명해 주세요?", [
      "문제 원인을 어떻게 찾았는지 설명해 주세요?",
      "대안을 선택한 기준을 설명해 주세요?",
    ]),
    "REPEATED_QUESTION_ENDING",
  );
  assert.equal(
    questionQualityIssue("장애 원인을 좁힐 때 가장 먼저 확인한 지표는 무엇이었나요?"),
    null,
  );
});

test("resume personalized prompt includes rejected questions to avoid regeneration loops", () => {
  const messages = buildQuestionMessages({
    kind: "RESUME_PERSONALIZED_QUESTION_GENERATE",
    postingId: 1,
    jobDescription: "Kubernetes 운영",
    questionCount: 1,
    criteria: [{ criterionId: 1, name: "기술", questionCount: 1 }],
    source: "RESUME_PERSONALIZED",
    resumeText: "Kubernetes 배포 자동화 경험",
    avoidQuestions: ["이전에 생성했지만 거절된 질문"],
  });

  assert.match(messages[1]?.content ?? "", /이전에 생성했지만 거절된 질문/);
});
