import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  ConfirmQuestionSetInput,
  ConfirmQuestionSetResult,
  AiJobResult,
  CreateCriterionTagInput,
  CreateCriterionTagResult,
  CreateInterviewQuestionInput,
  CreateInterviewQuestionResult,
  EvaluationCriteriaResult,
  GenerateInterviewQuestionsInput,
  InterviewSettings,
  UpdateInterviewQuestionInput,
  UpdateEvaluationCriteriaInput,
  UpdateInterviewTimePolicyInput,
  UpdateInterviewTimePolicyResult,
  UpdateQuestionGenerationPolicyInput,
  UpdateQuestionGenerationPolicyResult,
} from "./types";
import { authFetch } from "../../api/client";
import { getApiBaseUrl } from "../../api/api-base-url";

export async function getInterviewSettings(postingId?: number) {
  return request<InterviewSettings>("/company/interviews/settings", {
    query: { postingId },
  });
}

export async function createCriterionTag(input: CreateCriterionTagInput) {
  return request<CreateCriterionTagResult>("/company/interviews/criterion-tags", {
    method: "POST",
    body: input,
  });
}

export async function updateEvaluationCriteria(input: UpdateEvaluationCriteriaInput) {
  return request<EvaluationCriteriaResult>("/company/interviews/evaluation-criteria", {
    method: "PATCH",
    body: input,
  });
}

export async function createInterviewQuestion(input: CreateInterviewQuestionInput) {
  return request<CreateInterviewQuestionResult>("/company/interviews/questions", {
    method: "POST",
    body: input,
  });
}

export async function updateInterviewQuestion(questionId: number, input: UpdateInterviewQuestionInput) {
  return request<CreateInterviewQuestionResult>(`/company/interviews/questions/${questionId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteInterviewQuestion(questionId: number) {
  return request<CreateInterviewQuestionResult>(`/company/interviews/questions/${questionId}`, {
    method: "DELETE",
  });
}

export async function updateInterviewTimePolicy(input: UpdateInterviewTimePolicyInput) {
  return request<UpdateInterviewTimePolicyResult>("/company/interviews/time-policy", {
    method: "PATCH",
    body: input,
  });
}

export async function updateQuestionGenerationPolicy(input: UpdateQuestionGenerationPolicyInput) {
  return request<UpdateQuestionGenerationPolicyResult>("/company/interviews/question-generation-policy", {
    method: "PATCH",
    body: input,
  });
}

export async function generateInterviewQuestions(input: GenerateInterviewQuestionsInput) {
  return request<AiJobResult>("/company/interviews/questions/generate", {
    method: "POST",
    body: input,
  });
}

export async function confirmQuestionSet(input: ConfirmQuestionSetInput) {
  return request<ConfirmQuestionSetResult>("/company/interviews/question-sets/confirm", {
    method: "POST",
    body: input,
  });
}

export async function getAiJobStatus(processLogId: number) {
  return request<AiJobResult>(`/ai/jobs/${processLogId}/status`);
}

async function request<T>(
  path: string,
  options: {
    method?: "DELETE" | "GET" | "POST" | "PATCH";
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {},
): Promise<ApiEnvelope<T>> {
  const url = new URL(`/api/v1${path}`, getApiBaseUrl());
  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await authFetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || "error" in payload) {
    const message = "error" in payload ? payload.error.message : "요청 처리 중 오류가 발생했습니다.";
    throw new Error(message);
  }

  return payload;
}
