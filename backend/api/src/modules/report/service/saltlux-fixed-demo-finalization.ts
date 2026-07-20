import { CandidateDomainError } from "../../candidate";
import type { EvaluationCriterionInput, InterviewAnswerInput } from "../report.types";
import { SALTLUX_FIXED_DEMO } from "../../../shared/saltlux-fixed-demo";

export const SALTLUX_FIXED_DEMO_REPORT_SUMMARY =
  "지원자는 Java·Spring Boot와 Python·FastAPI 기반의 AI 백엔드 경험을 직무와 연결해 설명했습니다. " +
  "검색 누락 사례를 팀과 분류하고 Top-5 적중률을 공통 기준으로 합의한 협업 과정이 확인되었습니다. " +
  "OCR 문단 청킹, 키워드·벡터 검색, reranking을 적용해 검색 누락을 31% 줄이고 Top-5 적중률을 0.68에서 0.84로 높인 검증 근거가 구체적입니다. " +
  "모델·프롬프트·평가셋 버전 관리와 배포 전 회귀 테스트로 품질 저하를 방지한 점도 강점입니다. " +
  "다만 대규모 운영 트래픽과 장기 장애 대응 경험은 면접관의 추가 확인이 필요합니다.";

export type SaltluxFixedDemoProfileId =
  | "JOB_TECHNICAL"
  | "COLLABORATION_COMMUNICATION"
  | "PROBLEM_SOLVING";

export interface SaltluxFixedDemoFinalizationInput {
  reportId: number;
  applicationId: number;
  sessionId: number;
  criteria: EvaluationCriterionInput[];
  answers: InterviewAnswerInput[];
}

export interface SaltluxFixedDemoProfileResult {
  ncsProfileId: SaltluxFixedDemoProfileId;
  profileOrder: 1 | 2 | 3;
  displayName: string;
  criterionId: number;
  criterionName: string;
  answerId: number;
  sessionQuestionId: number;
  question: string;
  questionMode: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE";
  ncsProfileVersion: string;
  score: 4 | 5;
  baseScore: 4 | 5;
  behaviorPoints: 3;
  logicPoints: 1 | 2;
  followUpApplied: boolean;
  weight: 30 | 40;
  weightedScore: 24 | 40;
  rationale: string;
  evidences: Array<{ answerId: number; sourceKind: "BASE" | "FOLLOW_UP"; text: string }>;
}

export interface SaltluxFixedDemoFinalization {
  reportId: number;
  applicationId: number;
  sessionId: number;
  summary: string;
  totalScore: 88;
  profiles: SaltluxFixedDemoProfileResult[];
}

