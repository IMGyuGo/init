import type {
  ApplicationStatus,
  DocumentStatus,
  InterviewStatus,
  ReportStatus,
  ScreeningDecision,
} from "@prisma/client";

import type { SyntheticApplicantPlanRecord } from "../modules/candidate/scripts/synthetic-applicant-importer.contract";
import { V2_EMAIL_DOMAINS } from "../modules/candidate/scripts/synthetic-applicant-importer.v2";

export type ApplicantStateProjection = {
  applicationStatus: ApplicationStatus;
  documentStatus: DocumentStatus;
  interviewStatus: InterviewStatus;
  reportStatus: ReportStatus;
  screeningDecision: ScreeningDecision | null;
};

export type PostingStatusCounts = {
  applicationStatus: Record<string, number>;
  documentStatus: Record<string, number>;
  interviewStatus: Record<string, number>;
  reportStatus: Record<string, number>;
  screeningDecision: Record<string, number>;
};

type AggregateExpectation = {
  active: number;
  canceled: number;
  statusCounts: PostingStatusCounts;
  attentionRequired: number;
};

export type PostingValidationExpectations = {
  baseline: AggregateExpectation;
  synthetic: { active: number; canceled: number };
  posting: AggregateExpectation;
};

export type SyntheticReportExpectations = {
  completed: number;
  decisions: Record<string, number>;
  minimumScore: number | null;
  maximumScore: number | null;
  uniqueScores: number;
};

export type SyntheticIdentityAggregate = {
  interactive: number;
  nonInteractive: number;
  invalidNonInteractive: number;
  identityMatches: number;
  domainCounts: Record<string, number>;
};

export type V3SyntheticIdentityAggregate = SyntheticIdentityAggregate & {
  uniqueFullCount: number;
  uniqueGivenCount: number;
  uniqueFamilyCount: number;
};

export type V3SyntheticFirstPageProjection = {
  decision: string | null;
  identity: string;
};

export type SyntheticManifestProjection = {
  ordinal: number;
  isCanceled: boolean;
  isInteractive: boolean;
  pipelineSelected: boolean;
  lifecycleStage: string;
  dataDepth: string;
};

const FIXED_V2_STAGE_COUNTS: Record<string, number> = {
  DOCUMENT_PROCESSING: 350,
  DOCUMENT_REVIEW: 250,
  INTERVIEW_WAITING: 180,
  INTERVIEW_IN_PROGRESS: 100,
  REPORT_COMPLETED: 100,
  FAILED: 20,
  CANCELED: 50,
};

const FIXED_V2_DEPTH_COUNTS: Record<string, number> = {
  LIGHTWEIGHT: 800,
  PROFILE: 150,
  INTERVIEW: 40,
  REPORT: 10,
};

const FIXED_V3_STAGE_COUNTS: Record<string, number> = {
  DOCUMENT_PROCESSING: 10,
  DOCUMENT_REVIEW: 10,
  INTERVIEW_WAITING: 30,
  INTERVIEW_IN_PROGRESS: 28,
  REPORT_COMPLETED: 920,
  FAILED: 2,
  CANCELED: 50,
};

const FIXED_V3_DEPTH_COUNTS: Record<string, number> = {
  LIGHTWEIGHT: 800,
  PROFILE: 150,
  INTERVIEW: 40,
  REPORT: 10,
};

export function buildPostingValidationExpectations(
  syntheticPlan: SyntheticApplicantPlanRecord[],
  baselineApplications: ApplicantStateProjection[],
): PostingValidationExpectations {
  const syntheticActive = syntheticPlan.filter((record) => !record.isCanceled);
  const baselineActive = baselineApplications.filter((record) => record.applicationStatus !== "CANCELED");
  const syntheticCanceled = syntheticPlan.length - syntheticActive.length;
  const baselineCanceled = baselineApplications.length - baselineActive.length;

  return {
    baseline: aggregate(baselineActive, baselineCanceled),
    synthetic: {
      active: syntheticActive.length,
      canceled: syntheticCanceled,
    },
    posting: aggregate([...syntheticActive, ...baselineActive], syntheticCanceled + baselineCanceled),
  };
}

export function buildSyntheticReportExpectations(
  plan: SyntheticApplicantPlanRecord[],
): SyntheticReportExpectations {
  const completed = plan.filter((record) => record.reportStatus === "COMPLETED");
  const scores = completed.map((record) => record.reportFixture?.totalScore ?? NaN);
  if (scores.some((score) => !Number.isInteger(score))) {
    throw new Error("완료 리포트 plan에 total score가 없습니다.");
  }
  return {
    completed: completed.length,
    decisions: completed.reduce<Record<string, number>>((counts, record) => {
      counts[record.screeningDecision] = (counts[record.screeningDecision] ?? 0) + 1;
      return counts;
    }, {}),
    minimumScore: scores.length === 0 ? null : Math.min(...scores),
    maximumScore: scores.length === 0 ? null : Math.max(...scores),
    uniqueScores: new Set(scores).size,
  };
}

