import { Inject, Injectable } from "@nestjs/common";
import {
  ApplicationStatus,
  AuthProvider,
  DocumentStatus,
  DocumentType,
  NotificationChannel,
  PostingStatus,
  ScreeningDecision,
  UserStatus,
  UserType,
  type Prisma,
} from "@prisma/client";

import { PrismaService } from "../../../shared/prisma.service";
import type {
  ApplicantRecord,
  ApplicantSummaryRecord,
  CompanyFileAssetRecord,
  NormalizedApplicantListQuery,
  NormalizedListQuery,
  PublicRecruitmentRecord,
  RecruitmentRecord,
  ScreeningResultConfirmationRecord,
} from "../company-recruiting.types";

const postingActiveApplicationCountInclude = {
  _count: {
    select: {
      applications: {
        where: { applicationStatus: { not: ApplicationStatus.CANCELED } },
      },
    },
  },
} satisfies Prisma.PostingInclude;

// update 시 값이 없는 필드는 prisma 에서 건드리지 않도록 undefined 를 허용한다(발행 등 부분 수정에서 기존 값 보존).
export type PostingFilterFields = {
  jobRoleCode?: string | null;
  regionCode?: string | null;
  careerMinYears?: number | null;
  careerMaxYears?: number | null;
  employmentTypeCode?: string | null;
  recruitmentType?: string | null;
  workplaceAddress?: string | null;
  workplaceLat?: number | null;
  workplaceLng?: number | null;
};

export type CreatePostingInput = {
  companyId: number;
  title: string;
  jobRole: string;
  jobDescription: string | null;
  careerRequirement: string | null;
  educationRequirement: string | null;
  salaryInfo: string | null;
  workLocation: string | null;
  employmentType: string | null;
  startsOn: Date | null;
  endsOn: Date | null;
  status: PostingStatus;
} & PostingFilterFields;

export type UpdatePostingInput = {
  title: string;
  jobRole: string;
  jobDescription: string | null;
  careerRequirement: string | null;
  educationRequirement: string | null;
  salaryInfo: string | null;
  workLocation: string | null;
  employmentType: string | null;
  startsOn: Date | null;
  endsOn: Date | null;
  status: PostingStatus;
} & PostingFilterFields;

export type CreateCandidateInput = {
  name: string;
  email: string;
  phone: string | null;
};

export type CreatePublicCandidateInput = CreateCandidateInput & {
  githubUrl: string | null;
  portfolioUrl: string | null;
  summary: string | null;
};

export type RecruitingUserAccount = {
  userId: number;
  userType: UserType;
  hasCandidateProfile: boolean;
};

export type CreateApplicationInput = {
  postingId: number;
  candidateId: number;
  applicantName?: string;
  applicantEmail?: string;
  applicantPhone?: string;
  githubUrl?: string;
  blogUrl?: string;
  portfolioUrl?: string | null;
  motivation?: string;
  additionalInfo?: string;
  screeningMemo: string | null;
  documentStatus?: DocumentStatus;
};

export type UpdateApplicationScreeningInput = {
  screeningDecision: ScreeningDecision;
  screeningMemo: string | null;
};

export type UpdateApplicationScreeningReviewInput = {
  screeningReviewerDecision: ScreeningDecision | null;
  screeningDecisionOverrideReason: string | null;
};

