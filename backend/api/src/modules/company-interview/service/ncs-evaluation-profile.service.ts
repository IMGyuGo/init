import { Inject, Injectable } from '@nestjs/common';
import type { CurrentUser } from '@init/common';
import { conflict, forbidden, notFound, validationFailed } from '../company-interview.errors';
import type {
  EvaluationProfileView,
  NcsCompetencyUnitRecord,
  NcsRecommendationRecord,
  NcsSearchResult,
  NcsSourceStatus,
} from '../ncs-evaluation-profile.types';
import type {
  NcsRecommendationDto,
  NcsUnitSearchQueryDto,
  UpsertEvaluationProfileDto,
} from '../dto/ncs-evaluation-profile.dto';
import {
  NCS_EVALUATION_PROFILE_REPOSITORY,
  type EvaluationProfileCriterionInput,
  type NcsEvaluationProfileRepository,
} from '../repositories/ncs-evaluation-profile.repository';
import { NcsOfficialApiClient } from './ncs-official-api.client';

const RUBRIC_VERSION = 'NCS_EVIDENCE_RUBRIC_V1';
const DEFAULT_WEIGHTS = { ncs: 60, company: 25, service: 15 } as const;
const OFFICIAL_SOURCE_URL = 'https://www.data.go.kr/data/15128213/openapi.do';

@Injectable()
export class NcsEvaluationProfileService {
  constructor(
    @Inject(NCS_EVALUATION_PROFILE_REPOSITORY)
    private readonly repository: NcsEvaluationProfileRepository,
    private readonly officialApi: NcsOfficialApiClient,
  ) {}

  async searchUnits(
    currentUser: CurrentUser,
    query: NcsUnitSearchQueryDto,
  ): Promise<NcsSearchResult> {
    this.requireCompanyId(currentUser);
    const normalizedQuery = query.query.replace(/\s+/g, ' ').trim();
    const limit = query.limit ?? 20;
    let sourceStatus: NcsSourceStatus = 'LOCAL_CACHE';

    if (this.officialApi.isConfigured()) {
      const official = await this.officialApi.searchUnits(normalizedQuery, limit);
      if (official.length > 0) {
        await this.repository.upsertOfficialUnits(official);
        sourceStatus = 'OFFICIAL_API';
      }
    }

    const items = await this.repository.searchUnits(normalizedQuery, limit);
    if (items.length === 0 && !this.officialApi.isConfigured()) {
      sourceStatus = 'CONFIGURATION_REQUIRED';
    }
    return {
      sourceStatus,
      ...this.officialApi.source(),
      query: normalizedQuery,
      items,
    };
  }

  async recommendUnits(
    currentUser: CurrentUser,
    dto: NcsRecommendationDto,
  ): Promise<{
    postingId: number;
    sourceStatus: NcsSourceStatus;
    recommendations: NcsRecommendationRecord[];
  }> {
    const companyId = this.requireCompanyId(currentUser);
    const posting = await this.repository.findOwnedPosting(dto.postingId, companyId);
    if (!posting) {
      notFound('채용 공고를 찾을 수 없습니다.');
    }

    const terms = extractRecommendationTerms(posting);
    let sourceStatus: NcsSourceStatus = 'LOCAL_CACHE';
    if (this.officialApi.isConfigured()) {
      const officialUnits = (
        await Promise.all(terms.slice(0, 3).map((term) => this.officialApi.searchUnits(term, 30)))
      ).flat();
      if (officialUnits.length > 0) {
        await this.repository.upsertOfficialUnits(uniqueOfficialUnits(officialUnits));
        sourceStatus = 'OFFICIAL_API';
      }
    }

    const candidateUnits = uniqueUnits(
      (
        await Promise.all(terms.map((term) => this.repository.searchUnits(term, 30)))
      ).flat(),
    );
    if (candidateUnits.length === 0 && !this.officialApi.isConfigured()) {
      sourceStatus = 'CONFIGURATION_REQUIRED';
    }

    const count = dto.count ?? 5;
    const recommendations = candidateUnits
      .map((unit) => scoreRecommendation(unit, posting))
      .sort((a, b) => b.relevanceScore - a.relevanceScore || a.unit.unitName.localeCompare(b.unit.unitName, 'ko'))
      .slice(0, count);

    return { postingId: posting.postingId, sourceStatus, recommendations };
  }

