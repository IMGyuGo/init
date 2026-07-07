import test from "node:test";
import assert from "node:assert/strict";
import { buildPostingDraftMessages } from "./openai-posting-draft.provider";

test("posting draft prompt includes few-shot rewrite examples and section rules", () => {
  const messages = buildPostingDraftMessages({
    title: "2026 신입 백엔드 채용",
    jobRole: "Backend Developer",
    keywords: ["NestJS", "PostgreSQL", "Redis"],
    summary: "채용 플랫폼 API를 함께 설계하고 운영합니다.",
    careerRequirement: "신입 이상",
    employmentType: "정규직",
    workLocation: "서울"
  });

  const prompt = messages.map((message) => String(message.content)).join("\n");

  assert.match(prompt, /Bad:/);
  assert.match(prompt, /Good:/);
  assert.match(prompt, /젊고 에너지 넘치는 남성 개발자/);
  assert.match(prompt, /서비스 안정성과 사용자 경험을 함께 개선할 백엔드 개발자/);
  assert.match(prompt, /명문대 졸업자, 20대 우대/);
  assert.match(prompt, /이에 준하는 실무 경험/);
  assert.match(prompt, /positionDetail/);
  assert.match(prompt, /responsibilities/);
  assert.match(prompt, /requirements/);
  assert.match(prompt, /preferredQualifications/);
  assert.match(prompt, /benefits/);
  assert.match(prompt, /hiringProcess/);
  assert.match(prompt, /Do not exaggerate benefits or guarantee outcomes/);
  assert.match(prompt, /Do not invent compensation, benefits, work policy, equipment, remote work, hiring steps, or company programs/);
  assert.match(prompt, /복지 및 혜택은 회사 정책에 따라 안내되며/);
  assert.match(prompt, /Do not invent benefits that were not provided in the input/);
});
