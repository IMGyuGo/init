import { createHash } from "node:crypto";
import {
  FACT_CHECK_INPUT_COMPOSITION_VERSIONS,
  type FactCheckInputCompositionVersion,
  FactCheckGateStatus,
  FactCheckProviderMode,
  FactCheckProviderStatus,
  FactCheckVerdict,
  FactClaimRole,
  FactClaimType,
  FactEvidenceSourceKind,
} from "./answer-fact-check.types";
import type { NcsTextEvaluationOutput } from "./ncs-text-evaluation.types";
import type { NcsFinalEvaluation } from "./ncs-final-evaluation";
import type { NcsApiProfileId } from "./ncs-question-alignment.adapter";
import { NonRetryableAiWorkerFailure } from "./worker-errors";
import type { AiWorkerJob, FailureCategory, FailureReason } from "./worker.types";

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

export interface ResumeQuestionJobReference {
  processLogId: number;
  applicationId: number;
  postingId: number;
  documentId: number;
  policyVersion: number;
  criteriaVersion: number;
  inputVersion: string;
  resumeDocumentHash: string;
  jdSnapshotHash: string;
  usageScope?: "STANDARD" | "DEMO_PRESET";
}

export interface ResumeQuestionGenerationCriterion {
  criterionId: number;
  name: string;
  category: string;
  description?: string;
  questionCount: number;
  ncsProfileId: NcsApiProfileId;
  ncsQuestionMode: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
  ncsProfileVersion: string;
  weight?: number;
}

export interface PersonalizedQuestionBindingRecord {
  criterionId: number;
  criterionTitleSnapshot: string;
  ncsProfileId: ResumeQuestionGenerationCriterion["ncsProfileId"];
  ncsProfileVersion: string;
  alignmentStatus: "ALIGNED" | "REVIEW_REQUIRED";
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
  bindingOrder: 1 | 2;
}

export interface ResumeQuestionGenerationContext extends ResumeQuestionJobReference {
  batchId: number;
  questionCount: number;
  jobDescription: string;
  resumeText: string;
  criteria: ResumeQuestionGenerationCriterion[];
  factualAnchor?: string | null;
}

export interface PersonalizedQuestionRecord {
  criterionId: number;
  criterionTitleSnapshot: string;
  questionType: "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
  content: string;
  ncsProfileId: ResumeQuestionGenerationCriterion["ncsProfileId"];
  ncsQuestionMode: ResumeQuestionGenerationCriterion["ncsQuestionMode"];
  ncsProfileVersion: string;
  alignmentStatus: "ALIGNED" | "REVIEW_REQUIRED";
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
  sortOrder: number;
  ncsBindings?: PersonalizedQuestionBindingRecord[];
}

export interface ResumeQuestionGenerationResult {
  reference: ResumeQuestionJobReference;
  status: "READY" | "REVIEW_REQUIRED" | "FAILED";
  evaluatorVersion: string | null;
  failureReason: string | null;
  questions: PersonalizedQuestionRecord[];
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
  required: boolean;
  content?: string;
  policy: "MOCK" | "RECRUITING";
  reason?: "NCS_EVIDENCE_GAP" | "FACT_CLARIFICATION" | "GENERAL_EVIDENCE_GAP";
  questionMode?: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
  answerTimeSec?: number;
  usageScope?: "STANDARD" | "DEMO_PRESET";
}

