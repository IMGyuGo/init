import type {
  EvaluationProfileCoverage,
  EvaluationProfilePostingRecord,
  NcsCompetencyUnitRecord,
  NcsOfficialUnitInput,
  PostingEvaluationProfileRecord,
} from '../ncs-evaluation-profile.types';

export const NCS_EVALUATION_PROFILE_REPOSITORY = Symbol(
  'NCS_EVALUATION_PROFILE_REPOSITORY',
);

export type EvaluationProfileCriterionInput = {
  tagName: string;
  category: string;
  description: string;
  weight: number;
  sortOrder: number;
  sourceType: 'NCS_OFFICIAL' | 'COMPANY_TALENT' | 'SERVICE_COMMON';
  sourceCode: string;
  sourceVersion: string;
  sourceName: string;
  behaviorIndicators: string[];
  alignmentRationale: string;
  ncsUnitId?: number;
};

export type SaveEvaluationProfileInput = {
  posting: EvaluationProfilePostingRecord;
  ncsWeight: number;
  companyWeight: number;
  serviceWeight: number;
  rubricVersion: string;
  sourceSnapshot: Record<string, unknown>;
  selections: Array<{
    ncsUnitId: number;
    weight: number;
    relevanceScore?: number;
    rationale?: string;
    sortOrder: number;
  }>;
  criteria: EvaluationProfileCriterionInput[];
};

export interface NcsEvaluationProfileRepository {
  findOwnedPosting(
    postingId: number,
    companyId: number,
  ): Promise<EvaluationProfilePostingRecord | undefined>;
  searchUnits(query: string, limit: number): Promise<NcsCompetencyUnitRecord[]>;
  upsertOfficialUnits(units: NcsOfficialUnitInput[]): Promise<NcsCompetencyUnitRecord[]>;
  findUnitsByIds(ids: number[]): Promise<NcsCompetencyUnitRecord[]>;
  findProfile(postingId: number): Promise<PostingEvaluationProfileRecord | undefined>;
  canReplaceProfile(postingId: number): Promise<boolean>;
  saveDraftProfile(input: SaveEvaluationProfileInput): Promise<PostingEvaluationProfileRecord>;
  listCoverage(postingId: number): Promise<EvaluationProfileCoverage[]>;
  activateProfile(postingId: number): Promise<PostingEvaluationProfileRecord>;
}
