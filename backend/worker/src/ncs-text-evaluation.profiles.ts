import {
  NCS_PROFILE_VERSION,
  NcsBehaviorId,
  NcsEvidenceDimensionId,
  NcsProfileId,
  NcsQuestionMode
} from "./ncs-text-evaluation.types";

export interface NcsBehaviorProfile {
  id: NcsBehaviorId;
  label: string;
  description: string;
  evidenceKeywords: readonly string[];
  questionKeywords: readonly string[];
}

export interface NcsCompetencyProfile {
  id: NcsProfileId;
  version: typeof NCS_PROFILE_VERSION;
  label: string;
  definition: string;
  alignmentKeywords: readonly string[];
  behaviors: readonly NcsBehaviorProfile[];
}

export interface NcsEvidenceDimensionProfile {
  id: NcsEvidenceDimensionId;
  label: string;
  description: string;
  keywords: readonly string[];
}

export const NCS_COMPETENCY_PROFILES: Readonly<Record<NcsProfileId, NcsCompetencyProfile>> = {
  "problem-solving": {
    id: "problem-solving",
    version: NCS_PROFILE_VERSION,
    label: "문제해결능력",
    definition: "문제를 구조화해 원인을 확인하고 대안을 선택한 뒤 결과를 검증·개선하는 능력",
    alignmentKeywords: [
      "문제",
      "원인",
      "해결",
      "대안",
      "장애",
      "오류",
      "개선",
      "갈등",
      "의견 충돌",
      "조율",
      "합의",
      "트러블슈팅",
      "problem",
      "incident",
      "debug"
    ],
    behaviors: [
      {
        id: "problem-analysis",
        label: "문제 분석",
        description: "현상과 원인을 구분하고 정보·가설·제약을 근거로 문제를 정의한다.",
        evidenceKeywords: ["원인", "분석", "재현", "가설", "로그", "지표", "현상", "문제 정의", "병목", "확인"],
        questionKeywords: ["원인", "분석", "재현", "문제", "장애", "오류", "병목"]
      },
      {
        id: "alternative-selection",
        label: "대안 선택",
        description: "복수 대안을 기준과 제약에 따라 비교하고 선택 이유를 설명한다.",
        evidenceKeywords: ["대안", "비교", "선택", "기준", "장단점", "제약", "트레이드오프", "우선순위", "대신"],
        questionKeywords: ["대안", "선택", "비교", "기준", "장단점", "제약", "트레이드오프", "갈등", "조율", "합의", "의견"]
      },
      {
        id: "result-validation",
        label: "결과 검증",
        description: "실행 결과를 측정하고 한계·재발 가능성을 점검해 다음 개선에 반영한다.",
        evidenceKeywords: ["결과", "검증", "측정", "모니터링", "테스트", "개선", "재발", "회고", "확인", "%", "ms"],
        questionKeywords: ["결과", "검증", "측정", "성과", "개선", "재발", "회고"]
      }
    ]
  },
  communication: {
    id: "communication",
    version: NCS_PROFILE_VERSION,
    label: "의사소통능력",
    definition: "목적과 상대에 맞춰 정보를 구조화하고 상호 이해를 확인하며 협력적으로 소통하는 능력",
    alignmentKeywords: [
      "소통",
      "설명",
      "전달",
      "협업",
      "조율",
      "갈등",
      "이해관계자",
      "communication",
      "collaboration",
      "stakeholder"
    ],
    behaviors: [
      {
        id: "structured-explanation",
        label: "구조화된 설명",
        description: "배경·핵심·근거·결론을 목적에 맞는 순서로 전달한다.",
        evidenceKeywords: ["핵심", "요약", "먼저", "다음", "결론", "배경", "근거", "순서", "정리", "구조"],
        questionKeywords: ["설명", "전달", "발표", "보고", "구조", "요약"]
      },
      {
        id: "audience-adjustment",
        label: "대상 맞춤",
        description: "상대의 역할·지식·관심사를 고려해 용어와 정보 깊이를 조정한다.",
        evidenceKeywords: ["상대", "비전문가", "고객", "개발자", "기획", "이해관계자", "수준", "용어", "눈높이", "맞춰"],
        questionKeywords: ["상대", "고객", "비전문가", "이해관계자", "대상", "눈높이"]
      },
      {
        id: "interaction-confirmation",
        label: "상호 이해 확인",
        description: "질문·경청·재진술·피드백을 통해 이해와 합의를 확인한다.",
        evidenceKeywords: ["질문", "경청", "확인", "재확인", "피드백", "합의", "의견", "되물", "공유", "조율"],
        questionKeywords: ["질문", "경청", "피드백", "합의", "갈등", "조율", "확인"]
      }
    ]
  },
  digital: {
    id: "digital",
    version: NCS_PROFILE_VERSION,
    label: "디지털능력",
    definition: "디지털 기술의 원리를 이해하고 직무에 적용하며 위험과 결과를 책임 있게 검증하는 능력",
    alignmentKeywords: [
      "기술",
      "시스템",
      "데이터",
      "디지털",
      "구현",
      "설계",
      "api",
      "db",
      "redis",
      "cache",
      "queue",
      "ai",
      "보안",
      "성능"
    ],
    behaviors: [
      {
        id: "technical-principle",
        label: "기술 원리",
        description: "기술의 구성·동작 원리와 선택 이유를 인과관계로 설명한다.",
        evidenceKeywords: [
          "원리",
          "동작",
          "구조",
          "이유",
          "때문",
          "ttl",
          "트랜잭션",
          "일관성",
          "캐시 미스",
          "인덱스",
          "비동기"
        ],
        questionKeywords: ["원리", "동작", "구조", "이유", "기술", "시스템", "데이터"]
      },
      {
        id: "practical-application",
        label: "실무 적용",
        description: "기술을 구체적인 업무·시스템 맥락에 설계·구현·운영한다.",
        evidenceKeywords: ["구현", "적용", "설계", "운영", "배포", "api", "db", "redis", "서버", "코드", "환경"],
        questionKeywords: ["구현", "적용", "설계", "운영", "개발", "api", "db", "redis"]
      },
      {
        id: "risk-validation",
        label: "위험 검증",
        description: "보안·실패·성능·데이터 위험을 식별하고 테스트·모니터링·복구로 검증한다.",
        evidenceKeywords: [
          "위험",
          "장애",
          "실패",
          "보안",
          "테스트",
          "검증",
          "모니터링",
          "롤백",
          "fallback",
          "timeout",
          "부하",
          "stale"
        ],
        questionKeywords: ["위험", "장애", "실패", "보안", "검증", "테스트", "모니터링", "복구"]
      }
    ]
  }
};

