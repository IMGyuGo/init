import { applyPostingDraftToFormState } from "./posting-ai-draft-form";
import type { PostingDraftResult } from "./posting-ai-draft";
import { createEmptyStructuredJobDescription } from "./structured-job-description";

const current = {
  title: "",
  jobRole: "",
  structuredJobDescription: {
    ...createEmptyStructuredJobDescription(),
    sections: {
      ...createEmptyStructuredJobDescription().sections,
      responsibilities: "<p>기존 업무</p>",
    },
    tags: ["NestJS"],
  },
};

const draft: PostingDraftResult = {
  title: "2026 신입 백엔드 채용",
  jobRole: "Backend Developer",
  sections: {
    positionDetail: "<p>Backend Developer 포지션입니다.</p>",
    responsibilities: "<ul><li>NestJS API 개발</li></ul>",
  },
  tags: ["NestJS", "PostgreSQL"],
};

const applied = applyPostingDraftToFormState(current, draft);

if (applied.title !== "2026 신입 백엔드 채용" || applied.jobRole !== "Backend Developer") {
  throw new Error("Applying a posting draft should update basic title and job role.");
}

if (applied.structuredJobDescription.sections.responsibilities !== "<ul><li>NestJS API 개발</li></ul>") {
  throw new Error("Applying a posting draft should replace generated structured sections.");
}

if (applied.structuredJobDescription.tags.join(",") !== "NestJS,PostgreSQL") {
  throw new Error("Applying a posting draft should merge tags without duplicates.");
}
