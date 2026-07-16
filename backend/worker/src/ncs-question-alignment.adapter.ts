export const NCS_QUESTION_PROFILE_VERSION = "2025.12-v1" as const;
export const NCS_QUESTION_ALIGNMENT_EVALUATOR_VERSION = "ncs-question-alignment-v1" as const;

export type NcsApiProfileId =
  | "JOB_TECHNICAL"
  | "COLLABORATION_COMMUNICATION"
  | "PROBLEM_SOLVING";
export type NcsQuestionMode =
  | "EXPERIENCE_BEHAVIOR"
  | "TECHNICAL_KNOWLEDGE"
  | "SITUATIONAL_DESIGN";
export type QuestionAlignmentStatus = "ALIGNED" | "LOW_ALIGNMENT" | "REVIEW_REQUIRED";

export interface NcsQuestionAlignmentInput {
  question: string;
  profileId: NcsApiProfileId;
  questionMode: NcsQuestionMode;
  profileVersion: string;
}

export interface NcsQuestionAlignmentResult {
  status: QuestionAlignmentStatus;
  score: number | null;
  reason: string | null;
  evaluatorVersion: typeof NCS_QUESTION_ALIGNMENT_EVALUATOR_VERSION;
  profileVersion: typeof NCS_QUESTION_PROFILE_VERSION;
}

type Profile = {
  alignmentKeywords: readonly string[];
  behaviorQuestionKeywords: readonly (readonly string[])[];
};

// This threshold and catalog are worker-owned evaluator details. API and UI consume only the versioned result.
const MIN_ALIGNMENT_COVERAGE = 0.6;
const PROFILES: Readonly<Record<NcsApiProfileId, Profile>> = {
  PROBLEM_SOLVING: {
    alignmentKeywords: [
      "문제", "원인", "해결", "대안", "장애", "오류", "개선", "갈등", "의견 충돌", "조율", "합의",
      "트러블슈팅", "problem", "incident", "debug",
    ],
    behaviorQuestionKeywords: [
      ["원인", "분석", "재현", "문제", "장애", "오류", "병목"],
      ["대안", "선택", "비교", "기준", "장단점", "제약", "트레이드오프", "갈등", "조율", "합의", "의견"],
      ["결과", "검증", "측정", "성과", "개선", "재발", "회고"],
    ],
  },
  COLLABORATION_COMMUNICATION: {
    alignmentKeywords: [
      "소통", "설명", "전달", "협업", "조율", "갈등", "이해관계자", "communication", "collaboration", "stakeholder",
    ],
    behaviorQuestionKeywords: [
      ["설명", "전달", "발표", "보고", "구조", "요약"],
      ["상대", "고객", "비전문가", "이해관계자", "대상", "눈높이"],
      ["질문", "경청", "피드백", "합의", "갈등", "조율", "확인"],
    ],
  },
  JOB_TECHNICAL: {
    alignmentKeywords: [
      "기술", "시스템", "데이터", "디지털", "구현", "설계", "api", "db", "redis", "cache", "queue", "ai", "보안", "성능",
    ],
    behaviorQuestionKeywords: [
      ["원리", "동작", "구조", "이유", "기술", "시스템", "데이터"],
      ["구현", "적용", "설계", "운영", "개발", "api", "db", "redis"],
      ["위험", "장애", "실패", "보안", "검증", "테스트", "모니터링", "복구"],
    ],
  },
};