export type CreateFileAssetInput = {
  ownerUserId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type CreateApplicationDocumentInput = {
  applicationId: number;
  fileId: number;
  documentType: DocumentType;
};

export type CompanyRecruitingRepositoryPort = {
  createPosting(input: CreatePostingInput): Promise<RecruitmentRecord>;
  updatePosting(postingId: number, companyId: number, input: UpdatePostingInput): Promise<RecruitmentRecord | null>;
  archivePosting(postingId: number, companyId: number): Promise<RecruitmentRecord | null>;
  listPostings(companyId: number, query: NormalizedListQuery): Promise<RecruitmentRecord[]>;
  countPostings(companyId: number, query: NormalizedListQuery): Promise<number>;
  findPostingForCompany(postingId: number, companyId: number): Promise<RecruitmentRecord | null>;
  findOpenPostingForPublic(postingId: number): Promise<PublicRecruitmentRecord | null>;
  findApplicationByPostingAndEmail(postingId: number, email: string): Promise<{ applicationId: number } | null>;
  findPublicApplicationStatusById(applicationId: number): Promise<ApplicantRecord | null>;
  findUserAccountByEmail(email: string): Promise<RecruitingUserAccount | null>;
  findOrCreateCandidate(input: CreateCandidateInput): Promise<{ candidateId: number }>;
  findOrCreatePublicCandidate(input: CreatePublicCandidateInput): Promise<{ candidateId: number; userId: number }>;
  createApplication(input: CreateApplicationInput): Promise<ApplicantRecord>;
  listApplicationsForPosting(
    postingId: number,
    companyId: number,
    query: NormalizedApplicantListQuery,
  ): Promise<ApplicantRecord[]>;
  countApplicationsForPosting(postingId: number, companyId: number, query: NormalizedApplicantListQuery): Promise<number>;
  summarizeApplicationsForPosting(postingId: number, companyId: number): Promise<ApplicantSummaryRecord>;
  listApplicationsForPassTargeting(postingId: number, companyId: number): Promise<ApplicantRecord[]>;
  finalizeApplicationsPassTarget(postingId: number, companyId: number, applicationIds: number[]): Promise<ApplicantRecord[]>;
  promoteApplicationsToPass(applicationIds: number[], companyId: number): Promise<ApplicantRecord[]>;
  markPassMailSent(applicationId: number, companyId: number): Promise<void>;
  markPassMailFailed(applicationId: number, companyId: number, errorMessage: string): Promise<void>;
  restoreApplicationScreeningDecisions(
    postingId: number,
    companyId: number,
    states: ApplicationScreeningRestoreState[],
  ): Promise<ApplicantRecord[]>;
  findApplicationForCompany(applicationId: number, companyId: number): Promise<ApplicantRecord | null>;
  updateApplicationScreening(
    applicationId: number,
    companyId: number,
    input: UpdateApplicationScreeningInput,
  ): Promise<ApplicantRecord | null>;
  updateApplicationScreeningReview(
    applicationId: number,
    companyId: number,
    input: UpdateApplicationScreeningReviewInput,
  ): Promise<ApplicantRecord | null>;
  confirmScreeningResults(
    postingId: number,
    companyId: number,
    confirmedByUserId: number,
    expectedEligibleCount: number,
  ): Promise<ScreeningResultConfirmationRecord>;
  markScreeningResultEmailNotification(notificationId: number, status: "SENT" | "FAILED"): Promise<void>;
  createFileAsset(input: CreateFileAssetInput): Promise<CompanyFileAssetRecord>;
  createApplicationDocument(input: CreateApplicationDocumentInput): Promise<{ documentId: number }>;
};

export type ApplicationScreeningRestoreState = {
  applicationId: number;
  screeningDecision: string | null;
  screeningMemo: string | null;
};

@Injectable()
export class PrismaCompanyRecruitingRepository implements CompanyRecruitingRepositoryPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createPosting(input: CreatePostingInput): Promise<RecruitmentRecord> {
    const posting = await this.prisma.posting.create({
      data: {
        ...input,
        companyId: BigInt(input.companyId),
      },
      include: postingActiveApplicationCountInclude,
    });
    return mapPosting(posting);
  }

  async updatePosting(postingId: number, companyId: number, input: UpdatePostingInput): Promise<RecruitmentRecord | null> {
    const ownedPosting = await this.prisma.posting.findFirst({
      where: { postingId: BigInt(postingId), companyId: BigInt(companyId) },
      select: { postingId: true },
    });
    if (!ownedPosting) {
      return null;
    }

    const posting = await this.prisma.posting.update({
      where: { postingId: BigInt(postingId) },
      data: input,
      include: postingActiveApplicationCountInclude,
    });
    return mapPosting(posting);
  }

  async archivePosting(postingId: number, companyId: number): Promise<RecruitmentRecord | null> {
    const ownedPosting = await this.prisma.posting.findFirst({
      where: { postingId: BigInt(postingId), companyId: BigInt(companyId) },
      select: { postingId: true },
    });
    if (!ownedPosting) {
      return null;
    }

    const posting = await this.prisma.posting.update({
      where: { postingId: BigInt(postingId) },
      data: { status: PostingStatus.ARCHIVED },
      include: postingActiveApplicationCountInclude,
    });
    return mapPosting(posting);
  }

  async listPostings(companyId: number, query: NormalizedListQuery): Promise<RecruitmentRecord[]> {
    const postings = await this.prisma.posting.findMany({
      where: buildPostingWhere(companyId, query),
      orderBy: buildPostingOrderBy(query),
      skip: query.skip,
      take: query.take,
      include: postingActiveApplicationCountInclude,
    });
    return postings.map(mapPosting);
  }

  async countPostings(companyId: number, query: NormalizedListQuery): Promise<number> {
    return this.prisma.posting.count({ where: buildPostingWhere(companyId, query) });
  }

  async findPostingForCompany(postingId: number, companyId: number): Promise<RecruitmentRecord | null> {
    const posting = await this.prisma.posting.findFirst({
      where: { postingId: BigInt(postingId), companyId: BigInt(companyId) },
      include: postingActiveApplicationCountInclude,
    });
    return posting ? mapPosting(posting) : null;
  }

  async findOpenPostingForPublic(postingId: number): Promise<PublicRecruitmentRecord | null> {
    const posting = await this.prisma.posting.findFirst({
      where: {
        postingId: BigInt(postingId),
        status: PostingStatus.OPEN,
      },
      include: {
        company: { select: { name: true } },
      },
    });
    return posting ? mapPublicPosting(posting) : null;
  }

  async findApplicationByPostingAndEmail(postingId: number, email: string): Promise<{ applicationId: number } | null> {
    const application = await this.prisma.application.findFirst({
      where: {
        postingId: BigInt(postingId),
        candidate: {
          user: {
            email,
          },
        },
      },
      select: { applicationId: true },
    });
    return application ? { applicationId: Number(application.applicationId) } : null;
  }

  async findPublicApplicationStatusById(applicationId: number): Promise<ApplicantRecord | null> {
    const application = await this.prisma.application.findUnique({
      where: { applicationId: BigInt(applicationId) },
      include: applicantInclude,
    });
    return application ? mapApplicant(application) : null;
  }

  async findUserAccountByEmail(email: string): Promise<RecruitingUserAccount | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        userId: true,
        userType: true,
        candidateProfile: { select: { candidateId: true } },
      },
    });
    return user
      ? {
          userId: Number(user.userId),
          userType: user.userType,
          hasCandidateProfile: Boolean(user.candidateProfile),
        }
      : null;
  }

  async findOrCreateCandidate(input: CreateCandidateInput): Promise<{ candidateId: number }> {
    return this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: input.email },
        include: { candidateProfile: true },
      });

      if (existingUser?.candidateProfile) {
        return { candidateId: Number(existingUser.candidateProfile.candidateId) };
      }

      if (existingUser) {
        if (existingUser.userType !== UserType.CANDIDATE) {
          throw new Error("USER_TYPE_MISMATCH");
        }
        const profile = await tx.candidateProfile.create({
          data: {
            userId: existingUser.userId,
            summary: "Registered by company recruiter.",
          },
        });
        return { candidateId: Number(profile.candidateId) };
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: null,
          userType: UserType.CANDIDATE,
          name: input.name,
          phone: input.phone,
          status: UserStatus.PENDING,
          authProvider: AuthProvider.LOCAL,
        },
      });
      const profile = await tx.candidateProfile.create({
        data: {
          userId: user.userId,
          summary: "Registered by company recruiter.",
        },
      });
      return { candidateId: Number(profile.candidateId) };
    });
  }

  async findOrCreatePublicCandidate(input: CreatePublicCandidateInput): Promise<{ candidateId: number; userId: number }> {
    return this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: input.email },
        include: { candidateProfile: true },
      });

      if (existingUser?.candidateProfile) {
        return { candidateId: Number(existingUser.candidateProfile.candidateId), userId: Number(existingUser.userId) };
      }

      if (existingUser) {
        throw new Error(existingUser.userType === UserType.CANDIDATE ? "EXISTING_USER_REQUIRES_VERIFICATION" : "USER_TYPE_MISMATCH");
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: null,
          userType: UserType.CANDIDATE,
          name: input.name,
          phone: input.phone,
          status: UserStatus.PENDING,
          authProvider: AuthProvider.LOCAL,
        },
      });
      const profile = await tx.candidateProfile.create({
        data: {
          userId: user.userId,
          githubUrl: input.githubUrl,
          portfolioUrl: input.portfolioUrl,
          summary: input.summary || "Submitted through public application form.",
        },
      });
      return { candidateId: Number(profile.candidateId), userId: Number(user.userId) };
    });
  }

  async createApplication(input: CreateApplicationInput): Promise<ApplicantRecord> {
    const application = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ posting_id: bigint }>>`
        SELECT "posting_id"
        FROM "postings"
        WHERE "posting_id" = ${BigInt(input.postingId)}
        FOR KEY SHARE
      `;
      return tx.application.create({
        data: {
          postingId: BigInt(input.postingId),
          candidateId: BigInt(input.candidateId),
          ...(input.applicantName !== undefined ? { applicantName: input.applicantName } : {}),
          ...(input.applicantEmail !== undefined ? { applicantEmail: input.applicantEmail } : {}),
          ...(input.applicantPhone !== undefined ? { applicantPhone: input.applicantPhone } : {}),
          ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
          ...(input.blogUrl !== undefined ? { blogUrl: input.blogUrl } : {}),
          ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
          ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
          ...(input.additionalInfo !== undefined ? { additionalInfo: input.additionalInfo } : {}),
          applicationStatus: ApplicationStatus.SUBMITTED,
          documentStatus: input.documentStatus ?? DocumentStatus.NOT_SUBMITTED,
          screeningDecision: ScreeningDecision.UNDECIDED,
          screeningMemo: input.screeningMemo,
        },
        include: applicantInclude,
      });
    });
    return mapApplicant(application);
  }

  async listApplicationsForPosting(
    postingId: number,
    companyId: number,
    query: NormalizedApplicantListQuery,
  ): Promise<ApplicantRecord[]> {
    if (query.sort === "score") {
      const applications = await this.prisma.application.findMany({
        where: buildApplicationWhere(postingId, companyId, query),
        include: applicantListInclude,
      });
      return applications
        .map(mapApplicantList)
        .sort((left, right) => compareApplicantsByScore(left, right, query.order))
        .slice(query.skip, query.skip + query.take);
    }

    const applications = await this.prisma.application.findMany({
      where: buildApplicationWhere(postingId, companyId, query),
      orderBy: buildApplicationOrderBy(query),
      skip: query.skip,
      take: query.take,
      include: applicantListInclude,
    });
    return applications.map(mapApplicantList);
  }

  async countApplicationsForPosting(postingId: number, companyId: number, query: NormalizedApplicantListQuery): Promise<number> {
    return this.prisma.application.count({
      where: buildApplicationWhere(postingId, companyId, query),
    });
  }

  async summarizeApplicationsForPosting(postingId: number, companyId: number): Promise<ApplicantSummaryRecord> {
    const ownedPosting = { posting: { companyId: BigInt(companyId) }, postingId: BigInt(postingId) };
    const activeWhere = { ...ownedPosting, applicationStatus: { not: ApplicationStatus.CANCELED } };
    const [
      activeTotal,
      canceledHistoryTotal,
      applicationStatuses,
      documentStatuses,
      interviewStatuses,
      reportStatuses,
      screeningDecisions,
      screeningResultRows,
      attentionRequiredTotal,
    ] = await Promise.all([
      this.prisma.application.count({ where: activeWhere }),
      this.prisma.application.count({ where: { ...ownedPosting, applicationStatus: ApplicationStatus.CANCELED } }),
      this.prisma.application.groupBy({ by: ["applicationStatus"], where: activeWhere, _count: { _all: true } }),
      this.prisma.application.groupBy({ by: ["documentStatus"], where: activeWhere, _count: { _all: true } }),
      this.prisma.application.groupBy({ by: ["interviewStatus"], where: activeWhere, _count: { _all: true } }),
      this.prisma.application.groupBy({ by: ["reportStatus"], where: activeWhere, _count: { _all: true } }),
      this.prisma.application.groupBy({ by: ["screeningDecision"], where: activeWhere, _count: { _all: true } }),
      this.prisma.application.findMany({
        where: activeWhere,
        select: {
          screeningDecision: true,
          screeningReviewerDecision: true,
          screeningFinalDecision: true,
          screeningResultConfirmedAt: true,
        },
      }),
      this.prisma.application.count({
        where: {
          ...activeWhere,
          OR: [
            { documentStatus: DocumentStatus.FAILED },
            { interviewStatus: "FAILED" },
            { reportStatus: "FAILED" },
            { screeningDecision: ScreeningDecision.UNDECIDED },
            { screeningDecision: ScreeningDecision.RETRY },
            { screeningDecision: null },
          ],
        },
      }),
    ]);

    const effectiveScreeningDecisionCounts = screeningResultRows.reduce<Record<string, number>>((counts, row) => {
      const decision = row.screeningResultConfirmedAt
        ? row.screeningFinalDecision ?? ScreeningDecision.UNDECIDED
        : row.screeningReviewerDecision ?? row.screeningDecision ?? ScreeningDecision.UNDECIDED;
      counts[decision] = (counts[decision] ?? 0) + 1;
      return counts;
    }, {});
    const confirmationEligibleDecisionCounts: Record<"PASS" | "HOLD" | "FAIL", number> = {
      PASS: 0,
      HOLD: 0,
      FAIL: 0,
    };
    for (const row of screeningResultRows) {
      const decision = row.screeningReviewerDecision ?? row.screeningDecision;
      if (row.screeningResultConfirmedAt === null && isFinalScreeningDecision(decision)) {
        confirmationEligibleDecisionCounts[decision] += 1;
      }
    }
    const confirmationEligibleTotal = Object.values(confirmationEligibleDecisionCounts)
      .reduce((total, count) => total + count, 0);
    const confirmedTotal = screeningResultRows.filter((row) => row.screeningResultConfirmedAt !== null).length;

    return {
      activeTotal,
      canceledHistoryTotal,
      applicationStatusCounts: toGroupCountMap(applicationStatuses, "applicationStatus"),
      documentStatusCounts: toGroupCountMap(documentStatuses, "documentStatus"),
      interviewStatusCounts: toGroupCountMap(interviewStatuses, "interviewStatus"),
      reportStatusCounts: toGroupCountMap(reportStatuses, "reportStatus"),
      screeningDecisionCounts: toScreeningDecisionCountMap(screeningDecisions),
      effectiveScreeningDecisionCounts,
      confirmationEligibleTotal,
      confirmationEligibleDecisionCounts,
      confirmedTotal,
      excludedTotal: screeningResultRows.length - confirmationEligibleTotal - confirmedTotal,
      attentionRequiredTotal,
    };
  }

  async listApplicationsForPassTargeting(postingId: number, companyId: number): Promise<ApplicantRecord[]> {
    const applications = await this.prisma.application.findMany({
      where: {
        postingId: BigInt(postingId),
        posting: { companyId: BigInt(companyId) },
        applicationStatus: { not: ApplicationStatus.CANCELED },
      },
      include: applicantListInclude,
    });
    return applications.map(mapApplicantList);
  }

  async finalizeApplicationsPassTarget(
    postingId: number,
    companyId: number,
    applicationIds: number[],
  ): Promise<ApplicantRecord[]> {
    const passIds = applicationIds.map((applicationId) => BigInt(applicationId));
    const activePostingWhere = {
      postingId: BigInt(postingId),
      posting: { companyId: BigInt(companyId) },
      applicationStatus: { not: ApplicationStatus.CANCELED },
    };
    const passTargetDecisionWhere = {
      screeningDecision: { in: [ScreeningDecision.PASS, ScreeningDecision.FAIL] },
    };

    return this.prisma.$transaction(async (tx) => {
      await tx.application.updateMany({
        where: {
          ...activePostingWhere,
          ...passTargetDecisionWhere,
          ...(passIds.length > 0 ? { applicationId: { notIn: passIds } } : {}),
        },
        data: {
          screeningDecision: ScreeningDecision.FAIL,
          screeningDecisionReasonCode: null,
          screeningDecisionPolicyVersion: null,
          screeningPolicyVersion: null,
          screeningCriteriaVersion: null,
          screeningDecisionReportId: null,
          screeningDecidedAt: null,
          screeningMemo: "목표 합격자 수 기준 불합격 처리",
        },
      });

      if (passIds.length === 0) {
        return [];
      }

      await tx.application.updateMany({
        where: {
          ...activePostingWhere,
          ...passTargetDecisionWhere,
          applicationId: { in: passIds },
        },
        data: {
          screeningDecision: ScreeningDecision.PASS,
          screeningDecisionReasonCode: null,
          screeningDecisionPolicyVersion: null,
          screeningPolicyVersion: null,
          screeningCriteriaVersion: null,
          screeningDecisionReportId: null,
          screeningDecidedAt: null,
          screeningMemo: "목표 합격자 수 기준 합격 처리",
        },
      });

      const applications = await tx.application.findMany({
        where: {
          ...activePostingWhere,
          ...passTargetDecisionWhere,
          applicationId: { in: passIds },
        },
        include: applicantListInclude,
      });
      return applications.map(mapApplicantList);
    });
  }

  async promoteApplicationsToPass(applicationIds: number[], companyId: number): Promise<ApplicantRecord[]> {
    if (applicationIds.length === 0) {
      return [];
    }

    const ids = applicationIds.map((applicationId) => BigInt(applicationId));
    await this.prisma.application.updateMany({
      where: {
        applicationId: { in: ids },
        posting: { companyId: BigInt(companyId) },
      },
      data: {
        screeningDecision: ScreeningDecision.PASS,
        screeningMemo: "목표 합격자 수 기준 자동 합격 처리",
      },
    });

    const applications = await this.prisma.application.findMany({
      where: {
        applicationId: { in: ids },
        posting: { companyId: BigInt(companyId) },
      },
      include: applicantListInclude,
    });
    return applications.map(mapApplicantList);
  }

  async findApplicationForCompany(applicationId: number, companyId: number): Promise<ApplicantRecord | null> {
    const application = await this.prisma.application.findFirst({
      where: { applicationId: BigInt(applicationId), posting: { companyId: BigInt(companyId) } },
      include: applicantDetailInclude,
    });
    return application ? mapApplicant(application) : null;
  }

  async updateApplicationScreening(
    applicationId: number,
    companyId: number,
    input: UpdateApplicationScreeningInput,
  ): Promise<ApplicantRecord | null> {
    const updated = await this.prisma.application.updateMany({
      where: {
        applicationId: BigInt(applicationId),
        posting: { companyId: BigInt(companyId) },
        screeningResultConfirmedAt: null,
      },
      data: {
        screeningDecision: input.screeningDecision,
        screeningMemo: input.screeningMemo,
        screeningDecisionReasonCode: null,
        screeningDecisionPolicyVersion: null,
        screeningPolicyVersion: null,
        screeningCriteriaVersion: null,
        screeningDecisionReportId: null,
        screeningDecidedAt: null,
      },
    });
    if (updated.count === 0) return null;

    const application = await this.prisma.application.findUnique({
      where: { applicationId: BigInt(applicationId) },
      include: applicantInclude,
    });
    return application ? mapApplicant(application) : null;
  }

  async updateApplicationScreeningReview(
    applicationId: number,
    companyId: number,
    input: UpdateApplicationScreeningReviewInput,
  ): Promise<ApplicantRecord | null> {
    const updated = await this.prisma.application.updateMany({
      where: {
        applicationId: BigInt(applicationId),
        posting: { companyId: BigInt(companyId) },
        screeningResultConfirmedAt: null,
      },
      data: {
        screeningReviewerDecision: input.screeningReviewerDecision,
        screeningDecisionOverrideReason: input.screeningDecisionOverrideReason,
      },
    });
    if (updated.count === 0) return null;

    const application = await this.prisma.application.findUnique({
      where: { applicationId: BigInt(applicationId) },
      include: applicantInclude,
    });
    return application ? mapApplicant(application) : null;
  }

  async confirmScreeningResults(
    postingId: number,
    companyId: number,
    confirmedByUserId: number,
    expectedEligibleCount: number,
  ): Promise<ScreeningResultConfirmationRecord> {
    return this.prisma.$transaction(async (tx) => {
      type LockedScreeningRow = {
        application_id: bigint;
        user_id: bigint;
        email: string;
        name: string;
        screening_decision: ScreeningDecision | null;
        screening_reviewer_decision: ScreeningDecision | null;
        screening_final_decision: ScreeningDecision | null;
        screening_result_confirmed_at: Date | null;
      };

      const rows = await tx.$queryRaw<LockedScreeningRow[]>`
        SELECT
          a."application_id",
          u."user_id",
          COALESCE(a."applicant_email", u."email") AS "email",
          COALESCE(a."applicant_name", u."name") AS "name",
          a."screening_decision",
          a."screening_reviewer_decision",
          a."screening_final_decision",
          a."screening_result_confirmed_at"
        FROM "applications" a
        JOIN "postings" p ON p."posting_id" = a."posting_id"
        JOIN "candidate_profiles" cp ON cp."candidate_id" = a."candidate_id"
        JOIN "users" u ON u."user_id" = cp."user_id"
        WHERE a."posting_id" = ${BigInt(postingId)}
          AND p."company_id" = ${BigInt(companyId)}
          AND a."application_status" <> 'CANCELED'
        FOR UPDATE OF a
      `;

      const effectiveDecision = (row: LockedScreeningRow) =>
        row.screening_reviewer_decision ?? row.screening_decision;
      const isEligible = (
        decision: ScreeningDecision | null,
      ): decision is "PASS" | "HOLD" | "FAIL" =>
        decision === ScreeningDecision.PASS || decision === ScreeningDecision.HOLD || decision === ScreeningDecision.FAIL;
      const pending = rows.filter((row) => row.screening_result_confirmed_at === null && isEligible(effectiveDecision(row)));
      const confirmed = rows.filter((row) => row.screening_result_confirmed_at !== null && isEligible(row.screening_final_decision));
      const excludedCounts = rows.reduce<Record<"UNDECIDED" | "RETRY", number>>((counts, row) => {
        if (row.screening_result_confirmed_at !== null) return counts;
        const decision = effectiveDecision(row);
        if (decision === ScreeningDecision.RETRY) counts.RETRY += 1;
        else if (!isEligible(decision)) counts.UNDECIDED += 1;
        return counts;
      }, { UNDECIDED: 0, RETRY: 0 });
      const excludedCount = excludedCounts.UNDECIDED + excludedCounts.RETRY;

      if (pending.length === 0 && confirmed.length > 0) {
        const retryableNotifications = await tx.notification.findMany({
          where: {
            applicationId: { in: confirmed.map((row) => row.application_id) },
            channel: NotificationChannel.EMAIL,
            notificationType: "SCREENING_RESULT_CONFIRMED",
            status: { in: ["PENDING", "FAILED"] },
          },
        });
        const notificationByApplication = new Map(
          retryableNotifications.map((notification) => [notification.applicationId?.toString() ?? "", notification]),
        );
        const emailRecipients = confirmed.flatMap((row) => {
          const notification = notificationByApplication.get(row.application_id.toString());
          const decision = row.screening_final_decision;
          return notification && isEligible(decision)
            ? [{
                notificationId: Number(notification.notificationId),
                applicationId: Number(row.application_id),
                userId: Number(row.user_id),
                email: row.email,
                name: row.name,
                decision,
              }]
            : [];
        });
        return buildConfirmationRecord(confirmed, excludedCounts, true, emailRecipients);
      }
      if (pending.length !== expectedEligibleCount) {
        return {
          scopeChanged: true,
          idempotent: false,
          eligibleCount: pending.length,
          excludedCount,
          excludedCounts,
          confirmedCount: confirmed.length,
          decisionCounts: { PASS: 0, HOLD: 0, FAIL: 0 },
          confirmedAt: confirmed[0]?.screening_result_confirmed_at ?? null,
          emailRecipients: [],
        };
      }

      const confirmationTime = new Date();
      if (pending.length > 0) {
        await tx.$executeRaw`
          UPDATE "applications"
          SET
            "screening_final_decision" = COALESCE("screening_reviewer_decision", "screening_decision"),
            "screening_result_confirmed_at" = ${confirmationTime},
            "screening_result_confirmed_by_user_id" = ${BigInt(confirmedByUserId)}
          WHERE "posting_id" = ${BigInt(postingId)}
            AND "screening_result_confirmed_at" IS NULL
            AND COALESCE("screening_reviewer_decision", "screening_decision") IN ('PASS', 'HOLD', 'FAIL')
        `;

        await tx.notification.createMany({
          data: pending.flatMap((row) => [
            {
              userId: row.user_id,
              applicationId: row.application_id,
              channel: NotificationChannel.IN_APP,
              notificationType: "SCREENING_RESULT_CONFIRMED",
              status: "PENDING",
            },
            {
              userId: row.user_id,
              applicationId: row.application_id,
              channel: NotificationChannel.EMAIL,
              notificationType: "SCREENING_RESULT_CONFIRMED",
              status: "PENDING",
            },
          ]),
          skipDuplicates: true,
        });
      }

      const emailNotifications = await tx.notification.findMany({
        where: {
          applicationId: { in: pending.map((row) => row.application_id) },
          channel: NotificationChannel.EMAIL,
          notificationType: "SCREENING_RESULT_CONFIRMED",
          status: "PENDING",
        },
      });
      const notificationByApplication = new Map(
        emailNotifications.map((notification) => [notification.applicationId?.toString() ?? "", notification]),
      );
      const finalizedPending = pending.map((row) => ({
        ...row,
        screening_final_decision: effectiveDecision(row),
        screening_result_confirmed_at: confirmationTime,
      }));
      const emailRecipients = finalizedPending.flatMap((row) => {
        const notification = notificationByApplication.get(row.application_id.toString());
        const decision = row.screening_final_decision;
        return notification && isEligible(decision)
          ? [{
              notificationId: Number(notification.notificationId),
              applicationId: Number(row.application_id),
              userId: Number(row.user_id),
              email: row.email,
              name: row.name,
              decision,
            }]
          : [];
      });

      return buildConfirmationRecord([...confirmed, ...finalizedPending], excludedCounts, false, emailRecipients);
    });
  }

  async markScreeningResultEmailNotification(notificationId: number, status: "SENT" | "FAILED"): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        notificationId: BigInt(notificationId),
        channel: NotificationChannel.EMAIL,
        notificationType: "SCREENING_RESULT_CONFIRMED",
      },
      data: { status, sentAt: status === "SENT" ? new Date() : null },
    });
  }

  async markPassMailSent(applicationId: number, companyId: number): Promise<void> {
    await this.prisma.application.updateMany({
      where: {
        applicationId: BigInt(applicationId),
        posting: { companyId: BigInt(companyId) },
      },
      data: {
        passMailDeliveryStatus: "SENT",
        passMailSentAt: new Date(),
        passMailFailedAt: null,
        passMailFailureReason: null,
      },
    });
  }

  async markPassMailFailed(applicationId: number, companyId: number, errorMessage: string): Promise<void> {
    await this.prisma.application.updateMany({
      where: {
        applicationId: BigInt(applicationId),
        posting: { companyId: BigInt(companyId) },
      },
      data: {
        passMailDeliveryStatus: "FAILED",
        passMailFailedAt: new Date(),
        passMailFailureReason: truncatePassMailFailureReason(errorMessage),
      },
    });
  }

  async restoreApplicationScreeningDecisions(
    postingId: number,
    companyId: number,
    states: ApplicationScreeningRestoreState[],
  ): Promise<ApplicantRecord[]> {
    if (states.length === 0) {
      return [];
    }

    const activePostingWhere = {
      postingId: BigInt(postingId),
      posting: { companyId: BigInt(companyId) },
      applicationStatus: { not: ApplicationStatus.CANCELED },
    };

    await this.prisma.$transaction(states.map((state) =>
      this.prisma.application.updateMany({
        where: {
          ...activePostingWhere,
          applicationId: BigInt(state.applicationId),
        },
        data: {
          screeningDecision: state.screeningDecision as ScreeningDecision | null,
          screeningMemo: state.screeningMemo,
          screeningDecisionReasonCode: null,
          screeningDecisionPolicyVersion: null,
          screeningPolicyVersion: null,
          screeningCriteriaVersion: null,
          screeningDecisionReportId: null,
          screeningDecidedAt: null,
        },
      }),
    ));

    const ids = states.map((state) => BigInt(state.applicationId));
    const applications = await this.prisma.application.findMany({
      where: {
        ...activePostingWhere,
        applicationId: { in: ids },
      },
      include: applicantListInclude,
    });
    return applications.map(mapApplicantList);
  }

  async createFileAsset(input: CreateFileAssetInput): Promise<CompanyFileAssetRecord> {
    const fileAsset = await this.prisma.fileAsset.create({
      data: {
        ownerUserId: BigInt(input.ownerUserId),
        storageKey: input.storageKey,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        status: "ACTIVE",
      },
    });
    return mapFileAsset(fileAsset);
  }

  async createApplicationDocument(input: CreateApplicationDocumentInput): Promise<{ documentId: number }> {
    const document = await this.prisma.applicationDocument.create({
      data: {
        applicationId: BigInt(input.applicationId),
        fileId: BigInt(input.fileId),
        documentType: input.documentType,
        parseStatus: DocumentStatus.SUBMITTED,
      },
      select: { documentId: true },
    });
    return { documentId: Number(document.documentId) };
  }
}