export interface GeneratedDraftRecord {
  kind: string;
  sourceProcessLogId: number;
  providerMode?: "mock" | "openai";
  providerSource?: string;
  model?: string;
  items: string[];
  postingDraft?: {
    title: string;
    jobRole: string;
    sections: Record<string, string>;
    tags: string[];
  };
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
    source?: "JD_CRITERIA";
    ncsProfileId?: NcsApiProfileId | null;
    ncsQuestionMode?: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN" | null;
    ncsProfileVersion?: string | null;
    alignmentStatus?: "NOT_EVALUATED" | "ALIGNED" | "LOW_ALIGNMENT" | "REVIEW_REQUIRED";
    alignmentScore?: number | null;
    alignmentReason?: string | null;
    evaluatorVersion?: string | null;
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
  targetTables: Array<"criterion_tags" | "evaluation_criteria" | "question_bank" | "postings">;
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

export interface NcsAnswerEvaluationRecord {
  reportId: number;
  answerId: number;
  sessionQuestionId: number;
  criterionId: number;
  criterionTitleSnapshot: string;
  ncsProfileId: "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING";
  ncsQuestionMode: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
  ncsProfileVersion: string;
  output: NcsTextEvaluationOutput;
  question: string;
  behaviorPoints: number | null;
  logicPoints: number | null;
  baseScore: number | null;
  effectiveScore: number | null;
  followUpApplied: boolean;
  evidences: Array<{
    sourceAnswerId: number;
    sourceKind: "BASE" | "FOLLOW_UP";
    quote: string;
  }>;
}

export interface AnswerFactCheckEvidenceRecord {
  evidenceLedgerId: string;
  sourceSnapshotId: string;
  sourceKind: FactEvidenceSourceKind;
  sourceStartOffset: number;
  sourceEndOffset: number;
}

export interface AnswerFactCheckClaimRecord {
  claimText: string;
  answerStartOffset: number;
  answerEndOffset: number;
  claimType: FactClaimType;
  claimRole: FactClaimRole;
  verdict: FactCheckVerdict;
  confidence: number;
  rationale: string;
  evidences: AnswerFactCheckEvidenceRecord[];
}

export interface AnswerFactCheckRunRecord {
  reportId: number;
  answerId: number;
  followUpAnswerId?: number;
  inputCompositionVersion: FactCheckInputCompositionVersion;
  providerStatus: FactCheckProviderStatus;
  gateStatus: FactCheckGateStatus | null;
  providerMode: FactCheckProviderMode;
  modelVersion: string;
  promptVersion: string;
  knowledgeSnapshotVersion: string;
  policyVersion: string;
  failureReason: string | null;
  startedAt: string;
  completedAt: string | null;
  claims: AnswerFactCheckClaimRecord[];
}

export type ReportAnswerEvaluationStatusRecord = "EVALUATED" | "STT_UNAVAILABLE";

export const DEFAULT_STT_UNAVAILABLE_REASON =
  "STT transcript is unavailable because speech recognition failed.";

export interface GeneratedReportRecord {
  reportId: number;
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";
  applicationId?: number;
  sessionId?: number;
  summary: string;
  totalScore: number | null;
  scores: GeneratedReportScoreRecord[];
  questionEvaluations: GeneratedQuestionEvaluationRecord[];
  ncsAnswerEvaluations?: NcsAnswerEvaluationRecord[];
  answerFactChecks?: AnswerFactCheckRunRecord[];
  ncsFinalEvaluation?: NcsFinalEvaluation;
  hasTerminalSttUnavailable?: boolean;
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
  ncsAnswerEvaluations?: NcsAnswerEvaluationRecord[];
  answerFactChecks?: AnswerFactCheckRunRecord[];
}

export interface FailedReportRecord {
  processLogId: number;
  reportId: number;
  reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT";
  applicationId?: number;
  sessionId?: number;
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
  saveDocumentExtraction(record: DocumentExtractionRecord): Promise<AiWorkerJob[]>;
  markDocumentExtractionFailed(record: FailedDocumentExtractionRecord): Promise<void>;
  loadResumeQuestionGenerationContext(reference: ResumeQuestionJobReference): Promise<ResumeQuestionGenerationContext>;
  saveResumeQuestionGeneration(record: ResumeQuestionGenerationResult): Promise<void>;
  markResumeQuestionGenerationFailed(reference: ResumeQuestionJobReference, failure: FailureReason): Promise<void>;
  saveTranscript(record: TranscriptRecord): Promise<void>;
  saveFollowUpQuestion(record: FollowUpQuestionRecord): Promise<void>;
  saveGeneratedDraft(record: GeneratedDraftRecord): Promise<void>;
  saveReportScoresAndEvidences(record: ReportScoresRecord): Promise<void>;
  saveAnswerFactChecks(reportId: number, records: AnswerFactCheckRunRecord[]): Promise<void>;
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
  readonly ncsAnswerEvaluations = new Map<number, NcsAnswerEvaluationRecord[]>();
  readonly answerFactChecks = new Map<number, AnswerFactCheckRunRecord[]>();
  readonly communicationAnalyses = new Map<number, CommunicationAnalysisRecord>();
  readonly generatedReports = new Map<number, GeneratedReportRecord>();
  readonly failedReports = new Map<number, FailedReportRecord>();
  readonly embeddings = new Map<string, EmbeddingRecord>();
  readonly resumeQuestionContexts = new Map<string, ResumeQuestionGenerationContext>();
  readonly resumeQuestionResults = new Map<number, ResumeQuestionGenerationResult>();
  readonly failedResumeQuestions = new Map<number, FailureReason>();
  readonly scopedResumeQuestionResults = new Map<string, ResumeQuestionGenerationResult>();
  readonly scopedFailedResumeQuestions = new Map<string, FailureReason>();

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

