import { PrismaClient, type Prisma } from "@prisma/client";

import {
  SYNTHETIC_MANIFEST_V2,
  SYNTHETIC_MANIFEST_V3,
  assertSyntheticManifestVersion,
  type SyntheticApplicantPlanRecord,
  type SyntheticImporterOptions,
  type SyntheticManifestVersion,
} from "./synthetic-applicant-importer.contract";
import type {
  SyntheticApplicantStore,
  SyntheticDatasetManifest,
  SyntheticManifestRecord,
} from "./synthetic-applicant-importer.service";

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

export function syntheticApplicationUpdatedAt(
  manifestVersion: SyntheticManifestVersion,
  ordinal: number,
  datasetCreatedAt: Date,
) {
  return manifestVersion === SYNTHETIC_MANIFEST_V2 || manifestVersion === SYNTHETIC_MANIFEST_V3
    ? new Date(datasetCreatedAt.getTime() - ordinal * 60_000)
    : undefined;
}

export function buildSyntheticReportWrite(record: SyntheticApplicantPlanRecord) {
  const completed = record.reportStatus === "COMPLETED";
  const fixture = record.reportFixture;
  if (completed && !fixture) throw new Error(`완료 리포트 fixture가 없습니다: ordinal=${record.ordinal}`);
  return {
    report: {
      status: record.reportStatus,
      totalScore: completed ? fixture!.totalScore : null,
      summary: completed ? `${record.name}의 데모 평가 리포트입니다.` : null,
      generatedAtRequired: completed,
      failureCategory: completed ? null : "NON_RETRYABLE",
      failureReason: completed ? null : "합성 실패 상태 fixture",
    },
    scores: completed
      ? fixture!.profiles.map((profile) => ({
          ncsProfileId: profile.id,
          score: profile.score,
          averageScore: profile.score / 20,
          normalizedScore: profile.score,
          weight: profile.weight,
          weightedScore: profile.score * profile.weight / 100,
          minimumAverageScore: 3,
          assignedQuestionCount: 1,
          validQuestionCount: 1,
        }))
      : [],
  };
}

