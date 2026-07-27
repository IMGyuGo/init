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
    // 직무는 사용자가 select 로 고른 값(jobRole=jobRoleCode)을 유지한다.
    // AI 초안의 직무명으로 덮어쓰면 화면 select 값과 저장되는 jobRole 이 어긋난다.
    jobRole: current.jobRole,
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
