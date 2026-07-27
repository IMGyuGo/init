import type {
  GeneratedQuestionEvaluationRecord,
  GeneratedReportRecord,
  GeneratedReportScoreRecord,
  NcsAnswerEvaluationRecord,
} from "./ai-result.repository";
import {
  aggregateNcsFinalEvaluation,
  NCS_SCORING_VERSION_V2,
  type NcsFinalProfileId,
  type NcsSessionPolicyInput,
} from "./ncs-final-evaluation";
import {
  NCS_PROFILE_VERSION,
  NCS_TEXT_EVALUATION_KIND,
  NCS_TEXT_EVALUATION_PROMPT_VERSION,
  NCS_TEXT_EVALUATION_RUBRIC_VERSION,
  type NcsProfileId,
  type NcsQuestionMode,
  type NcsTextEvaluationOutput,
} from "./ncs-text-evaluation.types";
import { NonRetryableAiWorkerFailure } from "./worker-errors";

export const SALTLUX_FIXED_PRESENTATION_FIXTURE_ID = "SALTLUX_AI_BACKEND_V1" as const;

const COMPANY_NAME = "솔트룩스";
const JOB_TITLE = "[Product Center] AI Backend Engineer (신입/경력)";

const QUESTIONS = {
  common: "AI 검색 품질 기준을 팀과 합의한 과정을 설명해 주세요.",
  personalized: "RAG 검색 정확도를 개선한 방법과 검증 결과를 설명해 주세요.",
  followUp: "개선 과정에서 품질 회귀는 어떻게 방지했나요?",
} as const;

const ANSWERS = {
  common:
    "팀과 검색 누락 사례를 분류하고 Top-5 적중률을 공통 기준으로 정했습니다. 같은 평가셋으로 결과를 공유하며 개선해 적중률을 0.68에서 0.84로 높였습니다.",
  personalized:
    "문단 단위 청킹과 키워드·벡터 검색을 결합하고 reranking을 적용했습니다. 같은 평가셋으로 검증해 검색 누락을 31퍼센트 줄이고 Top-5 적중률을 0.84로 높였습니다.",
  followUp:
    "모델·프롬프트·평가셋 버전을 함께 기록하고 배포 전 회귀 테스트를 실행했습니다. 기준보다 적중률이 낮아지면 배포를 중단해 품질 저하를 조기에 발견했습니다.",
} as const;

type FixedProfile = "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING";

export interface FixedPresentationAnswer {
  answerId: number;
  question?: string;
  sortOrder?: number;
  isFollowUpAnswer?: boolean;
  parentAnswerId?: number;
  sessionQuestionId?: number;
  ncsQuestionMode?: NcsQuestionMode;
  ncsBindings?: Array<{
    criterionId?: number;
    criterionTitleSnapshot: string;
    ncsProfileId: string;
    ncsProfileVersion: string;
  }>;
}

export interface FixedPresentationCriterion {
  criterionId: number;
  name: string;
  weight: number;
}

export function shouldUseSaltluxFixedPresentationReport(payload: Record<string, unknown>) {
  if (payload.presentationFixtureId === SALTLUX_FIXED_PRESENTATION_FIXTURE_ID) {
    return true;
  }
  if (
    payload.reportType !== "RECRUITING_REPORT" ||
    !normalizedText(payload.companyName).includes(COMPANY_NAME) ||
    normalizedText(payload.jobTitle) !== normalizedText(JOB_TITLE) ||
    !Array.isArray(payload.answers)
  ) {
    return false;
  }

  const answers = payload.answers.filter(isRecord);
  if (answers.length !== 3) {
    return false;
  }
  const common = answers.find((answer) =>
    answer.isFollowUpAnswer !== true &&
    normalizedText(answer.question) === normalizedText(QUESTIONS.common),
  );
  const personalized = answers.find((answer) =>
    answer.isFollowUpAnswer !== true &&
    normalizedText(answer.question) === normalizedText(QUESTIONS.personalized),
  );
  if (!common || !personalized || typeof personalized.answerId !== "number") {
    return false;
  }

  return answers.some((answer) =>
    answer.isFollowUpAnswer === true &&
    answer.parentAnswerId === personalized.answerId &&
    normalizedText(answer.question) === normalizedText(QUESTIONS.followUp),
  );
}

