import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { CurrentUser } from "../../../common/dev-auth/current-user";
import { PrismaService } from "../../../shared/prisma.service";
import { AiPerformanceQueryDto, ClientPerformanceLogRequestDto } from "../dto/ai-performance.dto";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

@Injectable()
export class AiPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async recordClientLog(body: ClientPerformanceLogRequestDto, currentUser?: CurrentUser) {
    const eventName = requiredToken(body.eventName, "eventName");
    const durationMs = nonNegativeInteger(body.durationMs, "durationMs");
    const processLogId = optionalBigInt(body.processLogId);
    const sessionId = optionalBigInt(body.sessionId);
    const applicationId = optionalBigInt(body.applicationId);
    const questionId = optionalBigInt(body.questionId);
    await this.assertClientLogRefsVisible({ processLogId, sessionId, applicationId, questionId }, currentUser);

    const created = await this.prisma.clientPerformanceLog.create({
      data: {
        eventName,
        processLogId,
        sessionId,
        applicationId,
        questionId,
        durationMs,
        startedAt: optionalDate(body.startedAt, "startedAt"),
        completedAt: optionalDate(body.completedAt, "completedAt"),
        metadataJson: body.metadata ? JSON.stringify(body.metadata) : undefined
      }
    });

    return {
      id: Number(created.clientPerformanceLogId),
      eventName: created.eventName,
      durationMs: created.durationMs,
      createdAt: created.createdAt.toISOString()
    };
  }

  async listJobs(query: AiPerformanceQueryDto) {
    const rows = await this.prisma.aiProcessLog.findMany({
      where: this.processWhere(query),
      orderBy: { createdAt: "desc" },
      take: normalizeLimit(query.limit),
      select: {
        processLogId: true,
        processType: true,
        status: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        modelName: true,
        inputTokens: true,
        outputTokens: true,
        audioSeconds: true,
        estimatedCostUsd: true,
        failureCategory: true,
        failureReason: true,
        createdAt: true
      }
    });
    return rows.map((row) => ({
      processLogId: Number(row.processLogId),
      processType: row.processType,
      status: row.status,
      startedAt: row.startedAt?.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      durationMs: row.durationMs ?? undefined,
      modelName: row.modelName ?? undefined,
      inputTokens: row.inputTokens ?? undefined,
      outputTokens: row.outputTokens ?? undefined,
      audioSeconds: row.audioSeconds ?? undefined,
      estimatedCostUsd: toNumber(row.estimatedCostUsd),
      failureCategory: row.failureCategory ?? undefined,
      failureReason: row.failureReason ?? undefined,
      createdAt: row.createdAt.toISOString()
    }));
  }

  async listClientEvents(query: AiPerformanceQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.eventName?.trim()) {
      where.eventName = query.eventName.trim();
    }
    const rows = await this.prisma.clientPerformanceLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: normalizeLimit(query.limit),
      select: {
        clientPerformanceLogId: true,
        eventName: true,
        processLogId: true,
        sessionId: true,
        applicationId: true,
        questionId: true,
        durationMs: true,
        startedAt: true,
        completedAt: true,
        createdAt: true
      }
    });
    return rows.map((row) => ({
      clientPerformanceLogId: Number(row.clientPerformanceLogId),
      eventName: row.eventName,
      processLogId: row.processLogId ? Number(row.processLogId) : undefined,
      sessionId: row.sessionId ? Number(row.sessionId) : undefined,
      applicationId: row.applicationId ? Number(row.applicationId) : undefined,
      questionId: row.questionId ? Number(row.questionId) : undefined,
      durationMs: row.durationMs,
      startedAt: row.startedAt?.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      createdAt: row.createdAt.toISOString()
    }));
  }

  async summary(query: AiPerformanceQueryDto) {
    const jobs = await this.listJobs({ ...query, limit: normalizeLimit(query.limit ?? MAX_LIMIT) });
    const clientEvents = await this.listClientEvents({ eventName: query.eventName, limit: normalizeLimit(query.limit ?? MAX_LIMIT) });
    return {
      jobs: summarizeTimedItems(jobs),
      clientEvents: summarizeTimedItems(clientEvents),
      cost: {
        estimatedCostUsd: round6(jobs.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0)),
        pricedJobCount: jobs.filter((row) => row.estimatedCostUsd !== undefined).length,
        unpricedJobCount: jobs.filter((row) => row.estimatedCostUsd === undefined).length,
        inputTokens: jobs.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
        outputTokens: jobs.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
        audioSeconds: jobs.reduce((sum, row) => sum + (row.audioSeconds ?? 0), 0)
      },
      byProcessType: groupByProcessType(jobs)
    };
  }

  private processWhere(query: AiPerformanceQueryDto): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (query.processType?.trim()) {
      where.processType = query.processType.trim();
    }
    if (query.status?.trim()) {
      where.status = query.status.trim();
    }
    return where;
  }

  private async assertClientLogRefsVisible(
    refs: ClientPerformanceRefs,
    currentUser?: CurrentUser
  ): Promise<void> {
    if (!refs.processLogId && !refs.sessionId && !refs.applicationId && !refs.questionId) {
      return;
    }
    if (!currentUser) {
      throw forbiddenClientLog();
    }
    if (currentUser.userType === "ADMIN") {
      return;
    }

    const visible = await Promise.all([
      refs.processLogId ? this.isProcessVisible(refs.processLogId, currentUser) : true,
      refs.sessionId ? this.isSessionVisible(refs.sessionId, currentUser) : true,
      refs.applicationId ? this.isApplicationVisible(refs.applicationId, currentUser) : true,
      refs.questionId ? this.isQuestionVisible(refs.questionId, refs) : true
    ]);

    if (visible.some((allowed) => !allowed)) {
      throw forbiddenClientLog();
    }

    if (!(await this.clientLogRefsConsistent(refs))) {
      throw forbiddenClientLog();
    }
  }

  private async clientLogRefsConsistent(refs: ClientPerformanceRefs): Promise<boolean> {
    if (refs.processLogId) {
      const processLog = await this.prisma.aiProcessLog.findUnique({
        where: { processLogId: refs.processLogId },
        select: {
          sessionId: true,
          applicationId: true,
          session: { select: { applicationId: true } }
        }
      });
      if (!processLog) {
        return false;
      }

      if (
        processLog.applicationId &&
        processLog.session?.applicationId &&
        !idsEqual(processLog.applicationId, processLog.session.applicationId)
      ) {
        return false;
      }

      const processApplicationId = processLog.applicationId ?? processLog.session?.applicationId ?? undefined;
      if (refs.sessionId) {
        if (processLog.sessionId && !idsEqual(processLog.sessionId, refs.sessionId)) {
          return false;
        }
        if (!processLog.sessionId && processApplicationId && !(await this.sessionMatchesApplication(refs.sessionId, processApplicationId))) {
          return false;
        }
        if (!processLog.sessionId && !processApplicationId) {
          return false;
        }
      }

      if (refs.applicationId) {
        if (!processApplicationId) {
          return false;
        }
        if (!idsEqual(processApplicationId, refs.applicationId)) {
          return false;
        }
      }
    }

    if (refs.sessionId && refs.applicationId && !(await this.sessionMatchesApplication(refs.sessionId, refs.applicationId))) {
      return false;
    }

    return true;
  }

  private async sessionMatchesApplication(sessionId: bigint, applicationId: bigint): Promise<boolean> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { sessionId },
      select: { applicationId: true }
    });
    return Boolean(session && idsEqual(session.applicationId, applicationId));
  }

  private async isProcessVisible(processLogId: bigint, currentUser: CurrentUser): Promise<boolean> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId },
      select: {
        inputRef: true,
        application: {
          select: {
            candidateId: true,
            posting: { select: { companyId: true } }
          }
        },
        session: {
          select: {
            candidateId: true,
            application: {
              select: {
                candidateId: true,
                posting: { select: { companyId: true } }
              }
            }
          }
        }
      }
    });
    if (!processLog) {
      return false;
    }
    if (this.inputRefMatchesUser(processLog.inputRef, currentUser)) {
      return true;
    }
    if (processLog.application && this.applicationRecordVisible(processLog.application, currentUser)) {
      return true;
    }
    return Boolean(processLog.session && this.sessionRecordVisible(processLog.session, currentUser));
  }

  private async isSessionVisible(sessionId: bigint, currentUser: CurrentUser): Promise<boolean> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { sessionId },
      select: {
        candidateId: true,
        application: {
          select: {
            candidateId: true,
            posting: { select: { companyId: true } }
          }
        }
      }
    });
    return Boolean(session && this.sessionRecordVisible(session, currentUser));
  }

  private async isApplicationVisible(applicationId: bigint, currentUser: CurrentUser): Promise<boolean> {
    const application = await this.prisma.application.findUnique({
      where: { applicationId },
      select: {
        candidateId: true,
        posting: { select: { companyId: true } }
      }
    });
    return Boolean(application && this.applicationRecordVisible(application, currentUser));
  }

  private sessionRecordVisible(
    session: { candidateId: bigint; application: { candidateId: bigint; posting: { companyId: bigint } } | null },
    currentUser: CurrentUser
  ): boolean {
    if (currentUser.userType === "CANDIDATE") {
      return idsEqual(session.candidateId, currentUser.candidateId);
    }
    if (currentUser.userType === "COMPANY") {
      return Boolean(session.application && idsEqual(session.application.posting.companyId, currentUser.companyId));
    }
    return false;
  }

  private applicationRecordVisible(
    application: { candidateId: bigint; posting: { companyId: bigint } },
    currentUser: CurrentUser
  ): boolean {
    if (currentUser.userType === "CANDIDATE") {
      return idsEqual(application.candidateId, currentUser.candidateId);
    }
    if (currentUser.userType === "COMPANY") {
      return idsEqual(application.posting.companyId, currentUser.companyId);
    }
    return false;
  }

  private async isQuestionVisible(
    questionId: bigint,
    refs: { processLogId?: bigint; sessionId?: bigint; applicationId?: bigint }
  ): Promise<boolean> {
    if (refs.sessionId && (await this.isQuestionInSession(questionId, refs.sessionId, refs.processLogId))) {
      return true;
    }
    if (refs.applicationId && (await this.isQuestionInApplication(questionId, refs.applicationId))) {
      return true;
    }
    if (refs.processLogId && (await this.isQuestionInProcess(questionId, refs.processLogId))) {
      return true;
    }
    return false;
  }

  private async isQuestionInSession(questionId: bigint, sessionId: bigint, processLogId?: bigint): Promise<boolean> {
    const answer = await this.prisma.interviewAnswer.findFirst({
      where: { sessionId, questionId },
      select: { answerId: true }
    });
    if (answer) {
      return true;
    }

    const [session, question] = await Promise.all([
      this.prisma.interviewSession.findUnique({
        where: { sessionId },
        select: {
          interviewType: true,
          application: { select: { postingId: true } }
        }
      }),
      this.prisma.question.findUnique({
        where: { questionId },
        select: {
          questionType: true,
          postingId: true,
          content: true
        }
      })
    ]);
    if (!session || !question) {
      return false;
    }

    if (question.questionType !== "FOLLOW_UP") {
      if (session.interviewType === "MOCK") {
        return question.postingId === null;
      }
      return Boolean(session.application && idsEqual(question.postingId, session.application.postingId));
    }

    return Boolean(processLogId && (await this.followUpProcessMatchesQuestion(processLogId, sessionId, question)));
  }

  private async isQuestionInApplication(questionId: bigint, applicationId: bigint): Promise<boolean> {
    const [application, question] = await Promise.all([
      this.prisma.application.findUnique({
        where: { applicationId },
        select: { postingId: true }
      }),
      this.prisma.question.findUnique({
        where: { questionId },
        select: {
          questionType: true,
          postingId: true
        }
      })
    ]);
    if (!application || !question || question.questionType === "FOLLOW_UP") {
      return false;
    }
    return idsEqual(question.postingId, application.postingId);
  }

  private async isQuestionInProcess(questionId: bigint, processLogId: bigint): Promise<boolean> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId },
      select: {
        sessionId: true,
        applicationId: true
      }
    });
    if (!processLog) {
      return false;
    }
    if (processLog.sessionId && (await this.isQuestionInSession(questionId, processLog.sessionId, processLogId))) {
      return true;
    }
    return Boolean(processLog.applicationId && (await this.isQuestionInApplication(questionId, processLog.applicationId)));
  }

  private async followUpProcessMatchesQuestion(
    processLogId: bigint,
    sessionId: bigint,
    question: { questionType: string; content: string }
  ): Promise<boolean> {
    const processLog = await this.prisma.aiProcessLog.findUnique({
      where: { processLogId },
      select: {
        processType: true,
        status: true,
        outputRef: true
      }
    });
    if (!processLog || processLog.processType !== "FOLLOW_UP" || processLog.status !== "COMPLETED" || !processLog.outputRef) {
      return false;
    }

    const output = parseJsonRecord(processLog.outputRef);
    return Boolean(
      output &&
        idsEqual(output.sessionId, sessionId) &&
        typeof output.content === "string" &&
        output.content.trim() === question.content.trim() &&
        question.questionType === "FOLLOW_UP"
    );
  }

  private inputRefMatchesUser(inputRef: string | null, currentUser: CurrentUser): boolean {
    if (!inputRef) {
      return false;
    }
    try {
      const parsed = JSON.parse(inputRef) as unknown;
      if (!isRecord(parsed) || !isRecord(parsed.requestedBy)) {
        return false;
      }
      const requestedBy = parsed.requestedBy;
      if (requestedBy.userType !== currentUser.userType || !idsEqual(requestedBy.userId, currentUser.userId)) {
        return false;
      }
      if (currentUser.userType === "CANDIDATE") {
        return idsEqual(requestedBy.candidateId, currentUser.candidateId);
      }
      if (currentUser.userType === "COMPANY") {
        return idsEqual(requestedBy.companyId, currentUser.companyId);
      }
      return false;
    } catch {
      return false;
    }
  }
}

