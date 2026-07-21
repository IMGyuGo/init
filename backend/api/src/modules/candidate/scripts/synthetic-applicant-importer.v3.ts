import { createHash } from "node:crypto";

import { V3_GIVEN_NAMES } from "./synthetic-applicant-given-names.v3";
import { V2_EMAIL_DOMAINS, V2_SURNAMES } from "./synthetic-applicant-importer.v2";
import { assertV3SyntheticOperationalContract } from "./synthetic-applicant-importer.v3-shape";
import type {
  SyntheticApplicantPlanRecord,
  SyntheticDataDepth,
  SyntheticImporterOptions,
  SyntheticLifecycleStage,
  SyntheticProfileScoreFixture,
} from "./synthetic-applicant-importer.contract";

const V3_STAGE_COUNTS: ReadonlyArray<readonly [SyntheticLifecycleStage, number]> = [
  ["DOCUMENT_PROCESSING", 10],
  ["DOCUMENT_REVIEW", 10],
  ["INTERVIEW_WAITING", 30],
  ["INTERVIEW_IN_PROGRESS", 28],
  ["REPORT_COMPLETED", 920],
  ["FAILED", 2],
];

const V3_DEPTH_COUNTS: ReadonlyArray<readonly [SyntheticDataDepth, number]> = [
  ["LIGHTWEIGHT", 800],
  ["PROFILE", 150],
  ["INTERVIEW", 40],
  ["REPORT", 10],
];

export function buildSyntheticApplicantPlanV3(options: SyntheticImporterOptions): SyntheticApplicantPlanRecord[] {
  assertV3SyntheticOperationalContract(options);
  const stages = buildStages(options.datasetId);
  const depths = buildDepths(stages, options.datasetId);
  ensureInteractiveDepth(depths, options.interactiveCount);
  const identities = buildIdentities(options.datasetId);
  let completedCount = 0;

  const records: SyntheticApplicantPlanRecord[] = stages.map((stage, index) => {
    const ordinal = index + 1;
    const reportRank = stage === "REPORT_COMPLETED" ? completedCount++ : null;
    return {
      ordinal,
      ...identities[index],
      isInteractive: ordinal <= options.interactiveCount,
      isCanceled: false,
      lifecycleStage: stage,
      dataDepth: depths[index],
      pipelineSelected: ordinal <= options.pipelineSelectionCount,
      ...projection(stage, reportRank),
    };
  });

  for (let offset = 0; offset < options.canceledCount; offset += 1) {
    const ordinal = options.activeCount + offset + 1;
    records.push({
      ordinal,
      ...identities[ordinal - 1],
      isInteractive: false,
      isCanceled: true,
      lifecycleStage: "CANCELED",
      dataDepth: "LIGHTWEIGHT",
      pipelineSelected: false,
      ...projection("CANCELED", null),
    });
  }

  if (records.length !== identities.length) {
    throw new Error("V3 manifest는 고정된 1,050명 identity 계약만 지원합니다.");
  }
  assertUnique(records, "name", "이름");
  assertUnique(records, "email", "이메일");
  assertUnique(records, "phone", "전화번호");
  return records;
}

function buildStages(datasetId: string): SyntheticLifecycleStage[] {
  const stages = V3_STAGE_COUNTS
    .flatMap(([stage, count]) => Array.from({ length: count }, (_, index) => ({ stage, index })))
    .sort((left, right) => deterministicOrder(datasetId, left.index, `v3-stage:${left.stage}`)
      .localeCompare(deterministicOrder(datasetId, right.index, `v3-stage:${right.stage}`)))
    .map(({ stage }) => stage);
  reserveReportShowcase(stages);
  return stages;
}

function buildDepths(stages: SyntheticLifecycleStage[], datasetId: string): SyntheticDataDepth[] {
  const depths: SyntheticDataDepth[] = Array(stages.length).fill("LIGHTWEIGHT");
  const reportCount = countForDepth("REPORT");
  const reportIndexes = stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage }) => stage === "REPORT_COMPLETED")
    .sort((left, right) => deterministicOrder(datasetId, left.index, "v3-depth:report")
      .localeCompare(deterministicOrder(datasetId, right.index, "v3-depth:report")))
    .slice(0, reportCount)
    .map(({ index }) => index);
  for (const index of reportIndexes) depths[index] = "REPORT";

  const remaining = stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ index }) => depths[index] === "LIGHTWEIGHT")
    .sort((left, right) => deterministicOrder(datasetId, left.index, `v3-depth:${left.stage}`)
      .localeCompare(deterministicOrder(datasetId, right.index, `v3-depth:${right.stage}`)));
  const interviewCount = countForDepth("INTERVIEW");
  const profileCount = countForDepth("PROFILE");
  for (const { index } of remaining.slice(0, interviewCount)) depths[index] = "INTERVIEW";
  for (const { index } of remaining.slice(interviewCount, interviewCount + profileCount)) depths[index] = "PROFILE";
  return depths;
}