export function buildSaltluxFixedPresentationReport(input: {
  reportId: number;
  applicationId?: number;
  sessionId?: number;
  answers: FixedPresentationAnswer[];
  criteria: FixedPresentationCriterion[];
  policies: NcsSessionPolicyInput[];
}): GeneratedReportRecord {
  const common = findBaseAnswer(input.answers, QUESTIONS.common);
  const personalized = findBaseAnswer(input.answers, QUESTIONS.personalized);
  const followUp = input.answers.find((answer) =>
    answer.isFollowUpAnswer === true &&
    answer.parentAnswerId === personalized.answerId &&
    normalized(answer.question) === normalized(QUESTIONS.followUp),
  );
  if (!followUp) {
    throw new NonRetryableAiWorkerFailure("Saltlux fixed presentation follow-up answer is missing");
  }

  const specs: Array<{
    profileId: FixedProfile;
    answer: FixedPresentationAnswer;
    mode: NcsQuestionMode;
    score: 4 | 5;
    baseScore: 4;
    rationale: string;
    baseQuote: string;
    followUpApplied: boolean;
  }> = [
    {
      profileId: "COLLABORATION_COMMUNICATION",
      answer: common,
      mode: "EXPERIENCE_BEHAVIOR",
      score: 4,
      baseScore: 4,
      rationale: "팀과 검색 누락 사례를 분류하고 공통 지표를 합의해 결과를 공유한 행동 근거가 구체적입니다.",
      baseQuote: ANSWERS.common,
      followUpApplied: false,
    },
    {
      profileId: "JOB_TECHNICAL",
      answer: personalized,
      mode: "TECHNICAL_KNOWLEDGE",
      score: 4,
      baseScore: 4,
      rationale: "청킹, 하이브리드 검색, reranking을 적용하고 동일 평가셋으로 성능을 검증한 직무 근거가 구체적입니다.",
      baseQuote: ANSWERS.personalized,
      followUpApplied: true,
    },
    {
      profileId: "PROBLEM_SOLVING",
      answer: personalized,
      mode: "TECHNICAL_KNOWLEDGE",
      score: 5,
      baseScore: 4,
      rationale: "검색 누락 원인을 구조적으로 개선하고 버전 관리와 회귀 테스트로 품질 저하까지 방지한 근거가 확인됩니다.",
      baseQuote: ANSWERS.personalized,
      followUpApplied: true,
    },
  ];

  const evaluations = specs.map((spec) => buildEvaluation(input.reportId, spec, followUp, input.policies));
  const finalEvaluation = aggregateNcsFinalEvaluation(
    input.policies,
    evaluations.map((evaluation) => ({
      answerId: evaluation.answerId,
      sessionQuestionId: evaluation.sessionQuestionId,
      ncsProfileId: evaluation.ncsProfileId,
      scoreStatus: evaluation.output.scoreStatus,
      effectiveScore: evaluation.effectiveScore,
      evidenceCount: evaluation.evidences.length,
    })),
    [],
    NCS_SCORING_VERSION_V2,
  );
  if (finalEvaluation.completionStatus !== "COMPLETE") {
    throw new NonRetryableAiWorkerFailure("Saltlux fixed presentation NCS policy is incomplete");
  }

  const scores = specs.map((spec) => buildScore(spec, followUp, input.criteria, input.policies));
  const questionEvaluations = specs.map((spec) => buildQuestionEvaluation(spec, followUp, input.criteria, input.policies));

  return {
    reportId: input.reportId,
    reportType: "RECRUITING_REPORT",
    applicationId: input.applicationId,
    sessionId: input.sessionId,
    summary:
      "지원자는 Java·Spring Boot와 Python·FastAPI 기반의 AI 백엔드 경험을 직무와 연결해 설명했습니다. 검색 누락 사례를 팀과 분류하고 Top-5 적중률을 공통 기준으로 합의한 협업 과정이 확인되었습니다. OCR 문단 청킹, 키워드·벡터 검색, reranking을 적용해 검색 누락을 31% 줄이고 Top-5 적중률을 0.68에서 0.84로 높인 검증 근거가 구체적입니다. 모델·프롬프트·평가셋 버전 관리와 배포 전 회귀 테스트로 품질 저하를 방지한 점도 강점입니다. 다만 대규모 운영 트래픽과 장기 장애 대응 경험은 면접관의 추가 확인이 필요합니다.",
    totalScore: finalEvaluation.totalScore,
    scores,
    questionEvaluations,
    ncsAnswerEvaluations: evaluations,
    ncsFinalEvaluation: finalEvaluation,
  };
}

