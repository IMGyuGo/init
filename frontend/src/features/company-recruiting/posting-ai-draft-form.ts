import type { PostingDraftResult } from "./posting-ai-draft";
import type { StructuredJobDescription } from "./structured-job-description";

export type PostingDraftApplicableFormState = {
  title: string;
  jobRole: string;
  structuredJobDescription: StructuredJobDescription;
};

export function applyPostingDraftToFormState<T extends PostingDraftApplicableFormState>(
  current: T,
  draft: PostingDraftResult,
): T {
  return {
    ...current,
    title: draft.title || current.title,
    jobRole: draft.jobRole || current.jobRole,
    structuredJobDescription: {
      ...current.structuredJobDescription,
      sections: {
        ...current.structuredJobDescription.sections,
        ...draft.sections,
      },
      tags: uniqueTags([...current.structuredJobDescription.tags, ...draft.tags]),
    },
  };
}

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}
