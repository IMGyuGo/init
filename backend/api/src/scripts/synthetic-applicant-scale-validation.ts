import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { Prisma, PrismaClient } from "@prisma/client";

import type { NormalizedApplicantListQuery } from "../modules/company-recruiting/company-recruiting.types";
import { PrismaCompanyRecruitingRepository } from "../modules/company-recruiting/repository/company-recruiting.repository";
import {
  SYNTHETIC_MANIFEST_V1,
  SYNTHETIC_MANIFEST_V2,
  assertSyntheticManifestVersion,
  buildSyntheticApplicantPlan,
  type SyntheticApplicantPlanRecord,
  type SyntheticImporterOptions,
  type SyntheticManifestVersion,
} from "../modules/candidate/scripts/synthetic-applicant-importer.contract";
import { V2_EMAIL_DOMAINS } from "../modules/candidate/scripts/synthetic-applicant-importer.v2";
import type { PrismaService } from "../shared/prisma.service";
import {
  buildPostingValidationExpectations,
  buildSyntheticReportExpectations,
  type PostingStatusCounts,
  type PostingValidationExpectations,
} from "./synthetic-applicant-scale-validation.expectations";

type ExpectedState = "applied" | "cleaned";

type ValidationArguments = {
  datasetId: string;
  expectedState: ExpectedState;
  iterations: number;
  outputPath?: string;
};

type PageSnapshot = {
  page: number;
  limit: number;
  totalItems: number;
  returnedItems: number;
  responseBytes: number;
};

type QueryPlanSummary = {
  page: number;
  limit: number;
  offset: number;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  nodeTypes: string[];
  indexNames: string[];
  sharedHitBlocks: number;
  sharedReadBlocks: number;
};

type SyntheticIdentityRow = {
  userId: bigint;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  authProvider: string;
  passwordHash: string | null;
  providerUserId: string | null;
};

const prisma = new PrismaClient();
const repository = new PrismaCompanyRecruitingRepository(prisma as unknown as PrismaService);

