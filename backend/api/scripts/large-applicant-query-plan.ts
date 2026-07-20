import { performance } from "node:perf_hooks";

import { ApplicationStatus, Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const postingId = parsePositiveBigInt(process.argv[2] ?? process.env.LARGE_APPLICANT_RECRUITMENT_ID);
  const page = parsePositiveInteger(process.env.LARGE_APPLICANT_PAGE, 1);
  const limit = Math.min(parsePositiveInteger(process.env.LARGE_APPLICANT_LIMIT, 20), 100);
  const offset = (page - 1) * limit;

  const startedAt = performance.now();
  const [activeTotal, statusCounts, pageRows] = await Promise.all([
    prisma.application.count({
      where: { postingId, applicationStatus: { not: ApplicationStatus.CANCELED } },
    }),
    prisma.application.groupBy({
      by: ["interviewStatus"],
      where: { postingId, applicationStatus: { not: ApplicationStatus.CANCELED } },
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where: { postingId, applicationStatus: { not: ApplicationStatus.CANCELED } },
      orderBy: [{ updatedAt: "desc" }, { applicationId: "desc" }],
      skip: offset,
      take: limit,
      select: { applicationId: true, updatedAt: true },
    }),
  ]);
  const responseTimeMs = performance.now() - startedAt;

  const planRows = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(Prisma.sql`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT application_id, updated_at
      FROM applications
     WHERE posting_id = ${postingId}
       AND application_status <> 'CANCELED'::"ApplicationStatus"
     ORDER BY updated_at DESC, application_id DESC
     LIMIT ${limit}
     OFFSET ${offset}
  `);

  console.log(JSON.stringify({
    postingId: postingId.toString(),
    page,
    limit,
    activeTotal,
    returnedItems: pageRows.length,
    firstApplicationId: pageRows[0]?.applicationId.toString() ?? null,
    lastApplicationId: pageRows.at(-1)?.applicationId.toString() ?? null,
    interviewStatusCounts: Object.fromEntries(statusCounts.map((row) => [row.interviewStatus, row._count._all])),
    responseTimeMs: Number(responseTimeMs.toFixed(2)),
    queryPlan: planRows[0]?.["QUERY PLAN"] ?? null,
  }, null, 2));
}

function parsePositiveBigInt(value: string | undefined): bigint {
  if (!value || !/^\d+$/.test(value) || BigInt(value) < 1n) {
    throw new Error("npm run verify:large-applicants -- <공고 ID> 형식으로 1 이상의 ID를 지정하세요.");
  }
  return BigInt(value);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("페이지와 limit은 1 이상의 정수여야 합니다.");
  }
  return parsed;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