  async saveDocumentExtraction(record: DocumentExtractionRecord): Promise<AiWorkerJob[]> {
    if (this.documentExtractionsById.has(record.documentId)) {
      return [];
    }

    this.documentExtractionsById.set(record.documentId, record);
    this.documentExtractions.push(record);
    this.documentParseStatuses.set(record.documentId, "EXTRACTED");
    this.documentParseStatusEvents.push({ documentId: record.documentId, fileId: record.fileId, status: "EXTRACTED" });
    return [];
  }

  setResumeQuestionGenerationContext(context: ResumeQuestionGenerationContext): void {
    this.resumeQuestionContexts.set(context.inputVersion, context);
  }

  async loadResumeQuestionGenerationContext(reference: ResumeQuestionJobReference): Promise<ResumeQuestionGenerationContext> {
    const context = this.resumeQuestionContexts.get(reference.inputVersion);
    if (!context || context.processLogId !== reference.processLogId || context.applicationId !== reference.applicationId) {
      throw new NonRetryableAiWorkerFailure("resume question generation context was not found");
    }
    return context;
  }

  async saveResumeQuestionGeneration(record: ResumeQuestionGenerationResult): Promise<void> {
    const key = resumeQuestionResultKey(record.reference);
    this.scopedResumeQuestionResults.set(key, record);
    if ((record.reference.usageScope ?? "STANDARD") === "STANDARD") {
      this.resumeQuestionResults.set(record.reference.applicationId, record);
    }
    if (record.status === "FAILED") {
      const failure = {
        category: "NON_RETRYABLE",
        reason: record.failureReason ?? "resume question generation failed",
        retryable: false,
      } as const;
      this.scopedFailedResumeQuestions.set(key, failure);
      if ((record.reference.usageScope ?? "STANDARD") === "STANDARD") {
        this.failedResumeQuestions.set(record.reference.applicationId, failure);
      }
    } else {
      this.scopedFailedResumeQuestions.delete(key);
      if ((record.reference.usageScope ?? "STANDARD") === "STANDARD") {
        this.failedResumeQuestions.delete(record.reference.applicationId);
      }
    }
  }

  async markResumeQuestionGenerationFailed(reference: ResumeQuestionJobReference, failure: FailureReason): Promise<void> {
    this.scopedFailedResumeQuestions.set(resumeQuestionResultKey(reference), failure);
    if ((reference.usageScope ?? "STANDARD") === "STANDARD") {
      this.failedResumeQuestions.set(reference.applicationId, failure);
    }
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
    if (record.ncsAnswerEvaluations) {
      this.ncsAnswerEvaluations.set(record.reportId, record.ncsAnswerEvaluations);
    }
    if (record.answerFactChecks) {
      await this.saveAnswerFactChecks(record.reportId, record.answerFactChecks);
    }
  }

  async saveAnswerFactChecks(reportId: number, records: AnswerFactCheckRunRecord[]): Promise<void> {
    assertAnswerFactCheckRecords(reportId, records);
    this.answerFactChecks.set(reportId, structuredClone(records));
  }

  async saveCommunicationAnalysis(record: CommunicationAnalysisRecord): Promise<void> {
    this.communicationAnalyses.set(record.reportId, record);
  }

