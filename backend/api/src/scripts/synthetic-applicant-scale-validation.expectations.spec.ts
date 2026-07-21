import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SYNTHETIC_MANIFEST_V2,
  SYNTHETIC_MANIFEST_V3,
  buildSyntheticApplicantPlan,
  type SyntheticApplicantPlanRecord,
  type SyntheticImporterOptions,
} from "../modules/candidate/scripts/synthetic-applicant-importer.contract";
import * as validationExpectations from "./synthetic-applicant-scale-validation.expectations";
import {
  assertV2SyntheticIdentityAggregate,
  buildPostingValidationExpectations,
  buildSyntheticReportExpectations,
  countSyntheticReportDecisions,
  type ApplicantStateProjection,
  type SyntheticIdentityAggregate,
} from "./synthetic-applicant-scale-validation.expectations";

describe("synthetic applicant scale validation expectations", () => {
  const plan = buildSyntheticApplicantPlan(options(), SYNTHETIC_MANIFEST_V2);

  it("wires V3 fixed-shape, projection, identity, interview and report assertions into the verifier", () => {
    const source = verifierSource();
    const operationalIndex = source.indexOf("assertV3SyntheticOperationalContract(dataset)");
    const manifestReadIndex = source.indexOf("prisma.syntheticApplicantRecord.findMany");
    const errorBoundaryIndex = source.indexOf("errorBoundary.markManifestVersion(dataset.manifestVersion)");

    expect(operationalIndex).toBeGreaterThan(-1);
    expect(operationalIndex).toBeLessThan(manifestReadIndex);
    expect(errorBoundaryIndex).toBeGreaterThan(-1);
    expect(errorBoundaryIndex).toBeLessThan(manifestReadIndex);
    expect(source).toContain("errorBoundary.format(error)");
    expect(source).toContain("assertV3SyntheticManifestProjection(records, planned)");
    expect(source).toContain("assertV3SyntheticIdentityAggregate(aggregate)");
    expect(source).toContain("assertV3SyntheticInterviewCompletedCount");
    expect(source).toContain("actual.completed === 920");
    expect(source).toContain("{ PASS: 184, FAIL: 736 }");
    expect(source).toContain("actual.profileRows === 2_760");
    expect(source).toContain("actual.weightedTotalsMatched === 920");
  });

  it("uses the real updatedAt-desc repository page for aggregate-only V3 diversity evidence", () => {
    const body = sourceFunction(verifierSource(), "async function verifyV3FirstPageAggregate", "async function verifyFilters");

    expect(body).toContain('sort: "updatedAt", order: "desc"');
    expect(body).toContain("baselineIds");
    expect(body).toContain("buildV3SyntheticFirstPageAggregate");
    expect(body).toContain("verifyV3FirstPageAggregateOnly");
    expect(body).not.toMatch(/return\s+\{[^}]*name|return\s+\{[^}]*email|return\s+\{[^}]*phone|IdSample/is);
  });

  it("keeps the V3 exact search value internal to aggregate-only output and errors", () => {
    const body = sourceFunction(verifierSource(), "async function verifyV3ExactEmailSearch", "async function verifyV2FirstPageDecisions");

    expect(body).toContain("candidate.user.email === email");
    expect(body).toContain("verifyV3ExactSearchAggregateOnly");
    expect(body).not.toContain("${email}");
  });

  it("replaces a V3 exact-search repository failure with constant aggregate-only evidence", async () => {
    const searchedValue = "private.person@controlled.example";
    const sensitiveValues = [searchedValue, "userId=71001", "candidateId=72001", "applicationId=73001"];
    const operation = v3ExactSearchAggregateOnly<{ candidate: { user: { email: string } } }>();

    const failure = await captureError(operation(
      async () => {
        throw new Error(`Prisma query failed: ${sensitiveValues.join(" ")}`);
      },
      (item) => item.candidate.user.email === searchedValue,
    ));
    const failureOutput = serializeFailure(failure);

    expect(failure.message).toBe("V3 exact-search aggregate verification failed.");
    expect(failureOutput).not.toMatch(/name|email|phone|userId|candidateId|applicationId|idSample/i);
    for (const value of sensitiveValues) expect(failureOutput).not.toContain(value);

    const success = await operation(
      async () => ({
        items: [{ candidate: { user: { email: searchedValue } } }],
        totalItems: 1,
      }),
      (item) => item.candidate.user.email === searchedValue,
    );
    const successOutput = JSON.stringify(success);
    expect(success).toEqual({ totalItems: 1, returnedItems: 1 });
    expect(successOutput).not.toMatch(/name|email|phone|userId|candidateId|applicationId|idSample/i);
    expect(successOutput).not.toContain(searchedValue);
  });

  it("replaces a V3 first-page repository failure with constant aggregate-only evidence", async () => {
    const sensitiveValues = [
      "name=Private Person",
      "email=private.person@controlled.example",
      "phone=010-1234-5678",
      "applicationId=73001",
    ];
    const operation = v3FirstPageAggregateOnly();

    const failure = await captureError(operation(async () => {
      throw new Error(`Prisma query failed: ${sensitiveValues.join(" ")}`);
    }));
    const failureOutput = serializeFailure(failure);

    expect(failure.message).toBe("V3 latest-page aggregate verification failed.");
    expect(failureOutput).not.toMatch(/name|email|phone|userId|candidateId|applicationId|idSample/i);
    for (const value of sensitiveValues) expect(failureOutput).not.toContain(value);

    const success = await operation(async () => [
      { decision: "PASS", identity: "김가나" },
      { decision: "FAIL", identity: "박다라" },
    ]);
    const successOutput = JSON.stringify(success);
    expect(success).toEqual({
      syntheticItems: 2,
      uniqueFullCount: 2,
      uniqueGivenCount: 2,
      uniqueFamilyCount: 2,
      decisions: { PASS: 1, FAIL: 1 },
    });
    expect(successOutput).not.toMatch(/name|email|phone|userId|candidateId|applicationId|idSample/i);
    expect(successOutput).not.toMatch(/김가나|박다라/);
  });

  it("renders every post-manifest V3 failure as one constant while preserving V2 error output", () => {
    const sensitiveValues = [
      "email=private.person@controlled.example",
      "name=Private Person",
      "phone=010-1234-5678",
      "userId=71001",
      "candidateId=72001",
      "applicationId=73001",
    ];
    const downstream = new Error(`Prisma query failed: ${sensitiveValues.join(" ")}`);
    const v3Boundary = createScaleValidationErrorBoundary();
    v3Boundary.markManifestVersion(SYNTHETIC_MANIFEST_V3);

    const v3Output = v3Boundary.format(downstream);

    expect(v3Output).toBe("synthetic-applicant-scale-validation failed: V3 aggregate verification failed.\n");
    expect(v3Output).not.toMatch(/name|email|phone|userId|candidateId|applicationId|idSample/i);
    for (const value of sensitiveValues) expect(v3Output).not.toContain(value);

    const v2Boundary = createScaleValidationErrorBoundary();
    v2Boundary.markManifestVersion(SYNTHETIC_MANIFEST_V2);
    expect(v2Boundary.format(downstream)).toBe(
      `synthetic-applicant-scale-validation failed: ${downstream.message}\n`,
    );
  });

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

  it("summarizes the approved V2 report distribution without identity data", () => {
    const v2 = buildSyntheticApplicantPlan({ ...options(), postingId: 36n }, SYNTHETIC_MANIFEST_V2);
    const actual = buildSyntheticReportExpectations(v2);
    expect(actual).toEqual({
      completed: 100,
      decisions: { PASS: 20, FAIL: 80 },
      minimumScore: 45,
      maximumScore: 96,
      uniqueScores: expect.any(Number),
    });
    expect(actual.uniqueScores).toBeGreaterThan(20);
    expect(JSON.stringify(actual)).not.toMatch(/applicationId|email|name|phone/);
  });

  it("summarizes the approved V3 report distribution without identity data", () => {
    const v3 = buildSyntheticApplicantPlan({ ...options(), postingId: 36n }, SYNTHETIC_MANIFEST_V3);
    const actual = buildSyntheticReportExpectations(v3);

    expect(actual).toEqual({
      completed: 920,
      decisions: { PASS: 184, FAIL: 736 },
      minimumScore: 45,
      maximumScore: 96,
      uniqueScores: expect.any(Number),
    });
    expect(actual.uniqueScores).toBeGreaterThan(20);
    expect(JSON.stringify(actual)).not.toMatch(/applicationId|email|name|phone/);
  });

  it("accepts only the approved fixed V2 identity aggregate", () => {
    expect(() => assertV2SyntheticIdentityAggregate(v2IdentityAggregate())).not.toThrow();
  });

  it.each([
    ["interactive", 9],
    ["nonInteractive", 1_039],
    ["invalidNonInteractive", 1],
    ["identityMatches", 1_049],
  ] as const)("rejects a V2 %s aggregate outside the approved total", (field, value) => {
    expect(() => assertV2SyntheticIdentityAggregate({
      ...v2IdentityAggregate(),
      [field]: value,
    })).toThrow();
  });

  it("accepts only the approved V3 identity and diversity aggregate", () => {
    expect(() => assertV3IdentityAggregate(v3IdentityAggregate())).not.toThrow();
  });

  it.each([
    ["interactive", 9],
    ["nonInteractive", 1_039],
    ["invalidNonInteractive", 1],
    ["identityMatches", 1_049],
    ["uniqueFullCount", 1_049],
    ["uniqueGivenCount", 524],
    ["uniqueFamilyCount", 19],
  ] as const)("rejects a V3 %s aggregate outside the approved total", (field, value) => {
    expect(() => assertV3IdentityAggregate({
      ...v3IdentityAggregate(),
      [field]: value,
    })).toThrow();
  });

  it("rejects a V3 identity aggregate outside the controlled domain allowlist", () => {
    expect(() => assertV3IdentityAggregate({
      ...v3IdentityAggregate(),
      domainCounts: { "uncontrolled.example": 1_050 },
    })).toThrow("allowlist");
  });

  it("returns only aggregate V3 latest-page diversity and decision evidence", () => {
    const actual = buildV3FirstPageAggregate([
      { decision: "PASS", identity: "김가나" },
      { decision: "FAIL", identity: "박다라" },
    ]);

    expect(actual).toEqual({
      syntheticItems: 2,
      uniqueFullCount: 2,
      uniqueGivenCount: 2,
      uniqueFamilyCount: 2,
      decisions: { PASS: 1, FAIL: 1 },
    });
    expect(JSON.stringify(actual)).not.toMatch(/name|email|phone|idSample|김가나|박다라/i);
  });

  it("rejects a V3 latest page without decision and identity diversity", () => {
    expect(() => buildV3FirstPageAggregate([
      { decision: "PASS", identity: "김가나" },
      { decision: "PASS", identity: "김가나" },
    ])).toThrow();
  });

  it("accepts only 920 actual V3 synthetic completed interviews", () => {
    expect(() => assertV3InterviewCompletedCount(920)).not.toThrow();
    expect(() => assertV3InterviewCompletedCount(919)).toThrow("920");
  });

  it("counts the actual database report decisions supplied by the verifier", () => {
    expect(countSyntheticReportDecisions(["FAIL", "PASS", "FAIL"])).toEqual({ FAIL: 2, PASS: 1 });
  });

  it("accepts the exact posting-36 V2 manifest projection independent of record order", () => {
    const fixedPlan = buildSyntheticApplicantPlan({ ...options(), postingId: 36n }, SYNTHETIC_MANIFEST_V2);

    expect(() => assertV2ManifestProjection(project(fixedPlan).reverse(), fixedPlan)).not.toThrow();
  });

  it.each([
    ["isCanceled", true],
    ["isInteractive", false],
    ["pipelineSelected", true],
    ["lifecycleStage", "CANCELED"],
    ["dataDepth", "REPORT"],
  ] as const)("rejects a V2 manifest record with a mismatched %s projection", (field, value) => {
    const fixedPlan = buildSyntheticApplicantPlan({ ...options(), postingId: 36n }, SYNTHETIC_MANIFEST_V2);
    const actual = project(fixedPlan);
    Object.assign(actual[0], { [field]: value });

    expect(() => assertV2ManifestProjection(actual, fixedPlan)).toThrow(field);
  });

  it.each([
    ["stage", "lifecycleStage", "CANCELED"],
    ["depth", "dataDepth", "REPORT"],
  ] as const)("rejects a malformed V2 %s aggregate even when a supplied plan repeats it", (label, field, value) => {
    const malformedPlan = buildSyntheticApplicantPlan({ ...options(), postingId: 36n }, SYNTHETIC_MANIFEST_V2);
    Object.assign(malformedPlan[0], { [field]: value });

    expect(() => assertV2ManifestProjection(project(malformedPlan), malformedPlan)).toThrow(`${label} aggregate`);
  });

  it("accepts the exact posting-36 V3 manifest projection independent of record order", () => {
    const fixedPlan = buildSyntheticApplicantPlan({ ...options(), postingId: 36n }, SYNTHETIC_MANIFEST_V3);

    expect(() => assertV3ManifestProjection(project(fixedPlan).reverse(), fixedPlan)).not.toThrow();
  });

  it.each([
    ["isCanceled", true],
    ["isInteractive", false],
    ["pipelineSelected", true],
    ["lifecycleStage", "CANCELED"],
    ["dataDepth", "REPORT"],
  ] as const)("rejects a V3 manifest record with a mismatched %s projection", (field, value) => {
    const fixedPlan = buildSyntheticApplicantPlan({ ...options(), postingId: 36n }, SYNTHETIC_MANIFEST_V3);
    const actual = project(fixedPlan);
    Object.assign(actual[0], { [field]: value });

    expect(() => assertV3ManifestProjection(actual, fixedPlan)).toThrow(field);
  });

  it.each([
    ["stage", "lifecycleStage", "CANCELED"],
    ["depth", "dataDepth", "REPORT"],
  ] as const)("rejects a malformed V3 %s aggregate even when a supplied plan repeats it", (label, field, value) => {
    const malformedPlan = buildSyntheticApplicantPlan({ ...options(), postingId: 36n }, SYNTHETIC_MANIFEST_V3);
    Object.assign(malformedPlan[0], { [field]: value });

    expect(() => assertV3ManifestProjection(project(malformedPlan), malformedPlan)).toThrow(`${label} aggregate`);
  });
});