const APPLICATION_STATUS_ORDER = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "INTERVIEW_WAITING",
  "INTERVIEW_DONE",
  "COMPLETED",
  "CANCELED",
] as const;
const INTERVIEW_STATUS_ORDER = ["NOT_READY", "READY", "IN_PROGRESS", "COMPLETED", "FAILED"] as const;
const REPORT_STATUS_ORDER = ["PENDING", "GENERATING", "COMPLETED", "FAILED"] as const;

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const dataset = await prisma.syntheticApplicantDataset.findUnique({ where: { datasetId: args.datasetId } });
  assert(dataset, `dataset을 찾을 수 없습니다: ${args.datasetId}`);
  assertSyntheticManifestVersion(dataset.manifestVersion);

  const records = await prisma.syntheticApplicantRecord.findMany({
    where: { datasetId: args.datasetId },
    orderBy: { ordinal: "asc" },
  });
  const ids = {
    userIds: records.map((record) => record.userId),
    candidateIds: records.map((record) => record.candidateId),
    applicationIds: records.map((record) => record.applicationId),
  };

  const base = {
    checkedAt: new Date().toISOString(),
    datasetId: dataset.datasetId,
    datasetStatus: dataset.status,
    environment: dataset.environment,
    companyId: dataset.companyId.toString(),
    postingId: dataset.postingId.toString(),
    manifestVersion: dataset.manifestVersion,
    scale: {
      active: dataset.activeCount,
      canceled: dataset.canceledCount,
      interactive: dataset.interactiveCount,
    },
  };

  if (args.expectedState === "cleaned") {
    assert(dataset.status === "CLEANED", `dataset 상태가 CLEANED가 아닙니다: ${dataset.status}`);
    assert(records.length === dataset.activeCount + dataset.canceledCount, "cleanup audit manifest 건수가 다릅니다.");
    assert(records.every((record) => record.cleanedAt !== null), "cleanedAt이 없는 manifest record가 있습니다.");
    const [users, candidates, applications] = await Promise.all([
      prisma.user.count({ where: { userId: { in: ids.userIds } } }),
      prisma.candidateProfile.count({ where: { candidateId: { in: ids.candidateIds } } }),
      prisma.application.count({ where: { applicationId: { in: ids.applicationIds } } }),
    ]);
    assert(users === 0 && candidates === 0 && applications === 0, "cleanup 뒤 synthetic domain row가 남아 있습니다.");
    emit({
      ...base,
      expectedState: args.expectedState,
      result: "PASS",
      cleanup: { manifestRecords: records.length, users, candidates, applications },
    }, args.outputPath);
    return;
  }

  assert(dataset.status === "APPLIED", `dataset 상태가 APPLIED가 아닙니다: ${dataset.status}`);
  assert(records.every((record) => record.cleanedAt === null), "APPLIED dataset에 cleaned record가 있습니다.");

  const options: SyntheticImporterOptions = {
    action: "apply",
    environment: dataset.environment,
    companyId: dataset.companyId,
    postingId: dataset.postingId,
    datasetId: dataset.datasetId,
    activeCount: dataset.activeCount,
    canceledCount: dataset.canceledCount,
    interactiveCount: dataset.interactiveCount,
    pipelineSelectionCount: dataset.pipelineSelectionCount,
    batchSize: dataset.batchSize,
  };
  const planned = buildSyntheticApplicantPlan(options, dataset.manifestVersion);
  const activeRecords = records.filter((record) => !record.isCanceled);
  const canceledRecords = records.filter((record) => record.isCanceled);

  assert(records.length === planned.length, `manifest total 불일치: expected=${planned.length}, actual=${records.length}`);
  assert(activeRecords.length === dataset.activeCount, "manifest active count가 다릅니다.");
  assert(canceledRecords.length === dataset.canceledCount, "manifest canceled count가 다릅니다.");
  assert(records.filter((record) => record.isInteractive).length === 10, "interactive manifest가 정확히 10개가 아닙니다.");
  assert(records.every((record, index) => record.ordinal === planned[index]?.ordinal), "manifest ordinal 누락 또는 순서 불일치가 있습니다.");

  const companyId = safeNumber(dataset.companyId, "companyId");
  const postingId = safeNumber(dataset.postingId, "postingId");
  const posting = await prisma.posting.findFirst({
    where: { postingId: dataset.postingId, companyId: dataset.companyId },
    select: { postingId: true, companyId: true, title: true },
  });
  assert(posting, "dataset의 대상 기업·공고 소유 관계를 확인할 수 없습니다.");

  const baselineRows = await prisma.application.findMany({
    where: {
      postingId: dataset.postingId,
      applicationId: { notIn: ids.applicationIds },
    },
    select: {
      applicationId: true,
      applicationStatus: true,
      documentStatus: true,
      interviewStatus: true,
      reportStatus: true,
      screeningDecision: true,
    },
  });
  const baselineApplications = baselineRows.map(({ applicationId: _applicationId, ...projection }) => projection);
  const expectations = buildPostingValidationExpectations(planned, baselineApplications);

  const databaseCounts = await verifyDomainRows(ids, records);
  const authentication = await verifySyntheticIdentities(records, planned, dataset.manifestVersion);
  const summary = await repository.summarizeApplicationsForPosting(postingId, companyId);
  verifySummary(summary, expectations.posting);

  const pageCoverage = await verifyAllPages(postingId, companyId, expectations.posting.active);
  const pageSnapshots = await verifyRepresentativePages(postingId, companyId, expectations.posting.active);
  const search = dataset.manifestVersion === SYNTHETIC_MANIFEST_V1
    ? await verifyLegacyDatasetSearch(postingId, companyId, dataset.datasetId, expectations.synthetic.active)
    : await verifyV2ExactEmailSearch(postingId, companyId, planned.find((record) => !record.isCanceled)!.email);
  const filters = await verifyFilters(postingId, companyId, expectations.posting.statusCounts);
  const sorts = await verifySorts(postingId, companyId);
  const details = await verifyDetailDepths(companyId, records);
  const reportFixtures = await verifyReportFixtures(records, planned, dataset.manifestVersion);
  const firstPageDecisions = dataset.manifestVersion === SYNTHETIC_MANIFEST_V2
    ? await verifyV2FirstPageDecisions(postingId, companyId, baselineRows.map((row) => row.applicationId))
    : null;
  const metrics = await measureQueries(postingId, companyId, expectations.posting.active, args.iterations);

  const totalPages = Math.ceil(expectations.posting.active / 20);
  const planPages = [...new Set([1, Math.max(1, Math.ceil(totalPages / 2)), Math.max(1, totalPages)])];
  const queryPlans = [] as QueryPlanSummary[];
  for (const page of planPages) queryPlans.push(await explainApplicantPage(dataset.postingId, page, 20));
  if (expectations.posting.active >= 1_000) {
    assert(
      queryPlans.some((plan) => plan.indexNames.includes("idx_applications_posting_updated_id")),
      "1,000명 이상 실행계획에서 idx_applications_posting_updated_id 사용을 확인하지 못했습니다.",
    );
  }

  emit({
    ...base,
    expectedState: args.expectedState,
    result: "PASS",
    target: { title: posting.title },
    baseline: {
      snapshot: "fixed-at-verifier-start",
      active: expectations.baseline.active,
      canceled: expectations.baseline.canceled,
      statusCounts: expectations.baseline.statusCounts,
      attentionRequired: expectations.baseline.attentionRequired,
      concurrentChangeBehavior: "posting-wide validation fails closed",
    },
    databaseCounts,
    authentication,
    summary,
    pageCoverage,
    pageSnapshots,
    search,
    filters,
    sorts,
    details,
    reportFixtures,
    ...(firstPageDecisions ? { firstPageDecisions } : {}),
    metrics,
    queryPlans,
    externalDispatch: {
      pipelineSelectionCount: dataset.pipelineSelectionCount,
      importerDispatchesExternalWork: false,
      note: "검증기는 DB read와 EXPLAIN ANALYZE만 수행하며 SMTP/S3/SQS/worker/OpenAI client를 사용하지 않습니다.",
    },
  }, args.outputPath);
}

