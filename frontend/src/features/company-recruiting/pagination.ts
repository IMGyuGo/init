export type PaginationRangeInput = {
  page: number;
  totalPages: number;
  siblingCount?: number;
};

export function buildPaginationRange({ page, totalPages, siblingCount = 2 }: PaginationRangeInput) {
  if (totalPages <= 0) {
    return [];
  }

  const visibleCount = siblingCount * 2 + 1;
  const current = clamp(page, 1, totalPages);
  const start = clamp(current - siblingCount, 1, Math.max(1, totalPages - visibleCount + 1));
  const end = Math.min(totalPages, start + visibleCount - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
