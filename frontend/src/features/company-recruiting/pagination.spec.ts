import { buildPaginationRange } from "./pagination";

const firstPageRange = buildPaginationRange({ page: 1, totalPages: 7 });

if (firstPageRange.join(",") !== "1,2,3,4,5") {
  throw new Error("Pagination should show the first five pages near the beginning.");
}

const middlePageRange = buildPaginationRange({ page: 5, totalPages: 10 });

if (middlePageRange.join(",") !== "3,4,5,6,7") {
  throw new Error("Pagination should keep the current page centered when possible.");
}

const lastPageRange = buildPaginationRange({ page: 10, totalPages: 10 });

if (lastPageRange.join(",") !== "6,7,8,9,10") {
  throw new Error("Pagination should show the last five pages near the end.");
}
