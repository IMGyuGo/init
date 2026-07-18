import type {
  DemoPresetReadinessReasonCode,
  DemoPresetReadinessStatus,
  EvaluationFramework,
  InterviewSessionMode,
  NcsProfileId,
  QuestionUsageScope,
} from "../enums";

export type NcsCriterionWeightDto = {
  ncsProfileId: NcsProfileId;
  weight: number;
  isActive: boolean;
};

export type NcsQuestionImpactDto = {
  ncsProfileId: NcsProfileId;
  exclusivelyBoundActiveQuestionCount: number;
  multiBoundActiveQuestionCount: number;
};

export type NcsActiveProfileCoverageDto = {
  ncsProfileId: NcsProfileId;
  requiredBaseQuestionCount: number;
  actualBaseQuestionCount: number;
  covered: boolean;
};

export type NcsConfigurationProjectionDto = {
  evaluationFramework: EvaluationFramework;
  criteriaVersion: number;
  criteria: NcsCriterionWeightDto[];
  configurationLocked: boolean;
  configurationLockedReason: "SUBMITTED_APPLICATION_EXISTS" | null;
  questionImpactByProfile: NcsQuestionImpactDto[];
  questionSetRequiresReconfirmation: boolean;
};

export type DemoPresetReadinessProjectionDto = {
  status: DemoPresetReadinessStatus;
  canStart: boolean;
  reasonCode: DemoPresetReadinessReasonCode | null;
  existingSessionId: number | null;
  existingSessionMode: InterviewSessionMode | null;
};

export type OfficialInterviewSessionStartRequestDto = {
  mode?: InterviewSessionMode;
};

export type OfficialInterviewQuestionSnapshotDto = {
  sessionQuestionId: number;
  usageScope: QuestionUsageScope;
  ncsProfileIds: NcsProfileId[];
  sortOrder: number;
};

export type OfficialInterviewSessionStartResponseDto = {
  applicationId: number;
  sessionId: number;
  sessionMode: InterviewSessionMode;
  snapshotCreated: boolean;
  questions: OfficialInterviewQuestionSnapshotDto[];
};

export type ResumeQuestionGenerationScopeDto = {
  usageScope: QuestionUsageScope;
  policyVersion: number;
  criteriaVersion: number;
  inputVersion: string;
  resumeDocumentHash: string;
  jdSnapshotHash: string;
};
