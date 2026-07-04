import { buildPaginationRange } from "./pagination";
import type { PageMeta } from "./types";

export function getRecruitmentPaginationPages(meta: PageMeta | null) {
  if (!meta) {
    return [];
  }

  return buildPaginationRange({
    page: meta.page,
    totalPages: meta.totalPages,
  });
}

export function formatRecruitmentPaginationSummary(meta: PageMeta) {
  return `총 ${meta.totalItems}개 · ${meta.page}/${Math.max(meta.totalPages, 1)}페이지`;
}