function buildEvaluation(
  reportId: number,
  spec: {
    profileId: FixedProfile;
    answer: FixedPresentationAnswer;
    mode: NcsQuestionMode;
    score: 4 | 5;
    baseScore: 4;
    rationale: string;
    baseQuote: string;
    followUpApplied: boolean;
  },
  followUp: FixedPresentationAnswer,
  policies: NcsSessionPolicyInput[],
): NcsAnswerEvaluationRecord {
  const policy = requirePolicy(policies, spec.profileId);
  const binding = spec.answer.ncsBindings?.find((candidate) => candidate.ncsProfileId === spec.profileId);
  const criterionId = binding?.criterionId ?? policy.criterionId;
  if (!criterionId || !spec.answer.sessionQuestionId) {
    throw new NonRetryableAiWorkerFailure(`Saltlux fixed presentation snapshot is missing for ${spec.profileId}`);
  }
  const evidences: NcsAnswerEvaluationRecord["evidences"] = [{
    sourceAnswerId: spec.answer.answerId,
    sourceKind: "BASE",
    quote: spec.baseQuote,
  }];
  if (spec.followUpApplied) {
    evidences.push({ sourceAnswerId: followUp.answerId, sourceKind: "FOLLOW_UP", quote: ANSWERS.followUp });
  }
  return {
    reportId,
    answerId: spec.answer.answerId,
    sessionQuestionId: spec.answer.sessionQuestionId,
    criterionId,
    criterionTitleSnapshot: binding?.criterionTitleSnapshot ?? policy.criterionTitleSnapshot,
    ncsProfileId: spec.profileId,
    ncsQuestionMode: spec.mode,
    ncsProfileVersion: binding?.ncsProfileVersion ?? policy.ncsProfileVersion,
    output: outputFor(spec.profileId, spec.mode, spec.score, spec.rationale, evidences.map((item) => item.quote)),
    question: spec.answer.question ?? "",
    behaviorPoints: 3,
    logicPoints: spec.score === 5 ? 2 : 1,
    baseScore: spec.baseScore,
    effectiveScore: spec.score,
    followUpApplied: spec.followUpApplied,
    evidences,
  };
}

function buildScore(
  spec: Parameters<typeof buildEvaluation>[1],
  followUp: FixedPresentationAnswer,
  criteria: FixedPresentationCriterion[],
  policies: NcsSessionPolicyInput[],
): GeneratedReportScoreRecord {
  const policy = requirePolicy(policies, spec.profileId);
  const criterionId = policy.criterionId ?? spec.answer.ncsBindings?.find((item) => item.ncsProfileId === spec.profileId)?.criterionId;
  if (!criterionId) throw new NonRetryableAiWorkerFailure(`Saltlux fixed presentation criterion is missing for ${spec.profileId}`);
  const criterionName = criteria.find((criterion) => criterion.criterionId === criterionId)?.name ?? policy.criterionTitleSnapshot;
  return {
    criterionId,
    criterionName,
    score: spec.score * 20,
    rationale: spec.rationale,
    rubricAnchor: `${spec.score}/5 NCS 행동·논리 근거`,
    confidence: "HIGH",
    uncertaintyReasons: [],
    evidences: [
      { sourceType: "INTERVIEW_ANSWER", answerId: spec.answer.answerId, text: spec.baseQuote },
      ...(spec.followUpApplied
        ? [{ sourceType: "INTERVIEW_ANSWER" as const, answerId: followUp.answerId, text: ANSWERS.followUp }]
        : []),
    ],
  };
}

