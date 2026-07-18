import type { NcsApiProfileId } from "./ncs-question-alignment.adapter";

export const FACTUAL_ANCHOR_MISSING = "FACTUAL_ANCHOR_MISSING" as const;

const CONTACT_OR_SENSITIVE = [
  /https?:\/\/\S+/i,
  /www\.\S+/i,
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
  /(?:\+?82[-\s]?)?0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/,
  /(생년|나이|성별|주소|장애|건강|연봉|학교명|출신\s*학교|학벌)/i,
] as const;

const TECH_TERMS = /(api|db|sql|redis|cache|queue|kafka|aws|docker|kubernetes|terraform|nestjs|spring|react|typescript|java|python|서버|데이터|시스템|기술|배포|인증|보안|성능|트랜잭션|인덱스)/i;
const ACTION_TERMS = /(구현|설계|적용|개발|분석|개선|해결|운영|마이그레이션|테스트|검증|모니터링|최적화|자동화)/i;
const PROBLEM_TERMS = /(문제|원인|장애|오류|병목|지연|실패|제약|대안|트레이드오프)/i;
const RESULT_TERMS = /(결과|성과|감소|증가|단축|향상|개선|해결|완료|%|\d+\s*(?:ms|초|분|시간|배|건|명))/i;
const EXPERIENCE_TERMS = /(프로젝트|업무|역할|담당|경험|서비스|기능)/i;

export function extractDemoFactualAnchor(...sources: Array<string | null | undefined>): string | null {
  const candidates = sources
    .flatMap((source) => source ? source.split(/\r?\n|(?<=[.!?。])\s+/) : [])
    .map(normalizeAnchorCandidate)
    .filter((candidate): candidate is string => candidate !== null)
    .map((candidate) => ({ candidate, score: anchorScore(candidate) }))
    .filter(({ score }) => score >= 4)
    .sort((left, right) => right.score - left.score || right.candidate.length - left.candidate.length);

  return candidates[0]?.candidate ?? null;
}

export function buildAnchoredDemoQuestion(anchor: string): string {
  return `이력서의 "${anchor}" 경험에서 사용한 기술이나 시스템의 동작 원리와 선택 이유를 설명하고, 문제 원인을 좁혀 대안을 비교한 기준과 결과를 테스트·검증한 방법을 말씀해 주세요.`;
}

export function extractDemoFollowUpAnchor(transcript: string): string | null {
  const candidates = transcript
    .split(/\r?\n|(?<=[.!?。])\s+/)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 10 && !CONTACT_OR_SENSITIVE.some((pattern) => pattern.test(value)))
    .sort((left, right) => followUpAnchorScore(right) - followUpAnchorScore(left) || right.length - left.length);
  const selected = candidates.find((value) => followUpAnchorScore(value) > 0);
  return selected ? (selected.length > 80 ? `${selected.slice(0, 77).trim()}...` : selected) : null;
}

export function buildAnswerAnchoredDemoFollowUp(transcript: string): string {
  const anchor = extractDemoFollowUpAnchor(transcript);
  return anchor
    ? `방금 답변의 "${anchor}" 내용에서 기술 선택 또는 문제 원인을 판단한 근거와, 적용 결과를 확인한 테스트·지표를 더 구체적으로 설명해 주세요.`
    : "방금 답변에서 설명한 기술 선택과 문제 해결 과정 중 판단 근거와 결과를 확인한 테스트·지표를 더 구체적으로 설명해 주세요.";
}

export function questionContainsFactualAnchor(question: string, anchor: string): boolean {
  const normalizedQuestion = canonical(question);
  const normalizedAnchor = canonical(anchor);
  if (normalizedAnchor.length >= 6 && normalizedQuestion.includes(normalizedAnchor)) return true;

  const anchorTerms = anchor.match(/[A-Za-z][A-Za-z0-9+#._-]{1,}|[가-힣]{3,}|\d+(?:\.\d+)?%?/g) ?? [];
  const meaningful = anchorTerms.filter((term) => !/^(프로젝트|업무|경험|담당|진행|사용|개발|구현)$/.test(term));
  return meaningful.length > 0 && meaningful.some((term) => normalizedQuestion.includes(canonical(term)));
}

export function demoQuestionUnsafeReason(question: string): string | null {
  const pattern = CONTACT_OR_SENSITIVE.find((candidate) => candidate.test(question));
  return pattern ? "QUESTION_CONTAINS_CONTACT_OR_SENSITIVE_DATA" : null;
}

export function exactDemoBindingProfiles(bindings: Array<{ ncsProfileId: NcsApiProfileId }>): boolean {
  return bindings.length === 2 &&
    bindings[0]?.ncsProfileId === "JOB_TECHNICAL" &&
    bindings[1]?.ncsProfileId === "PROBLEM_SOLVING";
}

function normalizeAnchorCandidate(value: string): string | null {
  const normalized = value
    .replace(/^[\s•*\-–—\d.)]+/, "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length < 12 || /^Extracted text from\b/i.test(normalized)) return null;
  if (CONTACT_OR_SENSITIVE.some((pattern) => pattern.test(normalized))) return null;
  const clipped = normalized.length > 96 ? `${normalized.slice(0, 93).trim()}...` : normalized;
  return clipped;
}

function anchorScore(value: string): number {
  return (TECH_TERMS.test(value) ? 3 : 0) +
    (ACTION_TERMS.test(value) ? 2 : 0) +
    (PROBLEM_TERMS.test(value) ? 2 : 0) +
    (RESULT_TERMS.test(value) ? 2 : 0) +
    (EXPERIENCE_TERMS.test(value) ? 1 : 0);
}

function followUpAnchorScore(value: string): number {
  return (TECH_TERMS.test(value) ? 2 : 0) +
    (ACTION_TERMS.test(value) ? 1 : 0) +
    (PROBLEM_TERMS.test(value) ? 1 : 0) +
    (RESULT_TERMS.test(value) ? 1 : 0);
}

function canonical(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z가-힣+#._%-]/g, "");
}
