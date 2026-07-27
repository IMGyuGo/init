export const NCS_TEXT_EVALUATION_KIND = "NCS_TEXT_EVALUATION_PLAYGROUND_V1" as const;
export const NCS_TEXT_EVALUATION_RUBRIC_VERSION = "ncs-evidence-growth-v1" as const;
export const NCS_PROFILE_VERSION = "2025.12-v1" as const;
export const NCS_TEXT_EVALUATION_PROMPT_VERSION = "ncs-text-evaluation-playground-v1" as const;

export type NcsTextEvaluationKind = typeof NCS_TEXT_EVALUATION_KIND;
export type NcsProfileId = "problem-solving" | "communication" | "digital";
export type NcsQuestionMode =
  | "EXPERIENCE_BEHAVIOR"
  | "TECHNICAL_KNOWLEDGE"
  | "SITUATIONAL_DESIGN";
export type NcsEvaluationConfidence = "HIGH" | "MEDIUM" | "LOW";
export type NcsScoreStatus = "SCORED" | "INSUFFICIENT_INPUT" | "LOW_ALIGNMENT" | "BLOCKED";
export type NcsProviderMode = "mock" | "openai" | "fixed";
export type NcsCompetencyLevel = 1 | 2 | 3 | 4 | 5;
export type NcsEvidenceDimensionScore = 0 | 1 | 2;

export type NcsBehaviorId =
  | "problem-analysis"
  | "alternative-selection"
  | "result-validation"
  | "structured-explanation"
  | "audience-adjustment"
  | "interaction-confirmation"
  | "technical-principle"
  | "practical-application"
  | "risk-validation";

export type NcsEvidenceDimensionId =
  | "situation-task"
  | "owned-action"
  | "result-impact"
  | "reflection-transfer"
  | "concept-accuracy"
  | "causal-reasoning"
  | "technical-application"
  | "technical-risk-validation"
  | "problem-constraints"
  | "alternatives-tradeoffs"
  | "execution-plan"
  | "validation-adaptation";

export interface NcsTextEvaluationInput {
  questionMode: NcsQuestionMode;
  question: string;
  answerText: string;
  profileIds: NcsProfileId[];
}

export interface NcsBehaviorAssessmentDraft {
  behaviorId: NcsBehaviorId;
  observed: boolean;
  confidence: NcsEvaluationConfidence;
  rationale: string;
  evidenceQuotes: string[];
}

export interface NcsCompetencyAssessmentDraft {
  profileId: NcsProfileId;
  level: NcsCompetencyLevel;
  confidence: NcsEvaluationConfidence;
  rationale: string;
  behaviors: NcsBehaviorAssessmentDraft[];
}

export interface NcsEvidenceDimensionDraft {
  dimensionId: NcsEvidenceDimensionId;
  score: NcsEvidenceDimensionScore;
  confidence: NcsEvaluationConfidence;
  rationale: string;
  evidenceQuotes: string[];
}

export interface NcsSharedEvidenceDraft {
  quote: string;
  usedBy: string[];
  reason: string;
}

export interface NcsGrowthFeedback {
  strengths: string[];
  gaps: string[];
  nextAction: string;
  followUpQuestion: string;
}

export interface NcsTextEvaluationDraft {
  competencies: NcsCompetencyAssessmentDraft[];
  evidenceDimensions: NcsEvidenceDimensionDraft[];
  sharedEvidence: NcsSharedEvidenceDraft[];
  growth: NcsGrowthFeedback;
}

export interface NcsBehaviorAssessment extends NcsBehaviorAssessmentDraft {
  label: string;
}

export interface NcsCompetencyAssessment {
  profileId: NcsProfileId;
  profileVersion: typeof NCS_PROFILE_VERSION;
  label: string;
  level: NcsCompetencyLevel;
  score: number;
  confidence: NcsEvaluationConfidence;
  rationale: string;
  behaviors: NcsBehaviorAssessment[];
}

export interface NcsEvidenceDimension extends NcsEvidenceDimensionDraft {
  label: string;
}

export interface NcsEvidenceMaturity {
  dimensions: NcsEvidenceDimension[];
  sharedEvidence: NcsSharedEvidenceDraft[];
}

export interface NcsTextEvaluationGuardrail {
  result: "PASS" | "BLOCKED";
  reasons: string[];
  exactQuotesValid: boolean;
  sharedEvidenceValid: boolean;
  confidenceValid: boolean;
  forbiddenWordingDetected: boolean;
  promptInjectionDetected: boolean;
}

export interface NcsTextEvaluationOutput {
  kind: NcsTextEvaluationKind;
  rubricVersion: typeof NCS_TEXT_EVALUATION_RUBRIC_VERSION;
  promptVersion: typeof NCS_TEXT_EVALUATION_PROMPT_VERSION;
  providerMode: NcsProviderMode;
  model?: string;
  scoreStatus: NcsScoreStatus;
  scores: {
    competency: number | null;
    evidence: number | null;
    total: number | null;
  };
  coverage: number;
  confidence: NcsEvaluationConfidence;
  questionMode: NcsQuestionMode;
  competencies: NcsCompetencyAssessment[];
  evidenceMaturity: NcsEvidenceMaturity;
  growth: NcsGrowthFeedback;
  guardrail: NcsTextEvaluationGuardrail;
}

export interface NcsTextEvaluationProviderResult {
  draft: NcsTextEvaluationDraft;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface NcsTextEvaluationProviderOptions {
  retryReason?: "FORBIDDEN_WORDING";
}

export interface NcsTextEvaluationProvider {
  evaluate(
    input: NcsTextEvaluationInput,
    options?: NcsTextEvaluationProviderOptions,
  ): Promise<NcsTextEvaluationProviderResult>;
}