export function assertV2SyntheticIdentityAggregate(actual: SyntheticIdentityAggregate) {
  if (actual.interactive !== 10) throw new Error("V2 interactive identity aggregate가 승인값과 다릅니다.");
  if (actual.nonInteractive !== 1_040) throw new Error("V2 non-interactive identity aggregate가 승인값과 다릅니다.");
  if (actual.invalidNonInteractive !== 0) throw new Error("V2 invalid identity aggregate가 승인값과 다릅니다.");
  if (actual.identityMatches !== 1_050) throw new Error("V2 identity match aggregate가 승인값과 다릅니다.");
}

export function assertV3SyntheticIdentityAggregate(actual: V3SyntheticIdentityAggregate) {
  if (actual.interactive !== 10) throw new Error("V3 interactive identity aggregate가 승인값과 다릅니다.");
  if (actual.nonInteractive !== 1_040) throw new Error("V3 non-interactive identity aggregate가 승인값과 다릅니다.");
  if (actual.invalidNonInteractive !== 0) throw new Error("V3 invalid identity aggregate가 승인값과 다릅니다.");
  if (actual.identityMatches !== 1_050) throw new Error("V3 identity match aggregate가 승인값과 다릅니다.");
  if (actual.uniqueFullCount !== 1_050) throw new Error("V3 unique full identity aggregate가 승인값과 다릅니다.");
  if (actual.uniqueGivenCount !== 525) throw new Error("V3 unique given identity aggregate가 승인값과 다릅니다.");
  if (actual.uniqueFamilyCount !== 20) throw new Error("V3 unique family identity aggregate가 승인값과 다릅니다.");

  const allowlist = new Set<string>(V2_EMAIL_DOMAINS);
  if (Object.keys(actual.domainCounts).some((domain) => !allowlist.has(domain))) {
    throw new Error("V3 identity domain allowlist aggregate가 승인 범위를 벗어났습니다.");
  }
  const domainTotal = Object.values(actual.domainCounts).reduce((total, count) => total + count, 0);
  if (domainTotal !== 1_050) throw new Error("V3 identity domain aggregate total이 승인값과 다릅니다.");
}

export function buildV3SyntheticFirstPageAggregate(actual: readonly V3SyntheticFirstPageProjection[]) {
  const fullIdentities = actual.map((record) => record.identity);
  const givenIdentities = fullIdentities.map((identity) => identity.slice(1));
  const familyIdentities = fullIdentities.map((identity) => identity.slice(0, 1));
  const aggregate = {
    syntheticItems: actual.length,
    uniqueFullCount: new Set(fullIdentities).size,
    uniqueGivenCount: new Set(givenIdentities).size,
    uniqueFamilyCount: new Set(familyIdentities).size,
    decisions: countSyntheticReportDecisions(actual.map((record) => record.decision ?? "UNDECIDED")),
  };

  if ((aggregate.decisions.PASS ?? 0) === 0) throw new Error("V3 latest-page PASS aggregate가 없습니다.");
  if ((aggregate.decisions.FAIL ?? 0) === 0) throw new Error("V3 latest-page FAIL aggregate가 없습니다.");
  if (aggregate.uniqueFullCount !== aggregate.syntheticItems) {
    throw new Error("V3 latest-page full identity diversity aggregate가 부족합니다.");
  }
  if (aggregate.uniqueGivenCount !== aggregate.syntheticItems) {
    throw new Error("V3 latest-page given identity diversity aggregate가 부족합니다.");
  }
  if (aggregate.uniqueFamilyCount !== aggregate.syntheticItems) {
    throw new Error("V3 latest-page family identity diversity aggregate가 부족합니다.");
  }
  return aggregate;
}

export async function verifyV3ExactSearchAggregateOnly<T>(
  load: () => Promise<{ items: readonly T[]; totalItems: number }>,
  matchesExpected: (item: T) => boolean,
) {
  try {
    const { items, totalItems } = await load();
    if (totalItems !== 1 || items.length !== 1 || !matchesExpected(items[0])) {
      throw new Error("V3 exact-search aggregate mismatch.");
    }
    return { totalItems: 1, returnedItems: 1 };
  } catch {
    throw new Error("V3 exact-search aggregate verification failed.");
  }
}

export async function verifyV3FirstPageAggregateOnly(
  load: () => Promise<V3SyntheticFirstPageProjection[]>,
  aggregate: (
    actual: readonly V3SyntheticFirstPageProjection[],
  ) => ReturnType<typeof buildV3SyntheticFirstPageAggregate> = buildV3SyntheticFirstPageAggregate,
) {
  try {
    return aggregate(await load());
  } catch {
    throw new Error("V3 latest-page aggregate verification failed.");
  }
}

export function assertV3SyntheticInterviewCompletedCount(actual: number) {
  if (actual !== 920) throw new Error("V3 synthetic interview COMPLETED aggregate가 정확히 920건이 아닙니다.");
}