const applicantInclude = {
  candidate: {
    include: {
      user: true,
    },
  },
  posting: {
    include: { autoScreeningPolicy: true },
  },
  evaluationReports: {
    orderBy: { reportId: "desc" as const },
    take: 1,
    include: {
      ncsAnswerEvaluations: {
        orderBy: [{ answerId: "asc" as const }, { ncsEvaluationId: "asc" as const }],
        include: {
          evidences: { orderBy: { sortOrder: "asc" as const } },
          sessionQuestion: {
            select: {
              runtimeQuestionId: true,
              generationSource: true,
              content: true,
              ncsQuestionMode: true,
              sortOrder: true,
            },
          },
        },
      },
      scores: {
        include: {
          criterion: {
            include: {
              tag: true,
            },
          },
          evidences: true,
        },
      },
    },
  },
  interviewSessions: {
    orderBy: { sessionId: "desc" as const },
    take: 1,
  },
} satisfies Prisma.ApplicationInclude;

const applicantListInclude = {
  candidate: {
    include: {
      user: true,
    },
  },
  posting: {
    include: { autoScreeningPolicy: { select: { enabled: true } } },
  },
  evaluationReports: {
    orderBy: { reportId: "desc" as const },
    take: 1,
    select: {
      reportId: true,
      status: true,
      totalScore: true,
      summary: true,
      generatedAt: true,
    },
  },
  interviewSessions: {
    orderBy: { sessionId: "desc" as const },
    take: 1,
    select: {
      sessionId: true,
      status: true,
      interviewType: true,
      startedAt: true,
      completedAt: true,
    },
  },
} satisfies Prisma.ApplicationInclude;