type ManifestProjection = Pick<
  SyntheticApplicantPlanRecord,
  "ordinal" | "isCanceled" | "isInteractive" | "pipelineSelected" | "lifecycleStage" | "dataDepth"
>;

function project(records: SyntheticApplicantPlanRecord[]): ManifestProjection[] {
  return records.map(({ ordinal, isCanceled, isInteractive, pipelineSelected, lifecycleStage, dataDepth }) => ({
    ordinal,
    isCanceled,
    isInteractive,
    pipelineSelected,
    lifecycleStage,
    dataDepth,
  }));
}

function assertV2ManifestProjection(actual: ManifestProjection[], planned: SyntheticApplicantPlanRecord[]) {
  const assertion = (validationExpectations as unknown as {
    assertV2SyntheticManifestProjection?: (actual: ManifestProjection[], planned: SyntheticApplicantPlanRecord[]) => void;
  }).assertV2SyntheticManifestProjection;
  if (!assertion) throw new Error("assertV2SyntheticManifestProjection is not implemented");
  assertion(actual, planned);
}

function assertV3ManifestProjection(actual: ManifestProjection[], planned: SyntheticApplicantPlanRecord[]) {
  const assertion = (validationExpectations as unknown as {
    assertV3SyntheticManifestProjection?: (actual: ManifestProjection[], planned: SyntheticApplicantPlanRecord[]) => void;
  }).assertV3SyntheticManifestProjection;
  if (!assertion) throw new Error("assertV3SyntheticManifestProjection is not implemented");
  assertion(actual, planned);
}