async function verifyDomainRows(
  ids: { userIds: bigint[]; candidateIds: bigint[]; applicationIds: bigint[] },
  records: Array<{ isCanceled: boolean }>,
) {
  const [users, candidates, applications, canceledApplications] = await Promise.all([
    prisma.user.count({ where: { userId: { in: ids.userIds } } }),
    prisma.candidateProfile.count({ where: { candidateId: { in: ids.candidateIds } } }),
    prisma.application.count({ where: { applicationId: { in: ids.applicationIds } } }),
    prisma.application.count({
      where: { applicationId: { in: ids.applicationIds }, applicationStatus: "CANCELED" },
    }),
  ]);
  assert(users === records.length, "manifest와 users 건수가 다릅니다.");
  assert(candidates === records.length, "manifest와 candidate_profiles 건수가 다릅니다.");
  assert(applications === records.length, "manifest와 applications 건수가 다릅니다.");
  assert(canceledApplications === records.filter((record) => record.isCanceled).length, "취소 이력 건수가 다릅니다.");
  return { users, candidates, applications, canceledApplications };
}

async function verifySyntheticIdentities(
  records: Array<{ ordinal: number; userId: bigint; isInteractive: boolean }>,
  planned: SyntheticApplicantPlanRecord[],
  manifestVersion: SyntheticManifestVersion,
) {
  assert(new Set(records.map((record) => record.userId.toString())).size === records.length, "manifest user가 중복되었습니다.");
  const users: SyntheticIdentityRow[] = await prisma.user.findMany({
    where: { userId: { in: records.map((record) => record.userId) } },
    select: {
      userId: true,
      email: true,
      name: true,
      phone: true,
      status: true,
      authProvider: true,
      passwordHash: true,
      providerUserId: true,
    },
  });
  assert(users.length === records.length, "manifest user가 정확히 한 건씩 존재하지 않습니다.");

  const usersById = new Map(users.map((user) => [user.userId.toString(), user]));
  const plannedByOrdinal = new Map(planned.map((record) => [record.ordinal, record]));
  const domainCounts: Record<string, number> = {};
  let interactive = 0;
  let nonInteractive = 0;
  let invalidNonInteractive = 0;
  let identityMatches = 0;

  for (const record of records) {
    const user = usersById.get(record.userId.toString());
    const expected = plannedByOrdinal.get(record.ordinal);
    assert(user && expected, "manifest identity 대응 관계가 누락되었습니다.");
    assert(record.isInteractive === expected.isInteractive, "manifest interactive 구분이 plan과 다릅니다.");
    assert(user.email === expected.email, "manifest user email이 plan과 다릅니다.");
    assert(user.name === expected.name, "manifest user name이 plan과 다릅니다.");
    assert(user.phone === expected.phone, "manifest user phone이 plan과 다릅니다.");
    identityMatches += 1;

    const domain = user.email.slice(user.email.lastIndexOf("@") + 1);
    assert(domain.length > 0, "manifest user email domain이 없습니다.");
    if (manifestVersion === SYNTHETIC_MANIFEST_V2) {
      assert((V2_EMAIL_DOMAINS as readonly string[]).includes(domain), "V2 manifest user domain이 allowlist에 없습니다.");
    }
    domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;

    if (record.isInteractive) {
      assert(
        user.status === "ACTIVE"
          && user.authProvider === "LOCAL"
          && user.passwordHash !== null
          && user.providerUserId === null,
        "interactive 인증 계약이 깨졌습니다.",
      );
      interactive += 1;
      continue;
    }

    const valid = user.status === "PENDING"
      && user.authProvider === "LOCAL"
      && user.passwordHash === null
      && user.providerUserId === null;
    if (valid) nonInteractive += 1;
    else invalidNonInteractive += 1;
  }

  assert(interactive === 10, `유효 interactive 계정이 10개가 아닙니다: ${interactive}`);
  assert(nonInteractive === records.length - interactive, "non-interactive 인증 격리 계약이 깨졌습니다.");
  assert(invalidNonInteractive === 0, "로그인 가능한 non-interactive 계정이 있습니다.");
  assert(identityMatches === records.length, "manifest identity가 plan과 일치하지 않습니다.");
  return { interactive, nonInteractive, invalidNonInteractive, identityMatches, domainCounts };
}

