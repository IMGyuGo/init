import { createHash } from "crypto";

import { allocateByWeight } from "./synthetic-applicant-importer.allocation";
import { buildSyntheticApplicantPlanV2 } from "./synthetic-applicant-importer.v2";

export const SYNTHETIC_MANIFEST_V1 = "SYNTHETIC_APPLICANT_MANIFEST_V1" as const;
export const SYNTHETIC_MANIFEST_V2 = "SYNTHETIC_APPLICANT_MANIFEST_V2" as const;
export const SYNTHETIC_MANIFEST_VERSION = SYNTHETIC_MANIFEST_V2;
export const SYNTHETIC_PRODUCTION_ACK = "ISSUE_393_DEPLOYED_AND_SNAPSHOT_READY";

export type SyntheticImporterAction = "plan" | "apply" | "cleanup";
export type SyntheticLifecycleStage =
  | "DOCUMENT_PROCESSING"
  | "DOCUMENT_REVIEW"
  | "INTERVIEW_WAITING"
  | "INTERVIEW_IN_PROGRESS"
  | "REPORT_COMPLETED"
  | "FAILED"
  | "CANCELED";
export type SyntheticDataDepth = "LIGHTWEIGHT" | "PROFILE" | "INTERVIEW" | "REPORT";

export type SyntheticImporterOptions = {
  action: SyntheticImporterAction;
  environment: string;
  companyId: bigint;
  postingId: bigint;
  datasetId: string;
  activeCount: number;
  canceledCount: number;
  interactiveCount: number;
  pipelineSelectionCount: number;
  batchSize: number;
};

export type SyntheticApplicationProjection = {
  applicationStatus: "SUBMITTED" | "IN_REVIEW" | "INTERVIEW_WAITING" | "INTERVIEW_DONE" | "COMPLETED" | "CANCELED";
  documentStatus: "NOT_SUBMITTED" | "SUBMITTED" | "EXTRACTING" | "EXTRACTED" | "FAILED";
  interviewStatus: "NOT_READY" | "READY" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  reportStatus: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  screeningDecision: "UNDECIDED" | "PASS" | "HOLD" | "FAIL";
};

export type SyntheticManifestVersion =
  | "SYNTHETIC_APPLICANT_MANIFEST_V1"
  | "SYNTHETIC_APPLICANT_MANIFEST_V2";

export type SyntheticProfileScoreFixture = {
  id: "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING";
  weight: 40 | 30;
  score: number;
};

export type SyntheticReportFixture = {
  totalScore: number;
  profiles: SyntheticProfileScoreFixture[];
};

export type SyntheticApplicantPlanRecord = SyntheticApplicationProjection & {
  ordinal: number;
  email: string;
  name: string;
  phone: string;
  isInteractive: boolean;
  isCanceled: boolean;
  lifecycleStage: SyntheticLifecycleStage;
  dataDepth: SyntheticDataDepth;
  pipelineSelected: boolean;
  reportFixture: SyntheticReportFixture | null;
};

const STAGE_WEIGHTS: Array<[SyntheticLifecycleStage, number]> = [
  ["DOCUMENT_PROCESSING", 350],
  ["DOCUMENT_REVIEW", 250],
  ["INTERVIEW_WAITING", 180],
  ["INTERVIEW_IN_PROGRESS", 100],
  ["REPORT_COMPLETED", 100],
  ["FAILED", 20],
];

const DEPTH_WEIGHTS: Array<[SyntheticDataDepth, number]> = [
  ["LIGHTWEIGHT", 800],
  ["PROFILE", 150],
  ["INTERVIEW", 40],
  ["REPORT", 10],
];

const LEGACY_PROFILES: SyntheticProfileScoreFixture[] = [
  { id: "JOB_TECHNICAL", weight: 40, score: 84 },
  { id: "COLLABORATION_COMMUNICATION", weight: 30, score: 78 },
  { id: "PROBLEM_SOLVING", weight: 30, score: 81 },
];