  async getProfile(currentUser: CurrentUser, postingId: number): Promise<EvaluationProfileView> {
    const companyId = this.requireCompanyId(currentUser);
    const posting = await this.repository.findOwnedPosting(postingId, companyId);
    if (!posting) {
      notFound('채용 공고를 찾을 수 없습니다.');
    }
    const profile = await this.repository.findProfile(postingId);
    const coverage = profile ? await this.repository.listCoverage(postingId) : [];
    return {
      postingId,
      status: profile?.status ?? 'DRAFT',
      weights: {
        ncs: profile?.ncsWeight ?? DEFAULT_WEIGHTS.ncs,
        company: profile?.companyWeight ?? DEFAULT_WEIGHTS.company,
        service: profile?.serviceWeight ?? DEFAULT_WEIGHTS.service,
      },
      rubricVersion: profile?.rubricVersion ?? RUBRIC_VERSION,
      companyContext: {
        talentProfile: profile?.companyTalentSnapshot ?? posting.talentProfile,
        evaluationPolicy: profile?.evaluationPolicySnapshot ?? posting.evaluationPolicy,
      },
      selections: profile?.selections ?? [],
      coverage,
      source: { provider: '한국산업인력공단', url: OFFICIAL_SOURCE_URL, official: true },
      activatedAt: profile?.activatedAt,
    };
  }

  async saveProfile(
    currentUser: CurrentUser,
    dto: UpsertEvaluationProfileDto,
  ): Promise<EvaluationProfileView> {
    const companyId = this.requireCompanyId(currentUser);
    const posting = await this.repository.findOwnedPosting(dto.postingId, companyId);
    if (!posting) {
      notFound('채용 공고를 찾을 수 없습니다.');
    }
    this.validateProfileInput(dto);
    if (!posting.talentProfile?.trim() || !posting.evaluationPolicy?.trim()) {
      validationFailed('기업 인재상과 평가 정책을 먼저 설정해주세요.', [
        { field: 'companyProfile', reason: 'TALENT_PROFILE_AND_EVALUATION_POLICY_REQUIRED' },
      ]);
    }
    if (!(await this.repository.canReplaceProfile(posting.postingId))) {
      conflict('질문 세트 확정 또는 면접 시작 후에는 평가 프로필을 교체할 수 없습니다.');
    }

    const unitIds = dto.selections.map((selection) => selection.ncsUnitId);
    const units = await this.repository.findUnitsByIds(unitIds);
    if (units.length !== unitIds.length) {
      validationFailed('공식 NCS 능력단위를 다시 선택해주세요.', [
        { field: 'selections[].ncsUnitId', reason: 'OFFICIAL_UNIT_NOT_FOUND' },
      ]);
    }
    const unitsById = new Map(units.map((unit) => [unit.ncsUnitId, unit]));
    const ncsCriterionWeights = distributeWeight(
      dto.ncsWeight,
      dto.selections.map((selection) => selection.weight),
    );
    const criteria: EvaluationProfileCriterionInput[] = dto.selections.map((selection, index) => {
      const unit = unitsById.get(selection.ncsUnitId)!;
      return {
        tagName: unit.unitName,
        category: 'NCS 공식 능력단위',
        description: buildNcsCriterionDescription(unit),
        weight: ncsCriterionWeights[index],
        sortOrder: index + 1,
        sourceType: 'NCS_OFFICIAL',
        sourceCode: unit.classificationCode,
        sourceVersion: `${unit.ncsDegree}:${unit.version}`,
        sourceName: unit.sourceProvider,
        behaviorIndicators: unit.elements.map((element) => element.elementName),
        alignmentRationale:
          selection.rationale?.trim() ||
          `${posting.title}의 JD와 ${unit.subdivisionName} 직무 능력단위의 연관성을 검토해 선택했습니다.`,
        ncsUnitId: unit.ncsUnitId,
      };
    });
    criteria.push(
      {
        tagName: '기업 직무행동 기준',
        category: '기업 인재상',
        description: buildCompanyCriterionDescription(posting.talentProfile, posting.evaluationPolicy),
        weight: dto.companyWeight,
        sortOrder: criteria.length + 1,
        sourceType: 'COMPANY_TALENT',
        sourceCode: `COMPANY:${posting.companyId}:TALENT_PROFILE`,
        sourceVersion: 'COMPANY_POLICY_SNAPSHOT_V1',
        sourceName: '기업 인재상 및 평가 정책',
        behaviorIndicators: companyBehaviorIndicators(posting.talentProfile, posting.evaluationPolicy),
        alignmentRationale: '기업이 명시한 인재상 중 직무와 연결된 관찰 가능한 행동만 평가합니다.',
      },
      {
        tagName: '근거 기반 답변 구성',
        category: '서비스 공통 기준',
        description:
          '답변이 상황, 본인 행동, 선택 근거, 결과, 배운 점을 구체적이고 일관되게 제시하는지 평가합니다.',
        weight: dto.serviceWeight,
        sortOrder: criteria.length + 2,
        sourceType: 'SERVICE_COMMON',
        sourceCode: RUBRIC_VERSION,
        sourceVersion: RUBRIC_VERSION,
        sourceName: '서비스 공통 근거 기반 rubric',
        behaviorIndicators: ['상황 설명', '본인 행동', '선택 근거', '결과 또는 변화', '학습 및 개선'],
        alignmentRationale: '모든 직무에 공통으로 적용되는 답변 근거의 충실도를 평가합니다.',
      },
    );

    await this.repository.saveDraftProfile({
      posting,
      ncsWeight: dto.ncsWeight,
      companyWeight: dto.companyWeight,
      serviceWeight: dto.serviceWeight,
      rubricVersion: RUBRIC_VERSION,
      sourceSnapshot: buildSourceSnapshot(posting, units),
      selections: dto.selections.map((selection) => ({
        ...selection,
        rationale: selection.rationale?.trim() || undefined,
      })),
      criteria,
    });
    return this.getProfile(currentUser, posting.postingId);
  }