function verifySummary(
  actual: Awaited<ReturnType<PrismaCompanyRecruitingRepository["summarizeApplicationsForPosting"]>>,
  expected: PostingValidationExpectations["posting"],
) {
  assert(actual.activeTotal === expected.active, "summary activeTotal이 다릅니다.");
  assert(actual.canceledHistoryTotal === expected.canceled, "summary canceledHistoryTotal이 다릅니다.");
  assertCountMap(actual.applicationStatusCounts, expected.statusCounts.applicationStatus, "applicationStatus");
  assertCountMap(actual.documentStatusCounts, expected.statusCounts.documentStatus, "documentStatus");
  assertCountMap(actual.interviewStatusCounts, expected.statusCounts.interviewStatus, "interviewStatus");
  assertCountMap(actual.reportStatusCounts, expected.statusCounts.reportStatus, "reportStatus");
  assertCountMap(actual.screeningDecisionCounts, expected.statusCounts.screeningDecision, "screeningDecision");
  assert(actual.attentionRequiredTotal === expected.attentionRequired, "summary attentionRequiredTotal이 다릅니다.");
}

async function verifyAllPages(postingId: number, companyId: number, expectedTotal: number) {
  const limit = 100;
  const totalPages = Math.ceil(expectedTotal / limit);
  const ids: number[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const items = await repository.listApplicationsForPosting(postingId, companyId, query({ page, limit }));
    ids.push(...items.map((item) => item.applicationId));
  }
  assert(ids.length === expectedTotal, `전체 페이지 수집 건수가 다릅니다: expected=${expectedTotal}, actual=${ids.length}`);
  assert(new Set(ids).size === expectedTotal, "전체 페이지 순회에서 중복 applicationId가 발견됐습니다.");
  return { limit, totalPages, collected: ids.length, unique: new Set(ids).size };
}

async function verifyRepresentativePages(postingId: number, companyId: number, expectedTotal: number) {
  const limit = 20;
  const totalPages = Math.ceil(expectedTotal / limit);
  const pages = [...new Set([1, Math.max(1, Math.ceil(totalPages / 2)), Math.max(1, totalPages)])];
  const snapshots: PageSnapshot[] = [];
  for (const page of pages) {
    const normalized = query({ page, limit });
    const [items, totalItems] = await Promise.all([
      repository.listApplicationsForPosting(postingId, companyId, normalized),
      repository.countApplicationsForPosting(postingId, companyId, normalized),
    ]);
    assert(totalItems === expectedTotal, `대표 page=${page} totalItems가 다릅니다.`);
    const expectedItems = page === totalPages ? expectedTotal - (page - 1) * limit : limit;
    assert(items.length === expectedItems, `대표 page=${page} items 길이가 다릅니다.`);
    snapshots.push({
      page,
      limit,
      totalItems,
      returnedItems: items.length,
      responseBytes: Buffer.byteLength(JSON.stringify(items)),
    });
  }
  return snapshots;
}

async function verifyLegacyDatasetSearch(postingId: number, companyId: number, datasetId: string, expectedTotal: number) {
  const q = datasetId.replace(/_/g, "-");
  const normalized = query({ q, page: 1, limit: 20 });
  const [items, totalItems] = await Promise.all([
    repository.listApplicationsForPosting(postingId, companyId, normalized),
    repository.countApplicationsForPosting(postingId, companyId, normalized),
  ]);
  assert(totalItems === expectedTotal, `dataset 검색 결과가 다릅니다: expected=${expectedTotal}, actual=${totalItems}`);
  assert(items.every((item) => item.candidate.user.email.includes(q)), "검색 결과에 dataset 외 지원자가 포함됐습니다.");
  return { q, totalItems, returnedItems: items.length };
}