const INTERACTIVE_STAGE_SHOWCASE: SyntheticLifecycleStage[] = [
  "DOCUMENT_PROCESSING",
  "DOCUMENT_PROCESSING",
  "DOCUMENT_REVIEW",
  "DOCUMENT_REVIEW",
  "INTERVIEW_WAITING",
  "INTERVIEW_WAITING",
  "INTERVIEW_IN_PROGRESS",
  "INTERVIEW_IN_PROGRESS",
  "REPORT_COMPLETED",
  "FAILED",
];

const ARGUMENT_NAMES = new Set([
  "action",
  "environment",
  "company-id",
  "posting-id",
  "dataset-id",
  "active-count",
  "canceled-count",
  "interactive-count",
  "pipeline-count",
  "batch-size",
]);

export function parseSyntheticImporterArgs(argv: string[]): SyntheticImporterOptions {
  const values = parseNamedArguments(argv);
  const action = (values.get("action") ?? "plan") as SyntheticImporterAction;
  if (!(["plan", "apply", "cleanup"] as string[]).includes(action)) {
    throw new Error("--action은 plan, apply, cleanup 중 하나여야 합니다.");
  }

  const environment = required(values, "environment").toLowerCase();
  const datasetId = required(values, "dataset-id").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(datasetId)) {
    throw new Error("--dataset-id는 소문자 영숫자로 시작하는 3~64자의 영숫자, -, _만 허용합니다.");
  }

  const options: SyntheticImporterOptions = {
    action,
    environment,
    companyId: positiveBigInt(required(values, "company-id"), "company-id"),
    postingId: positiveBigInt(required(values, "posting-id"), "posting-id"),
    datasetId,
    activeCount: integer(values.get("active-count") ?? "1000", "active-count"),
    canceledCount: integer(values.get("canceled-count") ?? "50", "canceled-count"),
    interactiveCount: integer(values.get("interactive-count") ?? "10", "interactive-count"),
    pipelineSelectionCount: integer(values.get("pipeline-count") ?? "0", "pipeline-count"),
    batchSize: integer(values.get("batch-size") ?? "100", "batch-size"),
  };
  validateSyntheticImporterOptions(options);
  return options;
}

export function validateSyntheticImporterOptions(options: SyntheticImporterOptions) {
  if (options.activeCount < 100 || options.activeCount > 5_000) {
    throw new Error("--active-count는 100 이상 5,000 이하여야 합니다.");
  }
  if (options.canceledCount < 0 || options.canceledCount > options.activeCount) {
    throw new Error("--canceled-count는 0 이상 active-count 이하여야 합니다.");
  }
  if (options.interactiveCount !== 10) {
    throw new Error("--interactive-count는 시연 계약에 따라 정확히 10이어야 합니다.");
  }
  if (options.pipelineSelectionCount < 0 || options.pipelineSelectionCount > 10) {
    throw new Error("--pipeline-count는 0 이상 10 이하여야 합니다.");
  }
  if (options.pipelineSelectionCount > options.interactiveCount) {
    throw new Error("--pipeline-count는 interactive-count를 초과할 수 없습니다.");
  }
  if (options.batchSize < 10 || options.batchSize > 500) {
    throw new Error("--batch-size는 10 이상 500 이하여야 합니다.");
  }
}

export function validateSyntheticEnvironment(
  options: SyntheticImporterOptions,
  env: NodeJS.ProcessEnv = process.env,
) {
  const allowedEnvironment = env.SYNTHETIC_APPLICANT_ALLOWED_ENV?.trim().toLowerCase();
  if (!allowedEnvironment || allowedEnvironment !== options.environment) {
    throw new Error("실행 environment가 SYNTHETIC_APPLICANT_ALLOWED_ENV와 일치하지 않습니다.");
  }
  if (options.action === "plan") return;
  if (env.SYNTHETIC_APPLICANT_WRITE_ENABLED?.trim().toLowerCase() !== "true") {
    throw new Error("apply/cleanup에는 SYNTHETIC_APPLICANT_WRITE_ENABLED=true가 필요합니다.");
  }
  if (options.environment === "production" && env.SYNTHETIC_APPLICANT_PRODUCTION_ACK !== SYNTHETIC_PRODUCTION_ACK) {
    throw new Error("production write에는 #393 배포와 snapshot 확인 ACK가 필요합니다.");
  }
  if (options.action === "apply") {
    const password = env.SYNTHETIC_APPLICANT_INTERACTIVE_PASSWORD ?? "";
    if (!/^(?=.*[A-Za-z])(?=.*\d)\S{12,}$/.test(password)) {
      throw new Error("interactive 계정 비밀번호는 환경변수에서 읽으며 12자 이상 영문과 숫자를 포함해야 합니다.");
    }
  }
}

