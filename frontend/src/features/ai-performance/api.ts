"use client";

import { apiFetch } from "@/api/client";
import type { ClientNextStepType } from "./client-next-step";

const USER_PERCEIVED_NEXT_READY_EVENT = "ANSWER_SUBMIT_TO_NEXT_READY";

export type AiWorkCategory =
  | "VOICE_TRANSCRIPTION"
  | "FOLLOW_UP_GENERATION"
  | "REPORT_GENERATION"
  | "QUESTION_PREPARATION"
  | "CRITERIA_PREPARATION"
  | "OTHER";

export interface AiPerformanceSummary {
  sampleLimit: number;
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
  byWorkCategory: AiWorkCategorySummary[];
  byClientNextStep: ClientNextStepSummary[];
}

export interface AiWorkCategorySummary {
  workCategory: AiWorkCategory;
  count: number;
  measuredCount: number;
  averageDurationMs?: number;
  p95DurationMs?: number;
  failureRate?: number;
  estimatedCostUsd: number;
}

export interface ClientNextStepSummary extends PerformanceSummaryBlock {
  nextQuestionType: ClientNextStepType;
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
  workCategory: AiWorkCategory;
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
  metadata?: Record<string, unknown>;
  nextQuestionType: ClientNextStepType;
  nextReady?: boolean;
  outcome?: string;
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