async function verifyV2ExactEmailSearch(postingId: number, companyId: number, email: string) {
  const normalized = query({ q: email, page: 1, limit: 20 });
  const [items, totalItems] = await Promise.all([
    repository.listApplicationsForPosting(postingId, companyId, normalized),
    repository.countApplicationsForPosting(postingId, companyId, normalized),
  ]);
  assert(totalItems === 1, "V2 exact-email 검색 결과가 정확히 한 건이 아닙니다.");
  assert(items.length === 1, "V2 exact-email 검색 첫 페이지가 정확히 한 건이 아닙니다.");
  assert(items[0]?.candidate.user.email === email, "V2 exact-email 검색 결과가 plan과 다릅니다.");
  return { strategy: "exact-email", totalItems: 1, returnedItems: 1 };
}

async function verifyV2FirstPageDecisions(
  postingId: number,
  companyId: number,
  baselineApplicationIds: bigint[],
) {
  const page = 1;
  const limit = 20;
  const items = await repository.listApplicationsForPosting(
    postingId,
    companyId,
    query({ page, limit, order: "asc" }),
  );
  const baselineIds = new Set(baselineApplicationIds.map((applicationId) => applicationId.toString()));
  const syntheticItems = items.filter((item) => !baselineIds.has(String(item.applicationId)));
  const decisions = syntheticItems.reduce<Record<string, number>>((counts, item) => {
    const decision = item.screeningDecision ?? "UNDECIDED";
    counts[decision] = (counts[decision] ?? 0) + 1;
    return counts;
  }, {});
  assert((decisions.PASS ?? 0) > 0, "V2 첫 페이지 synthetic 지원자에 PASS가 없습니다.");
  assert((decisions.FAIL ?? 0) > 0, "V2 첫 페이지 synthetic 지원자에 FAIL이 없습니다.");
  return { page, limit, syntheticItems: syntheticItems.length, decisions };
}

async function verifyFilters(
  postingId: number,
  companyId: number,
  expectedStatusCounts: PostingStatusCounts,
) {
  const output: Record<string, Record<string, number>> = {};
  for (const field of ["applicationStatus", "documentStatus", "interviewStatus", "reportStatus", "screeningDecision"] as const) {
    const expected = expectedStatusCounts[field];
    output[field] = {};
    for (const [value, expectedCount] of Object.entries(expected)) {
      const actualCount = await repository.countApplicationsForPosting(
        postingId,
        companyId,
        query({ [field]: value }),
      );
      assert(actualCount === expectedCount, `${field}=${value} 필터 count가 다릅니다: expected=${expectedCount}, actual=${actualCount}`);
      output[field][value] = actualCount;
    }
  }
  return output;
}

async function verifySorts(postingId: number, companyId: number) {
  const output: Record<string, { ascChecked: number; descChecked: number }> = {};
  for (const field of ["updatedAt", "applicationStatus", "interviewStatus", "reportStatus"] as const) {
    const asc = await repository.listApplicationsForPosting(postingId, companyId, query({ sort: field, order: "asc", limit: 100 }));
    const desc = await repository.listApplicationsForPosting(postingId, companyId, query({ sort: field, order: "desc", limit: 100 }));
    assertSorted(asc, field, "asc");
    assertSorted(desc, field, "desc");
    output[field] = { ascChecked: asc.length, descChecked: desc.length };
  }
  return output;
}

async function verifyDetailDepths(
  companyId: number,
  records: Array<{ applicationId: bigint; dataDepth: string; cleanedAt: Date | null }>,
) {
  const output: Record<string, { documents: number; sessions: number; reports: number }> = {};
  for (const depth of ["PROFILE", "INTERVIEW", "REPORT"] as const) {
    const record = records.find((candidate) => candidate.dataDepth === depth && candidate.cleanedAt === null);
    assert(record, `${depth} fixture를 찾을 수 없습니다.`);
    const applicationId = safeNumber(record.applicationId, `${depth} applicationId`);
    const detail = await repository.findApplicationForCompany(applicationId, companyId);
    assert(detail, `${depth} 상세 조회가 실패했습니다.`);
    if (depth === "PROFILE") assert((detail.documents?.length ?? 0) > 0, "PROFILE fixture에 문서가 없습니다.");
    if (depth === "INTERVIEW") assert(detail.interviewSessions.length > 0, "INTERVIEW fixture에 세션이 없습니다.");
    if (depth === "REPORT") assert(detail.evaluationReports.length > 0, "REPORT fixture에 리포트가 없습니다.");
    output[depth] = {
      documents: detail.documents?.length ?? 0,
      sessions: detail.interviewSessions.length,
      reports: detail.evaluationReports.length,
    };
  }
  return output;
}

