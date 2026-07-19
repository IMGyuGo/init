import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  ApplicationStatus as PrismaApplicationStatus,
  ConsentType as PrismaConsentType,
  DocumentStatus as PrismaDocumentStatus,
  DocumentType as PrismaDocumentType,
  InterviewStatus as PrismaInterviewStatus,
  InterviewType as PrismaInterviewType,
  ReportStatus as PrismaReportStatus,
  type Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../shared/prisma.service";
import { CandidateDomainError } from "../candidate.errors";
import {
  type ApplicantContact,
  type Application,
  type ApplicationDocument,
  type ApplicationSubmissionResult,
  type CandidateDemoApplicationResetRepositoryResult,
  type CandidateFolder,
  type CandidateProfileSnapshotV1,
  type CandidateProfileView,
  type UpdateCandidateProfileInput,
  type CandidateJob,
  type CandidateRepository,
  type ConsentRecord,
  type FileAsset,
  type InterviewDeviceCheck,
  type InterviewQuestionSnapshotResult,
  type InterviewSession,
  type PortfolioLink,
  type ReportStatus,
} from "../candidate.types";

interface CandidatePostingRow {
  postingId: bigint;
  companyId: bigint;
  title: string;
  jobRole: string;
  jobDescription: string | null;
  workLocation: string | null;
  employmentType: string | null;
  jobRoleCode: string | null;
  regionCode: string | null;
  careerMinYears: number | null;
  careerMaxYears: number | null;
  employmentTypeCode: string | null;
  recruitmentType: string | null;
  workplaceAddress: string | null;
  workplaceLat: number | null;
  workplaceLng: number | null;
  startsOn: Date | null;
  endsOn: Date | null;
  postingStatus: string;
  createdAt: Date;
  companyName: string;
  companyIndustry: string | null;
  companyProfile: string | null;
  companyLogoStorageKey: string | null;
}

interface CandidatePostingSchemaShape {
  postingColumns: Set<string>;
  companyColumns: Set<string>;
}

type ApplicationRecord = Prisma.ApplicationGetPayload<Record<string, never>>;
type ApplicationDocumentRecord = Prisma.ApplicationDocumentGetPayload<Record<string, never>>;
type CandidateFolderRecord = Prisma.CandidateFolderGetPayload<{
  include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } };
}>;
type ConsentRecordModel = Prisma.ConsentRecordGetPayload<Record<string, never>>;
type FileAssetRecord = Prisma.FileAssetGetPayload<Record<string, never>>;
type InterviewSessionRecord = Prisma.InterviewSessionGetPayload<{ include: { application: true } }>;

const NCS_SCORING_VERSION = "NCS_RECRUITING_SCORING_V1";
const NCS_REQUIRED_QUESTION_COUNT = 2;
const NCS_PROFILE_IDS = [
  "JOB_TECHNICAL",
  "COLLABORATION_COMMUNICATION",
  "PROBLEM_SOLVING",
] as const;
const NCS_QUESTION_MODES = [
  "EXPERIENCE_BEHAVIOR",
  "TECHNICAL_KNOWLEDGE",
  "SITUATIONAL_DESIGN",
] as const;
type CanonicalNcsProfileId = (typeof NCS_PROFILE_IDS)[number];

function isCanonicalNcsProfileId(value: string | null | undefined): value is CanonicalNcsProfileId {
  return NCS_PROFILE_IDS.includes(value as CanonicalNcsProfileId);
}

type ExistingNcsSnapshotBinding = {
  criterionId: bigint | null;
  criterionTitleSnapshot: string;
  ncsProfileId: string;
  ncsProfileVersion: string;
  alignmentStatus: string;
  evaluatorVersion: string | null;
  bindingOrder: number;
};

type ExistingNcsSnapshotQuestion = {
  sessionQuestionId: bigint;
  questionId: bigint | null;
  personalizedQuestionId: bigint | null;
  runtimeQuestionId: bigint | null;
  criterionId: bigint | null;
  criterionTitleSnapshot: string | null;
  generationSource: string | null;
  questionType: string | null;
  content: string | null;
  ncsProfileId: string | null;
  ncsQuestionMode: string | null;
  ncsProfileVersion: string | null;
  alignmentStatus: string | null;
  evaluatorVersion: string | null;
  policyVersion: number | null;
  criteriaVersion: number | null;
  sortOrder: number;
  ncsBindings: ExistingNcsSnapshotBinding[];
};

type ExistingNcsSessionPolicy = {
  ncsProfileId: string;
  criterionId: bigint | null;
  criterionTitleSnapshot: string;
  weight: number;
  requiredQuestionCount: number;
  ncsProfileVersion: string;
};

type ExistingNcsSessionSnapshot = {
  sessionId: bigint;
  status: string;
  preparationTimeSecSnapshot: number | null;
  answerTimeSecSnapshot: number | null;
  retryAllowedSnapshot: boolean | null;
  ncsScoringVersion: string | null;
  answers: Array<{ answerId: bigint }>;
  sessionQuestions: ExistingNcsSnapshotQuestion[];
  ncsProfilePolicies: ExistingNcsSessionPolicy[];
};

type ExistingNcsSnapshotValidation = {
  valid: boolean;
  errors: string[];
  commonQuestionCount: number;
  personalizedQuestionCount: number;
  policyVersion: number;
  criteriaVersion: number;
  ncsCoverage: Array<{
    ncsProfileId: CanonicalNcsProfileId;
    requiredQuestionCount: number;
    actualQuestionCount: number;
  }>;
};

type NcsSourceQuestion = {
  criterionId: bigint | null;
  ncsProfileId: string | null;
  ncsQuestionMode: string | null;
  ncsProfileVersion: string | null;
  alignmentStatus: string | null;
  evaluatorVersion: string | null;
  ncsBindings: Array<{
    criterionId: bigint | null;
    ncsProfileId: string;
    ncsProfileVersion: string;
    alignmentStatus: string;
    evaluatorVersion: string | null;
    bindingOrder: number;
    criterion: {
      ncsProfileId: string | null;
      ncsProfileVersion: string | null;
    } | null;
  }>;
};

function hasValidNcsSourceBindings(question: NcsSourceQuestion): boolean {
  const bindings = question.ncsBindings;
  const primaryBinding = bindings[0];
  return (
    question.alignmentStatus === "ALIGNED" &&
    NCS_QUESTION_MODES.includes(
      question.ncsQuestionMode as (typeof NCS_QUESTION_MODES)[number],
    ) &&
    Boolean(question.ncsProfileVersion?.trim()) &&
    Boolean(question.evaluatorVersion?.trim()) &&
    bindings.length >= 1 &&
    bindings.length <= 2 &&
    new Set(bindings.map((binding) => binding.ncsProfileId)).size === bindings.length &&
    bindings.every((binding, index) =>
      binding.bindingOrder === index + 1 &&
      binding.alignmentStatus === "ALIGNED" &&
      isCanonicalNcsProfileId(binding.ncsProfileId) &&
      Boolean(binding.ncsProfileVersion.trim()) &&
      Boolean(binding.evaluatorVersion?.trim()) &&
      binding.criterion?.ncsProfileId === binding.ncsProfileId &&
      binding.criterion.ncsProfileVersion === binding.ncsProfileVersion,
    ) &&
    primaryBinding !== undefined &&
    question.criterionId === primaryBinding.criterionId &&
    question.ncsProfileId === primaryBinding.ncsProfileId &&
    question.ncsProfileVersion === primaryBinding.ncsProfileVersion &&
    question.evaluatorVersion === primaryBinding.evaluatorVersion
  );
}

