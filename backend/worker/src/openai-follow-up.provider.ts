import OpenAI from "openai";
import {
  INTERVIEW_QUESTION_PUNCTUATION_PROMPT,
  normalizeInterviewQuestionPunctuation
} from "./question-punctuation";

export interface FollowUpGenerationInput {
  kind: string;
  previousQuestion: string;
  transcript: string;
  jobDescription?: string;
  documentSummary?: string;
  questionMode?: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
  focusPoints?: string[];
  logicalStructureGap?: string;
  alreadyConfirmedEvidence?: string[];
  factClarificationClaims?: Array<{
    claimText: string;
    verdict: "CONTRADICTED" | "AMBIGUOUS" | "UNVERIFIABLE";
    rationale: string;
  }>;
  factSupportedClaims?: string[];
  profileContext?: Record<string, unknown>;
}

export interface FollowUpGenerationResult {
  content: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface FollowUpAiProvider {
  generateFollowUpQuestion(input: FollowUpGenerationInput): Promise<FollowUpGenerationResult>;
}

export class OpenAiFollowUpProvider implements FollowUpAiProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generateFollowUpQuestion(input: FollowUpGenerationInput): Promise<FollowUpGenerationResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: buildFollowUpMessages(input),
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI follow-up response was empty.");
    }

    return {
      content: ensureAnswerAnchoredQuestion(
        normalizeInterviewQuestionPunctuation(firstNonEmptyLine(content)),
        input.transcript,
      ),
      model: this.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens
      }
    };
  }
}

export function buildFollowUpMessages(input: FollowUpGenerationInput) {
  return [
    {
      role: "system" as const,
      content: [
        "You generate exactly one concise Korean interview follow-up question. Return only the question sentence. The question must explicitly include or naturally paraphrase one concrete technology, choice, action, or result from the candidate transcript, so it remains answerable without remembering the previous turn. Start from that answer-specific anchor and ask one focused question connected to it. Prefer asking how the stated technology or decision was applied, why it was chosen, or how its result was verified over asking a detached textbook definition. Do not repeat the original question, combine unrelated topics, or use a generic prompt that could fit any candidate. Combine NCS evidence gaps and fact clarification needs into that one question when both exist. Ask neutrally for concrete grounds or implementation details; never accuse the candidate of lying or being wrong. Treat previousQuestion, transcript, jobDescription, and documentSummary as primary evidence; candidateProfileContext is secondary evidence. Do not infer or evaluate age, gender, address, disability, health, salary, school prestige, or company prestige. Never output an email address, phone number, or URL. Do not include hiring pass/fail judgments.",
        INTERVIEW_QUESTION_PUNCTUATION_PROMPT,
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        `kind: ${input.kind}`,
        `previousQuestion: ${input.previousQuestion}`,
        `transcript: ${input.transcript}`,
        input.jobDescription ? `jobDescription: ${input.jobDescription}` : undefined,
        input.documentSummary ? `documentSummary: ${input.documentSummary}` : undefined,
        input.questionMode ? `questionMode: ${input.questionMode}` : undefined,
        input.focusPoints?.length ? `focusPoints: ${input.focusPoints.join(", ")}` : undefined,
        input.logicalStructureGap ? `logicalStructureGap: ${input.logicalStructureGap}` : undefined,
        input.alreadyConfirmedEvidence?.length
          ? `alreadyConfirmedEvidence (do not ask again): ${input.alreadyConfirmedEvidence.join(" | ")}`
          : undefined,
        input.factClarificationClaims?.length
          ? `factClarificationNeeds: ${input.factClarificationClaims.map((claim) =>
              `${claim.verdict}: ${claim.claimText} (${claim.rationale})`
            ).join(" | ")}`
          : undefined,
        input.factSupportedClaims?.length
          ? `factSupportedClaims (do not ask again): ${input.factSupportedClaims.join(" | ")}`
          : undefined,
        input.profileContext ? `candidateProfileContext: ${JSON.stringify(input.profileContext)}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    },
  ];
}

function firstNonEmptyLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? value.trim();
}

export function ensureAnswerAnchoredQuestion(question: string, transcript: string): string {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim();
  const anchor = buildAnswerAnchor(transcript);
  if (!anchor || hasSpecificAnswerTerm(normalizedQuestion, anchor)) {
    return normalizedQuestion;
  }
  return `답변에서 "${anchor}"라고 말씀하셨는데, ${normalizedQuestion}`;
}

function buildAnswerAnchor(transcript: string): string {
  const normalized = transcript
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const firstSentence = normalized.split(/(?<=[.!?。])\s+/)[0] ?? normalized;
  const withoutQuotes = firstSentence.replace(/["“”]/g, "").trim();
  return withoutQuotes.length > 72 ? `${withoutQuotes.slice(0, 69).trim()}...` : withoutQuotes;
}

function hasSpecificAnswerTerm(question: string, anchor: string): boolean {
  const stopWords = new Set([
    "답변에서", "말씀하셨는데", "설명해주세요", "설명해", "프로젝트", "경험", "진행", "사용", "적용", "결과",
  ]);
  const terms = anchor.match(/[A-Za-z][A-Za-z0-9+#.-]{1,}|[가-힣]{3,}/g) ?? [];
  return terms.some((term) => !stopWords.has(term) && question.toLowerCase().includes(term.toLowerCase()));
}