async function verifyReportFixtures(
  records: Array<{ ordinal: number; applicationId: bigint; dataDepth: string }>,
  planned: SyntheticApplicantPlanRecord[],
  manifestVersion: SyntheticManifestVersion,
) {
  const reports = await prisma.evaluationReport.findMany({
    where: { applicationId: { in: records.map((record) => record.applicationId) } },
    select: {
      applicationId: true,
      status: true,
      totalScore: true,
      scores: {
        select: { ncsProfileId: true, score: true, weight: true, weightedScore: true },
        orderBy: { ncsProfileId: "asc" },
      },
    },
  });

  const manifestByOrdinal = new Map(records.map((record) => [record.ordinal, record]));
  const reportsByApplication = new Map<string, typeof reports>();
  for (const report of reports) {
    assert(report.applicationId !== null, "manifest 범위 리포트에 application 연결이 없습니다.");
    const key = report.applicationId.toString();
    const grouped = reportsByApplication.get(key) ?? [];
    grouped.push(report);
    reportsByApplication.set(key, grouped);
  }

  const expected = buildSyntheticReportExpectations(planned);
  const scores: number[] = [];
  const decisions: Record<string, number> = {};
  let profileRows = 0;
  let weightedTotalsMatched = 0;

  for (const plannedRecord of planned.filter((record) => record.reportStatus === "COMPLETED")) {
    const manifestRecord = manifestByOrdinal.get(plannedRecord.ordinal);
    assert(manifestRecord, "완료 리포트의 manifest 대응 관계가 없습니다.");
    const completedReports = (reportsByApplication.get(manifestRecord.applicationId.toString()) ?? [])
      .filter((report) => report.status === "COMPLETED");
    assert(completedReports.length === 1, "완료 리포트가 application마다 정확히 한 건이 아닙니다.");

    const report = completedReports[0];
    const fixture = plannedRecord.reportFixture;
    assert(fixture, "완료 리포트 plan에 fixture가 없습니다.");
    assert(report.totalScore === fixture.totalScore, "완료 리포트 total score가 plan과 다릅니다.");
    scores.push(report.totalScore);
    decisions[plannedRecord.screeningDecision] = (decisions[plannedRecord.screeningDecision] ?? 0) + 1;
    profileRows += report.scores.length;

    const expectedProfiles = fixture.profiles;
    assert(report.scores.length === expectedProfiles.length, "완료 리포트 profile score row 수가 plan과 다릅니다.");
    if (manifestVersion === SYNTHETIC_MANIFEST_V2) {
      assert(report.scores.length === 3, "V2 완료 리포트에 canonical profile score 세 건이 없습니다.");
    }
    const scoreByProfile = new Map(report.scores.map((score) => [score.ncsProfileId, score]));
    assert(scoreByProfile.size === report.scores.length, "완료 리포트 profile ID가 중복되었습니다.");
    let weightedTotal = 0;
    for (const expectedProfile of expectedProfiles) {
      const score = scoreByProfile.get(expectedProfile.id);
      assert(score, "완료 리포트 profile ID가 plan과 다릅니다.");
      assert(score.score === expectedProfile.score, "완료 리포트 profile score가 plan과 다릅니다.");
      assert(score.weight === expectedProfile.weight, "완료 리포트 profile weight가 plan과 다릅니다.");
      assert(score.weightedScore !== null, "완료 리포트 weighted score가 없습니다.");
      const weightedScore = Number(score.weightedScore);
      assert(
        Math.abs(weightedScore - expectedProfile.score * expectedProfile.weight / 100) < 0.001,
        "완료 리포트 weighted score가 profile score와 다릅니다.",
      );
      weightedTotal += weightedScore;
    }
    if (expectedProfiles.length > 0) {
      assert(Math.round(weightedTotal) === report.totalScore, "완료 리포트 weighted total이 total score와 다릅니다.");
      weightedTotalsMatched += 1;
    }
  }

  const completed = reports.filter((report) => report.status === "COMPLETED").length;
  const actual = {
    completed,
    decisions,
    minimumScore: scores.length === 0 ? null : Math.min(...scores),
    maximumScore: scores.length === 0 ? null : Math.max(...scores),
    uniqueScores: new Set(scores).size,
    profileRows,
    weightedTotalsMatched,
  };
  assert(completed === expected.completed, "완료 리포트 집계가 plan과 다릅니다.");
  assertCountMap(decisions, expected.decisions, "completedReportDecision");
  assert(actual.minimumScore === expected.minimumScore, "완료 리포트 minimum score가 plan과 다릅니다.");
  assert(actual.maximumScore === expected.maximumScore, "완료 리포트 maximum score가 plan과 다릅니다.");
  assert(actual.uniqueScores === expected.uniqueScores, "완료 리포트 unique score 수가 plan과 다릅니다.");

  if (manifestVersion === SYNTHETIC_MANIFEST_V1) {
    const detailedCompleted = planned.filter(
      (record) => record.reportStatus === "COMPLETED" && record.dataDepth === "REPORT",
    ).length;
    assert(scores.every((score) => score === 81), "V1 완료 리포트 total score 81 계약이 깨졌습니다.");
    assert(profileRows === detailedCompleted * 3, "V1 REPORT depth profile row 계약이 깨졌습니다.");
    assert(weightedTotalsMatched === detailedCompleted, "V1 REPORT depth weighted total 계약이 깨졌습니다.");
  } else {
    assert(actual.completed === 100, "V2 완료 리포트가 정확히 100건이 아닙니다.");
    assertCountMap(actual.decisions, { PASS: 20, FAIL: 80 }, "V2 completedReportDecision");
    assert(actual.minimumScore === 45, "V2 완료 리포트 minimum score가 45가 아닙니다.");
    assert(actual.maximumScore === 96, "V2 완료 리포트 maximum score가 96이 아닙니다.");
    assert(actual.uniqueScores > 20, "V2 완료 리포트 unique score가 20개 이하입니다.");
    assert(actual.profileRows === 300, "V2 완료 리포트 profile row가 정확히 300건이 아닙니다.");
    assert(actual.weightedTotalsMatched === 100, "V2 완료 리포트 weighted total 일치가 정확히 100건이 아닙니다.");
  }
  return actual;
}

