import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared/prisma.service";
import type { ReportType } from "../report.types";
import type {
  CandidateAiProcessRecord,
  CandidateFollowUpQuestionRecord,
  CandidateReportCriterionRecord,
  CandidateReportEvidenceRecord,
  CandidateReportRepository,
  CandidateReportScoreRecord,
  CandidateStoredReport,
} from "./candidate-report.repository";

const candidateReportInclude = {
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
} satisfies Prisma.EvaluationReportInclude;

@Injectable()
export class PrismaCandidateReportRepository implements CandidateReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMockReportStatus(): undefined {
    return undefined;
  }

  async saveMockReportStatus(): Promise<void> {
    return;
  }

  async listEvaluationCriteriaByPosting(postingId: number): Promise<CandidateReportCriterionRecord[]> {
    const criteria = await this.prisma.evaluationCriterion.findMany({
      where: { postingId: BigInt(postingId) },
      include: { tag: true },
      orderBy: [{ sortOrder: "asc" }, { criterionId: "asc" }],
    });

    return criteria.map((criterion) => ({
      criterionId: Number(criterion.criterionId),
      name: criterion.tag.name,
      description: criterion.tag.description ?? undefined,
      weight: criterion.weight,
      sortOrder: criterion.sortOrder,
    }));
  }

  async findLatestReportByApplication(
    applicationId: number,
    sessionId?: number,
  ): Promise<CandidateStoredReport | undefined> {
    const report = await this.prisma.evaluationReport.findFirst({
      where: {
        reportType: "RECRUITING_REPORT",
        OR: this.applicationReportWhere(applicationId, sessionId),
      },
      include: candidateReportInclude,
      orderBy: [{ generatedAt: "desc" }, { reportId: "desc" }],
    });

    return report ? this.toReport(report) : undefined;
  }

  async findLatestReportBySession(
    sessionId: number,
    reportType: ReportType,
  ): Promise<CandidateStoredReport | undefined> {
    const report = await this.prisma.evaluationReport.findFirst({
      where: {
        reportType,
        OR: [{ sessionId: BigInt(sessionId) }, { reportId: BigInt(sessionId) }],
      },
      include: candidateReportInclude,
      orderBy: [{ generatedAt: "desc" }, { reportId: "desc" }],
    });

    return report ? this.toReport(report) : undefined;
  }

  async listFollowUpQuestionsByAnswerIds(answerIds: number[]): Promise<CandidateFollowUpQuestionRecord[]> {
    if (answerIds.length === 0) {
      return [];
    }

    const questions = await this.prisma.followUpQuestion.findMany({
      where: {
        answerId: { in: answerIds.map((answerId) => BigInt(answerId)) },
      },
      orderBy: [{ createdAt: "asc" }, { followUpId: "asc" }],
    });

    return questions.map((question) => ({
      followUpId: Number(question.followUpId),
      answerId: Number(question.answerId),
      content: question.content,
      generationStatus: question.generationStatus,
      policy: question.policy,
      createdAt: question.createdAt.toISOString(),
    }));
  }

  async findLatestReportProcessByApplication(
    applicationId: number,
    sessionId?: number,
  ): Promise<CandidateAiProcessRecord | undefined> {
    const process = await this.prisma.aiProcessLog.findFirst({
      where: {
        processType: "REPORT_GENERATE",
        OR: this.applicationProcessWhere(applicationId, sessionId),
      },
      orderBy: { createdAt: "desc" },
    });

    return process ? this.toProcess(process) : undefined;
  }

  async findLatestReportProcessBySession(sessionId: number): Promise<CandidateAiProcessRecord | undefined> {
    const process = await this.prisma.aiProcessLog.findFirst({
      where: {
        processType: "REPORT_GENERATE",
        OR: [
          { sessionId: BigInt(sessionId) },
          ...this.jsonNumberFieldWhere("sessionId", sessionId),
          ...this.jsonNumberFieldWhere("reportId", sessionId),
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    return process ? this.toProcess(process) : undefined;
  }

  private applicationReportWhere(applicationId: number, sessionId?: number): Prisma.EvaluationReportWhereInput[] {
    return [
      { applicationId: BigInt(applicationId) },
      { reportId: BigInt(applicationId) },
      ...(sessionId ? [{ sessionId: BigInt(sessionId) }] : []),
    ];
  }

  private applicationProcessWhere(applicationId: number, sessionId?: number): Prisma.AiProcessLogWhereInput[] {
    return [
      { applicationId: BigInt(applicationId) },
      ...this.jsonNumberFieldWhere("applicationId", applicationId),
      ...this.jsonNumberFieldWhere("reportId", applicationId),
      ...(sessionId
        ? [
            { sessionId: BigInt(sessionId) },
            ...this.jsonNumberFieldWhere("sessionId", sessionId),
          ]
        : []),
    ];
  }

  private jsonNumberFieldWhere(fieldName: string, value: number): Prisma.AiProcessLogWhereInput[] {
    const prefix = `"${fieldName}":${value}`;
    return [
      { inputRef: { contains: `${prefix},` } },
      { inputRef: { contains: `${prefix}}` } },
    ];
  }

  private toReport(report: CandidateReportWithScores): CandidateStoredReport {
    return {
      reportId: Number(report.reportId),
      applicationId: report.applicationId ? Number(report.applicationId) : undefined,
      sessionId: report.sessionId ? Number(report.sessionId) : undefined,
      reportType: report.reportType,
      status: report.status,
      totalScore: report.totalScore ?? undefined,
      summary: report.summary ?? undefined,
      generatedAt: report.generatedAt?.toISOString(),
      failureCategory: report.failureCategory ?? undefined,
      failureReason: report.failureReason ?? undefined,
      scores: report.scores.flatMap((score) => {
        const candidateScore = this.toScore(score);
        return candidateScore ? [candidateScore] : [];
      }),
    };
  }

  private toScore(score: CandidateReportScoreWithIncludes): CandidateReportScoreRecord | undefined {
    // Incomplete NCS aggregates are internal state, not candidate-facing feedback scores.
    if (score.score === null) {
      return undefined;
    }

    return {
      scoreId: Number(score.scoreId),
      criterionId: score.criterionId ? Number(score.criterionId) : undefined,
      criterionName: score.criterion?.tag.name,
      score: score.score,
      rationale: score.rationale ?? undefined,
      evidences: score.evidences.map((evidence) => this.toEvidence(evidence)),
    };
  }

  private toEvidence(evidence: CandidateReportEvidenceRecordInput): CandidateReportEvidenceRecord {
    return {
      evidenceId: Number(evidence.evidenceId),
      sourceType: evidence.sourceType,
      answerId: evidence.answerId ? Number(evidence.answerId) : undefined,
      documentId: evidence.documentId ? Number(evidence.documentId) : undefined,
      documentRef: evidence.documentRef ?? undefined,
      evidenceText: evidence.evidenceText,
    };
  }

  private toProcess(process: CandidateAiProcessRecordInput): CandidateAiProcessRecord {
    return {
      processLogId: Number(process.processLogId),
      applicationId: process.applicationId ? Number(process.applicationId) : undefined,
      sessionId: process.sessionId ? Number(process.sessionId) : undefined,
      reportId: this.extractReportId(process.inputRef),
      processType: process.processType,
      status: process.status,
      failureCategory: process.failureCategory ?? undefined,
      failureReason: process.failureReason ?? undefined,
      createdAt: process.createdAt.toISOString(),
    };
  }

  private extractReportId(inputRef: string | null): number | undefined {
    if (!inputRef) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(inputRef) as { payload?: { reportId?: unknown }; reportId?: unknown };
      const reportId = parsed.payload?.reportId ?? parsed.reportId;
      return Number.isInteger(reportId) ? Number(reportId) : undefined;
    } catch {
      return undefined;
    }
  }
}

type CandidateReportWithScores = Prisma.EvaluationReportGetPayload<{ include: typeof candidateReportInclude }>;
type CandidateReportScoreWithIncludes = CandidateReportWithScores["scores"][number];
type CandidateReportEvidenceRecordInput = CandidateReportScoreWithIncludes["evidences"][number];
type CandidateAiProcessRecordInput = Prisma.AiProcessLogGetPayload<Record<string, never>>;
