import { extractPostingDraftFromJob } from "./posting-ai-draft";
import type { AiJobStatusResponse } from "./types";

const completedJob: AiJobStatusResponse = {
  processLogId: 36,
  processType: "POSTING_DRAFT_GENERATE",
  status: "COMPLETED",
  queued: true,
  inputRef: "{}",
  output: {
    kind: "POSTING_DRAFT_GENERATE",
    sourceProcessLogId: 36,
    reviewRequired: true,
    reviewStatus: "PENDING_REVIEW",
    targetTables: ["postings"],
    postingDraft: {
      title: "2026 신입 백엔드 채용",
      jobRole: "Backend Developer",
      sections: {
        positionDetail: "<p>Backend Developer &amp; Platform 포지션입니다.</p>",
        responsibilities: '<p onclick="alert(1)">NestJS API 개발<img src=x onerror="alert(1)"></p><script>alert(1)</script>',
      },
      tags: ["NestJS", "PostgreSQL"],
    },
  },
};

const draft = extractPostingDraftFromJob(completedJob);

if (draft?.title !== "2026 신입 백엔드 채용") {
  throw new Error("Completed posting draft job should expose draft title.");
}

if (draft?.sections.positionDetail !== "<p>Backend Developer &amp; Platform 포지션입니다.</p>") {
  throw new Error("Completed posting draft job should expose structured sections.");
}

if (draft?.sections.responsibilities !== "<p>NestJS API 개발</p>") {
  throw new Error("Posting draft sections should be sanitized before preview and apply.");
}

const pendingJob: AiJobStatusResponse = {
  processLogId: 37,
  processType: "POSTING_DRAFT_GENERATE",
  status: "PENDING",
  queued: true,
  inputRef: "{}",
};

if (extractPostingDraftFromJob(pendingJob) !== null) {
  throw new Error("Pending posting draft job should not expose a draft.");
}