type V3IdentityAggregate = SyntheticIdentityAggregate & {
  uniqueFullCount: number;
  uniqueGivenCount: number;
  uniqueFamilyCount: number;
};

function assertV3IdentityAggregate(actual: V3IdentityAggregate) {
  const assertion = (validationExpectations as unknown as {
    assertV3SyntheticIdentityAggregate?: (aggregate: V3IdentityAggregate) => void;
  }).assertV3SyntheticIdentityAggregate;
  if (!assertion) throw new Error("assertV3SyntheticIdentityAggregate is not implemented");
  assertion(actual);
}

function buildV3FirstPageAggregate(actual: Array<{ decision: string | null; identity: string }>) {
  const builder = (validationExpectations as unknown as {
    buildV3SyntheticFirstPageAggregate?: (
      records: Array<{ decision: string | null; identity: string }>,
    ) => {
      syntheticItems: number;
      uniqueFullCount: number;
      uniqueGivenCount: number;
      uniqueFamilyCount: number;
      decisions: Record<string, number>;
    };
  }).buildV3SyntheticFirstPageAggregate;
  if (!builder) throw new Error("buildV3SyntheticFirstPageAggregate is not implemented");
  return builder(actual);
}

function assertV3InterviewCompletedCount(actual: number) {
  const assertion = (validationExpectations as unknown as {
    assertV3SyntheticInterviewCompletedCount?: (completed: number) => void;
  }).assertV3SyntheticInterviewCompletedCount;
  if (!assertion) throw new Error("assertV3SyntheticInterviewCompletedCount is not implemented");
  assertion(actual);
}

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