  async saveGeneratedReport(record: GeneratedReportRecord): Promise<void> {
    assertScoresHaveEvidence(record.scores);
    if (record.questionEvaluations.length > 0) {
      assertQuestionEvaluationsHaveEvidence(record.questionEvaluations);
    }
    await this.saveReportScoresAndEvidences({
      reportId: record.reportId,
      scores: record.scores,
      ncsAnswerEvaluations: record.ncsAnswerEvaluations,
      answerFactChecks: record.answerFactChecks,
    });
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

function resumeQuestionResultKey(reference: Pick<ResumeQuestionJobReference, "applicationId" | "usageScope">): string {
  return `${reference.applicationId}:${reference.usageScope ?? "STANDARD"}`;
}

export function hashSourceText(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

export function assertAnswerFactCheckRecords(reportId: number, records: AnswerFactCheckRunRecord[]): void {
  if (records.some((record) => record.reportId !== reportId)) {
    throw new NonRetryableAiWorkerFailure("fact-check reportId mismatch");
  }
  const keys = new Set<string>();
  for (const record of records) {
    const key = `${record.answerId}:${record.policyVersion}`;
    if (keys.has(key)) {
      throw new NonRetryableAiWorkerFailure("duplicate fact-check answer policy record");
    }
    keys.add(key);
    const completed = record.providerStatus === "COMPLETED";
    const combined = record.inputCompositionVersion === "BASE_FOLLOW_UP_V1";
    if (
      !Number.isSafeInteger(record.answerId) || record.answerId <= 0 ||
      !(FACT_CHECK_INPUT_COMPOSITION_VERSIONS as readonly string[]).includes(record.inputCompositionVersion) ||
      (combined && (!Number.isSafeInteger(record.followUpAnswerId) || record.followUpAnswerId! <= 0 || record.followUpAnswerId === record.answerId)) ||
      (!combined && record.followUpAnswerId !== undefined) ||
      !record.modelVersion.trim() || !record.promptVersion.trim() ||
      !record.knowledgeSnapshotVersion.trim() || !record.policyVersion.trim() ||
      !validIsoDate(record.startedAt) || (record.completedAt !== null && !validIsoDate(record.completedAt)) ||
      (completed && (record.gateStatus === null || record.failureReason !== null)) ||
      (!completed && (record.gateStatus !== null || !record.failureReason?.trim() || record.claims.length > 0))
    ) {
      throw new NonRetryableAiWorkerFailure(`invalid fact-check run for answer ${record.answerId}`);
    }
    record.claims.forEach((claim, claimIndex) => {
      if (
        !claim.claimText || !claim.rationale.trim() ||
        !Number.isSafeInteger(claim.answerStartOffset) || !Number.isSafeInteger(claim.answerEndOffset) ||
        claim.answerStartOffset < 0 || claim.answerEndOffset <= claim.answerStartOffset ||
        !Number.isFinite(claim.confidence) || claim.confidence < 0 || claim.confidence > 1
      ) {
        throw new NonRetryableAiWorkerFailure(`invalid fact-check claim ${claimIndex + 1} for answer ${record.answerId}`);
      }
      const evidenceIds = new Set<string>();
      for (const evidence of claim.evidences) {
        if (
          !evidence.evidenceLedgerId.trim() || !evidence.sourceSnapshotId.trim() ||
          evidenceIds.has(evidence.evidenceLedgerId) ||
          !Number.isSafeInteger(evidence.sourceStartOffset) || !Number.isSafeInteger(evidence.sourceEndOffset) ||
          evidence.sourceStartOffset < 0 || evidence.sourceEndOffset <= evidence.sourceStartOffset
        ) {
          throw new NonRetryableAiWorkerFailure(`invalid fact-check evidence for answer ${record.answerId}`);
        }
        evidenceIds.add(evidence.evidenceLedgerId);
      }
      if ((claim.verdict === "SUPPORTED" || claim.verdict === "CONTRADICTED") && claim.evidences.length === 0) {
        throw new NonRetryableAiWorkerFailure(`${claim.verdict} fact-check claim requires evidence`);
      }
    });
  }
}

function validIsoDate(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}
