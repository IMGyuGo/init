export const SALTLUX_FIXED_DEMO_FIXTURE_ID = "SALTLUX_AI_BACKEND_V1" as const;

export const SALTLUX_FIXED_DEMO = {
  companyName: "솔트룩스",
  jobTitle: "[Product Center] AI Backend Engineer (신입/경력)",
  preparationTimeSec: 0,
  answerTimeSec: 22,
  maxQuestionAndAnswerSeconds: 30,
  questions: {
    common: "AI 검색 품질 기준을 팀과 합의한 과정을 설명해 주세요.",
    personalized: "RAG 검색 정확도를 개선한 방법과 검증 결과를 설명해 주세요.",
    followUp: "개선 과정에서 품질 회귀는 어떻게 방지했나요?",
  },
  answerScripts: {
    common:
      "팀과 검색 누락 사례를 분류하고 Top-5 적중률을 공통 기준으로 정했습니다. 같은 평가셋으로 결과를 공유하며 개선해 적중률을 0.68에서 0.84로 높였습니다.",
    personalized:
      "문단 단위 청킹과 키워드·벡터 검색을 결합하고 reranking을 적용했습니다. 같은 평가셋으로 검증해 검색 누락을 31퍼센트 줄이고 Top-5 적중률을 0.84로 높였습니다.",
    followUp:
      "모델·프롬프트·평가셋 버전을 함께 기록하고 배포 전 회귀 테스트를 실행했습니다. 기준보다 적중률이 낮아지면 배포를 중단해 품질 저하를 조기에 발견했습니다.",
  },
} as const;

export type SaltluxFixedDemoFixtureId = typeof SALTLUX_FIXED_DEMO_FIXTURE_ID;

export function isSaltluxFixedDemoPosting(companyName: string | null | undefined, jobTitle: string | null | undefined) {
  return normalize(companyName).includes(SALTLUX_FIXED_DEMO.companyName) &&
    normalize(jobTitle) === normalize(SALTLUX_FIXED_DEMO.jobTitle);
}

export function isSaltluxFixedDemoPersonalizedQuestion(question: string | null | undefined) {
  return normalize(question) === normalize(SALTLUX_FIXED_DEMO.questions.personalized);
}

export function isSaltluxFixedDemoQuestionSnapshot(contents: Array<string | null | undefined>) {
  return contents.length === 2 &&
    normalize(contents[0]) === normalize(SALTLUX_FIXED_DEMO.questions.common) &&
    normalize(contents[1]) === normalize(SALTLUX_FIXED_DEMO.questions.personalized);
}

export function estimateKoreanSpeechSeconds(text: string, charactersPerSecond = 4) {
  return Math.ceil(text.replace(/\s/g, "").length / charactersPerSecond);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
