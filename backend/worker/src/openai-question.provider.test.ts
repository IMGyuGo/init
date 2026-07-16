import { strict as assert } from "node:assert";
import test from "node:test";
import { buildQuestionMessages } from "./openai-question.provider";

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