function buildIdentities(datasetId: string): Array<Pick<SyntheticApplicantPlanRecord, "email" | "name" | "phone">> {
  const orderedGivenNames = [...V3_GIVEN_NAMES].sort((left, right) => (
    deterministicOrder(datasetId, 0, `v3-name:${left[0]}`)
      .localeCompare(deterministicOrder(datasetId, 0, `v3-name:${right[0]}`))
  ));
  const surnameOffset = digestNumber(datasetId, "v3-surname-offset", 2) % V2_SURNAMES.length;
  const phoneOffset = digestNumber(datasetId, "v3-phone-offset", 8) % 10_000;

  return Array.from({ length: 1_050 }, (_, index) => {
    const ordinal = index + 1;
    const [givenName, givenTransliteration] = orderedGivenNames[index % orderedGivenNames.length];
    const surname = V2_SURNAMES[(index + surnameOffset) % V2_SURNAMES.length];
    const phoneCode = String((phoneOffset + index * 7_919) % 10_000).padStart(4, "0");
    const digest = createHash("sha256").update(`${datasetId}:${ordinal}:v3-identity`).digest("hex");
    const domain = V2_EMAIL_DOMAINS[Number.parseInt(digest.slice(0, 2), 16) % V2_EMAIL_DOMAINS.length];
    const localParts = [
      `${givenTransliteration}${phoneCode.slice(2)}`,
      `${givenTransliteration}.${surname[1]}${phoneCode.slice(2)}`,
      `${surname[1]}.${givenTransliteration}${phoneCode.slice(0, 2)}`,
      `${givenTransliteration[0]}${surname[1]}${phoneCode}`,
      `${givenTransliteration}_dev${phoneCode.slice(2)}`,
    ];
    return {
      name: `${surname[0]}${givenName}`,
      email: `${localParts[ordinal % localParts.length]}@${domain}`,
      phone: `010-****-${phoneCode}`,
    };
  });
}

function projection(stage: SyntheticLifecycleStage, reportRank: number | null): Pick<
  SyntheticApplicantPlanRecord,
  "applicationStatus" | "documentStatus" | "interviewStatus" | "reportStatus" | "screeningDecision" | "reportFixture"
> {
  if (stage === "DOCUMENT_PROCESSING") {
    return { applicationStatus: "SUBMITTED", documentStatus: "EXTRACTING", interviewStatus: "NOT_READY", reportStatus: "PENDING", screeningDecision: "UNDECIDED", reportFixture: null };
  }
  if (stage === "DOCUMENT_REVIEW") {
    return { applicationStatus: "IN_REVIEW", documentStatus: "EXTRACTED", interviewStatus: "NOT_READY", reportStatus: "PENDING", screeningDecision: "UNDECIDED", reportFixture: null };
  }
  if (stage === "INTERVIEW_WAITING") {
    return { applicationStatus: "INTERVIEW_WAITING", documentStatus: "EXTRACTED", interviewStatus: "READY", reportStatus: "PENDING", screeningDecision: "HOLD", reportFixture: null };
  }
  if (stage === "INTERVIEW_IN_PROGRESS") {
    return { applicationStatus: "INTERVIEW_WAITING", documentStatus: "EXTRACTED", interviewStatus: "IN_PROGRESS", reportStatus: "GENERATING", screeningDecision: "HOLD", reportFixture: null };
  }
  if (stage === "REPORT_COMPLETED") {
    if (reportRank === null) throw new Error("완료 리포트 순위가 필요합니다.");
    const fixture = reportFixture(reportRank);
    return {
      applicationStatus: "COMPLETED",
      documentStatus: "EXTRACTED",
      interviewStatus: "COMPLETED",
      reportStatus: "COMPLETED",
      screeningDecision: fixture.decision,
      reportFixture: { totalScore: fixture.totalScore, profiles: fixture.profiles },
    };
  }
  if (stage === "FAILED") {
    return { applicationStatus: "SUBMITTED", documentStatus: "FAILED", interviewStatus: "NOT_READY", reportStatus: "PENDING", screeningDecision: "UNDECIDED", reportFixture: null };
  }
  return { applicationStatus: "CANCELED", documentStatus: "SUBMITTED", interviewStatus: "NOT_READY", reportStatus: "PENDING", screeningDecision: "UNDECIDED", reportFixture: null };
}

