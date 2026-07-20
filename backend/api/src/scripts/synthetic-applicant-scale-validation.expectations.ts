import type {
  ApplicationStatus,
  DocumentStatus,
  InterviewStatus,
  ReportStatus,
  ScreeningDecision,
} from "@prisma/client";

import type { SyntheticApplicantPlanRecord } from "../modules/candidate/scripts/synthetic-applicant-importer.contract";

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
