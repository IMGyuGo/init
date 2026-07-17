export type PostingStatus = "DRAFT" | "OPEN" | "CLOSING_SOON" | "CLOSED" | "ARCHIVED";

export type QuestionType = "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
export type QuestionOrigin = "MANUAL" | "AI_GENERATED";
export type EvaluationFramework = "LEGACY" | "NCS_3_PROFILE_V1" | "NCS_ACTIVE_PROFILE_V2";
export type NcsProfileId = "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING";
export type NcsQuestionMode = "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
export type QuestionGenerationSource = "JD_CRITERIA" | "RESUME_PERSONALIZED";
export type QuestionAlignmentStatus = "NOT_EVALUATED" | "ALIGNED" | "LOW_ALIGNMENT" | "REVIEW_REQUIRED";

export type InterviewSettings = {
  posting: {
    postingId: number;
    title: string;
    status: PostingStatus;
  };
  availableTags: Array<{
    tagId: number;
    jobRole: string;
    tagName: string;
    category: string;
    description: string | null;
    sortOrder: number;
    ncsProfileId: NcsProfileId | null;
    defaultNcsQuestionMode: NcsQuestionMode | null;
    ncsProfileVersion: string | null;
  }>;
  criteria: Array<{
    criterionId: number;
    tagId: number;
    tagName: string;
    category: string;
    description: string | null;
    weight: number;
    passScore: number | null;
    sortOrder: number;
    ncsProfileId: NcsProfileId | null;
    ncsQuestionMode: NcsQuestionMode | null;
    ncsProfileVersion: string | null;
    isActive: boolean;
  }>;
  questions: Array<{
    questionId: number;
    criterionId: number | null;
    questionType: QuestionType;
    content: string;
    origin: QuestionOrigin;
    isAiEdited: boolean;
    isActive: boolean;
    usageScope: "STANDARD" | "DEMO_PRESET";
    generationSource: QuestionGenerationSource | null;
    ncsProfileId: NcsProfileId | null;
    ncsQuestionMode: NcsQuestionMode | null;
    ncsProfileVersion: string | null;
    alignmentStatus: QuestionAlignmentStatus | null;
    alignmentScore: number | null;
    alignmentReason: string | null;
    evaluatorVersion: string | null;
    sourceProcessLogId: number | null;
    ncsBindings: Array<{
      criterionId: number;
      ncsProfileId: NcsProfileId;
      ncsProfileVersion: string;
      alignmentStatus: QuestionAlignmentStatus;
      alignmentScore: number | null;
      alignmentReason: string | null;
      evaluatorVersion: string | null;
      bindingOrder: number;
    }>;
  }>;
  timePolicy: {
    preparationTimeSec: number;
    answerTimeSec: number;
    retryAllowed: boolean;
  };
  evaluationFramework: EvaluationFramework;
  questionGenerationPolicy: QuestionGenerationPolicy;
  configurationLocked: boolean;
  configurationLockedReason: "SUBMITTED_APPLICATION_EXISTS" | null;
  questionImpactByProfile: NcsQuestionImpact[];
  questionSetRequiresReconfirmation: boolean;
};

export type NcsQuestionImpact = {
  ncsProfileId: NcsProfileId;
  exclusivelyBoundActiveQuestionCount: number;
  multiBoundActiveQuestionCount: number;
};

export type ActiveProfileCoverage = {
  ncsProfileId: NcsProfileId;
  requiredBaseQuestionCount: number;
  actualBaseQuestionCount: number;
  covered: boolean;
};

export type QuestionGenerationAllocation = {
  source: QuestionGenerationSource;
  ncsProfileId: NcsProfileId;
  ncsQuestionMode: NcsQuestionMode;
  count: number;
  usageScope: "STANDARD";
};

export type QuestionGenerationPolicy = {
  postingId: number;
  jdCriteriaQuestionCount: number;
  resumeQuestionCount: number;
  policyVersion: number;
  criteriaVersion: number;
  allocations: QuestionGenerationAllocation[];
  resumeQuestionStatus?: "DISABLED" | "WAITING_APPLICATION";
  evaluationFramework?: EvaluationFramework;
  warnings?: string[];
  activeProfileCoverage: ActiveProfileCoverage[];
  questionSetRequiresReconfirmation: boolean;
};

export type CriterionTag = InterviewSettings["availableTags"][number];

export type CreateCriterionTagInput = {
  postingId: number;
  tagName: string;
  category: string;
  description?: string | null;
};

export type CreateCriterionTagResult = {
  postingId: number;
  tag: CriterionTag;
};

export type UpdateEvaluationCriteriaInput = {
  postingId: number;
  evaluationFramework?: EvaluationFramework;
  criteria: Array<{
    criterionId?: number;
    tagId: number;
    description?: string | null;
    weight: number;
    passScore?: number | null;
    sortOrder: number;
  }>;
  confirmQuestionImpact?: boolean;
};