const applicantDetailInclude = {
  ...applicantInclude,
  documents: {
    orderBy: { documentId: "asc" as const },
    include: { file: true },
  },
  interviewSessions: {
    orderBy: { sessionId: "desc" as const },
    take: 1,
    include: {
      answers: {
        orderBy: { answerId: "asc" as const },
        include: {
          question: true,
          sessionQuestion: {
            select: {
              sessionQuestionId: true,
              runtimeQuestionId: true,
              questionType: true,
              content: true,
            },
          },
          videoFile: true,
          audioFile: true,
          followUpQuestions: {
            orderBy: { createdAt: "asc" as const },
          },
        },
      },
    },
  },
} satisfies Prisma.ApplicationInclude;

type FollowUpAnswerCandidate = {
  answerId: bigint | number;
  sessionQuestionId?: bigint | number | null;
  submittedAt: Date | null;
  question?: {
    questionType?: string | null;
    content?: string | null;
  } | null;
  sessionQuestion?: {
    sessionQuestionId?: bigint | number | null;
    questionType?: string | null;
    content?: string | null;
  } | null;
};

type FollowUpQuestionCandidate = {
  insertedSessionQuestionId?: bigint | number | null;
  content: string;
  createdAt: Date;
};

function buildPostingWhere(companyId: number, query: NormalizedListQuery): Prisma.PostingWhereInput {
  const q = query.q?.trim();
  return {
    companyId: BigInt(companyId),
    ...(query.status ? { status: query.status as PostingStatus } : { status: { not: PostingStatus.ARCHIVED } }),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { jobRole: { contains: q, mode: "insensitive" } },
            { careerRequirement: { contains: q, mode: "insensitive" } },
            { educationRequirement: { contains: q, mode: "insensitive" } },
            { salaryInfo: { contains: q, mode: "insensitive" } },
            { workLocation: { contains: q, mode: "insensitive" } },
            { employmentType: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function buildApplicationWhere(
  postingId: number,
  companyId: number,
  query: NormalizedApplicantListQuery,
): Prisma.ApplicationWhereInput {
  const q = query.q?.trim();
  const conditions: Prisma.ApplicationWhereInput[] = [];
  if (query.screeningDecision === ScreeningDecision.UNDECIDED) {
    conditions.push({ OR: [{ screeningDecision: ScreeningDecision.UNDECIDED }, { screeningDecision: null }] });
  } else if (query.screeningDecision) {
    conditions.push({ screeningDecision: query.screeningDecision });
  }
  if (query.effectiveScreeningDecision) {
    const decision = query.effectiveScreeningDecision;
    conditions.push({
      OR: [
        { screeningResultConfirmedAt: { not: null }, screeningFinalDecision: decision },
        { screeningResultConfirmedAt: null, screeningReviewerDecision: decision },
        { screeningResultConfirmedAt: null, screeningReviewerDecision: null, screeningDecision: decision },
      ],
    });
  }
  if (query.screeningResultConfirmationStatus === "CONFIRMED") {
    conditions.push({ screeningResultConfirmedAt: { not: null } });
  } else if (query.screeningResultConfirmationStatus === "PENDING") {
    conditions.push({ screeningResultConfirmedAt: null });
  }
  if (q) {
    conditions.push({
      OR: [
        { candidate: { user: { name: { contains: q, mode: "insensitive" } } } },
        { candidate: { user: { email: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  return {
    postingId: BigInt(postingId),
    posting: { companyId: BigInt(companyId) },
    applicationStatus: { not: ApplicationStatus.CANCELED },
    ...(query.applicationStatus ? { applicationStatus: query.applicationStatus } : {}),
    ...(query.documentStatus ? { documentStatus: query.documentStatus } : {}),
    ...(query.interviewStatus ? { interviewStatus: query.interviewStatus } : {}),
    ...(query.reportStatus ? { reportStatus: query.reportStatus } : {}),
    ...(conditions.length > 0 ? { AND: conditions } : {}),
  };
}

function buildPostingOrderBy(query: NormalizedListQuery): Prisma.PostingOrderByWithRelationInput {
  const allowed = new Set(["createdAt", "updatedAt", "startsOn", "endsOn", "title", "status"]);
  return { [allowed.has(query.sort) ? query.sort : "createdAt"]: query.order };
}

function buildApplicationOrderBy(query: NormalizedApplicantListQuery): Prisma.ApplicationOrderByWithRelationInput[] {
  const allowed = new Set(["updatedAt", "applicationStatus", "interviewStatus", "reportStatus"]);
  return [
    { [allowed.has(query.sort) ? query.sort : "updatedAt"]: query.order },
    { applicationId: query.order },
  ];
}

function compareApplicantsByScore(
  left: ApplicantRecord,
  right: ApplicantRecord,
  order: "asc" | "desc",
): number {
  const leftScore = latestReportScore(left);
  const rightScore = latestReportScore(right);
  if (leftScore === null && rightScore !== null) return 1;
  if (leftScore !== null && rightScore === null) return -1;
  if (leftScore !== null && rightScore !== null && leftScore !== rightScore) {
    return order === "asc" ? leftScore - rightScore : rightScore - leftScore;
  }

  const submittedCompare = compareNullableDatesAsc(left.submittedAt, right.submittedAt);
  if (submittedCompare !== 0) return submittedCompare;
  return left.applicationId - right.applicationId;
}

function latestReportScore(application: ApplicantRecord): number | null {
  return application.evaluationReports[0]?.totalScore ?? null;
}

function compareNullableDatesAsc(left: Date | null, right: Date | null): number {
  const leftTime = left?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTime = right?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime;
}

function truncatePassMailFailureReason(message: string): string {
  return message.slice(0, 500);
}

function mapPosting(
  posting: Prisma.PostingGetPayload<{ include: typeof postingActiveApplicationCountInclude }>,
): RecruitmentRecord {
  return {
    postingId: Number(posting.postingId),
    companyId: Number(posting.companyId),
    title: posting.title,
    jobRole: posting.jobRole,
    jobDescription: posting.jobDescription,
    careerRequirement: posting.careerRequirement,
    educationRequirement: posting.educationRequirement,
    salaryInfo: posting.salaryInfo,
    workLocation: posting.workLocation,
    employmentType: posting.employmentType,
    jobRoleCode: posting.jobRoleCode,
    regionCode: posting.regionCode,
    careerMinYears: posting.careerMinYears,
    careerMaxYears: posting.careerMaxYears,
    employmentTypeCode: posting.employmentTypeCode,
    recruitmentType: posting.recruitmentType,
    workplaceAddress: posting.workplaceAddress,
    workplaceLat: posting.workplaceLat,
    workplaceLng: posting.workplaceLng,
    startsOn: posting.startsOn,
    endsOn: posting.endsOn,
    status: posting.status,
    createdAt: posting.createdAt,
    updatedAt: posting.updatedAt,
    applicantCount: posting._count.applications,
  };
}

function mapPublicPosting(posting: Prisma.PostingGetPayload<{ include: { company: { select: { name: true } } } }>): PublicRecruitmentRecord {
  return {
    postingId: Number(posting.postingId),
    title: posting.title,
    jobRole: posting.jobRole,
    jobDescription: posting.jobDescription,
    careerRequirement: posting.careerRequirement,
    educationRequirement: posting.educationRequirement,
    salaryInfo: posting.salaryInfo,
    workLocation: posting.workLocation,
    employmentType: posting.employmentType,
    jobRoleCode: posting.jobRoleCode,
    regionCode: posting.regionCode,
    careerMinYears: posting.careerMinYears,
    careerMaxYears: posting.careerMaxYears,
    employmentTypeCode: posting.employmentTypeCode,
    recruitmentType: posting.recruitmentType,
    workplaceAddress: posting.workplaceAddress,
    workplaceLat: posting.workplaceLat,
    workplaceLng: posting.workplaceLng,
    startsOn: posting.startsOn,
    endsOn: posting.endsOn,
    status: posting.status,
    companyName: posting.company.name,
  };
}

type ApplicationWithIncludes = Prisma.ApplicationGetPayload<{ include: typeof applicantInclude }>;
type ApplicationWithListIncludes = Prisma.ApplicationGetPayload<{ include: typeof applicantListInclude }>;
type ApplicationWithDetailIncludes = Prisma.ApplicationGetPayload<{ include: typeof applicantDetailInclude }>;
type FileAssetRecord = Prisma.FileAssetGetPayload<Record<string, never>>;

function mapFileAsset(fileAsset: FileAssetRecord): CompanyFileAssetRecord {
  return {
    fileId: Number(fileAsset.fileId),
    ownerUserId: Number(fileAsset.ownerUserId),
    storageKey: fileAsset.storageKey,
    originalName: fileAsset.originalName,
    mimeType: fileAsset.mimeType,
    sizeBytes: Number(fileAsset.sizeBytes),
    status: fileAsset.status,
    createdAt: fileAsset.createdAt,
  };
}

function mapJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function mapApplicant(application: ApplicationWithIncludes | ApplicationWithDetailIncludes): ApplicantRecord {
  const documents = "documents" in application ? application.documents : [];
  return {
    applicationId: Number(application.applicationId),
    postingId: Number(application.postingId),
    candidateId: Number(application.candidateId),
    applicantName: application.applicantName,
    applicantEmail: application.applicantEmail,
    applicantPhone: application.applicantPhone,
    githubUrl: application.githubUrl,
    blogUrl: application.blogUrl,
    portfolioUrl: application.portfolioUrl,
    motivation: application.motivation,
    additionalInfo: application.additionalInfo,
    profileSnapshot: mapJsonObject(application.profileSnapshot),
    applicationStatus: application.applicationStatus,
    documentStatus: application.documentStatus,
    interviewStatus: application.interviewStatus,
    reportStatus: application.reportStatus,
    screeningDecision: application.screeningDecision,
    screeningDecisionReasonCode: application.screeningDecisionReasonCode,
    screeningDecisionPolicyVersion: application.screeningDecisionPolicyVersion,
    screeningPolicyVersion: application.screeningPolicyVersion,
    screeningCriteriaVersion: application.screeningCriteriaVersion,
    screeningDecisionReportId: application.screeningDecisionReportId == null ? null : Number(application.screeningDecisionReportId),
    screeningDecidedAt: application.screeningDecidedAt,
    screeningReviewerDecision: application.screeningReviewerDecision,
    effectiveScreeningDecision: application.screeningResultConfirmedAt
      ? application.screeningFinalDecision ?? ScreeningDecision.UNDECIDED
      : application.screeningReviewerDecision ?? application.screeningDecision ?? ScreeningDecision.UNDECIDED,
    screeningFinalDecision: application.screeningFinalDecision,
    screeningDecisionOverrideReason: application.screeningDecisionOverrideReason,
    screeningResultConfirmationStatus: application.screeningResultConfirmedAt ? "CONFIRMED" : "PENDING",
    screeningResultConfirmedAt: application.screeningResultConfirmedAt,
    screeningMemo: application.screeningMemo,
    passMailDeliveryStatus: application.passMailDeliveryStatus,
    passMailSentAt: application.passMailSentAt,
    passMailFailedAt: application.passMailFailedAt,
    passMailFailureReason: application.passMailFailureReason,
    submittedAt: application.submittedAt,
    updatedAt: application.updatedAt,
    candidate: {
      candidateId: Number(application.candidate.candidateId),
      githubUrl: application.candidate.githubUrl,
      portfolioUrl: application.candidate.portfolioUrl,
      summary: application.candidate.summary,
      user: {
        userId: Number(application.candidate.user.userId),
        email: application.candidate.user.email,
        name: application.candidate.user.name,
        phone: application.candidate.user.phone,
      },
    },
    documents: documents.map((document) => ({
      documentId: Number(document.documentId),
      applicationId: Number(document.applicationId),
      fileId: document.fileId == null ? null : Number(document.fileId),
      documentType: document.documentType,
      parseStatus: document.parseStatus,
      uploadedAt: document.uploadedAt,
      file: document.file ? mapFileAsset(document.file) : null,
    })),
    posting: {
      postingId: Number(application.posting.postingId),
      title: application.posting.title,
      jobRole: application.posting.jobRole,
      autoScreeningPolicyEnabled:
        application.posting.autoScreeningPolicy?.enabled === true,
    },
    evaluationReports: application.evaluationReports.map((report) => ({
      reportId: Number(report.reportId),
      applicationId: report.applicationId === null ? null : Number(report.applicationId),
      sessionId: report.sessionId === null ? null : Number(report.sessionId),
      status: report.status,
      totalScore: report.totalScore,
      summary: report.summary,
      ncsCompletionStatus: report.ncsCompletionStatus,
      ncsThresholdResult: report.ncsThresholdResult,
      ncsAiDecision: report.ncsAiDecision,
      ncsDecisionReasonCode: report.ncsDecisionReasonCode,
      ncsScoringVersion: report.ncsScoringVersion,
      ncsDecisionPolicyVersion: report.ncsDecisionPolicyVersion,
      ncsSummary: report.ncsSummaryJson,
      generatedAt: report.generatedAt,
      scores: report.scores.map((score) => ({
        scoreId: Number(score.scoreId),
        score: score.score,
        rationale: score.rationale,
        ncsProfileId: score.ncsProfileId,
        averageScore: score.averageScore === null ? null : Number(score.averageScore),
        normalizedScore: score.normalizedScore,
        weight: score.weight,
        weightedScore: score.weightedScore === null ? null : Number(score.weightedScore),
        minimumAverageScore: score.minimumAverageScore === null ? null : Number(score.minimumAverageScore),
        assignedQuestionCount: score.assignedQuestionCount,
        validQuestionCount: score.validQuestionCount,
        criterion: score.criterion
          ? {
              criterionId: Number(score.criterion.criterionId),
              tagName: score.criterion.tag.name,
            }
          : null,
        evidences: score.evidences.map((evidence) => ({
          evidenceId: Number(evidence.evidenceId),
          evidenceText: evidence.evidenceText,
        })),
      })),
      ncsAnswerEvaluations: report.ncsAnswerEvaluations.map((evaluation) => ({
        ncsEvaluationId: Number(evaluation.ncsEvaluationId),
        answerId: Number(evaluation.answerId),
        sessionQuestionId: Number(evaluation.sessionQuestionId),
        criterionId: evaluation.criterionId === null ? null : Number(evaluation.criterionId),
        criterionTitleSnapshot: evaluation.criterionTitleSnapshot,
        ncsProfileId: evaluation.ncsProfileId,
        ncsQuestionMode: evaluation.ncsQuestionMode,
        ncsProfileVersion: evaluation.ncsProfileVersion,
        scoreStatus: evaluation.scoreStatus,
        competencyScore: evaluation.competencyScore,
        evidenceScore: evaluation.evidenceScore,
        totalScore: evaluation.totalScore,
        behaviorPoints: evaluation.behaviorPoints,
        logicPoints: evaluation.logicPoints,
        baseScore: evaluation.baseScore,
        effectiveScore: evaluation.effectiveScore,
        followUpApplied: evaluation.followUpApplied,
        coverage: Number(evaluation.coverage),
        confidence: evaluation.confidence,
        rubricVersion: evaluation.rubricVersion,
        promptVersion: evaluation.promptVersion,
        providerMode: evaluation.providerMode,
        modelName: evaluation.modelName,
        result: evaluation.resultJson,
        evidences: evaluation.evidences.map((evidence) => ({
          evidenceId: Number(evidence.evidenceId),
          sourceAnswerId: Number(evidence.sourceAnswerId),
          sourceKind: evidence.sourceKind,
          quote: evidence.quote,
          sortOrder: evidence.sortOrder,
        })),
        sessionQuestion: {
          runtimeQuestionId: evaluation.sessionQuestion.runtimeQuestionId === null
            ? null
            : Number(evaluation.sessionQuestion.runtimeQuestionId),
          generationSource: evaluation.sessionQuestion.generationSource,
          content: evaluation.sessionQuestion.content,
          ncsQuestionMode: evaluation.sessionQuestion.ncsQuestionMode,
          sortOrder: evaluation.sessionQuestion.sortOrder,
        },
        updatedAt: evaluation.updatedAt,
      })),
    })),
    interviewSessions: application.interviewSessions.map((session) => {
      const sessionAnswers = "answers" in session ? session.answers : [];
      const usedFollowUpAnswerIds = new Set<string>();
      return {
        sessionId: Number(session.sessionId),
        status: session.status,
        interviewType: session.interviewType,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        answerTimeSecSnapshot: session.answerTimeSecSnapshot,
        answers: sessionAnswers.map((answer) => ({
          answerId: Number(answer.answerId),
          questionId: answer.sessionQuestion?.runtimeQuestionId == null
            ? answer.questionId == null ? null : Number(answer.questionId)
            : Number(answer.sessionQuestion.runtimeQuestionId),
          videoFileId: answer.videoFileId == null ? null : Number(answer.videoFileId),
          audioFileId: answer.audioFileId == null ? null : Number(answer.audioFileId),
          videoFile: answer.videoFile ? mapFileAsset(answer.videoFile) : null,
          audioFile: answer.audioFile ? mapFileAsset(answer.audioFile) : null,
          questionType: answer.sessionQuestion?.questionType ?? answer.question?.questionType ?? null,
          questionContent: answer.sessionQuestion?.content ?? answer.question?.content ?? null,
          transcript: answer.transcript,
          durationSeconds: answer.durationSeconds,
          submittedAt: answer.submittedAt,
          nonverbalMetadata: mapJsonObject(answer.nonverbalMetadata),
          followUpQuestions: answer.followUpQuestions.map((followUp) => {
            const followUpAnswer = findLinkedFollowUpAnswer(
              followUp,
              sessionAnswers,
              usedFollowUpAnswerIds,
            );
            if (followUpAnswer) {
              usedFollowUpAnswerIds.add(answerIdKey(followUpAnswer.answerId));
            }
            return {
              followUpId: Number(followUp.followUpId),
              content: followUp.content,
              generationStatus: followUp.generationStatus,
              policy: followUp.policy,
              answer: followUpAnswer
                ? {
                    answerId: Number(followUpAnswer.answerId),
                    videoFileId: followUpAnswer.videoFileId == null ? null : Number(followUpAnswer.videoFileId),
                    audioFileId: followUpAnswer.audioFileId == null ? null : Number(followUpAnswer.audioFileId),
                    videoFile: followUpAnswer.videoFile ? mapFileAsset(followUpAnswer.videoFile) : null,
                    audioFile: followUpAnswer.audioFile ? mapFileAsset(followUpAnswer.audioFile) : null,
                    transcript: followUpAnswer.transcript,
                    durationSeconds: followUpAnswer.durationSeconds,
                    submittedAt: followUpAnswer.submittedAt,
                    nonverbalMetadata: mapJsonObject(followUpAnswer.nonverbalMetadata),
                  }
                : null,
            };
          }),
        })),
      };
    }),
  };
}

function mapApplicantList(application: ApplicationWithListIncludes): ApplicantRecord {
  return {
    applicationId: Number(application.applicationId),
    postingId: Number(application.postingId),
    candidateId: Number(application.candidateId),
    applicantName: application.applicantName,
    applicantEmail: application.applicantEmail,
    applicantPhone: application.applicantPhone,
    githubUrl: application.githubUrl,
    blogUrl: application.blogUrl,
    portfolioUrl: application.portfolioUrl,
    motivation: application.motivation,
    additionalInfo: application.additionalInfo,
    profileSnapshot: mapJsonObject(application.profileSnapshot),
    applicationStatus: application.applicationStatus,
    documentStatus: application.documentStatus,
    interviewStatus: application.interviewStatus,
    reportStatus: application.reportStatus,
    screeningDecision: application.screeningDecision,
    screeningDecisionReasonCode: application.screeningDecisionReasonCode,
    screeningDecisionPolicyVersion: application.screeningDecisionPolicyVersion,
    screeningPolicyVersion: application.screeningPolicyVersion,
    screeningCriteriaVersion: application.screeningCriteriaVersion,
    screeningDecisionReportId: application.screeningDecisionReportId == null ? null : Number(application.screeningDecisionReportId),
    screeningDecidedAt: application.screeningDecidedAt,
    screeningReviewerDecision: application.screeningReviewerDecision,
    effectiveScreeningDecision: application.screeningResultConfirmedAt
      ? application.screeningFinalDecision ?? ScreeningDecision.UNDECIDED
      : application.screeningReviewerDecision ?? application.screeningDecision ?? ScreeningDecision.UNDECIDED,
    screeningFinalDecision: application.screeningFinalDecision,
    screeningDecisionOverrideReason: application.screeningDecisionOverrideReason,
    screeningResultConfirmationStatus: application.screeningResultConfirmedAt ? "CONFIRMED" : "PENDING",
    screeningResultConfirmedAt: application.screeningResultConfirmedAt,
    screeningMemo: application.screeningMemo,
    passMailDeliveryStatus: application.passMailDeliveryStatus,
    passMailSentAt: application.passMailSentAt,
    passMailFailedAt: application.passMailFailedAt,
    passMailFailureReason: application.passMailFailureReason,
    submittedAt: application.submittedAt,
    updatedAt: application.updatedAt,
    candidate: {
      candidateId: Number(application.candidate.candidateId),
      githubUrl: application.candidate.githubUrl,
      portfolioUrl: application.candidate.portfolioUrl,
      summary: application.candidate.summary,
      user: {
        userId: Number(application.candidate.user.userId),
        email: application.candidate.user.email,
        name: application.candidate.user.name,
        phone: application.candidate.user.phone,
      },
    },
    posting: {
      postingId: Number(application.posting.postingId),
      title: application.posting.title,
      jobRole: application.posting.jobRole,
      autoScreeningPolicyEnabled:
        application.posting.autoScreeningPolicy?.enabled === true,
    },
    evaluationReports: application.evaluationReports.map((report) => ({
      reportId: Number(report.reportId),
      status: report.status,
      totalScore: report.totalScore,
      summary: report.summary,
      generatedAt: report.generatedAt,
    })),
    interviewSessions: application.interviewSessions.map((session) => ({
      sessionId: Number(session.sessionId),
      status: session.status,
      interviewType: session.interviewType,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    })),
  };
}

function toGroupCountMap(
  rows: Array<Record<string, unknown> & { _count: { _all: number } }>,
  field: string,
): Record<string, number> {
  return Object.fromEntries(
    rows.flatMap((row) => (typeof row[field] === "string" ? [[row[field] as string, row._count._all]] : [])),
  );
}

function toScreeningDecisionCountMap(
  rows: Array<Record<string, unknown> & { _count: { _all: number } }>,
): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = typeof row.screeningDecision === "string" ? row.screeningDecision : ScreeningDecision.UNDECIDED;
    counts[key] = (counts[key] ?? 0) + row._count._all;
    return counts;
  }, {});
}

function buildConfirmationRecord(
  rows: Array<{ screening_final_decision: ScreeningDecision | null; screening_result_confirmed_at: Date | null }>,
  excludedCounts: Record<"UNDECIDED" | "RETRY", number>,
  idempotent: boolean,
  emailRecipients: ScreeningResultConfirmationRecord["emailRecipients"],
): ScreeningResultConfirmationRecord {
  const decisionCounts = rows.reduce<Record<"PASS" | "HOLD" | "FAIL", number>>(
    (counts, row) => {
      if (row.screening_final_decision === ScreeningDecision.PASS) counts.PASS += 1;
      if (row.screening_final_decision === ScreeningDecision.HOLD) counts.HOLD += 1;
      if (row.screening_final_decision === ScreeningDecision.FAIL) counts.FAIL += 1;
      return counts;
    },
    { PASS: 0, HOLD: 0, FAIL: 0 },
  );
  return {
    scopeChanged: false,
    idempotent,
    eligibleCount: rows.length,
    excludedCount: excludedCounts.UNDECIDED + excludedCounts.RETRY,
    excludedCounts,
    confirmedCount: rows.length,
    decisionCounts,
    confirmedAt: rows.reduce<Date | null>((latest, row) => {
      if (!row.screening_result_confirmed_at) return latest;
      return !latest || row.screening_result_confirmed_at > latest ? row.screening_result_confirmed_at : latest;
    }, null),
    emailRecipients,
  };
}

function isFinalScreeningDecision(
  decision: ScreeningDecision | null,
): decision is "PASS" | "HOLD" | "FAIL" {
  return decision === ScreeningDecision.PASS || decision === ScreeningDecision.HOLD || decision === ScreeningDecision.FAIL;
}

function findLinkedFollowUpAnswer<T extends FollowUpAnswerCandidate>(
  followUp: FollowUpQuestionCandidate,
  sessionAnswers: T[],
  usedAnswerIds: Set<string>,
): T | undefined {
  if (followUp.insertedSessionQuestionId == null) {
    return undefined;
  }
  const insertedSessionQuestionId = answerIdKey(followUp.insertedSessionQuestionId);
  return sessionAnswers.find((candidate) => {
    const candidateSessionQuestionId = candidate.sessionQuestionId ?? candidate.sessionQuestion?.sessionQuestionId;
    return candidateSessionQuestionId != null &&
      answerIdKey(candidateSessionQuestionId) === insertedSessionQuestionId &&
      !usedAnswerIds.has(answerIdKey(candidate.answerId));
  });
}

function answerIdKey(answerId: bigint | number) {
  return answerId.toString();
}
