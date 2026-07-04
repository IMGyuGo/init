import { createHash } from "node:crypto";
import { NonRetryableAiWorkerFailure } from "./worker-errors";
import type { FailureCategory } from "./worker.types";

export interface DocumentExtractionRecord {
  documentId: number;
  fileId: number;
  s3Key: string;
  extractedText: string;
}

export interface DocumentExtractionStatusRecord {
  documentId: number;
  fileId?: number;
}

export interface FailedDocumentExtractionRecord {
  documentId: number;
  fileId?: number;
}

export interface TranscriptRecord {
  answerId: number;
  audioFileId: number;
  audioS3Key: string;
  transcript: string;
}

export interface FollowUpQuestionRecord {
  sessionId: number;
  answerId: number;
  content: string;
  policy: "MOCK" | "RECRUITING";
}

export interface GeneratedDraftRecord {
  kind: string;
  sourceProcessLogId: number;
  items: string[];
  criteriaSuggestions?: Array<{
    title: string;
    description: string;
    weight: number;
    order: number;
    suggestionReason: string;
    category?: string;
  }>;
  questionCandidates?: Array<{
    content: string;
    category: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    criterionId?: number;
    criterionTitle?: string;
    expectedKeywords: string[];
    suggestionReason: string;
    questionType?: string;
  }>;
  questionSetPreview?: Array<{
    criterionId?: number;
    criterionTitle: string;
    questions: Array<{
      content: string;
      category: string;
      difficulty: "EASY" | "MEDIUM" | "HARD";
      criterionId?: number;
      criterionTitle?: string;
      expectedKeywords: string[];
      suggestionReason: string;
      questionType?: string;
    }>;
  }>;
  reviewRequired: true;
  reviewStatus: "PENDING_REVIEW";
  targetTables: Array<"criterion_tags" | "evaluation_criteria" | "question_bank">;
  postingId?: number;
}

export interface GeneratedReportEvidenceRecord {
  sourceType: "INTERVIEW_ANSWER" | "APPLICATION_DOCUMENT";
  answerId?: number;
  documentId?: number;
  documentRef?: string;
  text: string;
}

export type GeneratedReportConfidenceRecord = "HIGH" | "MEDIUM" | "LOW";

export interface GeneratedReportScoreRecord {
  criterionId: number;
  criterionName: string;
  score: number;
  rationale: string;
  rubricAnchor: string;
  confidence: GeneratedReportConfidenceRecord;
  uncertaintyReasons: string[];
  evidences: GeneratedReportEvidenceRecord[];
}

export interface GeneratedQuestionEvaluationRecord {
  criterionId: number;
  criterionName: string;
  answerId: number;
  question: string;
  rubricAnchor: string;
  confidence: GeneratedReportConfidenceRecord;
  uncertaintyReasons: string[];
  evidences: GeneratedReportEvidenceRecord[];
}

export type ReportAnswerEvaluationStatusRecord = "EVALUATED" | "STT_UNAVAILABLE";

export const STT_UNAVAILABLE_TEMP_ZERO_REASON =
  "STT transcript is unavailable; this answer is temporarily scored as 0 because speech recognition failed, not because of answer quality.";

export interface GeneratedReportRecord {
  reportId: number;
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";
  summary: string;
  totalScore: number;
  scores: GeneratedReportScoreRecord[];
  questionEvaluations: GeneratedQuestionEvaluationRecord[];
}

export interface CommunicationAnalysisRecord {
  processLogId: number;
  reportId: number;
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";
  analysis: {
    usage: "AUXILIARY_ONLY";
    mediaQuality: string;
    metrics: Record<string, unknown>;
    notes: string[];
    decisionWeight: 0;
  };
}

export interface ReportScoresRecord {
  reportId: number;
  scores: GeneratedReportScoreRecord[];
}

export interface FailedReportRecord {
  reportId: number;
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";
  failureCategory: FailureCategory;
  failureReason: string;
}

export interface EmbeddingRecord {
  sourceType: string;
  sourceTextHash: string;
  embeddingModel: string;
  embeddingDimension: number;
  metadataJson?: string;
}

