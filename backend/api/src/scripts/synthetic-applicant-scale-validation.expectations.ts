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