export function syntheticOptionsHash(
  options: SyntheticImporterOptions,
  manifestVersion: SyntheticManifestVersion = SYNTHETIC_MANIFEST_V2,
) {
  assertSyntheticManifestVersion(manifestVersion);
  const canonical = JSON.stringify({
    manifestVersion,
    environment: options.environment,
    companyId: options.companyId.toString(),
    postingId: options.postingId.toString(),
    datasetId: options.datasetId,
    activeCount: options.activeCount,
    canceledCount: options.canceledCount,
    interactiveCount: options.interactiveCount,
    pipelineSelectionCount: options.pipelineSelectionCount,
    batchSize: options.batchSize,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildSyntheticApplicantPlan(
  options: SyntheticImporterOptions,
  manifestVersion: SyntheticManifestVersion = SYNTHETIC_MANIFEST_V2,
) {
  if (manifestVersion === SYNTHETIC_MANIFEST_V1) return buildSyntheticApplicantPlanV1(options);
  if (manifestVersion === SYNTHETIC_MANIFEST_V2) return buildSyntheticApplicantPlanV2(options);
  throw new Error(`지원하지 않는 synthetic manifest version입니다: ${String(manifestVersion)}`);
}

export function assertSyntheticManifestVersion(value: string): asserts value is SyntheticManifestVersion {
  if (value !== SYNTHETIC_MANIFEST_V1 && value !== SYNTHETIC_MANIFEST_V2) {
    throw new Error(`지원하지 않는 synthetic manifest version입니다: ${value}`);
  }
}

export function buildSyntheticApplicantPlanV1(options: SyntheticImporterOptions): SyntheticApplicantPlanRecord[] {
  validateSyntheticImporterOptions(options);
  const stageCounts = allocateByWeight(options.activeCount, STAGE_WEIGHTS.map((entry) => entry[1]));
  const stages = STAGE_WEIGHTS.flatMap(([stage], index) => Array(stageCounts[index]).fill(stage)) as SyntheticLifecycleStage[];
  spreadInteractiveStages(stages, options.interactiveCount);

  const depthCounts = allocateByWeight(options.activeCount, DEPTH_WEIGHTS.map((entry) => entry[1]));
  const depths: SyntheticDataDepth[] = Array(options.activeCount).fill("LIGHTWEIGHT");
  assignDepth(depths, stages, "REPORT", depthCounts[3], ["REPORT_COMPLETED"]);
  assignDepth(depths, stages, "INTERVIEW", depthCounts[2], ["INTERVIEW_IN_PROGRESS", "INTERVIEW_WAITING", "REPORT_COMPLETED"]);
  assignDepth(depths, stages, "PROFILE", depthCounts[1], ["DOCUMENT_REVIEW", "DOCUMENT_PROCESSING", "INTERVIEW_WAITING"]);
  ensureInteractiveDepth(depths, stages, options.interactiveCount);

  const records: SyntheticApplicantPlanRecord[] = stages.map((stage, index) => {
    const ordinal = index + 1;
    return {
      ordinal,
      ...syntheticIdentity(options.datasetId, ordinal, ordinal <= options.interactiveCount),
      isInteractive: ordinal <= options.interactiveCount,
      isCanceled: false,
      lifecycleStage: stage,
      dataDepth: depths[index],
      pipelineSelected: ordinal <= options.pipelineSelectionCount,
      reportFixture: legacyReportFixture(stage, depths[index]),
      ...projectionFor(stage, ordinal),
    };
  });

  for (let offset = 0; offset < options.canceledCount; offset += 1) {
    const ordinal = options.activeCount + offset + 1;
    records.push({
      ordinal,
      ...syntheticIdentity(options.datasetId, ordinal, false),
      isInteractive: false,
      isCanceled: true,
      lifecycleStage: "CANCELED",
      dataDepth: "LIGHTWEIGHT",
      pipelineSelected: false,
      reportFixture: null,
      ...projectionFor("CANCELED", ordinal),
    });
  }
  return records;
}

function legacyReportFixture(stage: SyntheticLifecycleStage, depth: SyntheticDataDepth): SyntheticReportFixture | null {
  if (stage !== "REPORT_COMPLETED") return null;
  return {
    totalScore: 81,
    profiles: depth === "REPORT" ? LEGACY_PROFILES.map((profile) => ({ ...profile })) : [],
  };
}

export function summarizeSyntheticPlan(records: SyntheticApplicantPlanRecord[]) {
  return {
    total: records.length,
    active: records.filter((record) => !record.isCanceled).length,
    canceled: records.filter((record) => record.isCanceled).length,
    interactive: records.filter((record) => record.isInteractive).length,
    pipelineSelected: records.filter((record) => record.pipelineSelected).length,
    stages: countBy(records, (record) => record.lifecycleStage),
    depths: countBy(records.filter((record) => !record.isCanceled), (record) => record.dataDepth),
  };
}

export function chunkSyntheticRecords<T>(records: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < records.length; index += size) chunks.push(records.slice(index, index + size));
  return chunks;
}

export function sanitizeSyntheticError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[REDACTED]@")
    .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "[REDACTED_BCRYPT]")
    .replace(/(["']?(?:password|passwordHash)["']?\s*[:=]\s*)[^,}\s]+/gi, "$1[REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 1_000);
}

function parseNamedArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`알 수 없는 인자 형식입니다: ${argument}`);
    const separator = argument.indexOf("=");
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    if (!ARGUMENT_NAMES.has(name)) throw new Error(`알 수 없는 인자입니다: --${name}`);
    const value = separator === -1 ? argv[++index] : argument.slice(separator + 1);
    if (!value || value.startsWith("--")) throw new Error(`--${name} 값이 필요합니다.`);
    if (values.has(name)) throw new Error(`--${name} 인자가 중복되었습니다.`);
    values.set(name, value);
  }
  return values;
}

