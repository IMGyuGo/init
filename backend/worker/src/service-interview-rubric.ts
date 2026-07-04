export type ReportEvaluationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ServiceInterviewRubricItem {
  name: string;
  description: string;
  weight: number;
}

export interface ReportScoreBand {
  label: string;
  range: string;
  description: string;
}

export interface ReportEvidenceAssessment {
  level: number;
  levelLabel: string;
  score: number;
  rubricAnchor: string;
  confidence: ReportEvaluationConfidence;
  uncertaintyReasons: string[];
}

export const SERVICE_INTERVIEW_RUBRIC: ServiceInterviewRubricItem[] = [
  {
    name: "직무/기술 역량",
    description: "JD와 연결되는 기술 지식, 구현 경험, 설계 판단을 답변 근거로 확인한다.",
    weight: 30,
  },
  {
    name: "문제 해결력",
    description: "문제 원인을 나누어 확인하고 제약, 대안, 해결 과정을 설명하는지 확인한다.",
    weight: 20,
  },
  {
    name: "실행력과 성과",
    description: "본인이 맡은 행동, 완성도, 결과나 개선 효과가 답변에 드러나는지 확인한다.",
    weight: 20,
  },
  {
    name: "협업/커뮤니케이션",
    description: "상황, 역할, 의사소통 방식, 협업 조정 과정을 구조적으로 전달하는지 확인한다.",
    weight: 15,
  },
  {
    name: "학습/성장성",
    description: "새로운 도구나 도메인을 학습하고 실제 문제에 적용한 흐름을 확인한다.",
    weight: 10,
  },
  {
    name: "책임감/신뢰성",
    description: "맡은 범위를 끝까지 확인하고 재발 방지, 검증, 공유까지 수행했는지 확인한다.",
    weight: 5,
  },
];

export const REPORT_SCORE_BANDS: ReportScoreBand[] = [
  { label: "매우 우수", range: "90~100", description: "근거가 풍부하고 결과와 재발 방지까지 명확합니다." },
  { label: "우수", range: "80~89", description: "상황, 행동, 결과가 비교적 구체적으로 연결됩니다." },
  { label: "보통 이상", range: "70~79", description: "핵심 경험은 확인되지만 일부 근거 보강이 필요합니다." },
  { label: "보완 필요", range: "60~69", description: "상황은 있으나 본인 역할, 과정, 결과가 부족합니다." },
  { label: "부족", range: "0~59", description: "질문과 직접 연결되는 평가 근거가 부족합니다." },
];

export const SERVICE_REPORT_POLICY = {
  philosophy:
    "AI는 채용 결정을 대신하지 않고, JD와 평가 기준에 연결되는 답변 근거를 구조화해 사람이 검토할 수 있도록 돕는다.",
  forbiddenSignals: [
    "합격/불합격/채용 여부를 단정하지 않는다.",
    "성별, 나이, 출신 학교, 외모, 지역, 장애 여부 등 민감 속성을 평가하지 않는다.",
    "표정, 시선, 목소리 톤 같은 비언어 요소를 채용 점수로 사용하지 않는다.",
    "답변 transcript와 제출 자료에 없는 사실을 추정하지 않는다.",
  ],
  evidenceRule: "점수와 문구는 면접 답변 transcript, JD, 제출 자료 근거에 한정한다.",
};

const RUBRIC_LEVEL_LABELS: Record<number, string> = {
  1: "근거 부족",
  2: "상황 제시",
  3: "행동/과정 제시",
  4: "결과 연결",
  5: "성과/대안까지 설명",
};

const RUBRIC_LEVEL_SCORES: Record<number, number> = {
  1: 55,
  2: 65,
  3: 75,
  4: 85,
  5: 93,
};

export function normalizeReportCriterionName(name: string): string {
  const normalized = name.toLowerCase();
  const compact = normalized.replace(/\s+/g, "");

  if (
    compact.includes("직무") ||
    compact.includes("기술") ||
    compact.includes("role") ||
    compact.includes("fit") ||
    compact.includes("technical") ||
    compact.includes("api") ||
    compact.includes("db") ||
    compact.includes("backend") ||
    compact.includes("frontend")
  ) {
    return "직무/기술 역량";
  }
  if (compact.includes("문제") || compact.includes("해결") || compact.includes("problem") || compact.includes("solving")) {
    return "문제 해결력";
  }
  if (
    compact.includes("실행") ||
    compact.includes("성과") ||
    compact.includes("결과") ||
    compact.includes("execution") ||
    compact.includes("impact") ||
    compact.includes("outcome")
  ) {
    return "실행력과 성과";
  }
  if (
    compact.includes("협업") ||
    compact.includes("커뮤니케이션") ||
    compact.includes("communication") ||
    compact.includes("collaboration")
  ) {
    return "협업/커뮤니케이션";
  }
  if (compact.includes("학습") || compact.includes("성장") || compact.includes("learning") || compact.includes("growth")) {
    return "학습/성장성";
  }
  if (
    compact.includes("책임") ||
    compact.includes("신뢰") ||
    compact.includes("responsibility") ||
    compact.includes("trust") ||
    compact.includes("ownership")
  ) {
    return "책임감/신뢰성";
  }

  return name;
}