export const NCS_MODE_EVIDENCE_DIMENSIONS: Readonly<
  Record<NcsQuestionMode, readonly NcsEvidenceDimensionProfile[]>
> = {
  EXPERIENCE_BEHAVIOR: [
    {
      id: "situation-task",
      label: "상황·과제",
      description: "구체적인 상황, 목표, 제약 또는 맡은 과제가 드러난다.",
      keywords: ["상황", "당시", "프로젝트", "목표", "문제", "요구", "제약", "과제", "담당"]
    },
    {
      id: "owned-action",
      label: "본인 행동",
      description: "본인이 직접 수행한 행동과 선택 이유가 드러난다.",
      keywords: ["제가", "저는", "직접", "맡", "담당", "구현", "설계", "분석", "조정", "선택", "적용"]
    },
    {
      id: "result-impact",
      label: "결과·영향",
      description: "행동의 결과, 변화, 검증 또는 영향이 확인된다.",
      keywords: ["결과", "성과", "개선", "감소", "증가", "완료", "해결", "검증", "%", "ms", "배"]
    },
    {
      id: "reflection-transfer",
      label: "성찰·전이",
      description: "배운 점과 다음 상황에 적용할 개선이 제시된다.",
      keywords: ["배웠", "회고", "다음", "이후", "개선", "재발", "교훈", "적용하", "보완"]
    }
  ],
  TECHNICAL_KNOWLEDGE: [
    {
      id: "concept-accuracy",
      label: "기술 정확성",
      description: "핵심 개념과 동작을 모순 없이 구체적으로 설명한다.",
      keywords: ["원리", "동작", "구조", "트랜잭션", "일관성", "ttl", "캐시", "인덱스", "큐", "api", "db"]
    },
    {
      id: "causal-reasoning",
      label: "인과 설명",
      description: "왜 그렇게 동작하거나 선택하는지 원인과 결과를 연결한다.",
      keywords: ["때문", "따라서", "그래서", "이유", "원인", "결과", "반면", "대신", "위해"]
    },
    {
      id: "technical-application",
      label: "실무 적용",
      description: "개념을 구체적인 구현·설계·운영 맥락에 적용한다.",
      keywords: ["구현", "적용", "설계", "운영", "배포", "코드", "환경", "서버", "서비스", "프로젝트"]
    },
    {
      id: "technical-risk-validation",
      label: "위험·검증",
      description: "한계와 실패 조건을 식별하고 테스트·모니터링·복구 방안을 제시한다.",
      keywords: ["위험", "한계", "장애", "실패", "테스트", "검증", "모니터링", "롤백", "fallback", "timeout", "부하"]
    }
  ],
  SITUATIONAL_DESIGN: [
    {
      id: "problem-constraints",
      label: "문제·제약 정의",
      description: "주어진 상황의 목표, 이해관계자, 정보와 제약을 구조화한다.",
      keywords: ["문제", "목표", "제약", "요구", "우선", "이해관계자", "확인", "정보", "조건"]
    },
    {
      id: "alternatives-tradeoffs",
      label: "대안·트레이드오프",
      description: "복수 대안과 선택 기준, 장단점을 비교한다.",
      keywords: ["대안", "비교", "선택", "기준", "장단점", "트레이드오프", "대신", "비용", "효과"]
    },
    {
      id: "execution-plan",
      label: "실행 계획",
      description: "우선순위·역할·순서·자원을 포함한 실행 계획을 제시한다.",
      keywords: ["먼저", "다음", "계획", "단계", "담당", "역할", "일정", "실행", "적용", "구현"]
    },
    {
      id: "validation-adaptation",
      label: "검증·조정",
      description: "성공 기준을 확인하고 실패 시 조정·복구·개선한다.",
      keywords: ["검증", "측정", "테스트", "모니터링", "실패", "조정", "개선", "롤백", "피드백", "결과"]
    }
  ]
};

export function ncsProfile(profileId: NcsProfileId): NcsCompetencyProfile {
  return NCS_COMPETENCY_PROFILES[profileId];
}

export function ncsEvidenceDimensions(questionMode: NcsQuestionMode): readonly NcsEvidenceDimensionProfile[] {
  return NCS_MODE_EVIDENCE_DIMENSIONS[questionMode];
}
