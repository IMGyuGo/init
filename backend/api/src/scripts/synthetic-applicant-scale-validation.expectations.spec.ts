import {
  buildSyntheticApplicantPlan,
  type SyntheticImporterOptions,
} from "../modules/candidate/scripts/synthetic-applicant-importer.contract";
import {
  buildPostingValidationExpectations,
  type ApplicantStateProjection,
} from "./synthetic-applicant-scale-validation.expectations";

describe("synthetic applicant scale validation expectations", () => {
  const plan = buildSyntheticApplicantPlan(options());

  it("preserves synthetic-only expectations when the posting has no baseline", () => {
    const actual = buildPostingValidationExpectations(plan, []);

    expect(actual.synthetic).toEqual({ active: 1_000, canceled: 50 });
    expect(actual.baseline).toEqual({
      active: 0,
      canceled: 0,
      statusCounts: {
        applicationStatus: {},
        documentStatus: {},
        interviewStatus: {},
        reportStatus: {},
        screeningDecision: {},
      },
      attentionRequired: 0,
    });
    expect(actual.posting.active).toBe(1_000);
    expect(actual.posting.canceled).toBe(50);
  });

  it("adds two active baseline applications to the posting total", () => {
    const syntheticOnly = buildPostingValidationExpectations(plan, []);
    const baseline = [
      application({ applicationStatus: "DRAFT", screeningDecision: "RETRY" }),
      application({ applicationStatus: "SUBMITTED", screeningDecision: "PASS" }),
    ];

    const actual = buildPostingValidationExpectations(plan, baseline);

    expect(actual.synthetic).toEqual({ active: 1_000, canceled: 50 });
    expect(actual.baseline.active).toBe(2);
    expect(actual.posting.active).toBe(1_002);
    expect(actual.posting.canceled).toBe(50);
    expect(actual.posting.statusCounts.applicationStatus.DRAFT).toBe(1);
    expect(actual.posting.statusCounts.applicationStatus.SUBMITTED).toBe(
      (syntheticOnly.posting.statusCounts.applicationStatus.SUBMITTED ?? 0) + 1,
    );
    expect(actual.posting.statusCounts.screeningDecision.RETRY).toBe(1);
  });

  it("counts a canceled baseline application only as canceled history", () => {
    const actual = buildPostingValidationExpectations(plan, [application({ applicationStatus: "CANCELED" })]);

    expect(actual.baseline).toMatchObject({ active: 0, canceled: 1, attentionRequired: 0 });
    expect(actual.posting.active).toBe(1_000);
    expect(actual.posting.canceled).toBe(51);
    expect(actual.baseline.statusCounts.applicationStatus).toEqual({});
  });

  it("merges baseline state maps and normalizes a null screening decision as attention-required", () => {
    const syntheticOnly = buildPostingValidationExpectations(plan, []);
    const baseline = application({
      applicationStatus: "IN_REVIEW",
      documentStatus: "EXTRACTED",
      interviewStatus: "READY",
      reportStatus: "GENERATING",
      screeningDecision: null,
    });

    const actual = buildPostingValidationExpectations(plan, [baseline]);

    expect(actual.baseline.statusCounts).toEqual({
      applicationStatus: { IN_REVIEW: 1 },
      documentStatus: { EXTRACTED: 1 },
      interviewStatus: { READY: 1 },
      reportStatus: { GENERATING: 1 },
      screeningDecision: { UNDECIDED: 1 },
    });
    expect(actual.baseline.attentionRequired).toBe(1);
    expect(actual.posting.attentionRequired).toBe(syntheticOnly.posting.attentionRequired + 1);
  });

  it("returns aggregate evidence without application IDs or personal data", () => {
    const serialized = JSON.stringify(buildPostingValidationExpectations(plan, [application()]));

    expect(serialized).not.toContain("applicationId");
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("name");
    expect(serialized).not.toContain("phone");
  });
});

function options(): SyntheticImporterOptions {
  return {
    action: "plan",
    environment: "production",
    companyId: 2n,
    postingId: 2n,
    datasetId: "issue411-production-posting2-20260720",
    activeCount: 1_000,
    canceledCount: 50,
    interactiveCount: 10,
    pipelineSelectionCount: 0,
    batchSize: 100,
  };
}

function application(overrides: Partial<ApplicantStateProjection> = {}): ApplicantStateProjection {
  return {
    applicationStatus: "SUBMITTED",
    documentStatus: "SUBMITTED",
    interviewStatus: "NOT_READY",
    reportStatus: "PENDING",
    screeningDecision: "UNDECIDED",
    ...overrides,
  };
}