function validateExistingNcsSessionSnapshot(
  session: ExistingNcsSessionSnapshot,
  current: {
    expectedCommonQuestionCount: number;
    expectedPersonalizedQuestionCount: number;
    currentPolicyVersion: number;
    currentCriteriaVersion: number;
    requireCurrentVersions: boolean;
  },
): ExistingNcsSnapshotValidation {
  const errors = new Set<string>();
  const questions = session.sessionQuestions;
  const commonQuestionCount = questions.filter(
    (question) => question.generationSource === "JD_CRITERIA",
  ).length;
  const personalizedQuestionCount = questions.filter(
    (question) => question.generationSource === "RESUME_PERSONALIZED",
  ).length;

  if (session.ncsScoringVersion !== NCS_SCORING_VERSION) {
    errors.add("NCS_SCORING_VERSION_INVALID");
  }
  if (
    !Number.isInteger(session.preparationTimeSecSnapshot) ||
    (session.preparationTimeSecSnapshot ?? -1) < 0 ||
    !Number.isInteger(session.answerTimeSecSnapshot) ||
    (session.answerTimeSecSnapshot ?? 0) <= 0 ||
    (session.answerTimeSecSnapshot ?? 0) <=
      (session.preparationTimeSecSnapshot ?? -1) ||
    typeof session.retryAllowedSnapshot !== "boolean"
  ) {
    errors.add("TIME_POLICY_SNAPSHOT_INVALID");
  }
  if (questions.length === 0) {
    errors.add("SESSION_QUESTIONS_MISSING");
  }

  const profileQuestionCounts = new Map<CanonicalNcsProfileId, number>(
    NCS_PROFILE_IDS.map((profileId) => [profileId, 0]),
  );
  const policyVersions = new Set<number>();
  const criteriaVersions = new Set<number>();
  for (const [index, question] of questions.entries()) {
    if (question.sortOrder !== index + 1) {
      errors.add("QUESTION_ORDER_INVALID");
    }
    const hasValidSourceShape =
      (question.generationSource === "JD_CRITERIA" &&
        question.questionId !== null &&
        question.personalizedQuestionId === null) ||
      (question.generationSource === "RESUME_PERSONALIZED" &&
        question.questionId === null);
    if (!hasValidSourceShape) {
      errors.add("GENERATION_SOURCE_INVALID");
    }
    if (
      question.runtimeQuestionId === null ||
      !question.questionType ||
      !question.content?.trim() ||
      !question.criterionTitleSnapshot?.trim() ||
      !NCS_QUESTION_MODES.includes(
        question.ncsQuestionMode as (typeof NCS_QUESTION_MODES)[number],
      ) ||
      !question.ncsProfileVersion?.trim() ||
      question.alignmentStatus !== "ALIGNED" ||
      !question.evaluatorVersion?.trim()
    ) {
      errors.add("QUESTION_METADATA_INVALID");
    }
    if (!Number.isInteger(question.policyVersion) || (question.policyVersion ?? 0) < 1) {
      errors.add("POLICY_VERSION_INVALID");
    } else {
      policyVersions.add(question.policyVersion as number);
    }
    if (!Number.isInteger(question.criteriaVersion) || (question.criteriaVersion ?? 0) < 1) {
      errors.add("CRITERIA_VERSION_INVALID");
    } else {
      criteriaVersions.add(question.criteriaVersion as number);
    }

    const bindings = question.ncsBindings;
    if (bindings.length < 1 || bindings.length > 2) {
      errors.add("BINDING_CARDINALITY_INVALID");
      continue;
    }
    const bindingProfiles = new Set<string>();
    for (const [bindingIndex, binding] of bindings.entries()) {
      if (
        binding.bindingOrder !== bindingIndex + 1 ||
        !isCanonicalNcsProfileId(binding.ncsProfileId) ||
        bindingProfiles.has(binding.ncsProfileId) ||
        binding.alignmentStatus !== "ALIGNED" ||
        !binding.ncsProfileVersion.trim() ||
        !binding.criterionTitleSnapshot.trim() ||
        !binding.evaluatorVersion?.trim()
      ) {
        errors.add("BINDING_METADATA_INVALID");
        continue;
      }
      bindingProfiles.add(binding.ncsProfileId);
      profileQuestionCounts.set(
        binding.ncsProfileId,
        (profileQuestionCounts.get(binding.ncsProfileId) ?? 0) + 1,
      );
    }
    const primaryBinding = bindings[0];
    if (
      !primaryBinding ||
      question.criterionId !== primaryBinding.criterionId ||
      question.criterionTitleSnapshot !== primaryBinding.criterionTitleSnapshot ||
      question.ncsProfileId !== primaryBinding.ncsProfileId ||
      question.ncsProfileVersion !== primaryBinding.ncsProfileVersion ||
      question.evaluatorVersion !== primaryBinding.evaluatorVersion
    ) {
      errors.add("PRIMARY_BINDING_MISMATCH");
    }
  }

  if (policyVersions.size !== 1) errors.add("POLICY_VERSION_INCONSISTENT");
  if (criteriaVersions.size !== 1) errors.add("CRITERIA_VERSION_INCONSISTENT");
  const policyVersion = [...policyVersions][0] ?? 0;
  const criteriaVersion = [...criteriaVersions][0] ?? 0;
  if (
    current.requireCurrentVersions &&
    (policyVersion !== current.currentPolicyVersion ||
      criteriaVersion !== current.currentCriteriaVersion)
  ) {
    errors.add("CURRENT_VERSION_MISMATCH");
  }
  if (
    current.requireCurrentVersions &&
    (commonQuestionCount !== current.expectedCommonQuestionCount ||
      personalizedQuestionCount !== current.expectedPersonalizedQuestionCount)
  ) {
    errors.add("QUESTION_COUNT_MISMATCH");
  }

  const policiesByProfile = new Map<CanonicalNcsProfileId, ExistingNcsSessionPolicy>();
  if (session.ncsProfilePolicies.length !== NCS_PROFILE_IDS.length) {
    errors.add("SESSION_POLICY_COUNT_INVALID");
  }
  for (const policy of session.ncsProfilePolicies) {
    if (
      !isCanonicalNcsProfileId(policy.ncsProfileId) ||
      policiesByProfile.has(policy.ncsProfileId) ||
      !Number.isInteger(policy.weight) ||
      policy.weight < 0 ||
      !Number.isInteger(policy.requiredQuestionCount) ||
      policy.requiredQuestionCount < NCS_REQUIRED_QUESTION_COUNT ||
      !policy.criterionTitleSnapshot.trim() ||
      !policy.ncsProfileVersion.trim()
    ) {
      errors.add("SESSION_POLICY_METADATA_INVALID");
      continue;
    }
    policiesByProfile.set(policy.ncsProfileId, policy);
  }
  if (
    NCS_PROFILE_IDS.some((profileId) => !policiesByProfile.has(profileId)) ||
    [...policiesByProfile.values()].reduce((total, policy) => total + policy.weight, 0) !== 100
  ) {
    errors.add("SESSION_POLICY_WEIGHT_INVALID");
  }

  const ncsCoverage = NCS_PROFILE_IDS.map((ncsProfileId) => {
    const policy = policiesByProfile.get(ncsProfileId);
    const requiredQuestionCount = policy?.requiredQuestionCount ?? NCS_REQUIRED_QUESTION_COUNT;
    const actualQuestionCount = profileQuestionCounts.get(ncsProfileId) ?? 0;
    if (actualQuestionCount < requiredQuestionCount) {
      errors.add(`PROFILE_COVERAGE_INVALID:${ncsProfileId}`);
    }
    const profileBindings = questions.flatMap((question) =>
      question.ncsBindings
        .filter((binding) => binding.ncsProfileId === ncsProfileId)
        .map((binding) => binding),
    );
    if (
      policy &&
      profileBindings.some((binding) =>
        binding.ncsProfileVersion !== policy.ncsProfileVersion ||
        binding.criterionId !== policy.criterionId ||
        binding.criterionTitleSnapshot !== policy.criterionTitleSnapshot,
      )
    ) {
      errors.add(`PROFILE_POLICY_MISMATCH:${ncsProfileId}`);
    }
    return { ncsProfileId, requiredQuestionCount, actualQuestionCount };
  });

  return {
    valid: errors.size === 0,
    errors: [...errors],
    commonQuestionCount,
    personalizedQuestionCount,
    policyVersion,
    criteriaVersion,
    ncsCoverage,
  };
}

@Injectable()
export class PrismaCandidateRepository implements CandidateRepository {
  private candidatePostingSchemaShape?: Promise<CandidatePostingSchemaShape>;

  constructor(private readonly prisma: PrismaService) {}

  async listJobs(): Promise<CandidateJob[]> {
    const postings = await this.findCandidatePostingRows();
    return postings.map((posting) => this.toCandidateJob(posting));
  }

  async findJob(jobId: number): Promise<CandidateJob | undefined> {
    const postings = await this.findCandidatePostingRows({ postingId: jobId, visibleOnly: false });
    return postings[0] ? this.toCandidateJob(postings[0]) : undefined;
  }

  async getInterviewTimePolicy(postingId: number) {
    const timePolicy = await this.prisma.interviewTimePolicy.findUnique({
      where: { postingId: BigInt(postingId) },
    });
    return {
      preparationTimeSec: timePolicy?.preparationTimeSec ?? 0,
      answerTimeSec: timePolicy?.answerTimeSec ?? 90,
      retryAllowed: timePolicy?.retryAllowed ?? false,
    };
  }

  async findFileAsset(fileId: number): Promise<FileAsset | undefined> {
    const fileAsset = await this.prisma.fileAsset.findUnique({ where: { fileId: BigInt(fileId) } });
    return fileAsset ? this.toFileAsset(fileAsset) : undefined;
  }

  async listApplications(candidateId: number): Promise<Application[]> {
    const applications = await this.prisma.application.findMany({
      where: { candidateId: BigInt(candidateId) },
      orderBy: { updatedAt: "desc" },
    });
    return applications.map((application) => this.toApplication(application));
  }

  async findApplication(applicationId: number): Promise<Application | undefined> {
    const application = await this.prisma.application.findUnique({
      where: { applicationId: BigInt(applicationId) },
    });
    return application ? this.toApplication(application) : undefined;
  }

