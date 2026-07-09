// 지원자 공고 필터용 구조화 taxonomy(한글 코드). 백엔드 @init/common 값과 동일하게 유지한다.
// 공고 생성/수정 폼에서 공유한다.

export const POSTING_CAREER_MAX_YEARS = 10;

export const POSTING_JOB_ROLE_CODE_OPTIONS = [
  "서버·백엔드",
  "프론트엔드",
  "웹풀스택",
  "안드로이드",
  "iOS",
  "크로스플랫폼",
  "DevOps·SRE",
  "데이터 엔지니어",
  "AI·ML",
  "QA·테스트",
  "시스템·네트워크",
  "보안",
  "블록체인",
  "개발 PM",
  "기타 IT·개발",
];

export const POSTING_REGION_CODE_OPTIONS = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "경남",
  "경북",
  "전남",
  "전북",
  "충남",
  "충북",
  "제주",
  "해외",
];

export const POSTING_EMPLOYMENT_TYPE_CODE_OPTIONS = ["정규직", "계약직", "인턴", "프리랜서"];

export const POSTING_RECRUITMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "상시", label: "상시 채용" },
  { value: "마감형", label: "마감형 채용" },
];

export const POSTING_CAREER_YEAR_OPTIONS = Array.from({ length: POSTING_CAREER_MAX_YEARS + 1 }, (_, index) => index);

// 경력 range(년)를 JD 표시용 한글 라벨로 변환한다.
export function formatCareerRangeLabel(minYears: number, maxYears: number): string {
  if (minYears <= 0 && maxYears >= POSTING_CAREER_MAX_YEARS) return "경력무관";
  if (minYears <= 0 && maxYears === 0) return "신입";
  const maxText = maxYears >= POSTING_CAREER_MAX_YEARS ? `${POSTING_CAREER_MAX_YEARS}년 이상` : `${maxYears}년`;
  if (minYears <= 0) return `신입~${maxText}`;
  if (minYears === maxYears) return `${minYears}년`;
  return `${minYears}~${maxText}`;
}