function reportFixture(reportRank: number): {
  decision: "PASS" | "FAIL";
  totalScore: number;
  profiles: SyntheticProfileScoreFixture[];
} {
  const pass = reportRank % 5 === 0;
  const passIndex = Math.floor(reportRank / 5);
  const failIndex = reportRank - passIndex - 1;
  const totalScore = pass
    ? 80 + ((passIndex * 7) % 17)
    : 45 + ((failIndex * 11) % 35);
  const deltas = [
    [3, -2, -2],
    [-3, 2, 2],
    [0, 1, -1],
  ] as const;
  const scores = [40, 30, 30].map((weight, index) => totalScore + deltas[reportRank % deltas.length][index]);
  if (!(totalScore >= (pass ? 80 : 45) && totalScore <= (pass ? 96 : 79)) || scores.some((score) => score < 0 || score > 100)) {
    throw new Error("리포트 fixture 점수가 승인 범위를 벗어났습니다.");
  }
  return {
    decision: pass ? "PASS" : "FAIL",
    totalScore,
    profiles: [
      { id: "JOB_TECHNICAL", weight: 40, score: scores[0] },
      { id: "COLLABORATION_COMMUNICATION", weight: 30, score: scores[1] },
      { id: "PROBLEM_SOLVING", weight: 30, score: scores[2] },
    ],
  };
}

function reserveReportShowcase(stages: SyntheticLifecycleStage[]) {
  const targets = [8, 10];
  const forbidden = [...Array.from({ length: 8 }, (_, index) => index), 9];
  const targetIndexes = new Set(targets);
  for (const targetIndex of targets) {
    if (stages[targetIndex] === "REPORT_COMPLETED") continue;
    const reportIndex = stages.findIndex((stage, index) => !targetIndexes.has(index) && stage === "REPORT_COMPLETED");
    if (reportIndex === -1) throw new Error("첫 페이지에 완료 리포트를 배치하지 못했습니다.");
    [stages[targetIndex], stages[reportIndex]] = [stages[reportIndex], stages[targetIndex]];
  }
  for (const forbiddenIndex of forbidden) {
    if (stages[forbiddenIndex] !== "REPORT_COMPLETED") continue;
    const replacementIndex = stages.findIndex((stage, index) => index > 10 && !targetIndexes.has(index) && stage !== "REPORT_COMPLETED");
    if (replacementIndex === -1) throw new Error("첫 페이지 리포트 showcase 순서를 보장할 수 없습니다.");
    [stages[forbiddenIndex], stages[replacementIndex]] = [stages[replacementIndex], stages[forbiddenIndex]];
  }
}

function ensureInteractiveDepth(depths: SyntheticDataDepth[], interactiveCount: number) {
  for (let index = 0; index < interactiveCount; index += 1) {
    if (depths[index] !== "LIGHTWEIGHT") continue;
    const profileIndex = depths.findIndex((depth, candidateIndex) => candidateIndex >= interactiveCount && depth === "PROFILE");
    if (profileIndex === -1) throw new Error("interactive 계정에 PROFILE 깊이를 배정하지 못했습니다.");
    [depths[index], depths[profileIndex]] = [depths[profileIndex], depths[index]];
  }
}

function countForDepth(depth: SyntheticDataDepth) {
  const entry = V3_DEPTH_COUNTS.find(([candidate]) => candidate === depth);
  if (!entry) throw new Error(`V3 ${depth} 깊이 계약이 없습니다.`);
  return entry[1];
}

function deterministicOrder(datasetId: string, index: number, namespace: string) {
  return createHash("sha256").update(`${datasetId}:${namespace}:${index}`).digest("hex");
}

function digestNumber(datasetId: string, namespace: string, hexLength: number) {
  const digest = createHash("sha256").update(`${datasetId}:${namespace}`).digest("hex");
  return Number.parseInt(digest.slice(0, hexLength), 16);
}

function assertUnique(
  records: SyntheticApplicantPlanRecord[],
  field: "name" | "email" | "phone",
  label: string,
) {
  if (new Set(records.map((record) => record[field])).size !== records.length) {
    throw new Error(`V3 합성 지원자 ${label}가 중복되었습니다.`);
  }
}
