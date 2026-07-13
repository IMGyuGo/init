import OpenAI from "openai";
import { REPORT_SCORE_BANDS, SERVICE_INTERVIEW_RUBRIC, SERVICE_REPORT_POLICY } from "./service-interview-rubric";

export type ReportGenerationPolicy = "MOCK" | "RECRUITING";

export interface ReportGenerationCriterion {
  criterionId: number;
  name: string;
  description?: string;
  weight?: number;
}

export interface ReportGenerationAnswer {
  answerId: number;
  questionId?: number;
  question?: string;
  questionType?: "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
  sortOrder?: number;
  isFollowUpAnswer?: boolean;
  parentAnswerId?: number;
  transcript: string;
  evaluationStatus?: "EVALUATED" | "STT_UNAVAILABLE";
  transcriptUnavailableReason?: string;
  nonverbalMetadata?: ReportAnswerNonverbalMetadata;
}

export interface ReportAnswerNonverbalMetadata {
  cameraWarnings?: number;
  microphoneWarnings?: number;
  longSilenceCount?: number;
  shortAnswerCount?: number;
  testModeUsed?: boolean;
  voicePeakLevel?: number;
  lowAudioFrameCount?: number;
  observedAudioFrameCount?: number;
  cameraDisconnectedCount?: number;
  integrityEvents?: unknown[];
  integritySummary?: {
    screenAwayCount?: number;
    cameraLostCount?: number;
    faceMissingCount?: number;
    faceOutOfFrameCount?: number;
    multipleFacesCount?: number;
    facePositionShiftCount?: number;
    gazeAwayCount?: number;
    voiceMouthMismatchCount?: number;
    voiceWithoutFaceCount?: number;
    staticVideoFrameCount?: number;
    earlyScreenAwayCount?: number;
    faceDetectionSupported?: boolean;
    faceDetectionFrameCount?: number;
    personDetectionSupported?: boolean;
    personDetectionFrameCount?: number;
    gazeDetectionSupported?: boolean;
    gazeDetectionFrameCount?: number;
    mouthSyncSupported?: boolean;
    mouthSyncFrameCount?: number;
    mouthSyncMismatchFrameCount?: number;
    videoFrameMotionSupported?: boolean;
    videoFrameSampleCount?: number;
    staticVideoFrameSampleCount?: number;
    totalAwayDurationMs?: number;
    maxAwayDurationMs?: number;
    suspicionLevel?: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  };
  [key: string]: unknown;
}

export interface ReportGenerationInput {
  kind: string;
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";
  policy: ReportGenerationPolicy;
  companyName?: string;
  jobTitle?: string;
  jobRole?: string;
  postingId?: number;
  jobDescription: string;
  criteria: ReportGenerationCriterion[];
  answers: ReportGenerationAnswer[];
  documentText?: string;
}

