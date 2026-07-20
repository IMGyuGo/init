import { createHash } from "node:crypto";

import { allocateByWeight } from "./synthetic-applicant-importer.allocation";
import type {
  SyntheticApplicantPlanRecord,
  SyntheticDataDepth,
  SyntheticImporterOptions,
  SyntheticLifecycleStage,
  SyntheticProfileScoreFixture,
} from "./synthetic-applicant-importer.contract";

export const V2_EMAIL_DOMAINS = [
  "bluepost.init-jungle.cloud",
  "mailtree.init-jungle.cloud",
  "inbox24.init-jungle.cloud",
  "cloudletter.init-jungle.cloud",
  "poston.init-jungle.cloud",
  "morningmail.init-jungle.cloud",
  "dailyinbox.init-jungle.cloud",
  "quickpost.init-jungle.cloud",
  "letterbox.init-jungle.cloud",
  "mymail.init-jungle.cloud",
] as const;

const SURNAMES = [
  ["김", "kim"], ["이", "lee"], ["박", "park"], ["최", "choi"], ["정", "jung"],
  ["강", "kang"], ["조", "cho"], ["윤", "yoon"], ["장", "jang"], ["임", "lim"],
  ["한", "han"], ["오", "oh"], ["서", "seo"], ["신", "shin"], ["권", "kwon"],
  ["황", "hwang"], ["안", "ahn"], ["송", "song"], ["류", "ryu"], ["홍", "hong"],
] as const;

const GIVEN_NAMES = [
  ["민준", "minjun"], ["서준", "seojun"], ["도윤", "doyoon"], ["예준", "yejun"],
  ["시우", "siwoo"], ["하준", "hajun"], ["주원", "juwon"], ["지호", "jiho"],
  ["준우", "junwoo"], ["현우", "hyunwoo"], ["서연", "seoyeon"], ["서윤", "seoyoon"],
  ["지우", "jiwoo"], ["하은", "haeun"], ["하윤", "hayoon"], ["민서", "minseo"],
  ["지유", "jiyoo"], ["윤서", "yoonseo"], ["채원", "chaewon"], ["수아", "sua"],
  ["지민", "jimin"], ["유진", "yujin"], ["수빈", "subin"], ["지원", "jiwon"],
  ["은우", "eunwoo"], ["예은", "yeeun"], ["다은", "daeun"], ["가은", "gaeun"],
  ["나연", "nayeon"], ["소윤", "soyoon"], ["태윤", "taeyoon"], ["건우", "gunwoo"],
  ["승현", "seunghyun"], ["정우", "jungwoo"], ["연우", "yeonwoo"], ["유나", "yuna"],
  ["아린", "arin"], ["혜원", "hyewon"], ["예진", "yejin"], ["다현", "dahyun"],
] as const;

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

export function buildSyntheticApplicantPlanV2(options: SyntheticImporterOptions): SyntheticApplicantPlanRecord[] {
  const stages = buildStages(options.activeCount, options.datasetId);
  const depths = buildDepths(stages, options.activeCount);
  ensureInteractiveDepth(depths, options.interactiveCount);
  let completedCount = 0;

  const records = stages.map((stage, index) => {
    const ordinal = index + 1;
    const reportRank = stage === "REPORT_COMPLETED" ? completedCount++ : null;
    return {
      ordinal,
      ...identity(options.datasetId, ordinal),
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
      ...identity(options.datasetId, ordinal),
      isInteractive: false,
      isCanceled: true,
      lifecycleStage: "CANCELED",
      dataDepth: "LIGHTWEIGHT",
      pipelineSelected: false,
      ...projection("CANCELED", null),
    });
  }

  if (new Set(records.map((record) => record.email)).size !== records.length) {
    throw new Error("V2 합성 지원자 이메일이 중복되었습니다.");
  }
  return records;
}

function buildStages(activeCount: number, datasetId: string): SyntheticLifecycleStage[] {
  const counts = allocateByWeight(activeCount, STAGE_WEIGHTS.map(([, weight]) => weight));
  const stages = STAGE_WEIGHTS
    .flatMap(([stage], stageIndex) => Array.from({ length: counts[stageIndex] }, (_, index) => ({ stage, index })))
    .sort((left, right) => deterministicOrder(datasetId, left.index, left.stage).localeCompare(deterministicOrder(datasetId, right.index, right.stage)))
    .map(({ stage }) => stage);

  swapInReport(stages, 8);
  swapInReport(stages, 10);
  return stages;
}