export function buildSaltluxFixedDemoFinalization(
  input: SaltluxFixedDemoFinalizationInput,
): SaltluxFixedDemoFinalization {
  const common = requireBaseAnswer(input.answers, SALTLUX_FIXED_DEMO.questions.common);
  const personalized = requireBaseAnswer(input.answers, SALTLUX_FIXED_DEMO.questions.personalized);
  const followUp = input.answers.find((answer) =>
    answer.isFollowUpAnswer === true &&
    answer.parentAnswerId === personalized.answerId &&
    normalize(answer.question) === normalize(SALTLUX_FIXED_DEMO.questions.followUp),
  );
  if (!followUp) {
    throw invalidFixture("고정 꼬리질문 답변이 없습니다.");
  }

  const profileInputs: Array<{
    ncsProfileId: SaltluxFixedDemoProfileId;
    profileOrder: 1 | 2 | 3;
    displayName: string;
    answer: InterviewAnswerInput;
    questionMode: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE";
    score: 4 | 5;
    logicPoints: 1 | 2;
    weight: 30 | 40;
    weightedScore: 24 | 40;
    rationale: string;
    followUpApplied: boolean;
  }> = [
    {
      ncsProfileId: "JOB_TECHNICAL",
      profileOrder: 1,
      displayName: "기술·직무",
      answer: personalized,
      questionMode: "TECHNICAL_KNOWLEDGE",
      score: 4,
      logicPoints: 1,
      weight: 30,
      weightedScore: 24,
      rationale: "청킹, 하이브리드 검색, reranking을 적용하고 동일 평가셋으로 성능을 검증한 직무 근거가 구체적입니다.",
      followUpApplied: true,
    },
    {
      ncsProfileId: "COLLABORATION_COMMUNICATION",
      profileOrder: 2,
      displayName: "협업·의사소통",
      answer: common,
      questionMode: "EXPERIENCE_BEHAVIOR",
      score: 4,
      logicPoints: 1,
      weight: 30,
      weightedScore: 24,
      rationale: "팀과 검색 누락 사례를 분류하고 공통 지표를 합의해 결과를 공유한 행동 근거가 구체적입니다.",
      followUpApplied: false,
    },
    {
      ncsProfileId: "PROBLEM_SOLVING",
      profileOrder: 3,
      displayName: "문제 해결력",
      answer: personalized,
      questionMode: "TECHNICAL_KNOWLEDGE",
      score: 5,
      logicPoints: 2,
      weight: 40,
      weightedScore: 40,
      rationale: "검색 누락 원인을 구조적으로 개선하고 버전 관리와 회귀 테스트로 품질 저하까지 방지한 근거가 확인됩니다.",
      followUpApplied: true,
    },
  ];

  const profiles = profileInputs.map((profile): SaltluxFixedDemoProfileResult => {
    const behaviorPoints = 3 as const;
    const baseScore: 4 | 5 = profile.logicPoints === 1 ? 4 : 5;
    const binding = profile.answer.ncsBindings?.find((candidate) => candidate.ncsProfileId === profile.ncsProfileId);
    const criterionId = binding?.criterionId;
    const sessionQuestionId = profile.answer.sessionQuestionId;
    if (!criterionId || !sessionQuestionId) {
      throw invalidFixture(`${profile.ncsProfileId} 질문 snapshot이 완전하지 않습니다.`);
    }
    const criterion = input.criteria.find((candidate) => candidate.criterionId === criterionId);
    const baseText = profile.ncsProfileId === "COLLABORATION_COMMUNICATION"
      ? SALTLUX_FIXED_DEMO.answerScripts.common
      : SALTLUX_FIXED_DEMO.answerScripts.personalized;
    return {
      ...profile,
      criterionId,
      criterionName: criterion?.name ?? binding.criterionTitleSnapshot,
      answerId: profile.answer.answerId,
      sessionQuestionId,
      question: profile.answer.question,
      ncsProfileVersion: binding.ncsProfileVersion,
      baseScore,
      behaviorPoints,
      evidences: [
        { answerId: profile.answer.answerId, sourceKind: "BASE", text: baseText },
        ...(profile.followUpApplied
          ? [{ answerId: followUp.answerId, sourceKind: "FOLLOW_UP" as const, text: SALTLUX_FIXED_DEMO.answerScripts.followUp }]
          : []),
      ],
    };
  });

  return {
    reportId: input.reportId,
    applicationId: input.applicationId,
    sessionId: input.sessionId,
    summary: SALTLUX_FIXED_DEMO_REPORT_SUMMARY,
    totalScore: 88,
    profiles,
  };
}

function requireBaseAnswer(answers: InterviewAnswerInput[], question: string): InterviewAnswerInput {
  const answer = answers.find((candidate) =>
    candidate.isFollowUpAnswer !== true && normalize(candidate.question) === normalize(question),
  );
  if (!answer) {
    throw invalidFixture(`고정 질문 답변이 없습니다: ${question}`);
  }
  return answer;
}

function invalidFixture(reason: string) {
  return new CandidateDomainError("COMMON_CONFLICT", "솔트룩스 시연 리포트 입력이 완전하지 않습니다.", 409, [
    { field: "presentationFixture", reason },
  ]);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
