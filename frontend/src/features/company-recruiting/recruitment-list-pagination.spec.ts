import { formatRecruitmentPaginationSummary, getRecruitmentPaginationPages } from "./recruitment-list-pagination";
import type { PageMeta } from "./types";

const meta: PageMeta = {
  page: 6,
  limit: 10,
  totalItems: 123,
  totalPages: 13,
  hasNext: true,
};

const pages = getRecruitmentPaginationPages(meta);

if (pages.join(",") !== "4,5,6,7,8") {
  throw new Error("Recruitment list pagination should keep the current page centered.");
}

const summary = formatRecruitmentPaginationSummary(meta);

if (summary !== "총 123개 · 6/13페이지") {
  throw new Error("Recruitment list pagination summary should use posting count labels.");
}
