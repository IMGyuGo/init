const TRAILING_PUNCTUATION = /(?:[.!?。？！]\s*)+$/u;
const ANSWER_REQUEST_ENDING = /(?:주세요|주십시오|보세요|바랍니다)$/u;
const DIRECT_QUESTION_ENDING = /(?:나요|가요|까요|인가요|한가요|할까요|입니까|합니까|습니까|십니까|일까요)$/u;

export const INTERVIEW_QUESTION_PUNCTUATION_PROMPT =
  'Use "?" for a direct interrogative sentence. Use "." for an answer request or instruction such as "구체적으로 설명해 주세요." Never append "?" after a period.';

export function normalizeInterviewQuestionPunctuation(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const terminalPunctuation = normalized.match(TRAILING_PUNCTUATION)?.[0];
  const sentence = normalized.replace(TRAILING_PUNCTUATION, "").trimEnd();

  if (ANSWER_REQUEST_ENDING.test(sentence)) {
    return `${sentence}.`;
  }

  if (DIRECT_QUESTION_ENDING.test(sentence)) {
    return `${sentence}?`;
  }

  if (terminalPunctuation === "." || terminalPunctuation === "?") {
    return normalized;
  }
  if (terminalPunctuation === "。") {
    return `${sentence}.`;
  }
  if (terminalPunctuation === "？") {
    return `${sentence}?`;
  }

  return `${sentence}.`;
}