export interface AiResultRepository {
  markDocumentExtractionStarted(record: DocumentExtractionStatusRecord): Promise<void>;
  saveDocumentExtraction(record: DocumentExtractionRecord): Promise<void>;
  markDocumentExtractionFailed(record: FailedDocumentExtractionRecord): Promise<void>;
  saveTranscript(record: TranscriptRecord): Promise<void>;
  saveFollowUpQuestion(record: FollowUpQuestionRecord): Promise<void>;
  saveGeneratedDraft(record: GeneratedDraftRecord): Promise<void>;
  saveReportScoresAndEvidences(record: ReportScoresRecord): Promise<void>;
  saveCommunicationAnalysis(record: CommunicationAnalysisRecord): Promise<void>;
  saveGeneratedReport(record: GeneratedReportRecord): Promise<void>;
  markReportFailed(record: FailedReportRecord): Promise<void>;
  upsertEmbedding(record: Omit<EmbeddingRecord, "sourceTextHash"> & { sourceText: string }): Promise<EmbeddingRecord>;
}

export function assertScoresHaveEvidence(scores: GeneratedReportScoreRecord[]): void {
  for (const score of scores) {
    if (!score.rubricAnchor?.trim()) {
      throw new NonRetryableAiWorkerFailure(`rubric anchor is required for criterion ${score.criterionId}`);
    }

    if (!["HIGH", "MEDIUM", "LOW"].includes(score.confidence)) {
      throw new NonRetryableAiWorkerFailure(`confidence is required for criterion ${score.criterionId}`);
    }

    if (!Array.isArray(score.uncertaintyReasons)) {
      throw new NonRetryableAiWorkerFailure(`uncertainty reasons are required for criterion ${score.criterionId}`);
    }

    if (!score.rationale.trim()) {
      throw new NonRetryableAiWorkerFailure(`rationale is required for criterion ${score.criterionId}`);
    }

    if (score.evidences.length === 0 || score.evidences.some((evidence) => !evidence.text.trim())) {
      throw new NonRetryableAiWorkerFailure(`evidence is required for criterion ${score.criterionId}`);
    }
  }
}

export function assertQuestionEvaluationsHaveEvidence(questionEvaluations: GeneratedQuestionEvaluationRecord[]): void {
  if (!Array.isArray(questionEvaluations) || questionEvaluations.length === 0) {
    throw new NonRetryableAiWorkerFailure("question evaluations are required");
  }

  for (const evaluation of questionEvaluations) {
    if (!evaluation.answerId || !evaluation.question?.trim()) {
      throw new NonRetryableAiWorkerFailure(`question evaluation source is required for criterion ${evaluation.criterionId}`);
    }
    if (!evaluation.rubricAnchor?.trim()) {
      throw new NonRetryableAiWorkerFailure(
        `question evaluation rubric anchor is required for criterion ${evaluation.criterionId}`
      );
    }
    if (!["HIGH", "MEDIUM", "LOW"].includes(evaluation.confidence)) {
      throw new NonRetryableAiWorkerFailure(
        `question evaluation confidence is required for criterion ${evaluation.criterionId}`
      );
    }
    if (!Array.isArray(evaluation.uncertaintyReasons)) {
      throw new NonRetryableAiWorkerFailure(
        `question evaluation uncertainty reasons are required for criterion ${evaluation.criterionId}`
      );
    }
    if (evaluation.uncertaintyReasons.some((reason) => !reason.trim())) {
      throw new NonRetryableAiWorkerFailure(
        `question evaluation uncertainty reasons must be non-empty for criterion ${evaluation.criterionId}`
      );
    }
    if (
      !Array.isArray(evaluation.evidences) ||
      evaluation.evidences.length === 0 ||
      evaluation.evidences.some((evidence) => !evidence.text.trim())
    ) {
      throw new NonRetryableAiWorkerFailure(`question evaluation evidence is required for criterion ${evaluation.criterionId}`);
    }
  }
}

export class InMemoryAiResultRepository implements AiResultRepository {
  readonly documentExtractions: DocumentExtractionRecord[] = [];
  readonly documentParseStatuses = new Map<number, "EXTRACTING" | "EXTRACTED" | "FAILED">();
  readonly documentParseStatusEvents: Array<{
    documentId: number;
    fileId?: number;
    status: "EXTRACTING" | "EXTRACTED" | "FAILED";
  }> = [];
  readonly transcripts: TranscriptRecord[] = [];
  readonly followUpQuestions: FollowUpQuestionRecord[] = [];
  readonly generatedDrafts: GeneratedDraftRecord[] = [];
  readonly reportScores = new Map<number, GeneratedReportScoreRecord[]>();
  readonly communicationAnalyses = new Map<number, CommunicationAnalysisRecord>();
  readonly generatedReports = new Map<number, GeneratedReportRecord>();
  readonly failedReports = new Map<number, FailedReportRecord>();
  readonly embeddings = new Map<string, EmbeddingRecord>();