function buildDepths(stages: SyntheticLifecycleStage[], activeCount: number): SyntheticDataDepth[] {
  const counts = allocateByWeight(activeCount, DEPTH_WEIGHTS.map(([, weight]) => weight));
  const depths: SyntheticDataDepth[] = Array(activeCount).fill("LIGHTWEIGHT");
  const reportIndexes = stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage }) => stage === "REPORT_COMPLETED")
    .sort((left, right) => deterministicOrder("v2-depth", left.index, "report").localeCompare(deterministicOrder("v2-depth", right.index, "report")))
    .slice(0, counts[3])
    .map(({ index }) => index);
  for (const index of reportIndexes) depths[index] = "REPORT";

  const remainingIndexes = stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ index }) => depths[index] === "LIGHTWEIGHT")
    .sort((left, right) => deterministicOrder("v2-depth", left.index, left.stage).localeCompare(deterministicOrder("v2-depth", right.index, right.stage)));
  for (const { index } of remainingIndexes.slice(0, counts[2])) depths[index] = "INTERVIEW";
  for (const { index } of remainingIndexes.slice(counts[2], counts[2] + counts[1])) depths[index] = "PROFILE";
  return depths;
}

function identity(datasetId: string, ordinal: number): Pick<SyntheticApplicantPlanRecord, "email" | "name" | "phone"> {
  const surname = SURNAMES[(ordinal - 1) % SURNAMES.length];
  const given = GIVEN_NAMES[Math.floor((ordinal - 1) / SURNAMES.length) % GIVEN_NAMES.length];
  const digest = createHash("sha256").update(`${datasetId}:${ordinal}:identity`).digest("hex");
  const code = String(Number.parseInt(digest.slice(0, 8), 16) % 10_000).padStart(4, "0");
  const domain = V2_EMAIL_DOMAINS[Number.parseInt(digest.slice(8, 10), 16) % V2_EMAIL_DOMAINS.length];
  const localParts = [
    `${given[1]}${code.slice(2)}`,
    `${given[1]}.${surname[1]}${code.slice(2)}`,
    `${surname[1]}.${given[1]}${code.slice(0, 2)}`,
    `${given[1][0]}${surname[1]}${code}`,
    `${given[1]}_dev${code.slice(2)}`,
  ];

  return {
    email: `${localParts[ordinal % localParts.length]}.${ordinal.toString(36)}@${domain}`,
    name: `${surname[0]}${given[0]}`,
    phone: `010-****-${code}`,
  };
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

function reportFixture(reportRank: number): { decision: "PASS" | "FAIL"; totalScore: number; profiles: SyntheticProfileScoreFixture[] } {
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
  const clampedScores = scores.map((score) => Math.max(0, Math.min(100, score)));
  return {
    decision: pass ? "PASS" : "FAIL",
    totalScore,
    profiles: [
      { id: "JOB_TECHNICAL", weight: 40, score: clampedScores[0] },
      { id: "COLLABORATION_COMMUNICATION", weight: 30, score: clampedScores[1] },
      { id: "PROBLEM_SOLVING", weight: 30, score: clampedScores[2] },
    ],
  };
}

function deterministicOrder(datasetId: string, index: number, namespace: string): string {
  return createHash("sha256").update(`${datasetId}:${namespace}:${index}`).digest("hex");
}

function swapInReport(stages: SyntheticLifecycleStage[], targetIndex: number) {
  if (stages[targetIndex] === "REPORT_COMPLETED") return;
  const reportIndex = stages.findIndex((stage, index) => index > targetIndex && stage === "REPORT_COMPLETED");
  if (reportIndex === -1) throw new Error("첫 페이지에 완료 리포트를 배치하지 못했습니다.");
  [stages[targetIndex], stages[reportIndex]] = [stages[reportIndex], stages[targetIndex]];
}

function ensureInteractiveDepth(depths: SyntheticDataDepth[], interactiveCount: number) {
  for (let index = 0; index < interactiveCount; index += 1) {
    if (depths[index] !== "LIGHTWEIGHT") continue;
    const profileIndex = depths.findIndex((depth, candidateIndex) => candidateIndex >= interactiveCount && depth === "PROFILE");
    if (profileIndex === -1) throw new Error("interactive 계정에 PROFILE 깊이를 배정하지 못했습니다.");
    [depths[index], depths[profileIndex]] = [depths[profileIndex], depths[index]];
  }
}