  async findCandidateUserId(candidateId: number): Promise<number | undefined> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateId: BigInt(candidateId) },
      select: { userId: true },
    });
    return profile ? Number(profile.userId) : undefined;
  }

  async findApplicantContact(userId: number): Promise<ApplicantContact | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { userId: BigInt(userId) },
      select: {
        name: true,
        email: true,
        phone: true,
        candidateProfile: { select: { githubUrl: true, blogUrl: true, portfolioUrl: true } },
      },
    });
    if (!user) {
      return undefined;
    }
    return {
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      githubUrl: user.candidateProfile?.githubUrl ?? null,
      blogUrl: user.candidateProfile?.blogUrl ?? null,
      portfolioUrl: user.candidateProfile?.portfolioUrl ?? null,
    };
  }

  async getCandidateProfile(candidateId: number): Promise<CandidateProfileView | undefined> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateId: BigInt(candidateId) },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        educations: { orderBy: { sortOrder: "asc" } },
        careers: { orderBy: { sortOrder: "asc" } },
        activities: { orderBy: { sortOrder: "asc" } },
        credentials: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!profile) {
      return undefined;
    }
    return {
      name: profile.user.name,
      email: profile.user.email,
      phone: profile.user.phone ?? null,
      githubUrl: profile.githubUrl ?? null,
      blogUrl: profile.blogUrl ?? null,
      portfolioUrl: profile.portfolioUrl ?? null,
      summary: profile.summary ?? null,
      coverLetter: profile.coverLetter ?? null,
      educations: profile.educations.map((item) => ({
        educationLevel: item.educationLevel,
        schoolName: item.schoolName,
        major: item.major ?? null,
        degreeType: item.degreeType,
        status: item.status,
        startMonth: formatDbMonth(item.startMonth),
        endMonth: item.endMonth ? formatDbMonth(item.endMonth) : null,
      })),
      careers: profile.careers.map((item) => ({
        companyName: item.companyName,
        startMonth: formatDbMonth(item.startMonth),
        endMonth: item.endMonth ? formatDbMonth(item.endMonth) : null,
        isCurrent: item.isCurrent,
        jobRole: item.jobRole,
        department: item.department ?? null,
        position: item.position ?? null,
        responsibilities: item.responsibilities,
      })),
      activities: profile.activities.map((item) => ({
        activityType: item.activityType,
        organizationName: item.organizationName,
        startDate: formatDbDate(item.startDate),
        endDate: item.endDate ? formatDbDate(item.endDate) : null,
        isOngoing: item.isOngoing,
        description: item.description,
      })),
      credentials: profile.credentials.map((item) => ({
        credentialType: item.credentialType,
        name: item.name,
        issuer: item.issuer,
        acquiredMonth: formatDbMonth(item.acquiredMonth),
        result: item.result ?? null,
      })),
    };
  }

  async getCandidateProfileUpdatedAt(candidateId: number): Promise<string | null> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateId: BigInt(candidateId) },
      select: { updatedAt: true },
    });
    return profile?.updatedAt.toISOString() ?? null;
  }

  async updateCandidateProfile(
    candidateId: number,
    input: UpdateCandidateProfileInput,
  ): Promise<CandidateProfileView> {
    const existing = await this.prisma.candidateProfile.findUnique({
      where: { candidateId: BigInt(candidateId) },
      select: { userId: true },
    });
    if (!existing) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "지원자 프로필을 찾을 수 없습니다.", 404);
    }

    const userData = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    };
    const profileData = {
      ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
      ...(input.blogUrl !== undefined ? { blogUrl: input.blogUrl } : {}),
      ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.coverLetter !== undefined ? { coverLetter: input.coverLetter } : {}),
    };

    const candidateIdValue = BigInt(candidateId);
    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { userId: existing.userId }, data: userData });
      }
      await tx.candidateProfile.update({
        where: { candidateId: candidateIdValue },
        data: { ...profileData, updatedAt: new Date() },
      });
      if (input.educations !== undefined) {
        await tx.candidateEducation.deleteMany({ where: { candidateId: candidateIdValue } });
        if (input.educations.length > 0) {
          await tx.candidateEducation.createMany({
            data: input.educations.map((item, index) => ({
              candidateId: candidateIdValue,
              sortOrder: index + 1,
              educationLevel: item.educationLevel,
              schoolName: item.schoolName,
              major: item.major,
              degreeType: item.degreeType,
              status: item.status,
              startMonth: parseDbMonth(item.startMonth),
              endMonth: item.endMonth ? parseDbMonth(item.endMonth) : null,
            })),
          });
        }
      }
      if (input.careers !== undefined) {
        await tx.candidateCareer.deleteMany({ where: { candidateId: candidateIdValue } });
        if (input.careers.length > 0) {
          await tx.candidateCareer.createMany({
            data: input.careers.map((item, index) => ({
              candidateId: candidateIdValue,
              sortOrder: index + 1,
              companyName: item.companyName,
              startMonth: parseDbMonth(item.startMonth),
              endMonth: item.endMonth ? parseDbMonth(item.endMonth) : null,
              isCurrent: item.isCurrent,
              jobRole: item.jobRole,
              department: item.department,
              position: item.position,
              responsibilities: item.responsibilities,
            })),
          });
        }
      }
      if (input.activities !== undefined) {
        await tx.candidateActivity.deleteMany({ where: { candidateId: candidateIdValue } });
        if (input.activities.length > 0) {
          await tx.candidateActivity.createMany({
            data: input.activities.map((item, index) => ({
              candidateId: candidateIdValue,
              sortOrder: index + 1,
              activityType: item.activityType,
              organizationName: item.organizationName,
              startDate: parseDbDate(item.startDate),
              endDate: item.endDate ? parseDbDate(item.endDate) : null,
              isOngoing: item.isOngoing,
              description: item.description,
            })),
          });
        }
      }
      if (input.credentials !== undefined) {
        await tx.candidateCredential.deleteMany({ where: { candidateId: candidateIdValue } });
        if (input.credentials.length > 0) {
          await tx.candidateCredential.createMany({
            data: input.credentials.map((item, index) => ({
              candidateId: candidateIdValue,
              sortOrder: index + 1,
              credentialType: item.credentialType,
              name: item.name,
              issuer: item.issuer,
              acquiredMonth: parseDbMonth(item.acquiredMonth),
              result: item.result,
            })),
          });
        }
      }
    });

    const updated = await this.getCandidateProfile(candidateId);
    if (!updated) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "지원자 프로필을 찾을 수 없습니다.", 404);
    }
    return updated;
  }

  async listDocuments(applicationId: number): Promise<ApplicationDocument[]> {
    const documents = await this.prisma.applicationDocument.findMany({
      where: { applicationId: BigInt(applicationId) },
      orderBy: { uploadedAt: "asc" },
    });
    return documents.map((document) => this.toApplicationDocument(document));
  }

  async findLatestExtractedTextByFileId(fileId: number): Promise<string | null> {
    const document = await this.prisma.applicationDocument.findFirst({
      where: {
        fileId: BigInt(fileId),
        parseStatus: "EXTRACTED",
        extractedText: { not: null },
      },
      orderBy: { uploadedAt: "desc" },
      select: { extractedText: true },
    });
    return document?.extractedText ?? null;
  }

  async listConsentRecords(applicationId: number): Promise<ConsentRecord[]> {
    const consents = await this.prisma.consentRecord.findMany({
      where: { applicationId: BigInt(applicationId), agreed: true },
      orderBy: { consentId: "asc" },
    });
    return consents.map((consent) => this.toConsentRecord(consent));
  }

  async saveConsentRecords(applicationId: number, consentTypes: ConsentRecord["consentType"][]): Promise<ConsentRecord[]> {
    await this.prisma.$transaction(async (tx) => {
      await tx.consentRecord.deleteMany({
        where: {
          applicationId: BigInt(applicationId),
          consentType: { in: consentTypes as PrismaConsentType[] },
        },
      });
      await tx.consentRecord.createMany({
        data: consentTypes.map((consentType) => ({
          applicationId: BigInt(applicationId),
          consentType: consentType as PrismaConsentType,
          agreed: true,
          agreedAt: new Date(),
        })),
      });
    });
    return this.listConsentRecords(applicationId);
  }

  async findInterviewSession(sessionId: number): Promise<InterviewSession | undefined> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { sessionId: BigInt(sessionId) },
      include: { application: true },
    });
    return session ? this.toInterviewSession(session) : undefined;
  }

  async findInterviewSessionByApplication(applicationId: number): Promise<InterviewSession | undefined> {
    const existing = await this.prisma.interviewSession.findFirst({
      where: { applicationId: BigInt(applicationId), interviewType: PrismaInterviewType.RECRUITING },
      orderBy: { sessionId: "desc" },
      include: { application: true },
    });
    return existing ? this.toInterviewSession(existing) : undefined;
  }

  async ensureInterviewSessionByApplication(applicationId: number): Promise<InterviewSession | undefined> {
    const existing = await this.findInterviewSessionByApplication(applicationId);
    if (existing) return existing;

    const application = await this.prisma.application.findUnique({ where: { applicationId: BigInt(applicationId) } });
    if (!application) return undefined;

    const created = await this.prisma.interviewSession.create({
      data: {
        applicationId: application.applicationId,
        candidateId: application.candidateId,
        interviewType: PrismaInterviewType.RECRUITING,
        status: PrismaInterviewStatus.NOT_READY,
        showQuestionText: true,
      },
      include: { application: true },
    });
    return this.toInterviewSession(created);
  }

  async prepareInterviewSessionQuestionSnapshot(
    applicationId: number,
  ): Promise<InterviewQuestionSnapshotResult | undefined> {
    return this.prisma.$transaction(async (transaction) => {
      const lockKey = 417_000_000_000n + BigInt(applicationId);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      const application = await transaction.application.findUnique({
        where: { applicationId: BigInt(applicationId) },
        include: {
          posting: {
            include: {
              timePolicy: true,
              criteria: {
                orderBy: { sortOrder: "asc" },
                include: { tag: true },
              },
              questionGenerationPolicy: true,
              questionSets: {
                where: { status: "ACTIVE" },
                orderBy: { questionSetId: "desc" },
                take: 1,
                include: {
                  items: {
                    orderBy: { sortOrder: "asc" },
                    include: {
                      question: {
                        include: {
                          ncsBindings: {
                            orderBy: { bindingOrder: "asc" },
                            include: { criterion: { include: { tag: true } } },
                          },
                        },
                      },
                      criterion: { include: { tag: true } },
                    },
                  },
                },
              },
            },
          },
          documents: {
            where: { documentType: PrismaDocumentType.RESUME },
            orderBy: { uploadedAt: "desc" },
            take: 1,
          },
          interviewQuestionBatches: {
            orderBy: { createdAt: "desc" },
            include: {
              questions: {
                orderBy: { sortOrder: "asc" },
                include: {
                  ncsBindings: {
                    orderBy: { bindingOrder: "asc" },
                    include: { criterion: { include: { tag: true } } },
                  },
                },
              },
            },
          },
          interviewSessions: {
            where: { interviewType: PrismaInterviewType.RECRUITING },
            orderBy: { sessionId: "desc" },
            take: 1,
            include: {
              sessionQuestions: {
                orderBy: { sortOrder: "asc" },
                include: {
                  ncsBindings: { orderBy: { bindingOrder: "asc" } },
                },
              },
              ncsProfilePolicies: { orderBy: { ncsProfileId: "asc" } },
              answers: { select: { answerId: true }, take: 1 },
            },
          },
        },
      });
      if (!application) return undefined;

      const policy = application.posting.questionGenerationPolicy;
      const expectedCommonQuestionCount = policy?.jdCriteriaQuestionCount ?? 0;
      const expectedPersonalizedQuestionCount = policy?.resumeQuestionCount ?? 0;
      const policyVersion = policy?.policyVersion ?? 0;
      const criteriaVersion = policy?.criteriaVersion ?? 0;
      const existingSession = application.interviewSessions[0] ?? null;
      const existingSnapshot = existingSession?.sessionQuestions ?? [];
      const isNcsPolicy = policy?.evaluationFramework === "NCS_3_PROFILE_V1";
      if (existingSession && existingSnapshot.length > 0 && !isNcsPolicy) {
        const commonQuestionCount = existingSnapshot.filter((item) =>
          item.generationSource === "JD_CRITERIA" || (item.generationSource === null && item.questionId !== null),
        ).length;
        const personalizedQuestionCount = existingSnapshot.filter(
          (item) => item.generationSource === "RESUME_PERSONALIZED",
        ).length;
        return {
          readiness: "READY",
          applicationId,
          postingId: Number(application.postingId),
          sessionId: Number(existingSession.sessionId),
          snapshotCreated: false,
          commonQuestionCount,
          personalizedQuestionCount,
          totalQuestionCount: existingSnapshot.length,
          expectedCommonQuestionCount,
          expectedPersonalizedQuestionCount,
          policyVersion: existingSnapshot[0]?.policyVersion ?? policyVersion,
          criteriaVersion: existingSnapshot[0]?.criteriaVersion ?? criteriaVersion,
        };
      }

      let replaceInvalidNcsSnapshot = false;
      if (existingSession && isNcsPolicy) {
        const canReplaceSnapshot =
          (existingSession.status === PrismaInterviewStatus.NOT_READY ||
            existingSession.status === PrismaInterviewStatus.READY) &&
          existingSession.answers.length === 0;
        const validation = validateExistingNcsSessionSnapshot(
          existingSession as unknown as ExistingNcsSessionSnapshot,
          {
            expectedCommonQuestionCount,
            expectedPersonalizedQuestionCount,
            currentPolicyVersion: policyVersion,
            currentCriteriaVersion: criteriaVersion,
            requireCurrentVersions: canReplaceSnapshot,
          },
        );
        if (validation.valid) {
          return {
            readiness: "READY",
            applicationId,
            postingId: Number(application.postingId),
            sessionId: Number(existingSession.sessionId),
            snapshotCreated: false,
            commonQuestionCount: validation.commonQuestionCount,
            personalizedQuestionCount: validation.personalizedQuestionCount,
            totalQuestionCount: existingSnapshot.length,
            expectedCommonQuestionCount,
            expectedPersonalizedQuestionCount,
            policyVersion: validation.policyVersion,
            criteriaVersion: validation.criteriaVersion,
            ncsCoverage: validation.ncsCoverage,
          };
        }
        if (!canReplaceSnapshot) {
          return {
            readiness: "NCS_SNAPSHOT_INVALID",
            applicationId,
            postingId: Number(application.postingId),
            sessionId: Number(existingSession.sessionId),
            snapshotCreated: false,
            commonQuestionCount: validation.commonQuestionCount,
            personalizedQuestionCount: validation.personalizedQuestionCount,
            totalQuestionCount: existingSnapshot.length,
            expectedCommonQuestionCount,
            expectedPersonalizedQuestionCount,
            policyVersion: validation.policyVersion,
            criteriaVersion: validation.criteriaVersion,
            ncsCoverage: validation.ncsCoverage,
            snapshotValidationErrors: validation.errors,
          };
        }
        const retryAllowedSnapshot = (
          existingSession as unknown as { retryAllowedSnapshot: boolean | null }
        ).retryAllowedSnapshot;
        replaceInvalidNcsSnapshot =
          existingSnapshot.length > 0 ||
          existingSession.ncsProfilePolicies.length > 0 ||
          existingSession.preparationTimeSecSnapshot !== null ||
          existingSession.answerTimeSecSnapshot !== null ||
          retryAllowedSnapshot !== null ||
          existingSession.ncsScoringVersion !== null;
      }

      if (!isNcsPolicy) {
        const session = existingSession ?? await transaction.interviewSession.create({
          data: {
            applicationId: application.applicationId,
            candidateId: application.candidateId,
            interviewType: PrismaInterviewType.RECRUITING,
            status: PrismaInterviewStatus.NOT_READY,
            showQuestionText: true,
          },
        });
        return {
          readiness: "READY",
          applicationId,
          postingId: Number(application.postingId),
          sessionId: Number(session.sessionId),
          snapshotCreated: false,
          commonQuestionCount: 0,
          personalizedQuestionCount: 0,
          totalQuestionCount: 0,
          expectedCommonQuestionCount,
          expectedPersonalizedQuestionCount,
          policyVersion,
          criteriaVersion,
        };
      }

      const ncsCriteria = application.posting.criteria.filter((criterion) =>
        isCanonicalNcsProfileId(criterion.ncsProfileId) &&
        Boolean(criterion.ncsProfileVersion) &&
        Boolean(criterion.tag.name.trim()),
      );
      const criteriaProfiles = ncsCriteria.map((criterion) => criterion.ncsProfileId);
      const hasValidNcsPolicy =
        ncsCriteria.length === NCS_PROFILE_IDS.length &&
        NCS_PROFILE_IDS.every(
          (profileId) => criteriaProfiles.filter((candidate) => candidate === profileId).length === 1,
        ) &&
        ncsCriteria.reduce((total, criterion) => total + criterion.weight, 0) === 100;
      if (!hasValidNcsPolicy) {
        return this.snapshotReadinessResult({
          readiness: "NCS_QUESTION_COVERAGE_INVALID",
          applicationId,
          postingId: Number(application.postingId),
          sessionId: existingSession ? Number(existingSession.sessionId) : null,
          commonQuestionCount: 0,
          personalizedQuestionCount: 0,
          expectedCommonQuestionCount,
          expectedPersonalizedQuestionCount,
          policyVersion,
          criteriaVersion,
          ncsCoverage: NCS_PROFILE_IDS.map((ncsProfileId) => ({
            ncsProfileId,
            requiredQuestionCount: NCS_REQUIRED_QUESTION_COUNT,
            actualQuestionCount: 0,
          })),
        });
      }

      const activeQuestionSet = application.posting.questionSets[0] ?? null;
      const activeQuestionSetItems = activeQuestionSet?.items ?? [];
      const commonQuestions = activeQuestionSetItems.filter((item) =>
        item.question.isActive &&
        item.question.generationSource === "JD_CRITERIA" &&
        hasValidNcsSourceBindings(item.question),
      );
      if (
        activeQuestionSetItems.length !== expectedCommonQuestionCount ||
        commonQuestions.length !== expectedCommonQuestionCount
      ) {
        return this.snapshotReadinessResult({
          readiness: "COMMON_QUESTIONS_NOT_READY",
          applicationId,
          postingId: Number(application.postingId),
          sessionId: existingSession ? Number(existingSession.sessionId) : null,
          commonQuestionCount: commonQuestions.length,
          personalizedQuestionCount: 0,
          expectedCommonQuestionCount,
          expectedPersonalizedQuestionCount,
          policyVersion,
          criteriaVersion,
        });
      }

      let personalizedQuestions: (typeof application.interviewQuestionBatches)[number]["questions"] = [];
      if (expectedPersonalizedQuestionCount > 0) {
        const resumeDocument = application.documents[0] ?? null;
        const resumeText = resumeDocument?.parseStatus === PrismaDocumentStatus.EXTRACTED
          ? resumeDocument.extractedText?.trim() ?? ""
          : "";
        const jobDescription = application.posting.jobDescription?.trim() ?? "";
        const resumeDocumentHash = resumeText ? hashInterviewSnapshot(resumeText) : null;
        const jdSnapshotHash = jobDescription ? hashInterviewSnapshot(jobDescription) : null;
        const batch = resumeDocumentHash && jdSnapshotHash
          ? application.interviewQuestionBatches.find((candidate) =>
              candidate.policyVersion === policyVersion &&
              candidate.criteriaVersion === criteriaVersion &&
              candidate.resumeDocumentHash === resumeDocumentHash &&
              candidate.jdSnapshotHash === jdSnapshotHash,
            )
          : null;
        personalizedQuestions = batch?.status === "READY" && batch.questions.length === expectedPersonalizedQuestionCount
            ? batch.questions.filter((question) =>
              question.source === "RESUME_PERSONALIZED" &&
              Boolean(question.content.trim()) &&
              hasValidNcsSourceBindings(question),
            )
          : [];
        if (personalizedQuestions.length !== expectedPersonalizedQuestionCount) {
          return this.snapshotReadinessResult({
            readiness: "PERSONALIZED_QUESTIONS_NOT_READY",
            applicationId,
            postingId: Number(application.postingId),
            sessionId: existingSession ? Number(existingSession.sessionId) : null,
            commonQuestionCount: commonQuestions.length,
            personalizedQuestionCount: personalizedQuestions.length,
            expectedCommonQuestionCount,
            expectedPersonalizedQuestionCount,
            policyVersion,
            criteriaVersion,
          });
        }
      }

      const profileQuestionCounts = new Map<CanonicalNcsProfileId, number>(
        NCS_PROFILE_IDS.map((profileId) => [profileId, 0]),
      );
      for (const bindings of [
        ...commonQuestions.map((item) => item.question.ncsBindings),
        ...personalizedQuestions.map((question) => question.ncsBindings),
      ]) {
        for (const binding of bindings) {
          if (isCanonicalNcsProfileId(binding.ncsProfileId)) {
            profileQuestionCounts.set(
              binding.ncsProfileId,
              (profileQuestionCounts.get(binding.ncsProfileId) ?? 0) + 1,
            );
          }
        }
      }
      const ncsCoverage = NCS_PROFILE_IDS.map((ncsProfileId) => ({
        ncsProfileId,
        requiredQuestionCount: NCS_REQUIRED_QUESTION_COUNT,
        actualQuestionCount: profileQuestionCounts.get(ncsProfileId) ?? 0,
      }));
      if (ncsCoverage.some((coverage) => coverage.actualQuestionCount < coverage.requiredQuestionCount)) {
        return this.snapshotReadinessResult({
          readiness: "NCS_QUESTION_COVERAGE_INVALID",
          applicationId,
          postingId: Number(application.postingId),
          sessionId: existingSession ? Number(existingSession.sessionId) : null,
          commonQuestionCount: commonQuestions.length,
          personalizedQuestionCount: personalizedQuestions.length,
          expectedCommonQuestionCount,
          expectedPersonalizedQuestionCount,
          policyVersion,
          criteriaVersion,
          ncsCoverage,
        });
      }

      const preparationTimeSecSnapshot = application.posting.timePolicy?.preparationTimeSec ?? 0;
      const answerTimeSecSnapshot = application.posting.timePolicy?.answerTimeSec ?? 90;
      const retryAllowedSnapshot = application.posting.timePolicy?.retryAllowed ?? false;
      if (existingSession && replaceInvalidNcsSnapshot) {
        await transaction.interviewSessionQuestion.deleteMany({
          where: { sessionId: existingSession.sessionId },
        });
        await transaction.interviewSessionNcsPolicy.deleteMany({
          where: { sessionId: existingSession.sessionId },
        });
      }
      const session = existingSession
        ? await transaction.interviewSession.update({
            where: { sessionId: existingSession.sessionId },
            data: {
              preparationTimeSecSnapshot,
              answerTimeSecSnapshot,
              retryAllowedSnapshot,
              ncsScoringVersion: NCS_SCORING_VERSION,
            } as Prisma.InterviewSessionUpdateInput,
          })
        : await transaction.interviewSession.create({
            data: {
              applicationId: application.applicationId,
              candidateId: application.candidateId,
              interviewType: PrismaInterviewType.RECRUITING,
              status: PrismaInterviewStatus.NOT_READY,
              showQuestionText: true,
              preparationTimeSecSnapshot,
              answerTimeSecSnapshot,
              retryAllowedSnapshot,
              ncsScoringVersion: NCS_SCORING_VERSION,
            } as Prisma.InterviewSessionUncheckedCreateInput,
          });
      const snapshotRows: Prisma.InterviewSessionQuestionCreateManyInput[] = [];
      const snapshotBindings: Array<Array<Omit<
        Prisma.SessionQuestionNcsBindingCreateManyInput,
        "sessionQuestionId"
      >>> = [];
      for (const item of commonQuestions) {
        const runtimeQuestionId = await this.allocateSessionRuntimeQuestionId(transaction);
        const primaryBinding = item.question.ncsBindings[0];
        if (!primaryBinding) throw new Error("Validated common NCS question lost its binding.");
        snapshotRows.push({
          sessionId: session.sessionId,
          questionId: item.question.questionId,
          personalizedQuestionId: null,
          runtimeQuestionId,
          criterionId: primaryBinding.criterionId,
          criterionTitleSnapshot: primaryBinding.criterion.tag.name,
          generationSource: "JD_CRITERIA",
          questionType: item.question.questionType,
          content: item.question.content,
          ncsProfileId: primaryBinding.ncsProfileId,
          ncsQuestionMode: item.question.ncsQuestionMode,
          ncsProfileVersion: primaryBinding.ncsProfileVersion,
          alignmentStatus: primaryBinding.alignmentStatus,
          alignmentScore: primaryBinding.alignmentScore,
          alignmentReason: primaryBinding.alignmentReason,
          evaluatorVersion: primaryBinding.evaluatorVersion,
          policyVersion,
          criteriaVersion,
          sortOrder: snapshotRows.length + 1,
        });
        snapshotBindings.push(item.question.ncsBindings.map((binding) => ({
          criterionId: binding.criterionId,
          criterionTitleSnapshot: binding.criterion.tag.name,
          ncsProfileId: binding.ncsProfileId,
          ncsProfileVersion: binding.ncsProfileVersion,
          alignmentStatus: binding.alignmentStatus,
          alignmentScore: binding.alignmentScore,
          alignmentReason: binding.alignmentReason,
          evaluatorVersion: binding.evaluatorVersion,
          bindingOrder: binding.bindingOrder,
        })));
      }
      for (const question of personalizedQuestions) {
        const runtimeQuestionId = await this.allocateSessionRuntimeQuestionId(transaction);
        const primaryBinding = question.ncsBindings[0];
        if (!primaryBinding) throw new Error("Validated personalized NCS question lost its binding.");
        snapshotRows.push({
          sessionId: session.sessionId,
          questionId: null,
          personalizedQuestionId: question.personalizedQuestionId,
          runtimeQuestionId,
          criterionId: primaryBinding.criterionId,
          criterionTitleSnapshot: primaryBinding.criterion?.tag.name ?? question.criterionTitleSnapshot,
          generationSource: "RESUME_PERSONALIZED",
          questionType: question.questionType,
          content: question.content,
          ncsProfileId: primaryBinding.ncsProfileId,
          ncsQuestionMode: question.ncsQuestionMode,
          ncsProfileVersion: primaryBinding.ncsProfileVersion,
          alignmentStatus: primaryBinding.alignmentStatus,
          alignmentScore: primaryBinding.alignmentScore,
          alignmentReason: primaryBinding.alignmentReason,
          evaluatorVersion: primaryBinding.evaluatorVersion,
          policyVersion,
          criteriaVersion,
          sortOrder: snapshotRows.length + 1,
        });
        snapshotBindings.push(question.ncsBindings.map((binding) => ({
          criterionId: binding.criterionId,
          criterionTitleSnapshot: binding.criterion?.tag.name ?? question.criterionTitleSnapshot,
          ncsProfileId: binding.ncsProfileId,
          ncsProfileVersion: binding.ncsProfileVersion,
          alignmentStatus: binding.alignmentStatus,
          alignmentScore: binding.alignmentScore,
          alignmentReason: binding.alignmentReason,
          evaluatorVersion: binding.evaluatorVersion,
          bindingOrder: binding.bindingOrder,
        })));
      }
      if (snapshotRows.length > 0) {
        await transaction.interviewSessionQuestion.createMany({ data: snapshotRows });
        const createdQuestions = await transaction.interviewSessionQuestion.findMany({
          where: { sessionId: session.sessionId },
          orderBy: { sortOrder: "asc" },
          select: { sessionQuestionId: true },
        });
        if (createdQuestions.length !== snapshotBindings.length) {
          throw new Error("NCS session question snapshot count mismatch.");
        }
        await transaction.sessionQuestionNcsBinding.createMany({
          data: createdQuestions.flatMap((createdQuestion, index) =>
            (snapshotBindings[index] ?? []).map((binding) => ({
              sessionQuestionId: createdQuestion.sessionQuestionId,
              ...binding,
            })),
          ),
        });
      }
      await transaction.interviewSessionNcsPolicy.createMany({
        data: ncsCriteria.map((criterion) => ({
          sessionId: session.sessionId,
          ncsProfileId: criterion.ncsProfileId as CanonicalNcsProfileId,
          criterionId: criterion.criterionId,
          criterionTitleSnapshot: criterion.tag.name,
          weight: criterion.weight,
          minimumAverageScore: 3,
          requiredQuestionCount: NCS_REQUIRED_QUESTION_COUNT,
          ncsProfileVersion: criterion.ncsProfileVersion ?? "",
        })),
      });

      return {
        readiness: "READY",
        applicationId,
        postingId: Number(application.postingId),
        sessionId: Number(session.sessionId),
        snapshotCreated: snapshotRows.length > 0,
        commonQuestionCount: commonQuestions.length,
        personalizedQuestionCount: personalizedQuestions.length,
        totalQuestionCount: snapshotRows.length,
        expectedCommonQuestionCount,
        expectedPersonalizedQuestionCount,
        policyVersion,
        criteriaVersion,
        ncsCoverage,
      };
    });
  }

  private snapshotReadinessResult(
    input: Omit<InterviewQuestionSnapshotResult, "snapshotCreated" | "totalQuestionCount">,
  ): InterviewQuestionSnapshotResult {
    return {
      ...input,
      snapshotCreated: false,
      totalQuestionCount: input.commonQuestionCount + input.personalizedQuestionCount,
    };
  }

  private async allocateSessionRuntimeQuestionId(transaction: Prisma.TransactionClient): Promise<bigint> {
    const [sequence] = await transaction.$queryRaw<Array<{ questionId: bigint }>>`
      SELECT nextval('interview_runtime_question_id_seq') AS "questionId"
    `;
    if (!sequence) throw new Error("Failed to allocate a session runtime question ID.");
    return sequence.questionId;
  }

  async saveDeviceCheck(
    sessionId: number,
    deviceCheck: Omit<InterviewDeviceCheck, "status" | "checkedAt">,
  ): Promise<InterviewSession> {
    const nextStatus =
      deviceCheck.cameraGranted && deviceCheck.microphoneGranted && deviceCheck.networkStable
        ? PrismaInterviewStatus.READY
        : PrismaInterviewStatus.NOT_READY;
    const session = await this.prisma.interviewSession.update({
      where: { sessionId: BigInt(sessionId) },
      data: { status: nextStatus },
      include: { application: true },
    });
    return this.toInterviewSession(session);
  }

  async updateApplicationInterviewStatus(applicationId: number, status: InterviewSession["status"]): Promise<Application> {
    const application = await this.prisma.application.update({
      where: { applicationId: BigInt(applicationId) },
      data: { interviewStatus: status as PrismaInterviewStatus },
    });
    return this.toApplication(application);
  }

  async cancelApplication(applicationId: number): Promise<Application | undefined> {
    const result = await this.prisma.application.updateMany({
      where: {
        applicationId: BigInt(applicationId),
        applicationStatus: { in: [PrismaApplicationStatus.SUBMITTED, PrismaApplicationStatus.IN_REVIEW] },
        interviewStatus: { in: [PrismaInterviewStatus.NOT_READY, PrismaInterviewStatus.READY] },
      },
      data: { applicationStatus: PrismaApplicationStatus.CANCELED },
    });
    if (result.count === 0) return undefined;

    const application = await this.prisma.application.findUnique({
      where: { applicationId: BigInt(applicationId) },
    });
    return application ? this.toApplication(application) : undefined;
  }

  async updateApplicationReportStatus(applicationId: number, status: ReportStatus): Promise<Application> {
    const application = await this.prisma.application.update({
      where: { applicationId: BigInt(applicationId) },
      data: { reportStatus: status as PrismaReportStatus },
    });
    return this.toApplication(application);
  }

  async updateInterviewSessionStatus(
    sessionId: number,
    status: InterviewSession["status"],
    statusAt?: string,
  ): Promise<InterviewSession> {
    const at = statusAt ? new Date(statusAt) : new Date();
    const session = await this.prisma.interviewSession.update({
      where: { sessionId: BigInt(sessionId) },
      data: {
        status: status as PrismaInterviewStatus,
        ...(status === "IN_PROGRESS" ? { startedAt: at } : {}),
        ...(status === "COMPLETED" ? { completedAt: at } : {}),
      },
      include: { application: true },
    });
    return this.toInterviewSession(session);
  }

  async hasApplication(candidateId: number, postingId: number): Promise<boolean> {
    const count = await this.prisma.application.count({
      where: { candidateId: BigInt(candidateId), postingId: BigInt(postingId) },
    });
    return count > 0;
  }

  async createApplication(input: {
    postingId: number;
    candidateId: number;
    candidateName?: string;
    email?: string;
    phone?: string;
    githubUrl?: string;
    blogUrl?: string;
    resumeFileId: number;
    portfolioFileId?: number;
    portfolioUrl?: string;
    motivation?: string;
    additionalInfo?: string;
    profileSnapshot?: CandidateProfileSnapshotV1;
    consentTypes: ConsentRecord["consentType"][];
    // 있으면 지원서 생성과 같은 트랜잭션에서 회원 연락처를 저장한다(다음 지원 자동 입력용). (#272 P2)
    contactUserId?: number;
  }): Promise<ApplicationSubmissionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const application = await tx.application.create({
        data: {
          postingId: BigInt(input.postingId),
          candidateId: BigInt(input.candidateId),
          applicantName: input.candidateName,
          applicantEmail: input.email,
          applicantPhone: input.phone,
          githubUrl: input.githubUrl,
          blogUrl: input.blogUrl,
          portfolioUrl: input.portfolioUrl,
          motivation: input.motivation,
          additionalInfo: input.additionalInfo,
          ...(input.profileSnapshot
            ? { profileSnapshot: input.profileSnapshot as unknown as Prisma.InputJsonValue }
            : {}),
          applicationStatus: PrismaApplicationStatus.SUBMITTED,
          documentStatus: PrismaDocumentStatus.SUBMITTED,
          interviewStatus: PrismaInterviewStatus.NOT_READY,
          reportStatus: PrismaReportStatus.PENDING,
          screeningDecision: "UNDECIDED",
          submittedAt: now,
        },
      });

      const documentInputs: Prisma.ApplicationDocumentCreateManyInput[] = [
        {
          applicationId: application.applicationId,
          fileId: BigInt(input.resumeFileId),
          documentType: PrismaDocumentType.RESUME,
          parseStatus: PrismaDocumentStatus.SUBMITTED,
          uploadedAt: now,
        },
      ];
      if (input.portfolioFileId) {
        documentInputs.push({
          applicationId: application.applicationId,
          fileId: BigInt(input.portfolioFileId),
          documentType: PrismaDocumentType.PORTFOLIO,
          parseStatus: PrismaDocumentStatus.SUBMITTED,
          uploadedAt: now,
        });
      }
      await tx.applicationDocument.createMany({ data: documentInputs });

      await tx.consentRecord.createMany({
        data: input.consentTypes.map((consentType) => ({
          applicationId: application.applicationId,
          consentType: consentType as PrismaConsentType,
          agreed: true,
          agreedAt: now,
        })),
      });

      await tx.interviewSession.create({
        data: {
          applicationId: application.applicationId,
          candidateId: BigInt(input.candidateId),
          interviewType: PrismaInterviewType.RECRUITING,
          status: PrismaInterviewStatus.NOT_READY,
          showQuestionText: true,
        },
      });

      // 공고별 입력값은 지원서 스냅샷에만 저장한다. 회원 프로필(정본)은 갱신하지 않는다.
      // (프로필은 마이페이지에서만 수정, 연락처만 재사용 목적으로 저장. #272 P1)
      let portfolioLink: PortfolioLink | undefined;
      if (input.portfolioUrl) {
        const linkType = input.portfolioUrl.includes("github.com") ? "GITHUB" : "PORTFOLIO";
        portfolioLink = {
          portfolioLinkId: Number(application.applicationId),
          candidateId: input.candidateId,
          applicationId: Number(application.applicationId),
          linkType,
          url: input.portfolioUrl,
          description: "Application portfolio link",
          fileId: input.portfolioFileId,
          createdAt: now.toISOString(),
        };
      }

      const documents = await tx.applicationDocument.findMany({
        where: { applicationId: application.applicationId },
        orderBy: { documentId: "asc" },
      });
      const consents = await tx.consentRecord.findMany({
        where: { applicationId: application.applicationId },
        orderBy: { consentId: "asc" },
      });

      if (input.contactUserId && input.phone) {
        await tx.user.update({ where: { userId: BigInt(input.contactUserId) }, data: { phone: input.phone } });
      }

      return {
        application: this.toApplication(application),
        documents: documents.map((document) => this.toApplicationDocument(document)),
        consents: consents.map((consent) => this.toConsentRecord(consent)),
        portfolioLink,
      };
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new CandidateDomainError("APPLICATION_ALREADY_SUBMITTED", "이미 지원한 채용공고입니다.", 409);
      }
      throw error;
    }
  }

  async resetDemoApplications(input: {
    candidateId: number;
    ownerUserId: number;
    applicationId?: number;
  }): Promise<CandidateDemoApplicationResetRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = 332_000_000_000n + BigInt(input.candidateId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      const applications = await tx.application.findMany({
        where: {
          candidateId: BigInt(input.candidateId),
          ...(input.applicationId === undefined ? {} : { applicationId: BigInt(input.applicationId) }),
        },
        select: { applicationId: true },
        orderBy: { applicationId: "asc" },
      });
      const applicationIds = applications.map((application) => application.applicationId);
      if (applicationIds.length === 0) {
        return { applicationIds: [], mediaStorageKeys: [] };
      }

      const documents = await tx.applicationDocument.findMany({
        where: { applicationId: { in: applicationIds } },
        select: { documentId: true, fileId: true },
      });
      const documentIds = documents.map((document) => document.documentId);
      const documentFileIds = new Set(
        documents.flatMap((document) => (document.fileId === null ? [] : [document.fileId.toString()])),
      );

      const sessions = await tx.interviewSession.findMany({
        where: { applicationId: { in: applicationIds } },
        select: { sessionId: true },
      });
      const sessionIds = sessions.map((session) => session.sessionId);

      const answers = await tx.interviewAnswer.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { answerId: true, videoFileId: true, audioFileId: true },
      });
      const answerIds = answers.map((answer) => answer.answerId);
      const mediaFileIds = [
        ...new Map(
          answers
            .flatMap((answer) => [answer.videoFileId, answer.audioFileId])
            .filter((fileId): fileId is bigint => fileId !== null)
            .filter((fileId) => !documentFileIds.has(fileId.toString()))
            .map((fileId) => [fileId.toString(), fileId]),
        ).values(),
      ];

      const reports = await tx.evaluationReport.findMany({
        where: {
          OR: [{ applicationId: { in: applicationIds } }, { sessionId: { in: sessionIds } }],
        },
        select: { reportId: true },
      });
      const reportIds = reports.map((report) => report.reportId);
      const scores = await tx.reportScore.findMany({
        where: { reportId: { in: reportIds } },
        select: { scoreId: true },
      });
      const scoreIds = scores.map((score) => score.scoreId);

      const processLogs = await tx.aiProcessLog.findMany({
        where: {
          OR: [{ applicationId: { in: applicationIds } }, { sessionId: { in: sessionIds } }],
        },
        select: { processLogId: true },
      });
      const processLogIds = processLogs.map((processLog) => processLog.processLogId);

      await tx.embedding.deleteMany({
        where: {
          OR: [
            { documentId: { in: documentIds } },
            { answerId: { in: answerIds } },
            { reportId: { in: reportIds } },
          ],
        },
      });
      await tx.reportEvidence.deleteMany({
        where: {
          OR: [
            { scoreId: { in: scoreIds } },
            { answerId: { in: answerIds } },
            { documentId: { in: documentIds } },
          ],
        },
      });
      await tx.manualEvaluation.deleteMany({ where: { reportId: { in: reportIds } } });
      await tx.reportScore.deleteMany({ where: { reportId: { in: reportIds } } });
      await tx.evaluationReport.deleteMany({ where: { reportId: { in: reportIds } } });

      await tx.followUpQuestion.deleteMany({ where: { answerId: { in: answerIds } } });
      await tx.interviewAnswer.deleteMany({ where: { answerId: { in: answerIds } } });

      await tx.clientPerformanceLog.deleteMany({
        where: {
          OR: [
            { applicationId: { in: applicationIds } },
            { sessionId: { in: sessionIds } },
            { processLogId: { in: processLogIds } },
          ],
        },
      });
      await tx.aiProcessTimingEvent.deleteMany({ where: { processLogId: { in: processLogIds } } });
      await tx.aiGuardrailLog.deleteMany({ where: { processLogId: { in: processLogIds } } });
      await tx.applicationInterviewQuestionBatch.deleteMany({
        where: { applicationId: { in: applicationIds } },
      });
      await tx.interviewQuestionSet.updateMany({
        where: { createdByProcessLogId: { in: processLogIds } },
        data: { createdByProcessLogId: null },
      });
      await tx.aiProcessLog.deleteMany({ where: { processLogId: { in: processLogIds } } });

      await tx.notification.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await tx.consentRecord.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await tx.applicationDocument.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await tx.candidateMockInterviewPassLedger.updateMany({
        where: { usedSessionId: { in: sessionIds } },
        data: { usedSessionId: null },
      });
      await tx.interviewSession.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.application.deleteMany({ where: { applicationId: { in: applicationIds } } });

      const deletableMedia = await tx.fileAsset.findMany({
        where: {
          fileId: { in: mediaFileIds },
          ownerUserId: BigInt(input.ownerUserId),
          companyLogos: { none: {} },
          candidateProfiles: { none: {} },
          candidateFolders: { none: {} },
          candidateFolderPortfolios: { none: {} },
          documents: { none: {} },
          videoAnswers: { none: {} },
          audioAnswers: { none: {} },
        },
        select: { fileId: true, storageKey: true },
      });
      await tx.fileAsset.deleteMany({
        where: { fileId: { in: deletableMedia.map((media) => media.fileId) } },
      });

      return {
        applicationIds: applicationIds.map(Number),
        mediaStorageKeys: deletableMedia.map((media) => media.storageKey),
      };
    }, { maxWait: 5_000, timeout: 30_000 });
  }

  async createFileAsset(input: Omit<FileAsset, "fileId" | "createdAt" | "status">): Promise<FileAsset> {
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
    return this.toFileAsset(fileAsset);
  }

  async createPortfolioLink(input: Omit<PortfolioLink, "portfolioLinkId" | "createdAt">): Promise<PortfolioLink> {
    const portfolioField = input.linkType === "GITHUB" ? "githubUrl" : "portfolioUrl";
    await this.prisma.candidateProfile.update({
      where: { candidateId: BigInt(input.candidateId) },
      data: { [portfolioField]: input.url },
    });
    return {
      ...input,
      portfolioLinkId: input.fileId ?? input.candidateId,
      createdAt: new Date().toISOString(),
    };
  }

  countFolders(candidateId: number): Promise<number> {
    return this.prisma.candidateFolder.count({
      where: { candidateId: BigInt(candidateId) },
    });
  }

  async listFolders(candidateId: number): Promise<CandidateFolder[]> {
    const folders = await this.prisma.candidateFolder.findMany({
      where: { candidateId: BigInt(candidateId) },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    return folders.map((folder) => this.toCandidateFolder(folder));
  }

  async findFolder(folderId: number): Promise<CandidateFolder | undefined> {
    const folder = await this.prisma.candidateFolder.findUnique({
      where: { id: BigInt(folderId) },
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    return folder ? this.toCandidateFolder(folder) : undefined;
  }

  async createFolder(
    input: Omit<CandidateFolder, "id" | "resumeFileName" | "portfolioFileName" | "profileSnapshot" | "createdAt" | "updatedAt"> & { profileSnapshot?: CandidateProfileSnapshotV1 | null },
  ): Promise<CandidateFolder> {
    const folder = await this.prisma.candidateFolder.create({
      data: {
        candidateId: BigInt(input.candidateId),
        name: input.name,
        githubUrl: input.githubUrl,
        blogUrl: input.blogUrl,
        portfolioUrl: input.portfolioUrl,
        resumeFileId: input.resumeFileId ? BigInt(input.resumeFileId) : null,
        portfolioFileId: input.portfolioFileId ? BigInt(input.portfolioFileId) : null,
        motivation: input.motivation,
        extraNote: input.extraNote,
        ...(input.profileSnapshot
          ? { profileSnapshot: input.profileSnapshot as unknown as Prisma.InputJsonValue }
          : {}),
      },
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    return this.toCandidateFolder(folder);
  }

  async updateFolder(
    folderId: number,
    input: Partial<Omit<CandidateFolder, "id" | "candidateId" | "resumeFileName" | "portfolioFileName" | "createdAt" | "updatedAt">>,
  ): Promise<CandidateFolder> {
    const folder = await this.prisma.candidateFolder.update({
      where: { id: BigInt(folderId) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
        ...(input.blogUrl !== undefined ? { blogUrl: input.blogUrl } : {}),
        ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
        ...(input.resumeFileId !== undefined ? { resumeFileId: input.resumeFileId ? BigInt(input.resumeFileId) : null } : {}),
        ...(input.portfolioFileId !== undefined ? { portfolioFileId: input.portfolioFileId ? BigInt(input.portfolioFileId) : null } : {}),
        ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
        ...(input.extraNote !== undefined ? { extraNote: input.extraNote } : {}),
        ...(input.profileSnapshot !== undefined
          ? { profileSnapshot: input.profileSnapshot as unknown as Prisma.InputJsonValue }
          : {}),
      },
      include: { resumeFile: { select: { originalName: true } }, portfolioFile: { select: { originalName: true } } },
    });
    return this.toCandidateFolder(folder);
  }

  async deleteFolder(folderId: number): Promise<void> {
    await this.prisma.candidateFolder.delete({ where: { id: BigInt(folderId) } });
  }

  private async findCandidatePostingRows(
    filter: { postingId?: number; visibleOnly?: boolean } = {},
  ): Promise<CandidatePostingRow[]> {
    const shape = await this.getCandidatePostingSchemaShape();
    const logoJoin = shape.companyColumns.has("logo_file_id")
      ? 'LEFT JOIN "file_assets" fa ON fa."file_id" = c."logo_file_id"'
      : "";
    const logoSelect = shape.companyColumns.has("logo_file_id")
      ? 'fa."storage_key" AS "companyLogoStorageKey"'
      : 'NULL::text AS "companyLogoStorageKey"';
    const params: unknown[] = [];
    const whereParts: string[] = [];
    if (filter.visibleOnly ?? true) {
      whereParts.push('p."status" IN (\'OPEN\', \'CLOSING_SOON\')');
    }
    if (filter.postingId) {
      params.push(BigInt(filter.postingId));
      whereParts.push(`p."posting_id" = $${params.length}`);
    }
    const where = whereParts.length > 0 ? whereParts.join(" AND ") : "TRUE";

    return this.prisma.$queryRawUnsafe<CandidatePostingRow[]>(
      `
      SELECT
        p."posting_id" AS "postingId",
        p."company_id" AS "companyId",
        p."title" AS "title",
        p."job_role" AS "jobRole",
        p."job_description" AS "jobDescription",
        ${this.selectPostingColumn(shape.postingColumns, "work_location", "workLocation")},
        ${this.selectPostingColumn(shape.postingColumns, "employment_type", "employmentType")},
        ${this.selectPostingColumn(shape.postingColumns, "job_role_code", "jobRoleCode")},
        ${this.selectPostingColumn(shape.postingColumns, "region_code", "regionCode")},
        ${this.selectPostingColumn(shape.postingColumns, "career_min_years", "careerMinYears", "integer")},
        ${this.selectPostingColumn(shape.postingColumns, "career_max_years", "careerMaxYears", "integer")},
        ${this.selectPostingColumn(shape.postingColumns, "employment_type_code", "employmentTypeCode")},
        ${this.selectPostingColumn(shape.postingColumns, "recruitment_type", "recruitmentType")},
        ${this.selectPostingColumn(shape.postingColumns, "workplace_address", "workplaceAddress")},
        ${this.selectPostingColumn(shape.postingColumns, "workplace_lat", "workplaceLat", "double precision")},
        ${this.selectPostingColumn(shape.postingColumns, "workplace_lng", "workplaceLng", "double precision")},
        p."starts_on" AS "startsOn",
        p."ends_on" AS "endsOn",
        p."status"::text AS "postingStatus",
        p."created_at" AS "createdAt",
        c."name" AS "companyName",
        c."industry" AS "companyIndustry",
        c."profile" AS "companyProfile",
        ${logoSelect}
      FROM "postings" p
      INNER JOIN "companies" c ON c."company_id" = p."company_id"
      ${logoJoin}
      WHERE ${where}
      ORDER BY p."created_at" DESC
      `,
      ...params,
    );
  }

  private async getCandidatePostingSchemaShape(): Promise<CandidatePostingSchemaShape> {
    this.candidatePostingSchemaShape ??= this.prisma
      .$queryRawUnsafe<Array<{ tableName: string; columnName: string }>>(
        `
        SELECT table_name AS "tableName", column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('postings', 'companies')
        `,
      )
      .then((rows) => ({
        postingColumns: new Set(
          rows.filter((row) => row.tableName === "postings").map((row) => row.columnName),
        ),
        companyColumns: new Set(
          rows.filter((row) => row.tableName === "companies").map((row) => row.columnName),
        ),
      }));

    return this.candidatePostingSchemaShape;
  }

  private selectPostingColumn(
    columns: Set<string>,
    columnName: string,
    alias: keyof CandidatePostingRow,
    fallbackType = "text",
  ): string {
    return columns.has(columnName)
      ? `p."${columnName}" AS "${alias}"`
      : `NULL::${fallbackType} AS "${alias}"`;
  }

  private toCandidateJob(posting: CandidatePostingRow): CandidateJob {
    const startsOn = posting.startsOn ?? posting.createdAt;
    const endsOn = posting.endsOn ?? new Date(startsOn.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      jobId: Number(posting.postingId),
      companyId: Number(posting.companyId),
      isPublic: posting.postingStatus !== "DRAFT" && posting.postingStatus !== "ARCHIVED",
      companyName: posting.companyName,
      companyLogoUrl: posting.companyLogoStorageKey ? buildPublicFileUrl(posting.companyLogoStorageKey) : null,
      companyIndustry: posting.companyIndustry ?? "미입력",
      companyProfile: posting.companyProfile ?? "",
      title: posting.title,
      jobGroup: posting.jobRole,
      jobRole: posting.jobRole,
      jobDescription: posting.jobDescription ?? "",
      location: posting.regionCode ?? posting.workLocation ?? "협의",
      careerLevel: formatCareerLevel(posting.careerMinYears, posting.careerMaxYears),
      employmentType: posting.employmentTypeCode ?? posting.employmentType ?? "정규직",
      techStacks: parseStructuredTags(posting.jobDescription),
      postingStatus: posting.postingStatus as CandidateJob["postingStatus"],
      jobRoleCode: posting.jobRoleCode,
      regionCode: posting.regionCode,
      careerMinYears: posting.careerMinYears,
      careerMaxYears: posting.careerMaxYears,
      employmentTypeCode: posting.employmentTypeCode,
      recruitmentType: posting.recruitmentType,
      workplaceAddress: posting.workplaceAddress,
      workplaceLat: posting.workplaceLat,
      workplaceLng: posting.workplaceLng,
      startsOn: this.toDateOnly(startsOn),
      endsOn: this.toDateOnly(endsOn),
      createdAt: posting.createdAt.toISOString(),
    };
  }

  private toApplication(application: ApplicationRecord): Application {
    const submittedAt = application.submittedAt ?? application.updatedAt;
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
      profileSnapshot: this.toProfileSnapshot(application.profileSnapshot),
      applicationStatus: application.applicationStatus,
      documentStatus: application.documentStatus,
      interviewStatus: application.interviewStatus,
      reportStatus: application.reportStatus,
      submittedAt: submittedAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  private toApplicationDocument(document: ApplicationDocumentRecord): ApplicationDocument {
    return {
      documentId: Number(document.documentId),
      applicationId: Number(document.applicationId),
      fileId: Number(document.fileId ?? 0),
      documentType: document.documentType,
      parseStatus: document.parseStatus,
      extractedText: document.extractedText,
      uploadedAt: document.uploadedAt.toISOString(),
    };
  }

  private toConsentRecord(consent: ConsentRecordModel): ConsentRecord {
    return {
      consentId: Number(consent.consentId),
      applicationId: Number(consent.applicationId),
      consentType: consent.consentType,
      agreed: true,
      agreedAt: (consent.agreedAt ?? new Date()).toISOString(),
    };
  }

  private toFileAsset(fileAsset: FileAssetRecord): FileAsset {
    return {
      fileId: Number(fileAsset.fileId),
      ownerUserId: Number(fileAsset.ownerUserId),
      storageKey: fileAsset.storageKey,
      originalName: fileAsset.originalName,
      mimeType: fileAsset.mimeType,
      sizeBytes: Number(fileAsset.sizeBytes),
      status: "ACTIVE",
      createdAt: fileAsset.createdAt.toISOString(),
    };
  }

  private toCandidateFolder(folder: CandidateFolderRecord): CandidateFolder {
    return {
      id: Number(folder.id),
      candidateId: Number(folder.candidateId),
      name: folder.name,
      githubUrl: folder.githubUrl,
      blogUrl: folder.blogUrl,
      portfolioUrl: folder.portfolioUrl,
      resumeFileId: folder.resumeFileId ? Number(folder.resumeFileId) : null,
      resumeFileName: folder.resumeFile?.originalName ?? null,
      portfolioFileId: folder.portfolioFileId ? Number(folder.portfolioFileId) : null,
      portfolioFileName: folder.portfolioFile?.originalName ?? null,
      motivation: folder.motivation,
      extraNote: folder.extraNote,
      profileSnapshot: this.toProfileSnapshot(folder.profileSnapshot),
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    };
  }

  private toProfileSnapshot(value: Prisma.JsonValue | null): CandidateProfileSnapshotV1 | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as unknown as CandidateProfileSnapshotV1;
  }

  private toInterviewSession(session: InterviewSessionRecord): InterviewSession {
    const started = session.startedAt ?? session.application?.submittedAt ?? new Date();
    const windowStartsAt = started.toISOString();
    const windowEndsAt = new Date(started.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const devicePassed = session.status !== PrismaInterviewStatus.NOT_READY;
    return {
      sessionId: Number(session.sessionId),
      applicationId: Number(session.applicationId ?? 0),
      candidateId: Number(session.candidateId),
      interviewType: session.interviewType,
      status: session.status,
      showQuestionText: session.showQuestionText,
      windowStartsAt,
      windowEndsAt,
      deviceCheck: {
        cameraGranted: devicePassed,
        microphoneGranted: devicePassed,
        networkStable: devicePassed,
        status: devicePassed ? "PASSED" : "PENDING",
        checkedAt: devicePassed ? (session.startedAt ?? new Date()).toISOString() : undefined,
      },
      startedAt: session.startedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      updatedAt: (session.completedAt ?? session.startedAt ?? session.application?.updatedAt ?? new Date()).toISOString(),
    };
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function hashInterviewSnapshot(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function buildPublicFileUrl(storageKey: string) {
  const baseUrl = process.env.S3_PUBLIC_BASE_URL ?? buildDefaultS3PublicBaseUrl();
  return `${baseUrl.replace(/\/+$/, "")}/${encodeStorageKeyPath(storageKey)}`;
}

function buildDefaultS3PublicBaseUrl() {
  const bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "";
  const region = process.env.AWS_REGION ?? "ap-northeast-2";
  if (process.env.AWS_ENDPOINT_URL && bucket) {
    return `${process.env.AWS_ENDPOINT_URL.replace(/\/+$/, "")}/${bucket}`;
  }
  return bucket ? `https://${bucket}.s3.${region}.amazonaws.com` : "";
}

function encodeStorageKeyPath(storageKey: string) {
  return storageKey.split("/").map(encodeURIComponent).join("/");
}

// 경력 range(년)를 지원자 표시용 한글 라벨로 변환한다.
function formatCareerLevel(minYears: number | null, maxYears: number | null): string {
  if (minYears == null && maxYears == null) return "경력무관";
  const min = minYears ?? 0;
  const max = maxYears ?? 10;
  if (min <= 0 && max >= 10) return "경력무관";
  if (min <= 0 && max === 0) return "신입";
  const maxText = max >= 10 ? "10년 이상" : `${max}년`;
  if (min <= 0) return `신입~${maxText}`;
  if (min === max) return `${min}년`;
  return `${min}~${maxText}`;
}

// 공고 JD(구조화 HTML)에 저장된 태그를 추출한다. 프론트 composeStructuredJobDescription 인코딩과 대응.
function parseStructuredTags(jobDescription: string | null): string[] {
  if (!jobDescription) return [];
  const matches = jobDescription.matchAll(/data-init-structured-tag="([^"]*)"/gi);
  const tags: string[] = [];
  for (const match of matches) {
    const value = decodeHtmlAttribute(match[1]).trim();
    if (value && !tags.includes(value)) tags.push(value);
  }
  return tags;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseDbMonth(value: string): Date {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function parseDbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDbMonth(value: Date): string {
  return value.toISOString().slice(0, 7);
}

function formatDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
