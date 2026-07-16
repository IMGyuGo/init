import type { CandidateJobQuery, SortOrder } from "./api";

export type CandidateJobSort = NonNullable<CandidateJobQuery["sort"]>;

export interface CandidateJobSortOption {
  value: CandidateJobSort;
  label: string;
  order: SortOrder;
}

export const candidateJobSortOptions: readonly CandidateJobSortOption[] = [
  { value: "createdAt", label: "최신순", order: "desc" },
  { value: "endsOn", label: "마감임박순", order: "asc" },
  { value: "title", label: "제목순", order: "asc" },
];

export function toCandidateJobSortQuery(sort: CandidateJobSort): {
  sort: CandidateJobSort;
  order: SortOrder;
} {
  const option = candidateJobSortOptions.find((candidate) => candidate.value === sort);
  if (!option) {
    throw new Error(`지원하지 않는 채용공고 정렬 기준입니다: ${sort}`);
  }

  return { sort: option.value, order: option.order };
}
