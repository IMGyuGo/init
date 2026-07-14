import type {
  NcsDecisionReasonCode,
  NcsFollowUpAnswerStatus,
  NcsIncompleteReasonCode,
  NcsQuestionMode,
  NcsReportEvaluationOutputV1,
  NcsReportEvidenceV1,
  NcsReportFindingV1,
  NcsReportProfileId,
  NcsScoreStatus,
} from "./ncs-report-contract";

export const NCS_PROFILE_LABELS: Record<NcsReportProfileId, string> = {
  JOB_TECHNICAL: "직무 수행 역량",
  COLLABORATION_COMMUNICATION: "협업·의사소통",
  PROBLEM_SOLVING: "문제 해결",
};

export const NCS_DECISION_REASON_LABELS: Record<NcsDecisionReasonCode, string> = {
  THRESHOLD_MET: "종합 점수와 모든 역량 기준을 충족했습니다.",
  OVERALL_SCORE_BELOW_THRESHOLD: "종합 점수가 합격 기준에 미달했습니다.",
  PROFILE_SCORE_BELOW_THRESHOLD: "필수 역량 중 하나 이상이 최소 기준에 미달했습니다.",
  EVALUATION_INCOMPLETE: "필수 평가가 완료되지 않아 임시 불합격 정책이 적용됐습니다.",
};

export const NCS_QUESTION_MODE_LABELS: Record<NcsQuestionMode, string> = {
  EXPERIENCE_BEHAVIOR: "경험·행동",
  TECHNICAL_KNOWLEDGE: "기술 지식",
  SITUATIONAL_DESIGN: "상황 설계",
};

export const NCS_SCORE_STATUS_LABELS: Record<NcsScoreStatus, string> = {
  SCORED: "평가 완료",
  INSUFFICIENT_INPUT: "답변 부족",
  LOW_ALIGNMENT: "질문 연관성 부족",
  BLOCKED: "평가 차단",
};

export const NCS_INCOMPLETE_REASON_LABELS: Record<NcsIncompleteReasonCode, string> = {
  MINIMUM_QUESTION_COUNT_NOT_MET: "필수 문항 수 미충족",
  INSUFFICIENT_INPUT: "평가할 답변 부족",
  LOW_ALIGNMENT: "답변과 질문의 연관성 부족",
  GUARDRAIL_BLOCKED: "안전 정책에 따른 평가 차단",
  STT_UNAVAILABLE: "음성 인식 결과 없음",
  SESSION_SNAPSHOT_MISSING: "면접 질문 정보 누락",
  UNSUPPORTED_PROFILE_VERSION: "지원하지 않는 역량 버전",
  EVIDENCE_SOURCE_INVALID: "근거 출처 확인 불가",
  FOLLOW_UP_LINK_INVALID: "꼬리질문 연결 정보 오류",
};

export const NCS_FOLLOW_UP_STATUS_LABELS: Record<NcsFollowUpAnswerStatus, string> = {
  NOT_ANSWERED: "미응답",
  NOT_RECOVERED: "보완되지 않음",
  PARTIALLY_RECOVERED: "일부 보완",
  RECOVERED: "보완 완료",
};

export function formatNcsScore(value: number | null, suffix = "점"): string {
  return value === null ? "점수 산정 불가" : `${value}${suffix}`;
}

export function getValidNcsFindings(output: NcsReportEvaluationOutputV1): NcsReportFindingV1[] {
  const evidencesById = new Map(output.evidences.map((evidence) => [evidence.evidenceId, evidence]));
  return output.findings.filter((finding) =>
    finding.evidenceIds.length > 0 &&
    finding.evidenceIds.every((evidenceId) =>
      evidencesById.get(evidenceId)?.ncsProfileId === finding.ncsProfileId,
    ),
  );
}

export function getNcsEvaluationEvidences(
  output: NcsReportEvaluationOutputV1,
  sessionQuestionId: number,
  ncsProfileId: NcsReportProfileId,
  requestedEvidenceIds: number[],
  ncsEvaluationId: number | null,
): NcsReportEvidenceV1[] {
  if (ncsEvaluationId === null) return [];
  const requested = new Set(requestedEvidenceIds);
  return output.evidences
    .filter(
      (evidence) =>
        requested.has(evidence.evidenceId) &&
        evidence.ncsEvaluationId === ncsEvaluationId &&
        evidence.sessionQuestionId === sessionQuestionId &&
        evidence.ncsProfileId === ncsProfileId,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getNcsProfileLabel(profileId: NcsReportProfileId, displayName?: string): string {
  return displayName?.trim() || NCS_PROFILE_LABELS[profileId];
}