async function measureQueries(postingId: number, companyId: number, activeCount: number, iterations: number) {
  const limit = 20;
  const page = Math.max(1, Math.ceil(Math.ceil(activeCount / limit) / 2));
  const normalized = query({ page, limit });
  await Promise.all([
    repository.listApplicationsForPosting(postingId, companyId, normalized),
    repository.countApplicationsForPosting(postingId, companyId, normalized),
    repository.summarizeApplicationsForPosting(postingId, companyId),
  ]);
  const listAndCount = await measure(iterations, async () => {
    await Promise.all([
      repository.listApplicationsForPosting(postingId, companyId, normalized),
      repository.countApplicationsForPosting(postingId, companyId, normalized),
    ]);
  });
  const summary = await measure(iterations, async () => {
    await repository.summarizeApplicationsForPosting(postingId, companyId);
  });
  return { iterations, measuredPage: page, listAndCount, summary };
}

async function explainApplicantPage(postingId: bigint, page: number, limit: number): Promise<QueryPlanSummary> {
  const offset = (page - 1) * limit;
  const rows = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(Prisma.sql`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT application_id, updated_at
      FROM applications
     WHERE posting_id = ${postingId}
       AND application_status <> 'CANCELED'::"ApplicationStatus"
     ORDER BY updated_at DESC, application_id DESC
     LIMIT ${limit}
     OFFSET ${offset}
  `);
  const root = unwrapExplain(rows[0]?.["QUERY PLAN"]);
  const nodes = collectPlanNodes(root?.Plan);
  return {
    page,
    limit,
    offset,
    planningTimeMs: numberOrNull(root?.["Planning Time"]),
    executionTimeMs: numberOrNull(root?.["Execution Time"]),
    nodeTypes: [...new Set(nodes.map((node) => String(node["Node Type"] ?? "UNKNOWN")))],
    indexNames: [...new Set(nodes.map((node) => node["Index Name"]).filter((name): name is string => typeof name === "string"))],
    sharedHitBlocks: sumPlanNumber(nodes, "Shared Hit Blocks"),
    sharedReadBlocks: sumPlanNumber(nodes, "Shared Read Blocks"),
  };
}

function parseArguments(argv: string[]): ValidationArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    assert(argument.startsWith("--"), `알 수 없는 인자 형식입니다: ${argument}`);
    const separator = argument.indexOf("=");
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    assert(["dataset-id", "expect", "iterations", "output"].includes(name), `알 수 없는 인자입니다: --${name}`);
    const value = separator === -1 ? argv[++index] : argument.slice(separator + 1);
    assert(value && !value.startsWith("--"), `--${name} 값이 필요합니다.`);
    assert(!values.has(name), `--${name} 인자가 중복되었습니다.`);
    values.set(name, value);
  }
  const datasetId = values.get("dataset-id")?.trim();
  assert(datasetId, "--dataset-id가 필요합니다.");
  const expectedState = (values.get("expect") ?? "applied") as ExpectedState;
  assert(expectedState === "applied" || expectedState === "cleaned", "--expect는 applied 또는 cleaned여야 합니다.");
  const iterations = Number(values.get("iterations") ?? "20");
  assert(Number.isInteger(iterations) && iterations >= 1 && iterations <= 100, "--iterations는 1~100 정수여야 합니다.");
  return { datasetId, expectedState, iterations, outputPath: values.get("output")?.trim() || undefined };
}

