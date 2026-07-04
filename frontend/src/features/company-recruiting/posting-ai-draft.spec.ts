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
        positionDetail: "<p>Backend Developer 포지션입니다.</p>",
        responsibilities: "<ul><li>NestJS API 개발</li></ul>",
      },
      tags: ["NestJS", "PostgreSQL"],
    },
  },
};

const draft = extractPostingDraftFromJob(completedJob);

if (draft?.title !== "2026 신입 백엔드 채용") {
  throw new Error("Completed posting draft job should expose draft title.");
}

if (draft?.sections.positionDetail?.includes("Backend Developer") !== true) {
  throw new Error("Completed posting draft job should expose structured sections.");
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
