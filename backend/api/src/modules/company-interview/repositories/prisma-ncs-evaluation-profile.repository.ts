import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma.service';
import type {
  EvaluationProfileCoverage,
  EvaluationProfilePostingRecord,
  NcsCompetencyUnitRecord,
  NcsOfficialUnitInput,
  PostingEvaluationProfileRecord,
} from '../ncs-evaluation-profile.types';
import type {
  NcsEvaluationProfileRepository,
  SaveEvaluationProfileInput,
} from './ncs-evaluation-profile.repository';

const unitInclude = {
  elements: { orderBy: { elementNumber: 'asc' as const } },
};

@Injectable()
export class PrismaNcsEvaluationProfileRepository
  implements NcsEvaluationProfileRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findOwnedPosting(
    postingId: number,
    companyId: number,
  ): Promise<EvaluationProfilePostingRecord | undefined> {
    const posting = await this.prisma.posting.findFirst({
      where: { postingId: BigInt(postingId), companyId: BigInt(companyId) },
      include: { company: true },
    });
    if (!posting) {
      return undefined;
    }
    return {
      postingId: Number(posting.postingId),
      companyId: Number(posting.companyId),
      title: posting.title,
      jobRole: posting.jobRole,
      jobDescription: posting.jobDescription ?? undefined,
      talentProfile: posting.company.talentProfile ?? undefined,
      evaluationPolicy: posting.company.evaluationPolicy ?? undefined,
    };
  }

  async searchUnits(query: string, limit: number): Promise<NcsCompetencyUnitRecord[]> {
    const units = await this.prisma.ncsCompetencyUnit.findMany({
      where: {
        isCurrent: true,
        OR: [
          { unitName: { contains: query, mode: 'insensitive' } },
          { definition: { contains: query, mode: 'insensitive' } },
          { subdivisionName: { contains: query, mode: 'insensitive' } },
          { elements: { some: { elementName: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: unitInclude,
      orderBy: [{ unitName: 'asc' }, { version: 'desc' }],
      take: limit,
    });
    return units.map(mapUnit);
  }

  async upsertOfficialUnits(units: NcsOfficialUnitInput[]): Promise<NcsCompetencyUnitRecord[]> {
    const saved: NcsCompetencyUnitRecord[] = [];
    for (const input of units) {
      const unit = await this.prisma.ncsCompetencyUnit.upsert({
        where: {
          classificationCode_version: {
            classificationCode: input.classificationCode,
            version: input.version,
          },
        },
        create: unitData(input),
        update: unitData(input),
      });
      for (const element of input.elements) {
        await this.prisma.ncsCompetencyElement.upsert({
          where: {
            ncsUnitId_elementCode: {
              ncsUnitId: unit.ncsUnitId,
              elementCode: element.elementCode,
            },
          },
          create: {
            ncsUnitId: unit.ncsUnitId,
            elementCode: element.elementCode,
            elementNumber: element.elementNumber,
            elementName: element.elementName,
            elementLevel: element.elementLevel ?? null,
            rawData: element.rawData as Prisma.InputJsonValue,
          },
          update: {
            elementNumber: element.elementNumber,
            elementName: element.elementName,
            elementLevel: element.elementLevel ?? null,
            rawData: element.rawData as Prisma.InputJsonValue,
          },
        });
      }
      const hydrated = await this.prisma.ncsCompetencyUnit.findUniqueOrThrow({
        where: { ncsUnitId: unit.ncsUnitId },
        include: unitInclude,
      });
      saved.push(mapUnit(hydrated));
    }
    return saved;
  }

  async findUnitsByIds(ids: number[]): Promise<NcsCompetencyUnitRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const units = await this.prisma.ncsCompetencyUnit.findMany({
      where: { ncsUnitId: { in: ids.map(BigInt) }, isCurrent: true },
      include: unitInclude,
    });
    return units.map(mapUnit);
  }

  async findProfile(postingId: number): Promise<PostingEvaluationProfileRecord | undefined> {
    const profile = await this.prisma.postingEvaluationProfile.findUnique({
      where: { postingId: BigInt(postingId) },
      include: {
        selections: {
          orderBy: { sortOrder: 'asc' },
          include: { unit: { include: unitInclude } },
        },
      },
    });
    return profile ? mapProfile(profile) : undefined;
  }

  async canReplaceProfile(postingId: number): Promise<boolean> {
    const [questionSetCount, sessionCount, reportCount] = await Promise.all([
      this.prisma.interviewQuestionSet.count({ where: { postingId: BigInt(postingId) } }),
      this.prisma.interviewSession.count({
        where: { application: { postingId: BigInt(postingId) } },
      }),
      this.prisma.evaluationReport.count({
        where: { application: { postingId: BigInt(postingId) } },
      }),
    ]);
    return questionSetCount === 0 && sessionCount === 0 && reportCount === 0;
  }

  async saveDraftProfile(input: SaveEvaluationProfileInput): Promise<PostingEvaluationProfileRecord> {
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.postingEvaluationProfile.upsert({
        where: { postingId: BigInt(input.posting.postingId) },
        create: {
          postingId: BigInt(input.posting.postingId),
          status: 'DRAFT',
          ncsWeight: input.ncsWeight,
          companyWeight: input.companyWeight,
          serviceWeight: input.serviceWeight,
          rubricVersion: input.rubricVersion,
          companyTalentSnapshot: input.posting.talentProfile ?? null,
          evaluationPolicySnapshot: input.posting.evaluationPolicy ?? null,
          sourceSnapshot: input.sourceSnapshot as Prisma.InputJsonValue,
          activatedAt: null,
        },
        update: {
          status: 'DRAFT',
          ncsWeight: input.ncsWeight,
          companyWeight: input.companyWeight,
          serviceWeight: input.serviceWeight,
          rubricVersion: input.rubricVersion,
          companyTalentSnapshot: input.posting.talentProfile ?? null,
          evaluationPolicySnapshot: input.posting.evaluationPolicy ?? null,
          sourceSnapshot: input.sourceSnapshot as Prisma.InputJsonValue,
          activatedAt: null,
        },
      });

      await tx.postingNcsSelection.deleteMany({ where: { profileId: profile.profileId } });
      await tx.postingNcsSelection.createMany({
        data: input.selections.map((selection) => ({
          profileId: profile.profileId,
          ncsUnitId: BigInt(selection.ncsUnitId),
          weight: selection.weight,
          relevanceScore: selection.relevanceScore ?? null,
          rationale: selection.rationale ?? null,
          sortOrder: selection.sortOrder,
        })),
      });

      const existingCriteria = await tx.evaluationCriterion.findMany({
        where: { postingId: BigInt(input.posting.postingId) },
        select: { criterionId: true },
      });
      const criterionIds = existingCriteria.map((criterion) => criterion.criterionId);
      if (criterionIds.length > 0) {
        await tx.question.updateMany({
          where: { criterionId: { in: criterionIds } },
          data: { criterionId: null, isActive: false },
        });
        await tx.evaluationCriterion.deleteMany({
          where: { criterionId: { in: criterionIds } },
        });
      }

      for (const criterion of input.criteria) {
        const tag =
          (await tx.criterionTag.findFirst({
            where: { name: criterion.tagName, category: criterion.category },
            orderBy: { tagId: 'asc' },
          })) ??
          (await tx.criterionTag.create({
            data: {
              jobRole: input.posting.jobRole || 'Common',
              name: criterion.tagName,
              description: criterion.description,
              category: criterion.category,
              isActive: true,
              sortOrder:
                ((await tx.criterionTag.findFirst({
                  orderBy: [{ sortOrder: 'desc' }, { tagId: 'desc' }],
                  select: { sortOrder: true },
                }))?.sortOrder ?? 0) + 1,
            },
          }));

        await tx.evaluationCriterion.create({
          data: {
            postingId: BigInt(input.posting.postingId),
            tagId: tag.tagId,
            description: criterion.description,
            weight: criterion.weight,
            passScore: null,
            sortOrder: criterion.sortOrder,
            sourceType: criterion.sourceType,
            sourceCode: criterion.sourceCode,
            sourceVersion: criterion.sourceVersion,
            sourceName: criterion.sourceName,
            behaviorIndicators: criterion.behaviorIndicators,
            alignmentRationale: criterion.alignmentRationale,
            ncsUnitId: criterion.ncsUnitId ? BigInt(criterion.ncsUnitId) : null,
          },
        });
      }
    });

    return (await this.findProfile(input.posting.postingId))!;
  }

  async listCoverage(postingId: number): Promise<EvaluationProfileCoverage[]> {
    const criteria = await this.prisma.evaluationCriterion.findMany({
      where: {
        postingId: BigInt(postingId),
        sourceType: { in: ['NCS_OFFICIAL', 'COMPANY_TALENT', 'SERVICE_COMMON'] },
      },
      include: {
        tag: true,
        questions: { where: { isActive: true, questionType: { not: 'FOLLOW_UP' } } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return criteria.map((criterion) => ({
      criterionId: Number(criterion.criterionId),
      sourceCode: criterion.sourceCode ?? undefined,
      criterionName: criterion.tag.name,
      activeQuestionCount: criterion.questions.length,
      requiredQuestionCount: 2,
      ready: criterion.questions.length >= 2,
    }));
  }

  async activateProfile(postingId: number): Promise<PostingEvaluationProfileRecord> {
    await this.prisma.postingEvaluationProfile.update({
      where: { postingId: BigInt(postingId) },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });
    return (await this.findProfile(postingId))!;
  }
}

function unitData(input: NcsOfficialUnitInput): Prisma.NcsCompetencyUnitUncheckedCreateInput {
  return {
    unitCode: input.unitCode,
    classificationCode: input.classificationCode,
    unitName: input.unitName,
    definition: input.definition ?? null,
    unitLevel: input.unitLevel ?? null,
    developmentYear: input.developmentYear ?? null,
    version: input.version,
    ncsDegree: input.ncsDegree,
    isCurrent: input.isCurrent,
    largeCategoryCode: input.largeCategoryCode,
    largeCategoryName: input.largeCategoryName,
    mediumCategoryCode: input.mediumCategoryCode,
    mediumCategoryName: input.mediumCategoryName,
    smallCategoryCode: input.smallCategoryCode,
    smallCategoryName: input.smallCategoryName,
    subdivisionCode: input.subdivisionCode,
    subdivisionName: input.subdivisionName,
    dutyDefinition: input.dutyDefinition ?? null,
    sourceProvider: input.sourceProvider,
    sourceUrl: input.sourceUrl,
    sourceUpdatedAt: input.sourceUpdatedAt ? new Date(input.sourceUpdatedAt) : null,
    rawData: input.rawData as Prisma.InputJsonValue,
  };
}

function mapUnit(unit: any): NcsCompetencyUnitRecord {
  return {
    ncsUnitId: Number(unit.ncsUnitId),
    unitCode: unit.unitCode,
    classificationCode: unit.classificationCode,
    unitName: unit.unitName,
    definition: unit.definition ?? undefined,
    unitLevel: unit.unitLevel ?? undefined,
    developmentYear: unit.developmentYear ?? undefined,
    version: unit.version,
    ncsDegree: unit.ncsDegree,
    isCurrent: unit.isCurrent,
    largeCategoryCode: unit.largeCategoryCode,
    largeCategoryName: unit.largeCategoryName,
    mediumCategoryCode: unit.mediumCategoryCode,
    mediumCategoryName: unit.mediumCategoryName,
    smallCategoryCode: unit.smallCategoryCode,
    smallCategoryName: unit.smallCategoryName,
    subdivisionCode: unit.subdivisionCode,
    subdivisionName: unit.subdivisionName,
    dutyDefinition: unit.dutyDefinition ?? undefined,
    sourceProvider: unit.sourceProvider,
    sourceUrl: unit.sourceUrl,
    sourceUpdatedAt: unit.sourceUpdatedAt?.toISOString().slice(0, 10),
    elements: (unit.elements ?? []).map((element: any) => ({
      ncsElementId: Number(element.ncsElementId),
      elementCode: element.elementCode,
      elementNumber: element.elementNumber,
      elementName: element.elementName,
      elementLevel: element.elementLevel ?? undefined,
    })),
  };
}

function mapProfile(profile: any): PostingEvaluationProfileRecord {
  return {
    profileId: Number(profile.profileId),
    postingId: Number(profile.postingId),
    status: profile.status,
    ncsWeight: profile.ncsWeight,
    companyWeight: profile.companyWeight,
    serviceWeight: profile.serviceWeight,
    rubricVersion: profile.rubricVersion,
    companyTalentSnapshot: profile.companyTalentSnapshot ?? undefined,
    evaluationPolicySnapshot: profile.evaluationPolicySnapshot ?? undefined,
    sourceSnapshot:
      profile.sourceSnapshot && typeof profile.sourceSnapshot === 'object'
        ? (profile.sourceSnapshot as Record<string, unknown>)
        : undefined,
    activatedAt: profile.activatedAt?.toISOString(),
    selections: (profile.selections ?? []).map((selection: any) => ({
      selectionId: Number(selection.selectionId),
      ncsUnitId: Number(selection.ncsUnitId),
      weight: selection.weight,
      relevanceScore: selection.relevanceScore ?? undefined,
      rationale: selection.rationale ?? undefined,
      sortOrder: selection.sortOrder,
      unit: mapUnit(selection.unit),
    })),
  };
}
