export type PostingStatus = "DRAFT" | "OPEN" | "CLOSING_SOON" | "CLOSED" | "ARCHIVED";

export type QuestionType = "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
export type QuestionOrigin = "MANUAL" | "AI_GENERATED";
export type EvaluationFramework = "LEGACY" | "NCS_3_PROFILE_V1";
export type NcsProfileId = "PROBLEM_SOLVING" | "COMMUNICATION" | "DIGITAL";
export type NcsQuestionMode = "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
export type QuestionGenerationSource = "JD_CRITERIA" | "RESUME_PERSONALIZED";

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
  }>;
  questions: Array<{
    questionId: number;
    criterionId: number | null;
    questionType: QuestionType;
    content: string;
    origin: QuestionOrigin;
    isAiEdited: boolean;
    isActive: boolean;
    generationSource: QuestionGenerationSource | null;
    ncsProfileId: NcsProfileId | null;
    ncsQuestionMode: NcsQuestionMode | null;
    ncsProfileVersion: string | null;
    alignmentStatus: string | null;
  }>;
  timePolicy: {
    preparationTimeSec: number;
    answerTimeSec: number;
    retryAllowed: boolean;
  };
  evaluationFramework: EvaluationFramework;
  questionGenerationPolicy: QuestionGenerationPolicy;
};

export type QuestionGenerationAllocation = {
  source: QuestionGenerationSource;
  ncsProfileId: NcsProfileId;
  ncsQuestionMode: NcsQuestionMode;
  count: number;
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
};

export type EvaluationCriteriaResult = {
  postingId: number;
  criteria: InterviewSettings["criteria"];
  totalWeight: number;
  evaluationFramework: EvaluationFramework;
  criteriaVersion: number;
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

export type SuggestEvaluationCriteriaInput = {
  postingId: number;
  jobDescription: string;
  talentProfile: string;
  evaluationPolicy: string;
};

export type CreateInterviewQuestionInput = {
  postingId: number;
  criterionId: number;
  questionType: QuestionType;
  content: string;
  origin?: QuestionOrigin;
};

export type UpdateInterviewQuestionInput = {
  criterionId: number;
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
    generationSource: QuestionGenerationSource | null;
    ncsProfileId: NcsProfileId | null;
    ncsQuestionMode: NcsQuestionMode | null;
    ncsProfileVersion: string | null;
    alignmentStatus: string | null;
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
  jobDescription: string;
  questionCount: number;
  criteria: Array<{
    criterionId: number;
    name: string;
    category?: string;
    weight?: number;
  }>;
};

export type GenerateQuestionSetInput = {
  postingId: number;
  questionCount: number;
  criteria: Array<{
    criterionId: number;
    name: string;
    weight?: number;
  }>;
  questionTypes: string[];
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