  async activateProfile(currentUser: CurrentUser, postingId: number): Promise<EvaluationProfileView> {
    const companyId = this.requireCompanyId(currentUser);
    const posting = await this.repository.findOwnedPosting(postingId, companyId);
    if (!posting) {
      notFound('채용 공고를 찾을 수 없습니다.');
    }
    const profile = await this.repository.findProfile(postingId);
    if (!profile) {
      notFound('저장된 NCS 평가 프로필이 없습니다.');
    }
    const coverage = await this.repository.listCoverage(postingId);
    const uncovered = coverage.filter((item) => !item.ready);
    if (uncovered.length > 0) {
      validationFailed('각 평가 기준에 독립 질문을 2개 이상 연결해주세요.',
        uncovered.map((item) => ({
          field: `criterion.${item.criterionId}`,
          reason: `QUESTION_COVERAGE_${item.activeQuestionCount}_OF_${item.requiredQuestionCount}`,
        })),
      );
    }
    await this.repository.activateProfile(postingId);
    return this.getProfile(currentUser, postingId);
  }

  private validateProfileInput(dto: UpsertEvaluationProfileDto): void {
    if (dto.ncsWeight + dto.companyWeight + dto.serviceWeight !== 100) {
      validationFailed('NCS·기업·서비스 평가 비중의 합은 100이어야 합니다.', [
        { field: 'weights', reason: 'TOTAL_MUST_EQUAL_100' },
      ]);
    }
    if (dto.selections.reduce((sum, selection) => sum + selection.weight, 0) !== 100) {
      validationFailed('선택한 NCS 능력단위 배분의 합은 100이어야 합니다.', [
        { field: 'selections[].weight', reason: 'TOTAL_MUST_EQUAL_100' },
      ]);
    }
    if (new Set(dto.selections.map((selection) => selection.ncsUnitId)).size !== dto.selections.length) {
      validationFailed('NCS 능력단위를 중복 선택할 수 없습니다.', [
        { field: 'selections[].ncsUnitId', reason: 'DUPLICATED' },
      ]);
    }
    if (new Set(dto.selections.map((selection) => selection.sortOrder)).size !== dto.selections.length) {
      validationFailed('NCS 능력단위 순서가 중복되었습니다.', [
        { field: 'selections[].sortOrder', reason: 'DUPLICATED' },
      ]);
    }
  }

  private requireCompanyId(currentUser: CurrentUser): number {
    if (currentUser.userType !== 'COMPANY' || !currentUser.companyId) {
      forbidden('기업 사용자만 NCS 평가 프로필을 설정할 수 있습니다.');
    }
    return currentUser.companyId;
  }
}

function extractRecommendationTerms(posting: {
  jobRole: string;
  jobDescription?: string;
  talentProfile?: string;
  evaluationPolicy?: string;
}): string[] {
  const preferred = [posting.jobRole.trim()];
  const tokens = tokenize(
    [posting.jobDescription, posting.talentProfile, posting.evaluationPolicy].filter(Boolean).join(' '),
  );
  return [...new Set([...preferred, ...tokens])].filter(Boolean).slice(0, 8);
}

