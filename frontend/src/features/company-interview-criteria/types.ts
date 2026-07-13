export type PostingStatus = "DRAFT" | "OPEN" | "CLOSING_SOON" | "CLOSED" | "ARCHIVED";

export type QuestionType = "INTRO" | "TECHNICAL" | "EXPERIENCE" | "SITUATION" | "FOLLOW_UP" | "CLOSING";
export type QuestionOrigin = "MANUAL" | "AI_GENERATED";
export type EvaluationCriterionSource = "COMPANY_CUSTOM" | "NCS_OFFICIAL" | "COMPANY_TALENT" | "SERVICE_COMMON";

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
    sourceType: EvaluationCriterionSource;
    sourceCode: string | null;
    sourceVersion: string | null;
    sourceName: string | null;
    behaviorIndicators: string[];
    alignmentRationale: string | null;
  }>;
  questions: Array<{
    questionId: number;
    criterionId: number | null;
    questionType: QuestionType;
    content: string;
    origin: QuestionOrigin;
    isAiEdited: boolean;
    isActive: boolean;
  }>;
  timePolicy: {
    preparationTimeSec: number;
    answerTimeSec: number;
    retryAllowed: boolean;
  };
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
    description?: string;
    sourceType?: EvaluationCriterionSource;
    sourceCode?: string;
    sourceVersion?: string;
    sourceName?: string;
    behaviorIndicators?: string[];
    alignmentRationale?: string;
  }>;
};

export type NcsCompetencyElement = {
  ncsElementId: number;
  elementCode: string;
  elementNumber: string;
  elementName: string;
  elementLevel?: string;
};

export type NcsCompetencyUnit = {
  ncsUnitId: number;
  unitCode: string;
  classificationCode: string;
  unitName: string;
  definition?: string;
  unitLevel?: string;
  developmentYear?: string;
  version: string;
  ncsDegree: string;
  isCurrent: boolean;
  largeCategoryCode: string;
  largeCategoryName: string;
  mediumCategoryCode: string;
  mediumCategoryName: string;
  smallCategoryCode: string;
  smallCategoryName: string;
  subdivisionCode: string;
  subdivisionName: string;
  dutyDefinition?: string;
  sourceProvider: string;
  sourceUrl: string;
  sourceUpdatedAt?: string;
  elements: NcsCompetencyElement[];
};

export type NcsSearchResult = {
  sourceStatus: "OFFICIAL_API" | "LOCAL_CACHE" | "CONFIGURATION_REQUIRED";
  sourceProvider: string;
  sourceUrl: string;
  query: string;
  items: NcsCompetencyUnit[];
};

export type NcsRecommendation = {
  unit: NcsCompetencyUnit;
  relevanceScore: number;
  rationale: string;
  matchedTerms: string[];
};

export type NcsRecommendationResult = {
  postingId: number;
  sourceStatus: NcsSearchResult["sourceStatus"];
  recommendations: NcsRecommendation[];
};

export type EvaluationProfileSelection = {
  selectionId: number;
  ncsUnitId: number;
  weight: number;
  relevanceScore?: number;
  rationale?: string;
  sortOrder: number;
  unit: NcsCompetencyUnit;
};

export type EvaluationProfile = {
  postingId: number;
  status: "DRAFT" | "ACTIVE";
  weights: { ncs: number; company: number; service: number };
  rubricVersion: string;
  companyContext: {
    talentProfile?: string;
    evaluationPolicy?: string;
  };
  selections: EvaluationProfileSelection[];
  coverage: Array<{
    criterionId: number;
    sourceCode?: string;
    criterionName: string;
    activeQuestionCount: number;
    requiredQuestionCount: number;
    ready: boolean;
  }>;
  source: {
    provider: string;
    url: string;
    official: true;
  };
  activatedAt?: string;
};

export type SaveEvaluationProfileInput = {
  postingId: number;
  ncsWeight: number;
  companyWeight: number;
  serviceWeight: number;
  selections: Array<{
    ncsUnitId: number;
    weight: number;
    relevanceScore?: number;
    rationale?: string;
    sortOrder: number;
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
