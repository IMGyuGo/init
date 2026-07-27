import type { AiJobStatusResponse } from "./types";
import type { StructuredJobSectionKey } from "./structured-job-description";
import { sanitizePostingDraftHtml } from "./posting-draft-html";

export type PostingDraftResult = {
  title: string;
  jobRole: string;
  sections: Partial<Record<StructuredJobSectionKey, string>>;
  tags: string[];
};

type PostingDraftJobOutput = {
  kind?: string;
  reviewRequired?: boolean;
  reviewStatus?: string;
  targetTables?: unknown;
  postingDraft?: unknown;
};

export function extractPostingDraftFromJob(job: AiJobStatusResponse): PostingDraftResult | null {
  if (job.processType !== "POSTING_DRAFT_GENERATE" || job.status !== "COMPLETED") {
    return null;
  }
  if (!job.output || typeof job.output !== "object") {
    return null;
  }

  const output = job.output as PostingDraftJobOutput;
  if (
    output.kind !== "POSTING_DRAFT_GENERATE" ||
    output.reviewRequired !== true ||
    output.reviewStatus !== "PENDING_REVIEW" ||
    !Array.isArray(output.targetTables) ||
    !output.targetTables.includes("postings")
  ) {
    return null;
  }

  return normalizePostingDraft(output.postingDraft);
}

function normalizePostingDraft(value: unknown): PostingDraftResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.jobRole !== "string") {
    return null;
  }

  return {
    title: record.title,
    jobRole: record.jobRole,
    sections: normalizeSections(record.sections),
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : [],
  };
}

function normalizeSections(value: unknown): Partial<Record<StructuredJobSectionKey, string>> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const sections: Partial<Record<StructuredJobSectionKey, string>> = {};
  for (const key of ["positionDetail", "responsibilities", "requirements", "preferredQualifications", "benefits", "hiringProcess"] as const) {
    const section = record[key];
    if (typeof section === "string" && section.trim()) {
      const sanitized = sanitizePostingDraftHtml(section);
      if (sanitized) {
        sections[key] = sanitized;
      }
    }
  }
  return sections;
}