  private readonly documentExtractionsById = new Map<number, DocumentExtractionRecord>();
  private readonly transcriptsByAnswerId = new Map<number, TranscriptRecord>();
  private readonly followUpQuestionsByKey = new Map<string, FollowUpQuestionRecord>();

  async markDocumentExtractionStarted(record: DocumentExtractionStatusRecord): Promise<void> {
    if (this.documentParseStatuses.get(record.documentId) === "EXTRACTED") {
      return;
    }

    this.documentParseStatuses.set(record.documentId, "EXTRACTING");
    this.documentParseStatusEvents.push({ documentId: record.documentId, fileId: record.fileId, status: "EXTRACTING" });
  }

  async saveDocumentExtraction(record: DocumentExtractionRecord): Promise<void> {
    if (this.documentExtractionsById.has(record.documentId)) {
      return;
    }

    this.documentExtractionsById.set(record.documentId, record);
    this.documentExtractions.push(record);
    this.documentParseStatuses.set(record.documentId, "EXTRACTED");
    this.documentParseStatusEvents.push({ documentId: record.documentId, fileId: record.fileId, status: "EXTRACTED" });
  }

  async markDocumentExtractionFailed(record: FailedDocumentExtractionRecord): Promise<void> {
    if (this.documentParseStatuses.get(record.documentId) === "EXTRACTED") {
      return;
    }

    this.documentParseStatuses.set(record.documentId, "FAILED");
    this.documentParseStatusEvents.push({ documentId: record.documentId, fileId: record.fileId, status: "FAILED" });
  }

  async saveTranscript(record: TranscriptRecord): Promise<void> {
    if (this.transcriptsByAnswerId.has(record.answerId)) {
      return;
    }

    this.transcriptsByAnswerId.set(record.answerId, record);
    this.transcripts.push(record);
  }

  async saveFollowUpQuestion(record: FollowUpQuestionRecord): Promise<void> {
    const key = `${record.policy}:${record.sessionId}:${record.answerId}`;
    if (this.followUpQuestionsByKey.has(key)) {
      return;
    }

    this.followUpQuestionsByKey.set(key, record);
    this.followUpQuestions.push(record);
  }

  async saveGeneratedDraft(record: GeneratedDraftRecord): Promise<void> {
    this.generatedDrafts.push(record);
  }

  async saveReportScoresAndEvidences(record: ReportScoresRecord): Promise<void> {
    assertScoresHaveEvidence(record.scores);
    this.reportScores.set(record.reportId, record.scores);
  }

  async saveCommunicationAnalysis(record: CommunicationAnalysisRecord): Promise<void> {
    this.communicationAnalyses.set(record.reportId, record);
  }

  async saveGeneratedReport(record: GeneratedReportRecord): Promise<void> {
    assertScoresHaveEvidence(record.scores);
    assertQuestionEvaluationsHaveEvidence(record.questionEvaluations);
    await this.saveReportScoresAndEvidences({ reportId: record.reportId, scores: record.scores });
    this.generatedReports.set(record.reportId, record);
    this.failedReports.delete(record.reportId);
  }

  async markReportFailed(record: FailedReportRecord): Promise<void> {
    this.failedReports.set(record.reportId, record);
  }

  async upsertEmbedding(record: Omit<EmbeddingRecord, "sourceTextHash"> & { sourceText: string }): Promise<EmbeddingRecord> {
    const sourceTextHash = hashSourceText(record.sourceText);
    const key = `${record.sourceType}:${sourceTextHash}`;
    const existing = this.embeddings.get(key);
    if (existing) {
      return existing;
    }

    const created: EmbeddingRecord = {
      sourceType: record.sourceType,
      sourceTextHash,
      embeddingModel: record.embeddingModel,
      embeddingDimension: record.embeddingDimension,
      metadataJson: record.metadataJson
    };
    this.embeddings.set(key, created);
    return created;
  }
}

export function hashSourceText(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}
