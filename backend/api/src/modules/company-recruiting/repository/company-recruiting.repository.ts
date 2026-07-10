import { Inject, Injectable } from "@nestjs/common";
import {
  ApplicationStatus,
  AuthProvider,
  DocumentStatus,
  DocumentType,
  PostingStatus,
  ScreeningDecision,
  UserStatus,
  UserType,
  type Prisma,
} from "@prisma/client";

import { PrismaService } from "../../../shared/prisma.service";
import type {
  ApplicantRecord,
  CompanyFileAssetRecord,
  NormalizedListQuery,
  PublicRecruitmentRecord,
  RecruitmentRecord,
} from "../company-recruiting.types";

// update 시 값이 없는 필드는 prisma 에서 건드리지 않도록 undefined 를 허용한다(발행 등 부분 수정에서 기존 값 보존).
export type PostingFilterFields = {
  jobRoleCode?: string | null;
  regionCode?: string | null;
  careerMinYears?: number | null;
  careerMaxYears?: number | null;
  employmentTypeCode?: string | null;
  recruitmentType?: string | null;
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
  screeningMemo: string | null;
  documentStatus?: DocumentStatus;
};

export type UpdateApplicationScreeningInput = {
  screeningDecision: ScreeningDecision;
  screeningMemo: string | null;
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
    query: NormalizedListQuery,
  ): Promise<ApplicantRecord[]>;
  countApplicationsForPosting(postingId: number, companyId: number, query: NormalizedListQuery): Promise<number>;
  findApplicationForCompany(applicationId: number, companyId: number): Promise<ApplicantRecord | null>;
  updateApplicationScreening(
    applicationId: number,
    companyId: number,
    input: UpdateApplicationScreeningInput,
  ): Promise<ApplicantRecord | null>;
  createFileAsset(input: CreateFileAssetInput): Promise<CompanyFileAssetRecord>;
  createApplicationDocument(input: CreateApplicationDocumentInput): Promise<{ documentId: number }>;
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
      include: { _count: { select: { applications: true } } },
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
      include: { _count: { select: { applications: true } } },
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
      include: { _count: { select: { applications: true } } },
    });
    return mapPosting(posting);
  }

  async listPostings(companyId: number, query: NormalizedListQuery): Promise<RecruitmentRecord[]> {
    const postings = await this.prisma.posting.findMany({
      where: buildPostingWhere(companyId, query),
      orderBy: buildPostingOrderBy(query),
      skip: query.skip,
      take: query.take,
      include: { _count: { select: { applications: true } } },
    });
    return postings.map(mapPosting);
  }

  async countPostings(companyId: number, query: NormalizedListQuery): Promise<number> {
    return this.prisma.posting.count({ where: buildPostingWhere(companyId, query) });
  }

  async findPostingForCompany(postingId: number, companyId: number): Promise<RecruitmentRecord | null> {
    const posting = await this.prisma.posting.findFirst({
      where: { postingId: BigInt(postingId), companyId: BigInt(companyId) },
      include: { _count: { select: { applications: true } } },
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
    const application = await this.prisma.application.create({
      data: {
        postingId: BigInt(input.postingId),
        candidateId: BigInt(input.candidateId),
        applicationStatus: ApplicationStatus.SUBMITTED,
        documentStatus: input.documentStatus ?? DocumentStatus.NOT_SUBMITTED,
        screeningDecision: ScreeningDecision.UNDECIDED,
        screeningMemo: input.screeningMemo,
      },
      include: applicantInclude,
    });
    return mapApplicant(application);
  }

  async listApplicationsForPosting(
    postingId: number,
    companyId: number,
    query: NormalizedListQuery,
  ): Promise<ApplicantRecord[]> {
    const applications = await this.prisma.application.findMany({
      where: buildApplicationWhere(postingId, companyId, query),
      orderBy: buildApplicationOrderBy(query),
      skip: query.skip,
      take: query.take,
      include: applicantInclude,
    });
    return applications.map(mapApplicant);
  }

  async countApplicationsForPosting(postingId: number, companyId: number, query: NormalizedListQuery): Promise<number> {
    return this.prisma.application.count({
      where: buildApplicationWhere(postingId, companyId, query),
    });
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
    const ownedApplication = await this.prisma.application.findFirst({
      where: { applicationId: BigInt(applicationId), posting: { companyId: BigInt(companyId) } },
      select: { applicationId: true },
    });
    if (!ownedApplication) {
      return null;
    }

    const application = await this.prisma.application.update({
      where: { applicationId: BigInt(applicationId) },
      data: {
        screeningDecision: input.screeningDecision,
        screeningMemo: input.screeningMemo,
      },
      include: applicantInclude,
    });
    return mapApplicant(application);
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
  posting: true,
  evaluationReports: {
    orderBy: { reportId: "desc" as const },
    take: 1,
    include: {
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

const applicantDetailInclude = {
  ...applicantInclude,
  interviewSessions: {
    orderBy: { sessionId: "desc" as const },
    take: 1,
    include: {
      answers: {
        orderBy: { answerId: "asc" as const },
        include: {
          question: true,
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
  submittedAt: Date | null;
  question?: {
    questionType?: string | null;
    content?: string | null;
  } | null;
};

type FollowUpQuestionCandidate = {
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
  query: NormalizedListQuery,
): Prisma.ApplicationWhereInput {
  const q = query.q?.trim();
  return {
    postingId: BigInt(postingId),
    posting: { companyId: BigInt(companyId) },
    ...(q
      ? {
          OR: [
            { candidate: { user: { name: { contains: q, mode: "insensitive" } } } },
            { candidate: { user: { email: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

function buildPostingOrderBy(query: NormalizedListQuery): Prisma.PostingOrderByWithRelationInput {
  const allowed = new Set(["createdAt", "updatedAt", "startsOn", "endsOn", "title", "status"]);
  return { [allowed.has(query.sort) ? query.sort : "createdAt"]: query.order };
}

function buildApplicationOrderBy(query: NormalizedListQuery): Prisma.ApplicationOrderByWithRelationInput {
  const allowed = new Set(["updatedAt", "applicationStatus", "interviewStatus", "reportStatus"]);
  return { [allowed.has(query.sort) ? query.sort : "updatedAt"]: query.order };
}

function mapPosting(posting: Prisma.PostingGetPayload<{ include: { _count: { select: { applications: true } } } }>): RecruitmentRecord {
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
    startsOn: posting.startsOn,
    endsOn: posting.endsOn,
    status: posting.status,
    companyName: posting.company.name,
  };
}

type ApplicationWithIncludes = Prisma.ApplicationGetPayload<{ include: typeof applicantInclude }>;
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
  return {
    applicationId: Number(application.applicationId),
    postingId: Number(application.postingId),
    candidateId: Number(application.candidateId),
    applicationStatus: application.applicationStatus,
    documentStatus: application.documentStatus,
    interviewStatus: application.interviewStatus,
    reportStatus: application.reportStatus,
    screeningDecision: application.screeningDecision,
    screeningMemo: application.screeningMemo,
    submittedAt: application.submittedAt,
    updatedAt: application.updatedAt,
    candidate: {
      candidateId: Number(application.candidate.candidateId),
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
    },
    evaluationReports: application.evaluationReports.map((report) => ({
      reportId: Number(report.reportId),
      status: report.status,
      totalScore: report.totalScore,
      summary: report.summary,
      generatedAt: report.generatedAt,
      scores: report.scores.map((score) => ({
        scoreId: Number(score.scoreId),
        score: score.score,
        rationale: score.rationale,
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
        answers: sessionAnswers.map((answer) => ({
          answerId: Number(answer.answerId),
          questionId: answer.questionId == null ? null : Number(answer.questionId),
          videoFileId: answer.videoFileId == null ? null : Number(answer.videoFileId),
          audioFileId: answer.audioFileId == null ? null : Number(answer.audioFileId),
          videoFile: answer.videoFile ? mapFileAsset(answer.videoFile) : null,
          audioFile: answer.audioFile ? mapFileAsset(answer.audioFile) : null,
          questionType: answer.question?.questionType ?? null,
          questionContent: answer.question?.content ?? null,
          transcript: answer.transcript,
          durationSeconds: answer.durationSeconds,
          submittedAt: answer.submittedAt,
          nonverbalMetadata: mapJsonObject(answer.nonverbalMetadata),
          followUpQuestions: answer.followUpQuestions.map((followUp) => {
            const followUpAnswer = findLinkedFollowUpAnswer(
              answer,
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

function findLinkedFollowUpAnswer<T extends FollowUpAnswerCandidate>(
  parentAnswer: T,
  followUp: FollowUpQuestionCandidate,
  sessionAnswers: T[],
  usedAnswerIds: Set<string>,
): T | undefined {
  const nextBaseAnswer = findNextBaseAnswer(parentAnswer, sessionAnswers);
  return sessionAnswers
    .filter((candidate) =>
      isFollowUpAnswerForQuestion(candidate, parentAnswer, followUp, nextBaseAnswer, usedAnswerIds),
    )
    .sort((left, right) => compareFollowUpAnswerCandidates(left, right, followUp))[0];
}

function isFollowUpAnswerForQuestion<T extends FollowUpAnswerCandidate>(
  candidate: T,
  parentAnswer: T,
  followUp: FollowUpQuestionCandidate,
  nextBaseAnswer: T | undefined,
  usedAnswerIds: Set<string>,
): boolean {
  if (
    usedAnswerIds.has(answerIdKey(candidate.answerId)) ||
    compareAnswerIds(candidate.answerId, parentAnswer.answerId) <= 0 ||
    candidate.question?.questionType !== "FOLLOW_UP" ||
    normalizeQuestionText(candidate.question.content) !== normalizeQuestionText(followUp.content)
  ) {
    return false;
  }

  if (nextBaseAnswer && compareAnswerIds(candidate.answerId, nextBaseAnswer.answerId) >= 0) {
    return false;
  }

  if (candidate.submittedAt && candidate.submittedAt < followUp.createdAt) {
    return false;
  }

  return true;
}

function findNextBaseAnswer<T extends FollowUpAnswerCandidate>(
  parentAnswer: T,
  sessionAnswers: T[],
): T | undefined {
  return sessionAnswers
    .filter(
      (candidate) =>
        compareAnswerIds(candidate.answerId, parentAnswer.answerId) > 0 &&
        candidate.question?.questionType !== "FOLLOW_UP",
    )
    .sort((left, right) => compareAnswerIds(left.answerId, right.answerId))[0];
}

function compareFollowUpAnswerCandidates(
  left: FollowUpAnswerCandidate,
  right: FollowUpAnswerCandidate,
  followUp: FollowUpQuestionCandidate,
) {
  return (
    followUpAnswerTimeDistance(left, followUp) -
      followUpAnswerTimeDistance(right, followUp) ||
    compareAnswerIds(left.answerId, right.answerId)
  );
}

function followUpAnswerTimeDistance(answer: FollowUpAnswerCandidate, followUp: FollowUpQuestionCandidate) {
  if (!answer.submittedAt) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(0, answer.submittedAt.getTime() - followUp.createdAt.getTime());
}

function compareAnswerIds(left: bigint | number, right: bigint | number) {
  const leftId = BigInt(left);
  const rightId = BigInt(right);
  if (leftId === rightId) {
    return 0;
  }
  return leftId > rightId ? 1 : -1;
}

function answerIdKey(answerId: bigint | number) {
  return answerId.toString();
}

function normalizeQuestionText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
