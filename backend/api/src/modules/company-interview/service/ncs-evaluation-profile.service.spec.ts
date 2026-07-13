import type { CurrentUser } from '@init/common';
import { ApiException } from '../../../shared/api-exception';
import type {
  NcsCompetencyUnitRecord,
  PostingEvaluationProfileRecord,
} from '../ncs-evaluation-profile.types';
import type {
  NcsEvaluationProfileRepository,
  SaveEvaluationProfileInput,
} from '../repositories/ncs-evaluation-profile.repository';
import { NcsEvaluationProfileService } from './ncs-evaluation-profile.service';
import type { NcsOfficialApiClient } from './ncs-official-api.client';

const companyUser: CurrentUser = {
  userId: 1,
  userType: 'COMPANY',
  companyId: 7,
  candidateId: null,
};

function unit(id: number): NcsCompetencyUnitRecord {
  return {
    ncsUnitId: id,
    unitCode: `UNIT-${id}`,
    classificationCode: `20010202${id}`,
    unitName: `공식 능력단위 ${id}`,
    definition: `공식 능력단위 ${id} 정의`,
    version: '6',
    ncsDegree: '24',
    isCurrent: true,
    largeCategoryCode: '20',
    largeCategoryName: '정보통신',
    mediumCategoryCode: '2001',
    mediumCategoryName: '정보기술',
    smallCategoryCode: '200102',
    smallCategoryName: '정보기술개발',
    subdivisionCode: '20010202',
    subdivisionName: '응용SW엔지니어링',
    sourceProvider: '한국산업인력공단',
    sourceUrl: 'https://www.data.go.kr/data/15128213/openapi.do',
    elements: [{
      ncsElementId: id,
      elementCode: `ELEMENT-${id}`,
      elementNumber: String(id),
      elementName: `관찰 행동 ${id}`,
    }],
  };
}

function createHarness() {
  const units = [unit(1), unit(2), unit(3)];
  let savedInput: SaveEvaluationProfileInput | undefined;
  let profile: PostingEvaluationProfileRecord | undefined;
  let coverageReady = false;
  const repository: NcsEvaluationProfileRepository = {
    async findOwnedPosting() {
      return {
        postingId: 11,
        companyId: 7,
        title: '백엔드 개발자',
        jobRole: '서버·백엔드',
        jobDescription: 'API 설계와 데이터베이스 운영 경험',
        talentProfile: '근거를 공유하고 끝까지 실행하는 사람',
        evaluationPolicy: '직무 행동과 결과를 답변 근거로 평가',
      };
    },
    async searchUnits() { return units; },
    async upsertOfficialUnits() { return units; },
    async findUnitsByIds(ids) { return units.filter((item) => ids.includes(item.ncsUnitId)); },
    async findProfile() { return profile; },
    async canReplaceProfile() { return true; },
    async saveDraftProfile(input) {
      savedInput = input;
      profile = {
        profileId: 1,
        postingId: 11,
        status: 'DRAFT',
        ncsWeight: input.ncsWeight,
        companyWeight: input.companyWeight,
        serviceWeight: input.serviceWeight,
        rubricVersion: input.rubricVersion,
        companyTalentSnapshot: input.posting.talentProfile,
        evaluationPolicySnapshot: input.posting.evaluationPolicy,
        selections: input.selections.map((selection, index) => ({
          selectionId: index + 1,
          ...selection,
          unit: units.find((item) => item.ncsUnitId === selection.ncsUnitId)!,
        })),
      };
      return profile;
    },
    async listCoverage() {
      return (savedInput?.criteria ?? []).map((criterion, index) => ({
        criterionId: index + 1,
        sourceCode: criterion.sourceCode,
        criterionName: criterion.tagName,
        activeQuestionCount: coverageReady ? 2 : 1,
        requiredQuestionCount: 2,
        ready: coverageReady,
      }));
    },
    async activateProfile() {
      profile = profile ? { ...profile, status: 'ACTIVE' } : profile;
      return profile!;
    },
  };
  const officialApi = {
    isConfigured: () => false,
    searchUnits: async () => [],
    source: () => ({
      sourceProvider: '한국산업인력공단',
      sourceUrl: 'https://www.data.go.kr/data/15128213/openapi.do',
    }),
  } as unknown as NcsOfficialApiClient;

  return {
    service: new NcsEvaluationProfileService(repository, officialApi),
    savedInput: () => savedInput,
    makeCoverageReady: () => { coverageReady = true; },
  };
}

describe('NcsEvaluationProfileService', () => {
  it('materializes official NCS, company behavior, and service evidence criteria with a 100-point weight', async () => {
    const harness = createHarness();
    const result = await harness.service.saveProfile(companyUser, {
      postingId: 11,
      ncsWeight: 60,
      companyWeight: 25,
      serviceWeight: 15,
      selections: [
        { ncsUnitId: 1, weight: 34, sortOrder: 1 },
        { ncsUnitId: 2, weight: 33, sortOrder: 2 },
        { ncsUnitId: 3, weight: 33, sortOrder: 3 },
      ],
    });

    const criteria = harness.savedInput()?.criteria ?? [];
    expect(result.status).toBe('DRAFT');
    expect(criteria).toHaveLength(5);
    expect(criteria.reduce((sum, criterion) => sum + criterion.weight, 0)).toBe(100);
    expect(criteria.filter((criterion) => criterion.sourceType === 'NCS_OFFICIAL')).toHaveLength(3);
    expect(criteria.some((criterion) => criterion.sourceType === 'COMPANY_TALENT')).toBe(true);
    expect(criteria.some((criterion) => criterion.sourceType === 'SERVICE_COMMON')).toBe(true);
  });

  it('requires two independent questions for every criterion before activation', async () => {
    const harness = createHarness();
    await harness.service.saveProfile(companyUser, {
      postingId: 11,
      ncsWeight: 60,
      companyWeight: 25,
      serviceWeight: 15,
      selections: [
        { ncsUnitId: 1, weight: 34, sortOrder: 1 },
        { ncsUnitId: 2, weight: 33, sortOrder: 2 },
        { ncsUnitId: 3, weight: 33, sortOrder: 3 },
      ],
    });

    await expect(harness.service.activateProfile(companyUser, 11)).rejects.toBeInstanceOf(ApiException);
    harness.makeCoverageReady();
    const active = await harness.service.activateProfile(companyUser, 11);
    expect(active.status).toBe('ACTIVE');
  });
});