function required(values: Map<string, string>, name: string) {
  const value = values.get(name)?.trim();
  if (!value) throw new Error(`--${name} 인자가 필요합니다.`);
  return value;
}

function integer(value: string, name: string) {
  if (!/^-?\d+$/.test(value)) throw new Error(`--${name}은 정수여야 합니다.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${name}이 안전한 정수 범위를 벗어났습니다.`);
  return parsed;
}

function positiveBigInt(value: string, name: string) {
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) throw new Error(`--${name}은 1 이상의 정수여야 합니다.`);
  return BigInt(value);
}

function spreadInteractiveStages(stages: SyntheticLifecycleStage[], interactiveCount: number) {
  for (let index = 0; index < interactiveCount; index += 1) {
    const desired = INTERACTIVE_STAGE_SHOWCASE[index];
    if (stages[index] === desired) continue;
    const swapIndex = stages.findIndex((stage, candidateIndex) => candidateIndex >= interactiveCount && stage === desired);
    if (swapIndex === -1) continue;
    [stages[index], stages[swapIndex]] = [stages[swapIndex], stages[index]];
  }
}

function assignDepth(
  depths: SyntheticDataDepth[],
  stages: SyntheticLifecycleStage[],
  depth: SyntheticDataDepth,
  count: number,
  preferredStages: SyntheticLifecycleStage[],
) {
  let remaining = count;
  for (const stage of preferredStages) {
    for (let index = 0; index < stages.length && remaining > 0; index += 1) {
      if (stages[index] !== stage || depths[index] !== "LIGHTWEIGHT") continue;
      depths[index] = depth;
      remaining -= 1;
    }
  }
  for (let index = 0; index < depths.length && remaining > 0; index += 1) {
    if (depths[index] !== "LIGHTWEIGHT") continue;
    depths[index] = depth;
    remaining -= 1;
  }
  if (remaining !== 0) throw new Error(`${depth} 데이터 깊이를 배정하지 못했습니다.`);
}

