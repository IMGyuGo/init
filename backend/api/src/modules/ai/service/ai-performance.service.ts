import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/prisma.service";
import { AiPerformanceQueryDto, ClientPerformanceLogRequestDto } from "../dto/ai-performance.dto";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

@Injectable()
export class AiPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async recordClientLog(body: ClientPerformanceLogRequestDto) {
    const eventName = requiredToken(body.eventName, "eventName");
    const durationMs = nonNegativeInteger(body.durationMs, "durationMs");
    const created = await this.prisma.clientPerformanceLog.create({
      data: {
        eventName,
        processLogId: optionalBigInt(body.processLogId),
        sessionId: optionalBigInt(body.sessionId),
        applicationId: optionalBigInt(body.applicationId),
        questionId: optionalBigInt(body.questionId),
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
}

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