function v2IdentityAggregate(): SyntheticIdentityAggregate {
  return {
    interactive: 10,
    nonInteractive: 1_040,
    invalidNonInteractive: 0,
    identityMatches: 1_050,
    domainCounts: {},
  };
}

function v3IdentityAggregate(): V3IdentityAggregate {
  return {
    interactive: 10,
    nonInteractive: 1_040,
    invalidNonInteractive: 0,
    identityMatches: 1_050,
    domainCounts: { "bluepost.init-jungle.cloud": 1_050 },
    uniqueFullCount: 1_050,
    uniqueGivenCount: 525,
    uniqueFamilyCount: 20,
  };
}

function verifierSource() {
  return readFileSync(join(__dirname, "synthetic-applicant-scale-validation.ts"), "utf8");
}

function sourceFunction(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`verifier function boundary missing: ${start}`);
  return source.slice(startIndex, endIndex);
}

function v3ExactSearchAggregateOnly<T>() {
  const operation = (validationExpectations as unknown as {
    verifyV3ExactSearchAggregateOnly?: (
      load: () => Promise<{ items: readonly T[]; totalItems: number }>,
      matchesExpected: (item: T) => boolean,
    ) => Promise<{ totalItems: number; returnedItems: number }>;
  }).verifyV3ExactSearchAggregateOnly;
  if (!operation) throw new Error("verifyV3ExactSearchAggregateOnly is not implemented");
  return operation;
}