export interface ReportGenerationResult {
  summary: string;
  feedback?: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ReportAiProvider {
  generateReport(input: ReportGenerationInput): Promise<ReportGenerationResult>;
}

export class OpenAiReportProvider implements ReportAiProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generateReport(input: ReportGenerationInput): Promise<ReportGenerationResult> {
    const reportAnswers = input.reportType === "RECRUITING_REPORT"
      ? input.answers.map(({ nonverbalMetadata: _nonverbalMetadata, ...answer }) => answer)
      : input.answers;
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write concise Korean interview reports. For recruiting reports, return JSON only with keys summary and reviewNote. For mock interview reports, return JSON only with keys summary and feedback. All JSON string values must be written in Korean. Evaluate only evidence found in answer transcripts, follow-up answer transcripts, JD, posting metadata, and submitted documents. For mock interview reports only, normalized nonverbalMetadata may be used as auxiliary practice metadata and never as a hiring signal. Treat integritySummary/integrityEvents as exam-integrity review signals only when they show screen/tab leaving, early screen leaving right after the question starts, camera loss, face missing or out of frame, audio continuing while no face is detected, multiple people detected by face or person-object detection, large face-position shift, long gaze away from the screen, static video frames, or voice-mouth mismatch where audio is detected while mouth movement is missing during recording. Never state that cheating is proven, and never claim identity verification from these signals. Treat microphoneWarnings/longSilenceCount/shortAnswerCount as recording or answer-quality signals only, not cheating. Do not use nonverbalMetadata to infer appearance, facial expression, voice tone, disability, health, age, gender, school, region, or other sensitive attributes. Do not score eye contact or communication quality from gaze data; use gaze only as a screen-away integrity signal. Do not claim that a voice is AI-generated; describe voice-mouth mismatch only as a possible recording/external-audio review signal. Recruiting report inputs must not contain nonverbalMetadata; if it is present, ignore it completely and do not use it in the summary, review note, or score. The reviewNote is an internal company review note, not candidate advice. Connect the evaluation to JD requirements and the confirmed question set, and never make a final hiring pass/fail judgment. For recruiting reports, do not quote raw STT text when it looks noisy or misrecognized; summarize the meaning conservatively and mention uncertainty instead. Avoid repeating the same strength in summary, score rationale, and review note. If an answer has evaluationStatus STT_UNAVAILABLE, state that it is temporarily scored as 0 because speech recognition failed and do not infer answer quality from it. Penalize very short answers, vague answers, missing results, missing owned actions, and transcripts that appear noisy or misrecognized. Do not infer or score sensitive attributes, appearance, facial expression, voice tone, age, gender, school, region, disability, or health. For mock interview reports, write practice feedback, and never mention acceptance, rejection, hiring fit, or pass/fail."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: input.reportType === "RECRUITING_REPORT"
              ? "Generate a short company-facing interview evaluation summary and one internal review note. Do not write candidate coaching feedback."
              : "Generate a short interview report summary and one practice feedback sentence.",
            serviceReportPolicy: SERVICE_REPORT_POLICY,
            serviceRubric: SERVICE_INTERVIEW_RUBRIC,
            scoreBands: REPORT_SCORE_BANDS,
            kind: input.kind,
            reportType: input.reportType,
            policy: input.policy,
            companyName: input.companyName,
            jobTitle: input.jobTitle,
            jobRole: input.jobRole,
            postingId: input.postingId,
            jobDescription: input.jobDescription,
            criteria: input.criteria,
            answers: reportAnswers,
            nonverbalMetadataPolicy: {
              usage: "MOCK_PRACTICE_AUXILIARY_ONLY",
              finalCheatingDecision: false,
              notHiringSignal: true,
              allowedFeedbackSignals: [
                "screen or tab leaving",
                "early screen leaving right after the question starts",
                "camera loss during recording",
                "face missing or out of frame",
                "audio input while no face is detected",
                "multiple people in frame (from face or person-object detection)",
                "large face-position shift",
                "long gaze away from screen",
                "static video frames",
                "voice-mouth mismatch during speech",
                "low microphone input",
                "long silence",
                "short answer"
              ],
              cheatingSuspicionSignalsOnly: [
                "screen or tab leaving",
                "early screen leaving right after the question starts",
                "camera loss during recording",
                "face missing or out of frame",
                "audio input while no face is detected",
                "multiple people in frame (from face or person-object detection)",
                "large face-position shift",
                "long gaze away from screen",
                "static video frames",
                "voice-mouth mismatch during speech"
              ],
              qualitySignalsOnly: [
                "low microphone input",
                "long silence",
                "short answer"
              ],
              prohibitedInferences: [
                "appearance",
                "facial expression",
                "voice tone",
                "sensitive attributes"
              ]
            },
            documentText: input.documentText
          })
        }
      ]
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI report response was empty.");
    }

    return {
      ...parseReportContent(content),
      model: this.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens
      }
    };
  }
}

function parseReportContent(content: string): Omit<ReportGenerationResult, "model"> {
  const jsonText = stripMarkdownFence(content);
  try {
    const parsed = JSON.parse(jsonText) as { summary?: unknown; feedback?: unknown; reviewNote?: unknown };
    const summary = normalizeText(parsed.summary);
    if (!summary) {
      throw new Error("summary is required");
    }
    return {
      summary,
      feedback: normalizeText(parsed.reviewNote) ?? normalizeText(parsed.feedback)
    };
  } catch {
    return {
      summary: firstNonEmptyLine(content)
    };
  }
}

function stripMarkdownFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function firstNonEmptyLine(content: string): string {
  return content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? content.trim();
}
