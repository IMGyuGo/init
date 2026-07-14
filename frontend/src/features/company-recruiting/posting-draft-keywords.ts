// AI 공고 초안 키워드 입력 유틸. 백엔드 계약(POSTING_DRAFT_INPUT_LIMITS)과 동기화한다. (#290)
// - 최대 10개, 키워드당 40자. 정상 UI 조작만으로 400 오류가 나지 않도록 프론트에서 선제 정규화.

export const AI_DRAFT_KEYWORD_MAX_COUNT = 10;
export const AI_DRAFT_KEYWORD_MAX_LENGTH = 40;

// 직무별 추천 키워드 + 공통 키워드.
export const AI_DRAFT_COMMON_KEYWORDS = ["협업", "커뮤니케이션", "문제 해결", "코드 리뷰", "성장 지향"];

export const AI_DRAFT_KEYWORD_SUGGESTIONS: Record<string, string[]> = {
  "서버·백엔드": ["Node.js", "Spring", "MSA", "대용량 트래픽", "API 설계", "DB 설계", "AWS"],
  "프론트엔드": ["React", "Next.js", "TypeScript", "성능 최적화", "디자인 시스템", "UI/UX 협업"],
  "웹풀스택": ["React", "Node.js", "TypeScript", "REST API", "DB 설계", "배포 자동화"],
  "안드로이드": ["Kotlin", "Jetpack Compose", "MVVM", "성능 최적화", "앱 출시 경험"],
  "iOS": ["Swift", "SwiftUI", "UIKit", "MVVM", "앱스토어 배포"],
  "크로스플랫폼": ["Flutter", "React Native", "TypeScript", "네이티브 연동"],
  "DevOps·SRE": ["Kubernetes", "Docker", "CI/CD", "IaC", "모니터링", "AWS"],
  "데이터 엔지니어": ["Spark", "Airflow", "데이터 파이프라인", "SQL", "DW 설계"],
  "AI·ML": ["PyTorch", "LLM", "모델 서빙", "MLOps", "데이터 전처리"],
  "QA·테스트": ["테스트 자동화", "E2E 테스트", "품질 프로세스", "회귀 테스트"],
  "시스템·네트워크": ["Linux", "네트워크 운영", "인프라 구축", "장애 대응"],
  "보안": ["취약점 진단", "모의해킹", "보안 관제", "ISMS"],
  "블록체인": ["Solidity", "스마트 컨트랙트", "Web3", "DApp"],
  "개발 PM": ["프로젝트 관리", "일정 관리", "요구사항 정의", "협업 리딩"],
  "기타 IT·개발": ["기술 문서화", "레거시 개선", "자동화"],
};

export function aiKeywordSuggestionsFor(jobRoleCode: string): string[] {
  const roleKeywords = AI_DRAFT_KEYWORD_SUGGESTIONS[jobRoleCode] ?? [];
  return [...roleKeywords, ...AI_DRAFT_COMMON_KEYWORDS];
}

// CSV/줄바꿈 원문을 키워드 배열로 파싱(정규화 없음 — 선택 상태 표시·토글용).
export function splitDraftKeywords(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

// 저장/요청 직전 정규화: 40자 절단 → 중복 제거 → 10개로 제한.
export function normalizeDraftKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const keyword of splitDraftKeywords(raw)) {
    const trimmed = keyword.slice(0, AI_DRAFT_KEYWORD_MAX_LENGTH);
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= AI_DRAFT_KEYWORD_MAX_COUNT) break;
  }
  return result;
}

// 칩 토글 결과 CSV 문자열을 계산. 상한 도달 시 새 키워드 추가는 무시.
export function toggleDraftKeyword(raw: string, keyword: string): string {
  const list = splitDraftKeywords(raw);
  if (list.includes(keyword)) {
    return list.filter((item) => item !== keyword).join(", ");
  }
  if (list.length >= AI_DRAFT_KEYWORD_MAX_COUNT) return raw;
  return [...list, keyword].join(", ");
}
