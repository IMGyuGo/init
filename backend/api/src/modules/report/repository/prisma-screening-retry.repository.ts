import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared/prisma.service";
import {
  ScreeningRetryConflictError,
  ScreeningRetryNotFoundError,
  ScreeningRetryPreparation,
  ScreeningRetryProcess,
  ScreeningRetryRepository,
} from "./screening-retry.repository";

const REPORT_RETRY_REASONS = new Set([
  "RETRY_REPORT_FAILED",
  "RETRY_EVALUATION_INCOMPLETE",
  "RETRY_SCORE_MISSING",
]);

type ProcessRecord = {
  processLogId: bigint;
  processType: string;
  status: string;
  inputRef: string | null;
  applicationId: bigint | null;
  sessionId: bigint | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
};

@Injectable()
export class PrismaScreeningRetryRepository implements ScreeningRetryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(applicationId: number): Promise<ScreeningRetryPreparation> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT "application_id" FROM "applications" WHERE "application_id" = $1 FOR UPDATE',
          BigInt(applicationId),
        );
        const application = await tx.application.findUnique({
          where: { applicationId: BigInt(applicationId) },
          select: { screeningDecision: true, screeningDecisionReasonCode: true },
        });
        if (!application) {
          throw new ScreeningRetryNotFoundError(`Application ${applicationId} was not found.`);
        }
        if (application.screeningDecision !== "RETRY") {
          throw new ScreeningRetryConflictError("Application is not in RETRY state.");
        }
        if (application.screeningDecisionReasonCode === "RETRY_STT_UNAVAILABLE") {
          return { action: "CANDIDATE_REANSWER_REQUIRED" };
        }
        if (!application.screeningDecisionReasonCode || !REPORT_RETRY_REASONS.has(application.screeningDecisionReasonCode)) {
          throw new ScreeningRetryConflictError("Application RETRY reason does not allow report regeneration.");
        }

        const active = await tx.aiProcessLog.findFirst({
          where: {
            applicationId: BigInt(applicationId),
            processType: "REPORT_GENERATE",
            OR: activeReportStatuses(),
          },
          orderBy: [{ createdAt: "desc" }, { processLogId: "desc" }],
        });
        if (active) {
          return { action: "REPORT_RETRY", created: false, process: this.toProcess(active) };
        }

        const source = await tx.aiProcessLog.findFirst({
          where: { applicationId: BigInt(applicationId), processType: "REPORT_GENERATE" },
          orderBy: [{ createdAt: "desc" }, { processLogId: "desc" }],
        });
        if (!source?.inputRef) {
          throw new ScreeningRetryNotFoundError("No report process is available for explicit retry.");
        }
        const reportId = findPositiveInteger(parseInputRef(source.inputRef), "reportId");
        if (!reportId) {
          throw new ScreeningRetryNotFoundError("The source report process has no reportId reference.");
        }

        const processLogId = this.nextId();
        const created = await tx.aiProcessLog.create({
          data: {
            processLogId,
            applicationId: BigInt(applicationId),
            sessionId: source.sessionId,
            processType: "REPORT_GENERATE",
            status: "PENDING",
            inputRef: source.inputRef,
            attemptCount: 1,
            maxAttempts: 3,
            nextRetryAt: null,
            retrySource: "OPERATOR",
            retryOfProcessLogId: source.processLogId,
            createdAt: new Date(),
          },
        });
        await tx.evaluationReport.updateMany({
          where: { reportId: BigInt(reportId), applicationId: BigInt(applicationId) },
          data: { status: "GENERATING", failureCategory: null, failureReason: null },
        });
        await tx.application.update({
          where: { applicationId: BigInt(applicationId) },
          data: { reportStatus: "GENERATING" },
        });
        return { action: "REPORT_RETRY", created: true, process: this.toProcess(created) };
      });
    } catch (error) {
      if (isUniqueConstraintFailure(error)) {
        const active = await this.prisma.aiProcessLog.findFirst({
          where: {
            applicationId: BigInt(applicationId),
            processType: "REPORT_GENERATE",
            OR: activeReportStatuses(),
          },
          orderBy: [{ createdAt: "desc" }, { processLogId: "desc" }],
        });
        if (active) {
          return { action: "REPORT_RETRY", created: false, process: this.toProcess(active) };
        }
      }
      throw error;
    }
  }

  async markPublishFailed(processLogId: number, reason: string): Promise<void> {
    const process = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId: BigInt(processLogId) },
    });
    if (!process) return;
    const reportId = process.inputRef ? findPositiveInteger(parseInputRef(process.inputRef), "reportId") : undefined;
    const completedAt = new Date();
    await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(processLogId) },
      data: {
        status: "FAILED",
        failureCategory: "NON_RETRYABLE",
        failureReason: reason,
        completedAt,
        nextRetryAt: null,
      },
    });
    if (reportId) {
      await this.prisma.evaluationReport.updateMany({
        where: { reportId: BigInt(reportId) },
        data: { status: "FAILED", failureCategory: "NON_RETRYABLE", failureReason: reason },
      });
    }
    if (process.applicationId) {
      await this.prisma.application.updateMany({
        where: { applicationId: process.applicationId },
        data: { reportStatus: "FAILED" },
      });
    }
  }

  private toProcess(process: ProcessRecord): ScreeningRetryProcess {
    return {
      processLogId: Number(process.processLogId),
      processType: process.processType as ScreeningRetryProcess["processType"],
      status: process.status as ScreeningRetryProcess["status"],
      inputRef: process.inputRef ?? "",
      attempt: process.attemptCount,
      maxAttempts: process.maxAttempts,
      nextRetryAt: process.nextRetryAt?.toISOString(),
    };
  }

  private nextId(): bigint {
    return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
  }
}

function findPositiveInteger(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const candidate = Number(record[key]);
    if (Number.isInteger(candidate) && candidate > 0) return candidate;
    for (const nested of Object.values(record)) {
      const found = findPositiveInteger(nested, key);
      if (found) return found;
    }
  }
  return undefined;
}

function parseInputRef(inputRef: string): unknown {
  try {
    return JSON.parse(inputRef);
  } catch {
    return undefined;
  }
}

function isUniqueConstraintFailure(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function activeReportStatuses(): Prisma.AiProcessLogWhereInput[] {
  return [
    { status: { in: ["PENDING", "RUNNING"] } },
    {
      status: "FAILED",
      failureCategory: { in: ["RETRYABLE", "STT_RETRYABLE"] },
      attemptCount: { lt: 3 },
      nextRetryAt: { not: null },
    },
  ];
}