type ClientPerformanceRefs = {
  processLogId?: bigint;
  sessionId?: bigint;
  applicationId?: bigint;
  questionId?: bigint;
};

function summarizeTimedItems(items: Array<{ durationMs?: number; status?: string }>) {
  const durations = items
    .map((item) => item.durationMs)
    .filter((duration): duration is number => typeof duration === "number" && Number.isFinite(duration))
    .sort((left, right) => left - right);
  const failed = items.filter((item) => item.status === "FAILED").length;
  const over4s = durations.filter((duration) => duration > 4_000).length;
  return {
    count: items.length,
    measuredCount: durations.length,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : undefined,
    p95DurationMs: percentile(durations, 0.95),
    over4sRate: durations.length ? round4(over4s / durations.length) : undefined,
    failureRate: items.length ? round4(failed / items.length) : undefined
  };
}

function groupByProcessType(items: Array<{ processType?: string; durationMs?: number; estimatedCostUsd?: number; status?: string }>) {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.processType ?? "UNKNOWN";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.entries()).map(([processType, rows]) => ({
    processType,
    ...summarizeTimedItems(rows),
    estimatedCostUsd: round6(rows.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0))
  }));
}

function percentile(sortedValues: number[], ratio: number): number | undefined {
  if (sortedValues.length === 0) {
    return undefined;
  }
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function optionalBigInt(value: unknown): bigint | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? BigInt(parsed) : undefined;
}

function optionalDate(value: unknown, name: string): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ code: "COMMON_VALIDATION_FAILED", message: `${name} must be an ISO date string.` });
  }
  return date;
}

function requiredToken(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException({ code: "COMMON_VALIDATION_FAILED", message: `${name} is required.` });
  }
  return value.trim().slice(0, 80);
}

function nonNegativeInteger(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BadRequestException({ code: "COMMON_VALIDATION_FAILED", message: `${name} must be a non-negative integer.` });
  }
  return parsed;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function idsEqual(left: unknown, right: unknown): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isInteger(leftNumber) && leftNumber > 0 && leftNumber === rightNumber;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function forbiddenClientLog(): ForbiddenException {
  return new ForbiddenException({
    code: "COMMON_FORBIDDEN",
    message: "AI performance log references are not available to the current user."
  });
}