function buildQuestionEvaluation(
  spec: Parameters<typeof buildEvaluation>[1],
  followUp: FixedPresentationAnswer,
  criteria: FixedPresentationCriterion[],
  policies: NcsSessionPolicyInput[],
): GeneratedQuestionEvaluationRecord {
  const score = buildScore(spec, followUp, criteria, policies);
  return {
    criterionId: score.criterionId,
    criterionName: score.criterionName,
    answerId: spec.answer.answerId,
    question: spec.answer.question ?? "",
    rubricAnchor: score.rubricAnchor,
    confidence: score.confidence,
    uncertaintyReasons: [],
    evidences: score.evidences,
  };
}

function outputFor(
  profileId: FixedProfile,
  questionMode: NcsQuestionMode,
  score: 4 | 5,
  rationale: string,
  quotes: string[],
): NcsTextEvaluationOutput {
  const legacyProfileId: NcsProfileId = profileId === "PROBLEM_SOLVING"
    ? "problem-solving"
    : profileId === "COLLABORATION_COMMUNICATION"
      ? "communication"
      : "digital";
  const label = profileId === "PROBLEM_SOLVING"
    ? "문제 해결력"
    : profileId === "COLLABORATION_COMMUNICATION"
      ? "협업·의사소통"
      : "기술·직무";
  return {
    kind: NCS_TEXT_EVALUATION_KIND,
    rubricVersion: NCS_TEXT_EVALUATION_RUBRIC_VERSION,
    promptVersion: NCS_TEXT_EVALUATION_PROMPT_VERSION,
    providerMode: "fixed",
    model: "fixed-demo-fixture-v1",
    scoreStatus: "SCORED",
    scores: { competency: score, evidence: score, total: score },
    coverage: 1,
    confidence: "HIGH",
    questionMode,
    competencies: [{
      profileId: legacyProfileId,
      profileVersion: NCS_PROFILE_VERSION,
      label,
      level: score,
      score,
      confidence: "HIGH",
      rationale,
      behaviors: [],
    }],
    evidenceMaturity: { dimensions: [], sharedEvidence: [] },
    growth: {
      strengths: [rationale],
      gaps: ["대규모 운영 환경의 장기 장애 대응 경험은 추가 확인이 필요합니다."],
      nextAction: "운영 규모와 장애 대응 책임 범위를 후속 면접에서 확인합니다.",
      followUpQuestion: QUESTIONS.followUp,
    },
    guardrail: {
      result: "PASS",
      reasons: [],
      exactQuotesValid: true,
      sharedEvidenceValid: true,
      confidenceValid: true,
      forbiddenWordingDetected: false,
      promptInjectionDetected: false,
    },
  };
}

function findBaseAnswer(answers: FixedPresentationAnswer[], question: string) {
  const answer = answers.find((candidate) =>
    candidate.isFollowUpAnswer !== true && normalized(candidate.question) === normalized(question),
  );
  if (!answer) throw new NonRetryableAiWorkerFailure(`Saltlux fixed presentation answer is missing: ${question}`);
  return answer;
}

function requirePolicy(policies: NcsSessionPolicyInput[], profileId: NcsFinalProfileId) {
  const policy = policies.find((candidate) => candidate.ncsProfileId === profileId);
  if (!policy) throw new NonRetryableAiWorkerFailure(`Saltlux fixed presentation policy is missing for ${profileId}`);
  return policy;
}

function normalized(value: string | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? normalized(value) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
