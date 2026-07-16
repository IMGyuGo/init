import type { CandidateMockReportFeedback, CandidateMockReportMedia } from "./api";

// dev 전용 모의면접 리포트 미리보기 목데이터. 프로덕션 fallback으로 쓰지 않는다. (#289)
// URL 쿼리 ?preview=1 (개발 환경)에서만 렌더 확인용으로 사용한다.

// 아이트래킹(시선) 시계열 그래프용 샘플. t=2s부터 1초 간격 50개. (#289 미리보기)
function buildGazeTimeline() {
  return Array.from({ length: 50 }, (_, i) => {
    const tMs = 2000 + i * 1000;
    // 대체로 중앙, 12~20초 구간에 오른쪽으로 시선 이탈 연출
    const away = i >= 10 && i <= 18;
    const h = away ? 0.32 + Math.sin(i) * 0.04 : Math.sin(i / 3) * 0.08;
    const v = Math.cos(i / 4) * 0.06;
    return {
      tMs,
      horizontalOffset: Number(h.toFixed(3)),
      verticalOffset: Number(v.toFixed(3)),
      direction: away ? "RIGHT" : "CENTER",
    };
  });
}

function buildHeadPoseTimeline() {
  return Array.from({ length: 50 }, (_, i) => ({
    tMs: 2000 + i * 1000,
    yawDegrees: Number((Math.sin(i / 3) * 8).toFixed(1)),
    pitchDegrees: Number((Math.cos(i / 5) * 5).toFixed(1)),
    rollDegrees: Number((Math.sin(i / 6) * 3).toFixed(1)),
  }));
}

export const MOCK_REPORT_PREVIEW_FEEDBACK: CandidateMockReportFeedback = {
  reportId: 9001,
  sessionId: 3301,
  reportType: "MOCK_INTERVIEW_REPORT",
  status: "COMPLETED",
  generatedAt: "2026-07-15T09:00:00.000Z",
  totalScore: 80,
  summary: "전반적으로 사례 설명이 구체적입니다. 결과를 수치로 검증하는 부분을 조금 더 보완하면 좋아요.",
  strengths: [
    "사례의 배경과 본인 행동을 명확히 구분해서 설명했어요.",
    "기술 선택 이유를 근거와 함께 제시했어요.",
  ],
  improvements: [
    "답변 마지막에 결과를 수치로 확인하는 습관을 들이면 좋아요.",
    "협업 상황에서 상대의 반응을 어떻게 확인했는지 더 구체적으로 말해보세요.",
  ],
  nextPractice: [
    "문제 해결 항목을 STAR(상황·행동·결과) 방식으로 30초 답변 다시 연습해 보세요.",
  ],
  scores: [
    {
      scoreId: 1,
      criterionName: "커뮤니케이션",
      score: 82,
      rationale: "핵심 정보를 논리적인 순서로 전달했습니다.",
      evidences: [
        { evidenceId: 11, sourceType: "ANSWER", answerId: 801, evidenceText: "비개발 직군에게는 응답 지연 영향으로 설명했습니다." },
      ],
    },
    {
      scoreId: 2,
      criterionName: "문제 해결",
      score: 68,
      rationale: "원인 분석은 좋았지만 결과 검증 근거가 부족했습니다.",
      evidences: [
        { evidenceId: 12, sourceType: "ANSWER", answerId: 802, evidenceText: "세 가지 대안의 복구 시간을 비교했습니다." },
      ],
    },
    {
      scoreId: 3,
      criterionName: "직무 이해",
      score: 90,
      rationale: "직무 관련 개념과 실무 적용을 정확히 설명했습니다.",
      evidences: [
        { evidenceId: 13, sourceType: "ANSWER", answerId: 803, evidenceText: "인덱스 설계로 조회 성능을 3배 개선했습니다." },
      ],
    },
  ],
  visibilityPolicy: {
    candidateFacingOnly: true,
    excludesHiringDecision: true,
    excludesInternalScores: true,
    excludesCompanyMemo: true,
  },
};

export const MOCK_REPORT_PREVIEW_MEDIA: CandidateMockReportMedia = {
  reportId: 9001,
  sessionId: 3301,
  reportType: "MOCK_INTERVIEW_REPORT",
  status: "COMPLETED",
  media: [
    {
      answerId: 801,
      questionId: 701,
      questionType: "EXPERIENCE",
      sortOrder: 1,
      questionContent: "장애 원인을 분석하고 기술 대안을 선택한 경험을 설명해 주세요.",
      durationSeconds: 96,
      submittedAt: "2026-07-15T08:40:00.000Z",
      transcriptStatus: "AVAILABLE",
      transcript: "로그와 지표를 비교해 병목 구간을 확인했고, 세 가지 대안의 복구 시간과 위험을 비교해 캐시 도입을 선택했습니다.",
      evaluationStatus: "EVALUATED",
      // 비언어(아이트래킹 등) 신호 + 시선/고개 시계열(그래프용) — 시선 이탈 2회, 화면 이탈 1회
      nonverbalMetadata: {
        integritySummary: { gazeAwayCount: 2, screenAwayCount: 1, faceMissingCount: 0, cameraLostCount: 0 },
        integrityEvents: [
          { type: "GAZE_AWAY", atMs: 12000, direction: "RIGHT" },
          { type: "GAZE_AWAY", atMs: 16000, direction: "RIGHT" },
        ],
        gazeTimeline: buildGazeTimeline(),
        headPoseTimeline: buildHeadPoseTimeline(),
      },
      followUpQuestions: [
        {
          followUpId: 51,
          content: "선택한 대안의 위험은 어떻게 검증했나요?",
          generationStatus: "COMPLETED",
          policy: "STANDARD",
          createdAt: "2026-07-15T08:41:00.000Z",
        },
      ],
    },
    {
      answerId: 803,
      questionId: 703,
      questionType: "TECHNICAL",
      sortOrder: 2,
      questionContent: "인덱스 설계로 성능을 개선한 경험을 설명해 주세요.",
      durationSeconds: 88,
      submittedAt: "2026-07-15T08:44:00.000Z",
      transcriptStatus: "AVAILABLE",
      transcript: "복합 인덱스를 설계해 조회 성능을 3배 개선했고, 적용 후 오류율을 일주일 동안 모니터링했습니다.",
      evaluationStatus: "EVALUATED",
      // 안정적인 답변 (신호 없음)
      nonverbalMetadata: {
        integritySummary: { gazeAwayCount: 0, screenAwayCount: 0, faceMissingCount: 0, cameraLostCount: 0 },
      },
      followUpQuestions: [],
    },
  ],
};