export function scoreBandFor(score: number): ReportScoreBand {
  if (score >= 90) {
    return REPORT_SCORE_BANDS[0];
  }
  if (score >= 80) {
    return REPORT_SCORE_BANDS[1];
  }
  if (score >= 70) {
    return REPORT_SCORE_BANDS[2];
  }
  if (score >= 60) {
    return REPORT_SCORE_BANDS[3];
  }
  return REPORT_SCORE_BANDS[4];
}

export function assessReportEvidence(
  transcript: string,
  documentText?: string,
  criterionDescription?: string,
): ReportEvidenceAssessment {
  const combined = `${transcript}\n${documentText ?? ""}`.toLowerCase();
  const hasSituation = normalizeSpace(transcript).length >= 20;
  const hasAction =
    /\b(found|analyzed|improved|optimized|built|designed|implemented|resolved|added|reduced|owned|led|tested)\b/.test(
      combined,
    ) || /(구현|설계|분석|해결|개선|적용|확인|조정|작성|연결|저장|검증|테스트|분리|추가|도입|수정|운영|담당|맡)/.test(combined);
  const hasResult =
    /\b(result|performance|latency|cache|ttl|policy|policies|reduced|improved|increased|completed|passed)\b/.test(
      combined,
    ) || /(결과|성과|완료|성공|통과|개선|감소|증가|해결|안정화|확인|저장|생성|연동)/.test(combined);
  const hasMetric = /\d|%|ms|sec|minute|hour|x\b|초|분|시간|건|배|회|명|개/.test(combined);
  const hasDocumentContext = Boolean(documentText?.trim());
  const level = Math.min(
    5,
    Math.max(1, 1 + Number(hasSituation) + Number(hasAction) + Number(hasResult) + Number(hasMetric || hasDocumentContext)),
  );
  const uncertaintyReasons = [
    ...(hasMetric ? [] : ["정량 성과나 전후 비교가 부족합니다."]),
    ...(hasDocumentContext ? [] : ["제출 서류 근거가 함께 제공되지 않았습니다."]),
    ...(hasAction ? [] : ["본인이 직접 수행한 행동이 충분히 드러나지 않습니다."]),
    ...(hasResult ? [] : ["결과나 영향이 충분히 드러나지 않습니다."]),
  ];
  const confidence: ReportEvaluationConfidence =
    hasAction && hasResult && (hasMetric || hasDocumentContext)
      ? "HIGH"
      : hasAction && (hasResult || hasDocumentContext)
        ? "MEDIUM"
        : "LOW";
  const levelLabel = RUBRIC_LEVEL_LABELS[level];
  const criterionPart = criterionDescription?.trim()
    ? `평가 기준: ${shorten(criterionDescription)}`
    : "서비스 기본 rubric에 따라 답변 근거를 평가했습니다.";

  return {
    level,
    levelLabel,
    score: RUBRIC_LEVEL_SCORES[level],
    rubricAnchor: `${level}단계(${levelLabel}) - ${criterionPart}`,
    confidence,
    uncertaintyReasons,
  };
}

export function weightedTotalScore(
  scores: Array<{ criterionId: number; score: number }>,
  criteria: Array<{ criterionId: number; weight: number }>,
): number {
  const weights = new Map(criteria.map((criterion) => [criterion.criterionId, criterion.weight]));
  const totalWeight = scores.reduce((sum, score) => sum + Math.max(0, weights.get(score.criterionId) ?? 0), 0);
  if (totalWeight <= 0) {
    return Math.round(scores.reduce((sum, score) => sum + score.score, 0) / Math.max(scores.length, 1));
  }
  return Math.round(
    scores.reduce((sum, score) => sum + score.score * Math.max(0, weights.get(score.criterionId) ?? 0), 0) / totalWeight,
  );
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string): string {
  const normalized = normalizeSpace(value);
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