export class PrismaSyntheticApplicantStore implements SyntheticApplicantStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findTargetPosting(postingId: bigint) {
    return this.prisma.posting.findUnique({
      where: { postingId },
      select: { postingId: true, companyId: true, title: true, status: true },
    });
  }

  async findDataset(datasetId: string): Promise<SyntheticDatasetManifest | null> {
    return this.prisma.syntheticApplicantDataset.findUnique({ where: { datasetId } });
  }

  async createDataset(
    options: SyntheticImporterOptions,
    optionsHash: string,
    manifestVersion: SyntheticManifestVersion,
  ): Promise<SyntheticDatasetManifest> {
    return this.prisma.syntheticApplicantDataset.create({
      data: {
        datasetId: options.datasetId,
        environment: options.environment,
        postingId: options.postingId,
        companyId: options.companyId,
        activeCount: options.activeCount,
        canceledCount: options.canceledCount,
        interactiveCount: options.interactiveCount,
        pipelineSelectionCount: options.pipelineSelectionCount,
        batchSize: options.batchSize,
        optionsHash,
        manifestVersion,
        status: "APPLYING",
      },
    });
  }

  async updateDataset(
    datasetId: string,
    data: { status: string; lastError?: string | null; appliedAt?: Date | null; cleanedAt?: Date | null },
  ) {
    await this.prisma.syntheticApplicantDataset.update({ where: { datasetId }, data });
  }

  async listRecords(datasetId: string): Promise<SyntheticManifestRecord[]> {
    return this.prisma.syntheticApplicantRecord.findMany({
      where: { datasetId },
      orderBy: { ordinal: "asc" },
      select: {
        ordinal: true,
        userId: true,
        candidateId: true,
        applicationId: true,
        isInteractive: true,
        isCanceled: true,
        lifecycleStage: true,
        dataDepth: true,
        pipelineSelected: true,
        cleanedAt: true,
      },
    });
  }

  async createBatch(datasetId: string, records: SyntheticApplicantPlanRecord[], passwordHash: string) {
    await this.prisma.$transaction(async (tx) => {
      const dataset = await tx.syntheticApplicantDataset.findUnique({
        where: { datasetId },
        select: { postingId: true, manifestVersion: true, createdAt: true },
      });
      if (!dataset) throw new Error(`dataset manifest가 없습니다: ${datasetId}`);
      assertSyntheticManifestVersion(dataset.manifestVersion);
      for (const record of records) {
        await this.createRecord(
          tx,
          datasetId,
          dataset.postingId,
          record,
          passwordHash,
          dataset.manifestVersion,
          dataset.createdAt,
        );
      }
    }, TRANSACTION_OPTIONS);
  }

  async cleanupBatch(datasetId: string, records: SyntheticManifestRecord[]) {
    const applicationIds = records.map((record) => record.applicationId);
    const candidateIds = records.map((record) => record.candidateId);
    const userIds = records.map((record) => record.userId);

    await this.prisma.$transaction(async (tx) => {
      const reports = await tx.evaluationReport.findMany({
        where: { applicationId: { in: applicationIds } },
        select: { reportId: true },
      });
      const reportIds = reports.map((report) => report.reportId);
      const sessions = await tx.interviewSession.findMany({
        where: { applicationId: { in: applicationIds } },
        select: { sessionId: true },
      });
      const sessionIds = sessions.map((session) => session.sessionId);

      if (reportIds.length > 0) {
        await tx.reportScore.deleteMany({ where: { reportId: { in: reportIds } } });
        await tx.evaluationReport.deleteMany({ where: { reportId: { in: reportIds } } });
      }
      if (sessionIds.length > 0) {
        await tx.interviewAnswer.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.interviewSessionQuestion.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.interviewSession.deleteMany({ where: { sessionId: { in: sessionIds } } });
      }
      await tx.applicationDocument.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await tx.consentRecord.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await tx.application.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await tx.candidateEducation.deleteMany({ where: { candidateId: { in: candidateIds } } });
      await tx.candidateCareer.deleteMany({ where: { candidateId: { in: candidateIds } } });
      await tx.candidateActivity.deleteMany({ where: { candidateId: { in: candidateIds } } });
      await tx.candidateCredential.deleteMany({ where: { candidateId: { in: candidateIds } } });
      await tx.candidateProfile.deleteMany({ where: { candidateId: { in: candidateIds } } });
      await tx.user.deleteMany({ where: { userId: { in: userIds } } });
      await tx.syntheticApplicantRecord.updateMany({
        where: { datasetId, ordinal: { in: records.map((record) => record.ordinal) }, cleanedAt: null },
        data: { cleanedAt: new Date() },
      });
    }, TRANSACTION_OPTIONS);
  }

  private async createRecord(
    tx: Prisma.TransactionClient,
    datasetId: string,
    postingId: bigint,
    record: SyntheticApplicantPlanRecord,
    passwordHash: string,
    manifestVersion: SyntheticManifestVersion,
    datasetCreatedAt: Date,
  ) {
    const now = new Date(Date.now() - record.ordinal * 60_000);
    const applicationUpdatedAt = syntheticApplicationUpdatedAt(manifestVersion, record.ordinal, datasetCreatedAt);
    const user = await tx.user.create({
      data: {
        email: record.email,
        passwordHash: record.isInteractive ? passwordHash : null,
        userType: "CANDIDATE",
        name: record.name,
        phone: record.phone,
        status: record.isInteractive ? "ACTIVE" : "PENDING",
        authProvider: "LOCAL",
        providerUserId: null,
        candidateProfile: {
          create: {
            portfolioUrl: `https://example.com/portfolio/${datasetId}/${record.ordinal}`,
            githubUrl: `https://example.com/github/${datasetId}/${record.ordinal}`,
            blogUrl: `https://example.com/blog/${datasetId}/${record.ordinal}`,
            summary: `${record.name}의 합성 지원자 프로필입니다. 실제 개인정보가 아닙니다.`,
            coverLetter: `지정 공고의 대규모 목록과 상세 흐름을 검증하기 위한 합성 자기소개서 ${record.ordinal}번입니다.`,
          },
        },
      },
      select: {
        userId: true,
        candidateProfile: { select: { candidateId: true } },
      },
    });
    const candidateId = user.candidateProfile?.candidateId;
    if (!candidateId) throw new Error(`candidate profile 생성에 실패했습니다: ordinal=${record.ordinal}`);

    const application = await tx.application.create({
      data: {
        postingId,
        candidateId,
        applicantName: record.name,
        applicantEmail: record.email,
        applicantPhone: record.phone,
        githubUrl: `https://example.com/github/${datasetId}/${record.ordinal}`,
        blogUrl: `https://example.com/blog/${datasetId}/${record.ordinal}`,
        portfolioUrl: `https://example.com/portfolio/${datasetId}/${record.ordinal}`,
        motivation: `합성 지원 동기 ${record.ordinal}: 제품 문제를 구조적으로 해결하고 팀과 결과를 공유한 경험을 검증합니다.`,
        additionalInfo: "운영 시연을 위해 생성된 합성 데이터이며 외부 연락과 AI 작업을 발생시키지 않습니다.",
        profileSnapshot: profileSnapshot(record),
        applicationStatus: record.applicationStatus,
        documentStatus: record.documentStatus,
        interviewStatus: record.interviewStatus,
        reportStatus: record.reportStatus,
        screeningDecision: record.screeningDecision,
        screeningMemo: null,
        submittedAt: now,
        ...(applicationUpdatedAt ? { updatedAt: applicationUpdatedAt } : {}),
      },
      select: { applicationId: true },
    });

    if (record.dataDepth !== "LIGHTWEIGHT") {
      await this.createDetailedProfile(tx, candidateId, record, now);
      await tx.applicationDocument.create({
        data: {
          applicationId: application.applicationId,
          fileId: null,
          documentType: "RESUME",
          parseStatus: record.documentStatus,
          extractedText: record.documentStatus === "EXTRACTED"
            ? `${record.name}은 합성 프로젝트에서 API 안정화와 데이터 검증을 수행했습니다.`
            : null,
          uploadedAt: now,
        },
      });
    }

    let sessionId: bigint | null = null;
    if (record.dataDepth === "INTERVIEW" || record.dataDepth === "REPORT") {
      sessionId = await this.createInterviewFixture(tx, application.applicationId, candidateId, record, now);
    }

    if (record.lifecycleStage === "REPORT_COMPLETED" || record.reportStatus === "FAILED") {
      await this.createReportFixture(tx, application.applicationId, sessionId, record, now);
    }

    await tx.syntheticApplicantRecord.create({
      data: {
        datasetId,
        ordinal: record.ordinal,
        userId: user.userId,
        candidateId,
        applicationId: application.applicationId,
        isInteractive: record.isInteractive,
        isCanceled: record.isCanceled,
        lifecycleStage: record.lifecycleStage,
        dataDepth: record.dataDepth,
        pipelineSelected: record.pipelineSelected,
      },
    });
  }

  private async createDetailedProfile(
    tx: Prisma.TransactionClient,
    candidateId: bigint,
    record: SyntheticApplicantPlanRecord,
    now: Date,
  ) {
    await tx.candidateEducation.create({
      data: {
        candidateId,
        sortOrder: 1,
        educationLevel: "UNIVERSITY",
        schoolName: "가상대학교",
        major: "소프트웨어학과",
        degreeType: "BACHELOR",
        status: "GRADUATED",
        startMonth: new Date("2018-03-01T00:00:00.000Z"),
        endMonth: new Date("2022-02-01T00:00:00.000Z"),
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.candidateCareer.create({
      data: {
        candidateId,
        sortOrder: 1,
        companyName: "가상테크",
        startMonth: new Date("2022-03-01T00:00:00.000Z"),
        endMonth: null,
        isCurrent: true,
        jobRole: "Backend Developer",
        department: "플랫폼팀",
        position: "개발자",
        responsibilities: `합성 경력 ${record.ordinal}: API 성능과 데이터 정합성 검증`,
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.candidateActivity.create({
      data: {
        candidateId,
        sortOrder: 1,
        activityType: "PROJECT_TASK",
        organizationName: "합성 프로젝트 연구회",
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: new Date("2025-06-01T00:00:00.000Z"),
        isOngoing: false,
        description: "지원자 목록 페이지네이션과 상태 집계를 검증한 합성 프로젝트",
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.candidateCredential.create({
      data: {
        candidateId,
        sortOrder: 1,
        credentialType: "CERTIFICATE",
        name: "합성 데이터 검증 자격",
        issuer: "가상기술원",
        acquiredMonth: new Date("2025-07-01T00:00:00.000Z"),
        result: "PASS",
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  private async createInterviewFixture(
    tx: Prisma.TransactionClient,
    applicationId: bigint,
    candidateId: bigint,
    record: SyntheticApplicantPlanRecord,
    now: Date,
  ) {
    const completed = record.interviewStatus === "COMPLETED";
    const session = await tx.interviewSession.create({
      data: {
        applicationId,
        candidateId,
        interviewType: "RECRUITING",
        sessionMode: "STANDARD",
        title: `합성 채용면접 ${record.ordinal}`,
        status: record.interviewStatus,
        showQuestionText: true,
        preparationTimeSecSnapshot: 30,
        answerTimeSecSnapshot: 90,
        retryAllowedSnapshot: false,
        startedAt: record.interviewStatus === "READY" ? null : now,
        completedAt: completed ? now : null,
      },
      select: { sessionId: true },
    });
    const question = await tx.interviewSessionQuestion.create({
      data: {
        sessionId: session.sessionId,
        questionId: null,
        personalizedQuestionId: null,
        runtimeQuestionId: null,
        criterionId: null,
        criterionTitleSnapshot: "문제 해결력",
        generationSource: null,
        questionType: "EXPERIENCE",
        content: "복잡한 문제를 발견하고 원인을 나누어 해결한 경험을 설명해 주세요.",
        ncsProfileId: "PROBLEM_SOLVING",
        ncsQuestionMode: "EXPERIENCE_BEHAVIOR",
        ncsProfileVersion: "2025.12-v1",
        alignmentStatus: "ALIGNED",
        alignmentScore: 0.92,
        alignmentReason: "합성 fixture 고정 질문",
        evaluatorVersion: "synthetic-fixture-v1",
        usageScope: "STANDARD",
        sortOrder: 1,
      },
      select: { sessionQuestionId: true },
    });
    await tx.interviewAnswer.create({
      data: {
        sessionId: session.sessionId,
        questionId: null,
        sessionQuestionId: question.sessionQuestionId,
        transcript: `${record.name}은 원인을 지표와 로그로 나누고 재현 테스트를 만든 뒤 개선 결과를 공유했습니다.`,
        durationSeconds: 72,
        submittedAt: now,
      },
    });
    return session.sessionId;
  }

  private async createReportFixture(
    tx: Prisma.TransactionClient,
    applicationId: bigint,
    sessionId: bigint | null,
    record: SyntheticApplicantPlanRecord,
    now: Date,
  ) {
    const write = buildSyntheticReportWrite(record);
    const report = await tx.evaluationReport.create({
      data: {
        applicationId,
        sessionId,
        reportType: "RECRUITING_REPORT",
        status: write.report.status,
        totalScore: write.report.totalScore,
        summary: write.report.summary,
        generatedAt: write.report.generatedAtRequired ? now : null,
        failureCategory: write.report.failureCategory,
        failureReason: write.report.failureReason,
      },
      select: { reportId: true },
    });
    if (write.scores.length > 0) {
      await tx.reportScore.createMany({
        data: write.scores.map((score) => ({
          reportId: report.reportId,
          criterionId: null,
          score: score.score,
          rationale: "합성 면접 답변에서 문제 구조화와 협업 근거를 확인했습니다.",
          ncsProfileId: score.ncsProfileId,
          averageScore: score.averageScore,
          normalizedScore: score.normalizedScore,
          weight: score.weight,
          weightedScore: score.weightedScore,
          minimumAverageScore: score.minimumAverageScore,
          assignedQuestionCount: score.assignedQuestionCount,
          validQuestionCount: score.validQuestionCount,
        })),
      });
    }
  }
}

function profileSnapshot(record: SyntheticApplicantPlanRecord): Prisma.InputJsonValue {
  return {
    schemaVersion: "CandidateProfileSnapshotV1",
    summary: `${record.name}의 합성 지원 프로필`,
    coverLetter: "실제 개인정보가 아닌 대규모 시연용 자기소개입니다.",
    educations: [],
    careers: [],
    activities: [],
    credentials: [],
  };
}
