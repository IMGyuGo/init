export type EvaluationCriterionSource =
  | 'COMPANY_CUSTOM'
  | 'NCS_OFFICIAL'
  | 'COMPANY_TALENT'
  | 'SERVICE_COMMON';

export type EvaluationProfileStatus = 'DRAFT' | 'ACTIVE';

export type NcsOfficialElementInput = {
  elementCode: string;
  elementNumber: string;
  elementName: string;
  elementLevel?: string;
  rawData: Record<string, unknown>;
};

export type NcsOfficialUnitInput = {
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
  rawData: Record<string, unknown>;
  elements: NcsOfficialElementInput[];
};

export type NcsCompetencyElementRecord = {
  ncsElementId: number;
  elementCode: string;
  elementNumber: string;
  elementName: string;
  elementLevel?: string;
};

export type NcsCompetencyUnitRecord = {
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
  elements: NcsCompetencyElementRecord[];
};

export type EvaluationProfilePostingRecord = {
  postingId: number;
  companyId: number;
  title: string;
  jobRole: string;
  jobDescription?: string;
  talentProfile?: string;
  evaluationPolicy?: string;
};

export type PostingEvaluationProfileSelectionRecord = {
  selectionId: number;
  ncsUnitId: number;
  weight: number;
  relevanceScore?: number;
  rationale?: string;
  sortOrder: number;
  unit: NcsCompetencyUnitRecord;
};

export type PostingEvaluationProfileRecord = {
  profileId: number;
  postingId: number;
  status: EvaluationProfileStatus;
  ncsWeight: number;
  companyWeight: number;
  serviceWeight: number;
  rubricVersion: string;
  companyTalentSnapshot?: string;
  evaluationPolicySnapshot?: string;
  sourceSnapshot?: Record<string, unknown>;
  activatedAt?: string;
  selections: PostingEvaluationProfileSelectionRecord[];
};

export type NcsRecommendationRecord = {
  unit: NcsCompetencyUnitRecord;
  relevanceScore: number;
  rationale: string;
  matchedTerms: string[];
};

export type NcsSourceStatus = 'OFFICIAL_API' | 'LOCAL_CACHE' | 'CONFIGURATION_REQUIRED';

export type NcsSearchResult = {
  sourceStatus: NcsSourceStatus;
  sourceProvider: string;
  sourceUrl: string;
  query: string;
  items: NcsCompetencyUnitRecord[];
};

export type EvaluationProfileCoverage = {
  criterionId: number;
  sourceCode?: string;
  criterionName: string;
  activeQuestionCount: number;
  requiredQuestionCount: number;
  ready: boolean;
};

export type EvaluationProfileView = {
  postingId: number;
  status: EvaluationProfileStatus;
  weights: {
    ncs: number;
    company: number;
    service: number;
  };
  rubricVersion: string;
  companyContext: {
    talentProfile?: string;
    evaluationPolicy?: string;
  };
  selections: PostingEvaluationProfileSelectionRecord[];
  coverage: EvaluationProfileCoverage[];
  source: {
    provider: string;
    url: string;
    official: true;
  };
  activatedAt?: string;
};