function ensureInteractiveDepth(depths: SyntheticDataDepth[], stages: SyntheticLifecycleStage[], count: number) {
  for (let index = 0; index < count; index += 1) {
    if (depths[index] !== "LIGHTWEIGHT") continue;
    const replacement = depths.findIndex((depth, candidateIndex) => candidateIndex >= count && depth === "PROFILE" && stages[candidateIndex] !== "REPORT_COMPLETED");
    if (replacement === -1) throw new Error("interactive 계정에 PROFILE 깊이를 배정하지 못했습니다.");
    depths[replacement] = "LIGHTWEIGHT";
    depths[index] = "PROFILE";
  }
}

function syntheticIdentity(datasetId: string, ordinal: number, interactive: boolean) {
  const slug = datasetId.replace(/_/g, "-");
  const padded = String(ordinal).padStart(5, "0");
  return {
    email: interactive ? `demo+${slug}-${padded}@example.com` : `candidate-${slug}-${padded}@demo.invalid`,
    name: `시연 지원자 ${padded}`,
    phone: `010-0000-${String((ordinal % 10_000)).padStart(4, "0")}`,
  };
}

function projectionFor(stage: SyntheticLifecycleStage, ordinal: number): SyntheticApplicationProjection {
  if (stage === "DOCUMENT_PROCESSING") {
    return {
      applicationStatus: "SUBMITTED",
      documentStatus: ordinal % 2 === 0 ? "EXTRACTING" : "SUBMITTED",
      interviewStatus: "NOT_READY",
      reportStatus: "PENDING",
      screeningDecision: "UNDECIDED",
    };
  }
  if (stage === "DOCUMENT_REVIEW") {
    return { applicationStatus: "IN_REVIEW", documentStatus: "EXTRACTED", interviewStatus: "NOT_READY", reportStatus: "PENDING", screeningDecision: "UNDECIDED" };
  }
  if (stage === "INTERVIEW_WAITING") {
    return { applicationStatus: "INTERVIEW_WAITING", documentStatus: "EXTRACTED", interviewStatus: "READY", reportStatus: "PENDING", screeningDecision: "HOLD" };
  }
  if (stage === "INTERVIEW_IN_PROGRESS") {
    return { applicationStatus: "INTERVIEW_WAITING", documentStatus: "EXTRACTED", interviewStatus: "IN_PROGRESS", reportStatus: "GENERATING", screeningDecision: "HOLD" };
  }
  if (stage === "REPORT_COMPLETED") {
    return { applicationStatus: "COMPLETED", documentStatus: "EXTRACTED", interviewStatus: "COMPLETED", reportStatus: "COMPLETED", screeningDecision: "PASS" };
  }
  if (stage === "FAILED") {
    const failureKind = ordinal % 3;
    if (failureKind === 0) return { applicationStatus: "SUBMITTED", documentStatus: "FAILED", interviewStatus: "NOT_READY", reportStatus: "PENDING", screeningDecision: "UNDECIDED" };
    if (failureKind === 1) return { applicationStatus: "INTERVIEW_WAITING", documentStatus: "EXTRACTED", interviewStatus: "FAILED", reportStatus: "PENDING", screeningDecision: "HOLD" };
    return { applicationStatus: "INTERVIEW_DONE", documentStatus: "EXTRACTED", interviewStatus: "COMPLETED", reportStatus: "FAILED", screeningDecision: "HOLD" };
  }
  return { applicationStatus: "CANCELED", documentStatus: "SUBMITTED", interviewStatus: "NOT_READY", reportStatus: "PENDING", screeningDecision: "UNDECIDED" };
}

function countBy<T>(records: T[], selector: (record: T) => string) {
  return records.reduce<Record<string, number>>((counts, record) => {
    const key = selector(record);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