function scoreRecommendation(
  unit: NcsCompetencyUnitRecord,
  posting: {
    title: string;
    jobRole: string;
    jobDescription?: string;
    talentProfile?: string;
    evaluationPolicy?: string;
  },
): NcsRecommendationRecord {
  const jobTokens = new Set(tokenize(`${posting.title} ${posting.jobRole} ${posting.jobDescription ?? ''}`));
  const companyTokens = new Set(tokenize(`${posting.talentProfile ?? ''} ${posting.evaluationPolicy ?? ''}`));
  const unitTokens = new Set(
    tokenize(
      `${unit.unitName} ${unit.definition ?? ''} ${unit.subdivisionName} ${unit.elements
        .map((element) => element.elementName)
        .join(' ')}`,
    ),
  );
  const jobMatches = [...jobTokens].filter((token) => unitTokens.has(token));
  const companyMatches = [...companyTokens].filter((token) => unitTokens.has(token));
  const score = Math.min(100, 35 + jobMatches.length * 12 + companyMatches.length * 6);
  const matchedTerms = [...new Set([...jobMatches, ...companyMatches])].slice(0, 5);
  return {
    unit,
    relevanceScore: score,
    matchedTerms,
    rationale:
      matchedTerms.length > 0
        ? `JD와 기업 인재상에서 ${matchedTerms.join(', ')} 관련 근거가 확인되어 추천했습니다.`
        : `${posting.jobRole} 직무와 ${unit.subdivisionName} NCS 분류의 연관성을 검토할 후보입니다.`,
  };
}

function buildNcsCriterionDescription(unit: NcsCompetencyUnitRecord): string {
  const elements = unit.elements.map((element) => element.elementName).filter(Boolean);
  return [
    unit.definition ?? `${unit.unitName} 능력을 실제 업무 경험 근거로 평가합니다.`,
    elements.length > 0 ? `관찰 행동: ${elements.join(', ')}` : undefined,
    `공식 NCS 코드 ${unit.classificationCode}, ${unit.ncsDegree}차수, 버전 ${unit.version}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function buildCompanyCriterionDescription(talentProfile: string, evaluationPolicy: string): string {
  return `기업 인재상(${talentProfile})과 평가 정책(${evaluationPolicy}) 중 직무와 연결된 행동을 답변 근거로 확인합니다. 추상적인 문화 적합성이나 민감 특성은 평가하지 않습니다.`;
}

function companyBehaviorIndicators(talentProfile: string, evaluationPolicy: string): string[] {
  const indicators = tokenize(`${talentProfile} ${evaluationPolicy}`).slice(0, 5);
  return indicators.length > 0
    ? indicators.map((indicator) => `${indicator}을(를) 보여주는 구체적인 행동과 결과`)
    : ['기업이 명시한 직무 행동을 보여주는 구체적인 사례'];
}

function buildSourceSnapshot(
  posting: {
    talentProfile?: string;
    evaluationPolicy?: string;
  },
  units: NcsCompetencyUnitRecord[],
): Record<string, unknown> {
  return {
    officialNcs: {
      provider: '한국산업인력공단',
      sourceUrl: OFFICIAL_SOURCE_URL,
      units: units.map((unit) => ({
        unitCode: unit.unitCode,
        classificationCode: unit.classificationCode,
        unitName: unit.unitName,
        ncsDegree: unit.ncsDegree,
        version: unit.version,
        sourceUpdatedAt: unit.sourceUpdatedAt,
        elements: unit.elements.map((element) => ({
          code: element.elementCode,
          name: element.elementName,
        })),
      })),
    },
    company: {
      talentProfile: posting.talentProfile,
      evaluationPolicy: posting.evaluationPolicy,
    },
    serviceRubric: {
      version: RUBRIC_VERSION,
      levels: [
        { level: 5, score: 100, anchor: '구체적 경험, 선택 근거, 결과, 개선까지 제시' },
        { level: 4, score: 85, anchor: '구체적 경험과 본인 행동, 결과 제시' },
        { level: 3, score: 70, anchor: '관련 경험은 있으나 본인 행동 또는 결과가 일부 부족' },
        { level: 2, score: 50, anchor: '개념 설명은 있으나 실제 경험 근거 부족' },
        { level: 1, score: 25, anchor: '관련 답변은 있으나 능력을 뒷받침하지 못함' },
      ],
      automaticHiringDecision: false,
      nonverbalExcluded: true,
    },
  };
}

function distributeWeight(total: number, ratios: number[]): number[] {
  const raw = ratios.map((ratio) => (total * ratio) / 100);
  const result = raw.map(Math.floor);
  let remainder = total - result.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index += 1) {
    result[order[index % order.length].index] += 1;
  }
  return result;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9가-힣+#.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !COMMON_TERMS.has(token));
}

function uniqueUnits(units: NcsCompetencyUnitRecord[]): NcsCompetencyUnitRecord[] {
  return [...new Map(units.map((unit) => [`${unit.classificationCode}:${unit.version}`, unit])).values()];
}

function uniqueOfficialUnits<T extends { classificationCode: string; version: string }>(units: T[]): T[] {
  return [...new Map(units.map((unit) => [`${unit.classificationCode}:${unit.version}`, unit])).values()];
}

const COMMON_TERMS = new Set([
  '경험',
  '업무',
  '직무',
  '지원자',
  '인재',
  '평가',
  '기준',
  '능력',
  '관련',
  '위한',
  '통해',
  '하는',
  '있는',
  'the',
  'and',
]);
