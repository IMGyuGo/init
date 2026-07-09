"use client";

import { apiFetch } from "@/api/client";

const USER_PERCEIVED_NEXT_READY_EVENT = "ANSWER_SUBMIT_TO_NEXT_READY";

export interface AiPerformanceSummary {
  jobs: PerformanceSummaryBlock;
  clientEvents: PerformanceSummaryBlock;
  cost: {
    estimatedCostUsd: number;
    pricedJobCount: number;
    unpricedJobCount: number;
    inputTokens: number;
    outputTokens: number;
    audioSeconds: number;
  };
  byProcessType: Array<PerformanceSummaryBlock & { processType: string; estimatedCostUsd: number }>;
}

export interface PerformanceSummaryBlock {
  count: number;
  measuredCount: number;
  averageDurationMs?: number;
  p95DurationMs?: number;
  over4sRate?: number;
  failureRate?: number;
}

export interface AiPerformanceJob {
  processLogId: number;
  processType: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  estimatedCostUsd?: number;
  failureCategory?: string;
  failureReason?: string;
  createdAt: string;
}

export interface ClientPerformanceEvent {
  clientPerformanceLogId: number;
  eventName: string;
  processLogId?: number;
  sessionId?: number;
  applicationId?: number;
  questionId?: number;
  durationMs: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ClientPerformanceLogRequest {
  eventName: string;
  durationMs: number;
  processLogId?: number;
  sessionId?: number;
  applicationId?: number;
  questionId?: number;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export function getAiPerformanceSummary() {
  return apiFetch<AiPerformanceSummary>(`/ai/performance/summary?limit=200&eventName=${USER_PERCEIVED_NEXT_READY_EVENT}`);
}

export function listAiPerformanceJobs() {
  return apiFetch<AiPerformanceJob[]>("/ai/performance/jobs?limit=30");
}

export function listClientPerformanceEvents() {
  return apiFetch<ClientPerformanceEvent[]>(`/ai/performance/client-events?limit=30&eventName=${USER_PERCEIVED_NEXT_READY_EVENT}`);
}

export async function sendClientPerformanceLog(request: ClientPerformanceLogRequest): Promise<void> {
  try {
    await apiFetch("/ai/performance-logs", {
      method: "POST",
      body: JSON.stringify(request)
    });
  } catch {
    return;
  }
}
