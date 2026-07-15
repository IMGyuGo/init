import {
  NO_EXTERNAL_KNOWLEDGE_VERSION,
  AnswerFactCheckClaim,
  AnswerFactCheckInput,
  FactCheckGateStatus,
} from "./answer-fact-check.types";

export interface AnswerFactCheckGoldenCase {
  name: string;
  input: AnswerFactCheckInput;
  claims: AnswerFactCheckClaim[];
  expectedGateStatus: FactCheckGateStatus;
}

export const ANSWER_FACT_CHECK_GOLDEN_CASES: AnswerFactCheckGoldenCase[] = [
  buildCase({
    name: "supported technical claim",
    answerText: "C는 절차적 프로그래밍 언어로 주로 사용됩니다.",
    claimText: "C는 절차적 프로그래밍 언어로 주로 사용됩니다.",
    claimType: "TECHNICAL_FACT",
    claimRole: "ANSWER_CORE",
    verdict: "SUPPORTED",
    confidence: 0.96,
    expectedGateStatus: "PASS_THROUGH",
    evidenceText: "C is commonly described as a procedural programming language.",
  }),
  buildCase({
    name: "contradicted core technical claim",
    answerText: "C는 객체지향 언어입니다.",
    claimText: "C는 객체지향 언어입니다.",
    claimType: "TECHNICAL_FACT",
    claimRole: "ANSWER_CORE",
    verdict: "CONTRADICTED",
    confidence: 0.98,
    expectedGateStatus: "FACT_CHECK_REQUIRED",
    evidenceText: "C is a general-purpose procedural programming language and does not provide built-in class-based OOP.",
  }),
  buildCase({
    name: "ambiguous project interpretation",
    answerText: "C 프로젝트를 통해 객체지향을 이해했습니다.",
    claimText: "C 프로젝트를 통해 객체지향을 이해했습니다.",
    claimType: "PERSONAL_EXPERIENCE",
    claimRole: "ANSWER_CORE",
    verdict: "AMBIGUOUS",
    confidence: 0.62,
    expectedGateStatus: "CLARIFICATION_CANDIDATE",
    evidenceText: "지원자는 C 기반 프로젝트를 수행했다고 이력서에 작성했습니다.",
  }),
  {
    name: "personal experience without evidence",
    input: {
      answerId: 104,
      question: "프로젝트에서 어떤 역할을 맡았습니까?",
      answerText: "제가 장애 대응을 주도했습니다.",
      questionMode: "EXPERIENCE_BEHAVIOR",
      knowledgeSnapshotVersion: NO_EXTERNAL_KNOWLEDGE_VERSION,
      evidenceLedger: [],
    },
    claims: [{
      claimText: "제가 장애 대응을 주도했습니다.",
      startOffset: 0,
      endOffset: "제가 장애 대응을 주도했습니다.".length,
      claimType: "PERSONAL_EXPERIENCE",
      claimRole: "ANSWER_CORE",
      verdict: "UNVERIFIABLE",
      confidence: 0.8,
      evidenceIds: [],
      rationale: "개인 경험을 독립적으로 확인할 snapshot 근거가 없습니다.",
    }],
    expectedGateStatus: "PASS_THROUGH",
  },
  {
    name: "opinion is not checkable",
    input: {
      answerId: 105,
      question: "선호하는 개발 문화는 무엇입니까?",
      answerText: "저는 짧은 피드백 주기가 가장 좋다고 생각합니다.",
      questionMode: "EXPERIENCE_BEHAVIOR",
      knowledgeSnapshotVersion: NO_EXTERNAL_KNOWLEDGE_VERSION,
      evidenceLedger: [],
    },
    claims: [{
      claimText: "저는 짧은 피드백 주기가 가장 좋다고 생각합니다.",
      startOffset: 0,
      endOffset: "저는 짧은 피드백 주기가 가장 좋다고 생각합니다.".length,
      claimType: "OPINION",
      claimRole: "ANSWER_CORE",
      verdict: "NOT_CHECKABLE",
      confidence: 0.99,
      evidenceIds: [],
      rationale: "사실 명제가 아닌 지원자의 선호 표현입니다.",
    }],
    expectedGateStatus: "PASS_THROUGH",
  },
];

function buildCase(input: {
  name: string;
  answerText: string;
  claimText: string;
  claimType: AnswerFactCheckClaim["claimType"];
  claimRole: AnswerFactCheckClaim["claimRole"];
  verdict: AnswerFactCheckClaim["verdict"];
  confidence: number;
  expectedGateStatus: FactCheckGateStatus;
  evidenceText: string;
}): AnswerFactCheckGoldenCase {
  const evidenceId = "K1";
  return {
    name: input.name,
    input: {
      answerId: 100 + input.name.length,
      question: "답변의 핵심 근거를 설명해 주세요.",
      answerText: input.answerText,
      questionMode: "TECHNICAL_KNOWLEDGE",
      knowledgeSnapshotVersion: "NCS_FACT_GOLDEN_2026_07_V1",
      evidenceLedger: [{
        evidenceId,
        sourceKind: "KNOWLEDGE_SNAPSHOT",
        sourceSnapshotId: `golden:${input.name}`,
        startOffset: 0,
        endOffset: input.evidenceText.length,
        text: input.evidenceText,
      }],
    },
    claims: [{
      claimText: input.claimText,
      startOffset: input.answerText.indexOf(input.claimText),
      endOffset: input.answerText.indexOf(input.claimText) + input.claimText.length,
      claimType: input.claimType,
      claimRole: input.claimRole,
      verdict: input.verdict,
      confidence: input.confidence,
      evidenceIds: [evidenceId],
      rationale: `${input.name} golden 판정입니다.`,
    }],
    expectedGateStatus: input.expectedGateStatus,
  };
}