export function assertV2SyntheticManifestProjection(
  actual: readonly SyntheticManifestProjection[],
  planned: readonly SyntheticApplicantPlanRecord[],
) {
  const actualByOrdinal = new Map(actual.map((record) => [record.ordinal, record]));
  if (actualByOrdinal.size !== actual.length) throw new Error("V2 manifest ordinal이 중복되었습니다.");
  if (actual.length !== planned.length) throw new Error("V2 manifest projection total이 plan과 다릅니다.");

  for (const expected of planned) {
    const record = actualByOrdinal.get(expected.ordinal);
    if (!record) throw new Error(`V2 manifest ordinal=${expected.ordinal} projection이 누락되었습니다.`);
    for (const field of [
      "isCanceled",
      "isInteractive",
      "pipelineSelected",
      "lifecycleStage",
      "dataDepth",
    ] as const) {
      if (record[field] !== expected[field]) {
        throw new Error(`V2 manifest ordinal=${expected.ordinal} ${field} projection이 plan과 다릅니다.`);
      }
    }
  }

  assertFixedCountMap(countByProjection(actual, "lifecycleStage"), FIXED_V2_STAGE_COUNTS, "stage aggregate");
  assertFixedCountMap(
    countByProjection(actual.filter((record) => !record.isCanceled), "dataDepth"),
    FIXED_V2_DEPTH_COUNTS,
    "depth aggregate",
  );
}

export function assertV3SyntheticManifestProjection(
  actual: readonly SyntheticManifestProjection[],
  planned: readonly SyntheticApplicantPlanRecord[],
) {
  const actualByOrdinal = new Map(actual.map((record) => [record.ordinal, record]));
  if (actualByOrdinal.size !== actual.length) throw new Error("V3 manifest ordinal이 중복되었습니다.");
  if (actual.length !== planned.length) throw new Error("V3 manifest projection total이 plan과 다릅니다.");

  for (const expected of planned) {
    const record = actualByOrdinal.get(expected.ordinal);
    if (!record) throw new Error(`V3 manifest ordinal=${expected.ordinal} projection이 누락되었습니다.`);
    for (const field of [
      "isCanceled",
      "isInteractive",
      "pipelineSelected",
      "lifecycleStage",
      "dataDepth",
    ] as const) {
      if (record[field] !== expected[field]) {
        throw new Error(`V3 manifest ordinal=${expected.ordinal} ${field} projection이 plan과 다릅니다.`);
      }
    }
  }

  assertV3FixedCountMap(countByProjection(actual, "lifecycleStage"), FIXED_V3_STAGE_COUNTS, "stage aggregate");
  assertV3FixedCountMap(
    countByProjection(actual.filter((record) => !record.isCanceled), "dataDepth"),
    FIXED_V3_DEPTH_COUNTS,
    "depth aggregate",
  );
}

export function countSyntheticReportDecisions(decisions: readonly string[]) {
  return decisions.reduce<Record<string, number>>((counts, decision) => {
    counts[decision] = (counts[decision] ?? 0) + 1;
    return counts;
  }, {});
}

function aggregate(active: ApplicantStateProjection[], canceled: number): AggregateExpectation {
  return {
    active: active.length,
    canceled,
    statusCounts: {
      applicationStatus: countBy(active, "applicationStatus"),
      documentStatus: countBy(active, "documentStatus"),
      interviewStatus: countBy(active, "interviewStatus"),
      reportStatus: countBy(active, "reportStatus"),
      screeningDecision: countBy(active, "screeningDecision"),
    },
    attentionRequired: active.filter(requiresAttention).length,
  };
}

function countByProjection(
  records: readonly SyntheticManifestProjection[],
  field: "lifecycleStage" | "dataDepth",
) {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = record[field];
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function assertFixedCountMap(actual: Record<string, number>, expected: Record<string, number>, label: string) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of keys) {
    if ((actual[key] ?? 0) !== (expected[key] ?? 0)) {
      throw new Error(`V2 ${label}.${key}가 승인값과 다릅니다.`);
    }
  }
}

function assertV3FixedCountMap(actual: Record<string, number>, expected: Record<string, number>, label: string) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of keys) {
    if ((actual[key] ?? 0) !== (expected[key] ?? 0)) {
      throw new Error(`V3 ${label}.${key}가 승인값과 다릅니다.`);
    }
  }
}

function countBy(records: ApplicantStateProjection[], field: keyof ApplicantStateProjection) {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = record[field];
    const key = field === "screeningDecision" && value === null ? "UNDECIDED" : String(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function requiresAttention(record: ApplicantStateProjection) {
  return record.documentStatus === "FAILED"
    || record.interviewStatus === "FAILED"
    || record.reportStatus === "FAILED"
    || record.screeningDecision === "UNDECIDED"
    || record.screeningDecision === null;
}
