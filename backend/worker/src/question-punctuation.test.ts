import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiFollowUpProvider } from "./openai-follow-up.provider";
import { OpenAiQuestionProvider } from "./openai-question.provider";
import { normalizeInterviewQuestionPunctuation } from "./question-punctuation";

test("answer request uses a period instead of a forced question mark", () => {
  assert.equal(
    normalizeInterviewQuestionPunctuation("구체적인 사례를 들어 설명해 주세요.?"),
    "구체적인 사례를 들어 설명해 주세요."
  );
});

test("direct question uses a question mark even when the model returns a period", () => {
  assert.equal(
    normalizeInterviewQuestionPunctuation("이 직무에서 필요한 기술은 무엇인가요."),
    "이 직무에서 필요한 기술은 무엇인가요?"
  );
  assert.equal(
    normalizeInterviewQuestionPunctuation("어떻게 해결했나요"),
    "어떻게 해결했나요?"
  );
});

test("ambiguous or unsupported endings default to a period", () => {
  assert.equal(
    normalizeInterviewQuestionPunctuation("관련 경험을 정리한 문장"),
    "관련 경험을 정리한 문장."
  );
  assert.equal(
    normalizeInterviewQuestionPunctuation("관련 경험입니다!"),
    "관련 경험입니다."
  );
});

test("trailing punctuation remains contextual when punctuation marks contain spaces", () => {
  assert.equal(
    normalizeInterviewQuestionPunctuation("  구체적으로   설명해 주세요 . ?  "),
    "구체적으로 설명해 주세요."
  );
});

test("only the final punctuation changes in a multi-sentence answer request", () => {
  assert.equal(
    normalizeInterviewQuestionPunctuation(
      "새로운 기술을 익힐 때 어떤 방법을 사용하나요? 구체적인 예를 들어 설명해 주세요.?"
    ),
    "새로운 기술을 익힐 때 어떤 방법을 사용하나요? 구체적인 예를 들어 설명해 주세요."
  );
});

test("valid punctuation is preserved and full-width punctuation is normalized", () => {
  assert.equal(normalizeInterviewQuestionPunctuation("관련 경험입니다."), "관련 경험입니다.");
  assert.equal(normalizeInterviewQuestionPunctuation("추가로 확인할 내용이 있나요?"), "추가로 확인할 내용이 있나요?");
  assert.equal(normalizeInterviewQuestionPunctuation("관련 경험입니다。"), "관련 경험입니다.");
  assert.equal(normalizeInterviewQuestionPunctuation("사용한 기술은 무엇인가요？！"), "사용한 기술은 무엇인가요?");
  assert.equal(normalizeInterviewQuestionPunctuation("   "), "");
});

test("question provider applies contextual punctuation to generated candidates", async () => {
  const provider = new OpenAiQuestionProvider("test-key", "test-model");
  Object.defineProperty(provider, "client", {
    value: openAiClientReturning(JSON.stringify({
      questionCandidates: [{
        content: "구체적인 사례를 들어 설명해 주세요.?",
        category: "직무역량",
        difficulty: "MEDIUM",
        criterionId: 1,
        expectedKeywords: ["사례"],
        suggestionReason: "경험을 확인합니다.",
        questionType: "EXPERIENCE"
      }]
    }))
  });

  const result = await provider.generateQuestions({
    kind: "RECRUITING_QUESTION_GENERATE",
    postingId: 1,
    jobDescription: "백엔드 개발자",
    questionCount: 1,
    criteria: [{ criterionId: 1, name: "문제 해결력", category: "직무역량" }]
  });

  assert.equal(result.questionCandidates[0]?.content, "구체적인 사례를 들어 설명해 주세요.");
});

test("follow-up provider keeps its first-line behavior and applies contextual punctuation", async () => {
  const provider = new OpenAiFollowUpProvider("test-key", "test-model");
  Object.defineProperty(provider, "client", {
    value: openAiClientReturning("답변에서 언급한 선택 이유를 설명해 주세요.?\n추가 문장")
  });

  const result = await provider.generateFollowUpQuestion({
    kind: "RECRUITING_FOLLOW_UP",
    previousQuestion: "사용한 기술은 무엇인가요?",
    transcript: "NestJS를 사용했습니다."
  });

  assert.equal(result.content, "답변에서 언급한 선택 이유를 설명해 주세요.");
});

test("question and follow-up prompts distinguish direct questions from answer requests", async () => {
  const capturedRequests: Array<Record<string, unknown>> = [];
  const questionProvider = new OpenAiQuestionProvider("test-key", "test-model");
  Object.defineProperty(questionProvider, "client", {
    value: openAiClientReturning(JSON.stringify({
      questionCandidates: [{
        content: "사용한 기술은 무엇인가요?",
        category: "직무역량",
        difficulty: "MEDIUM",
        criterionId: 1,
        expectedKeywords: ["기술"],
        suggestionReason: "기술 경험을 확인합니다."
      }]
    }), (request) => capturedRequests.push(request))
  });
  await questionProvider.generateQuestions({
    kind: "RECRUITING_QUESTION_GENERATE",
    postingId: 1,
    jobDescription: "백엔드 개발자",
    questionCount: 1,
    criteria: [{ criterionId: 1, name: "직무 적합성" }]
  });

  const followUpProvider = new OpenAiFollowUpProvider("test-key", "test-model");
  Object.defineProperty(followUpProvider, "client", {
    value: openAiClientReturning("선택 이유를 설명해 주세요.", (request) => capturedRequests.push(request))
  });
  await followUpProvider.generateFollowUpQuestion({
    kind: "RECRUITING_FOLLOW_UP",
    previousQuestion: "사용한 기술은 무엇인가요?",
    transcript: "NestJS를 사용했습니다."
  });

  for (const request of capturedRequests) {
    const systemPrompt = systemPromptOf(request);
    assert.match(systemPrompt, /direct interrogative.*\?/i);
    assert.match(systemPrompt, /answer request.*\./i);
  }
});

function openAiClientReturning(content: string, capture?: (request: Record<string, unknown>) => void) {
  return {
    chat: {
      completions: {
        async create(request: Record<string, unknown>) {
          capture?.(request);
          return {
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 }
          };
        }
      }
    }
  };
}

function systemPromptOf(request: Record<string, unknown>): string {
  const messages = request.messages;
  if (!Array.isArray(messages) || !messages[0] || typeof messages[0] !== "object") {
    return "";
  }
  const content = (messages[0] as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}