export function alignNcsQuestion(input: NcsQuestionAlignmentInput): NcsQuestionAlignmentResult {
  if (input.profileVersion !== NCS_QUESTION_PROFILE_VERSION) {
    return {
      status: "REVIEW_REQUIRED",
      score: null,
      reason: `지원하지 않는 NCS profile version입니다: ${input.profileVersion}`,
      evaluatorVersion: NCS_QUESTION_ALIGNMENT_EVALUATOR_VERSION,
      profileVersion: NCS_QUESTION_PROFILE_VERSION,
    };
  }

  const score = questionProfileCoverage(input.question, input.profileId, input.questionMode);
  return {
    status: score >= MIN_ALIGNMENT_COVERAGE ? "ALIGNED" : "LOW_ALIGNMENT",
    score,
    reason:
      score >= MIN_ALIGNMENT_COVERAGE
        ? null
        : "질문과 선택한 NCS 프로필의 정렬 범위가 기준 미만입니다.",
    evaluatorVersion: NCS_QUESTION_ALIGNMENT_EVALUATOR_VERSION,
    profileVersion: NCS_QUESTION_PROFILE_VERSION,
  };
}

export function markQuestionReviewRequired(
  result: NcsQuestionAlignmentResult,
  reason = "동일 질문 유형 재생성과 허용 fallback 이후에도 정렬 기준을 충족하지 못했습니다.",
): NcsQuestionAlignmentResult {
  return {
    ...result,
    status: "REVIEW_REQUIRED",
    reason,
  };
}

function questionProfileCoverage(
  question: string,
  profileId: NcsApiProfileId,
  questionMode: NcsQuestionMode,
): number {
  const original = normalizeSpace(question);
  const normalized = original.toLowerCase();
  if (!normalized) return 0;

  const profile = PROFILES[profileId];
  const profileAligned = includesAny(normalized, profile.alignmentKeywords);
  const behaviorMatches = profile.behaviorQuestionKeywords.filter((keywords) =>
    includesAny(normalized, keywords),
  ).length;
  const modeBonus = questionModeProfileBonus(original, profileId, questionMode);
  return roundTo(Math.min(1, (profileAligned ? 0.4 : 0) + behaviorMatches * 0.2 + modeBonus), 3);
}

function questionModeProfileBonus(
  question: string,
  profileId: NcsApiProfileId,
  questionMode: NcsQuestionMode,
): number {
  if (profileId === "JOB_TECHNICAL" && questionMode === "TECHNICAL_KNOWLEDGE") {
    const hasCodeLikeTerm = /\b(?:[A-Z]{2,10}|[A-Z][a-z]+[A-Z][A-Za-z0-9]*|[A-Za-z]+(?:JS|DB|SQL|API|SDK)|[A-Za-z0-9][._+#-][A-Za-z0-9._+#-]+|[A-Za-z]*\d+[A-Za-z0-9]*)\b/.test(question);
    const hasTechnicalContext = /(기술|시스템|서버|데이터|코드|프레임워크|라이브러리|네트워크|데이터베이스|동시성|인증|보안|성능|배포|클라우드|캐시|트랜잭션|인덱스|알고리즘)|\b(?:api|database|cache|server|framework|library|network|concurrency|authentication|security|performance|deployment|cloud|runtime|compiler|query|transaction|index|middleware|protocol|algorithm|system|code)\b/i.test(question);
    return hasCodeLikeTerm || hasTechnicalContext ? 0.6 : 0;
  }
  if (profileId === "PROBLEM_SOLVING" && questionMode === "SITUATIONAL_DESIGN") {
    return /(상황|문제|설계|대응|개선|장애|제약|요구|어떻게)/.test(question) ? 0.2 : 0;
  }
  if (profileId === "COLLABORATION_COMMUNICATION" && questionMode === "EXPERIENCE_BEHAVIOR") {
    return /(설명|공유|협업|조율|보고|전달|갈등|상대)/.test(question) ? 0.2 : 0;
  }
  return 0;
}

export function canonicalNcsProfileIdOf(value: unknown): NcsApiProfileId | undefined {
  if (value === "JOB_TECHNICAL" || value === "DIGITAL") return "JOB_TECHNICAL";
  if (value === "COLLABORATION_COMMUNICATION" || value === "COMMUNICATION") {
    return "COLLABORATION_COMMUNICATION";
  }
  return value === "PROBLEM_SOLVING" ? value : undefined;
}

function includesAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase()));
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function roundTo(value: number, places: number): number {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}