function query(overrides: Partial<NormalizedApplicantListQuery> = {}): NormalizedApplicantListQuery {
  const page = overrides.page ?? 1;
  const limit = overrides.limit ?? 20;
  return {
    page,
    limit,
    sort: overrides.sort ?? "updatedAt",
    order: overrides.order ?? "desc",
    skip: (page - 1) * limit,
    take: limit,
    ...(overrides.q ? { q: overrides.q } : {}),
    ...(overrides.applicationStatus ? { applicationStatus: overrides.applicationStatus } : {}),
    ...(overrides.documentStatus ? { documentStatus: overrides.documentStatus } : {}),
    ...(overrides.interviewStatus ? { interviewStatus: overrides.interviewStatus } : {}),
    ...(overrides.reportStatus ? { reportStatus: overrides.reportStatus } : {}),
    ...(overrides.screeningDecision ? { screeningDecision: overrides.screeningDecision } : {}),
  };
}

function assertSorted(
  items: Awaited<ReturnType<PrismaCompanyRecruitingRepository["listApplicationsForPosting"]>>,
  field: "updatedAt" | "applicationStatus" | "interviewStatus" | "reportStatus",
  order: "asc" | "desc",
) {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    const fieldComparison = compareSortValue(field, previous[field], current[field]);
    const idComparison = previous.applicationId - current.applicationId;
    const comparison = fieldComparison === 0 ? idComparison : fieldComparison;
    assert(order === "asc" ? comparison <= 0 : comparison >= 0, `${field} ${order} 정렬이 index=${index}에서 깨졌습니다.`);
  }
}

function compareSortValue(field: string, left: string | Date, right: string | Date) {
  if (field === "updatedAt") return new Date(left).getTime() - new Date(right).getTime();
  const order = field === "applicationStatus"
    ? APPLICATION_STATUS_ORDER
    : field === "interviewStatus"
      ? INTERVIEW_STATUS_ORDER
      : REPORT_STATUS_ORDER;
  return order.indexOf(left as never) - order.indexOf(right as never);
}

async function measure(iterations: number, operation: () => Promise<void>) {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    await operation();
    samples.push(performance.now() - startedAt);
  }
  samples.sort((left, right) => left - right);
  return {
    minMs: round(samples[0]),
    p50Ms: round(percentile(samples, 0.5)),
    p95Ms: round(percentile(samples, 0.95)),
    maxMs: round(samples.at(-1) ?? 0),
  };
}

function percentile(sorted: number[], ratio: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function assertCountMap(actual: Record<string, number | undefined>, expected: Record<string, number>, label: string) {
  for (const [key, count] of Object.entries(expected)) {
    assert((actual[key] ?? 0) === count, `${label}.${key} count가 다릅니다: expected=${count}, actual=${actual[key] ?? 0}`);
  }
  const unexpected = Object.entries(actual).filter(([key, count]) => (count ?? 0) > 0 && expected[key] === undefined);
  assert(unexpected.length === 0, `${label}에 예상하지 않은 상태가 있습니다: ${unexpected.map(([key]) => key).join(", ")}`);
}

function unwrapExplain(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return isObject(value[0]) ? value[0] : undefined;
  return isObject(value) ? value : undefined;
}

function collectPlanNodes(value: unknown): Array<Record<string, unknown>> {
  if (!isObject(value)) return [];
  const children = Array.isArray(value.Plans) ? value.Plans.flatMap(collectPlanNodes) : [];
  return [value, ...children];
}

function sumPlanNumber(nodes: Array<Record<string, unknown>>, key: string) {
  return nodes.reduce((total, node) => total + (typeof node[key] === "number" ? node[key] : 0), 0);
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeNumber(value: bigint, label: string) {
  const number = Number(value);
  assert(Number.isSafeInteger(number), `${label}가 JavaScript safe integer 범위를 벗어났습니다.`);
  return number;
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function emit(value: unknown, outputPath?: string) {
  const serialized = `${JSON.stringify(value, (_, nested) => typeof nested === "bigint" ? nested.toString() : nested, 2)}\n`;
  if (outputPath) {
    const absolute = resolve(outputPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main()
  .catch((error) => {
    process.stderr.write(`synthetic-applicant-scale-validation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