export type EvaluationCriteriaResult = {
  postingId: number;
  criteria: InterviewSettings["criteria"];
  totalWeight: number;
  evaluationFramework: EvaluationFramework;
  criteriaVersion: number;
  configurationLocked: boolean;
  configurationLockedReason: "SUBMITTED_APPLICATION_EXISTS" | null;
  questionImpactByProfile: NcsQuestionImpact[];
  questionSetRequiresReconfirmation: boolean;
};

export type UpdateQuestionGenerationPolicyInput = {
  postingId: number;
  jdCriteriaQuestionCount: number;
  resumeQuestionCount: number;
  expectedPolicyVersion?: number;
};

export type UpdateQuestionGenerationPolicyResult = QuestionGenerationPolicy & {
  evaluationFramework: EvaluationFramework;
  warnings: string[];
};

export type AiProcessStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type CriteriaSuggestionCandidate = {
  title: string;
  description: string;
  weight: number;
  order: number;
  suggestionReason: string;
  tagId?: number;
  tagName?: string;
  category?: string;
  confidence?: number;
};

export type GeneratedQuestionCandidate = {
  questionId?: number;
  content: string;
  category: string;
  difficulty: "EASY" | "MEDIUM" | "HARD" | string;
  criterionId?: number;
  criterionTitle?: string;
  expectedKeywords: string[];
  suggestionReason: string;
  questionType?: QuestionType;
  source?: QuestionGenerationSource;
  ncsProfileId?: NcsProfileId | null;
  ncsQuestionMode?: NcsQuestionMode | null;
  ncsProfileVersion?: string | null;
  alignmentStatus?: QuestionAlignmentStatus;
  alignmentScore?: number | null;
  alignmentReason?: string | null;
  evaluatorVersion?: string | null;
};

export type GeneratedQuestionSetCandidate = {
  criterionId?: number;
  criterionTitle: string;
  questions: GeneratedQuestionCandidate[];
};

export type AiJobOutput = {
  kind?: string;
  sourceProcessLogId?: number;
  reviewRequired?: boolean;
  reviewStatus?: string;
  postingId?: number;
  criteriaSuggestions?: CriteriaSuggestionCandidate[];
  questionCandidates?: GeneratedQuestionCandidate[];
  questionSetPreview?: GeneratedQuestionSetCandidate[];
  items?: string[];
  guardrail?: {
    result?: string;
    reason?: string | null;
  };
};

export type AiJobResult = {
  processLogId: number;
  processType?: string;
  status: AiProcessStatus;
  queued?: boolean;
  inputRef?: string;
  outputRef?: string;
  output?: AiJobOutput;
  failure?: {
    category: string;
    reason: string;
    retryable: boolean;
  };
};

export type CreateInterviewQuestionInput = {
  postingId: number;
  criterionId: number;
  criterionIds?: number[];
  questionType: QuestionType;
  content: string;
  origin?: QuestionOrigin;
  sourceProcessLogId?: number;
};

export type UpdateInterviewQuestionInput = {
  criterionId: number;
  criterionIds?: number[];
  questionType: QuestionType;
  content: string;
};

export type CreateInterviewQuestionResult = {
  postingId: number;
  question: {
    questionId: number;
    postingId: number | null;
    criterionId: number | null;
    questionType: QuestionType;
    content: string;
    origin: QuestionOrigin;
    isAiEdited: boolean;
    isActive: boolean;
    usageScope: "STANDARD" | "DEMO_PRESET";
    generationSource: QuestionGenerationSource | null;
    ncsProfileId: NcsProfileId | null;
    ncsQuestionMode: NcsQuestionMode | null;
    ncsProfileVersion: string | null;
    alignmentStatus: QuestionAlignmentStatus | null;
    alignmentScore: number | null;
    alignmentReason: string | null;
    evaluatorVersion: string | null;
    sourceProcessLogId: number | null;
    ncsBindings: InterviewSettings["questions"][number]["ncsBindings"];
  };
};

export type UpdateInterviewTimePolicyInput = {
  postingId: number;
  preparationTimeSec: number;
  answerTimeSec: number;
  retryAllowed: boolean;
};

export type UpdateInterviewTimePolicyResult = {
  postingId: number;
  timePolicy: InterviewSettings["timePolicy"];
};

export type GenerateInterviewQuestionsInput = {
  postingId: number;
  jdCriteriaQuestionCount: number;
  expectedPolicyVersion?: number;
};

export type ConfirmQuestionSetInput = {
  postingId: number;
  title: string;
  sourceProcessLogId?: number;
  items: Array<{
    questionId: number;
    criterionId?: number | null;
    sortOrder: number;
  }>;
};

export type ConfirmQuestionSetResult = {
  questionSetId: number;
  postingId: number;
  title: string;
  status: string;
  createdByProcessLogId: number | null;
  items: Array<{
    questionSetItemId: number;
    questionId: number;
    criterionId: number | null;
    sortOrder: number;
  }>;
};

export type ApiEnvelope<T> = {
  data: T;
  meta: {
    traceId: string;
    timestamp: string;
  };
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  meta?: {
    traceId: string;
    timestamp: string;
  };
};