function v3FirstPageAggregateOnly() {
  const operation = (validationExpectations as unknown as {
    verifyV3FirstPageAggregateOnly?: (
      load: () => Promise<Array<{ decision: string | null; identity: string }>>,
    ) => Promise<{
      syntheticItems: number;
      uniqueFullCount: number;
      uniqueGivenCount: number;
      uniqueFamilyCount: number;
      decisions: Record<string, number>;
    }>;
  }).verifyV3FirstPageAggregateOnly;
  if (!operation) throw new Error("verifyV3FirstPageAggregateOnly is not implemented");
  return operation;
}

async function captureError(operation: Promise<unknown>) {
  try {
    await operation;
    throw new Error("expected operation to fail");
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return error;
  }
}

function serializeFailure(error: Error) {
  return JSON.stringify({
    message: error.message,
    cause: error.cause instanceof Error ? error.cause.message : error.cause ?? null,
  });
}

function createScaleValidationErrorBoundary() {
  const factory = (validationExpectations as unknown as {
    createScaleValidationErrorBoundary?: () => {
      markManifestVersion: (manifestVersion: string) => void;
      format: (error: unknown) => string;
    };
  }).createScaleValidationErrorBoundary;
  if (!factory) throw new Error("createScaleValidationErrorBoundary is not implemented");
  return factory();
}
