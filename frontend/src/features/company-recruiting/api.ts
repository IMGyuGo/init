import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  Applicant,
  ApplicantEvaluation,
  AiJobStatusResponse,
  CreateRecruitmentInput,
  JobDescriptionImageUploadResponse,
  PostingDraftGenerateInput,
  Recruitment,
  RecruitmentStatus,
  UpdateScreeningStatusInput,
  UpdateRecruitmentInput,
} from "./types";
import { authFetch } from "../../api/client";
import { getApiBaseUrl } from "../../api/api-base-url";

type ListQuery = {
  page?: number;
  limit?: number;
  q?: string;
  keyword?: string;
  status?: RecruitmentStatus;
  sort?: string;
  order?: "asc" | "desc";
};

export async function listRecruitments(query: ListQuery = {}) {
  return request<{ items: Recruitment[] }>("/company/recruitments", { query });
}

export async function createRecruitment(input: CreateRecruitmentInput) {
  return request<Recruitment>("/company/recruitments", {
    method: "POST",
    body: input,
  });
}

export async function getRecruitment(recruitmentId: number) {
  return request<Recruitment>(`/company/recruitments/${recruitmentId}`);
}

export async function updateRecruitment(recruitmentId: number, input: UpdateRecruitmentInput) {
  return request<Recruitment>(`/company/recruitments/${recruitmentId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function changeRecruitmentStatus(recruitmentId: number, status: "OPEN" | "DRAFT") {
  const current = await getRecruitment(recruitmentId);
  return updateRecruitment(recruitmentId, {
    title: current.data.title,
    jobRole: current.data.jobRole,
    startsOn: current.data.startsOn ?? undefined,
    endsOn: current.data.endsOn ?? undefined,
    status,
    jobDescription: current.data.jobDescription ?? undefined,
  });
}

export async function publishRecruitment(recruitmentId: number) {
  return changeRecruitmentStatus(recruitmentId, "OPEN");
}

export async function deleteRecruitment(recruitmentId: number) {
  return request<Recruitment>(`/company/recruitments/${recruitmentId}`, {
    method: "DELETE",
  });
}

export async function uploadJobDescriptionImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return requestFormData<JobDescriptionImageUploadResponse>("/company/recruitments/jd-images", formData);
}

export async function generatePostingDraft(input: PostingDraftGenerateInput) {
  return request<AiJobStatusResponse>("/company/recruitments/ai-draft", {
    method: "POST",
    body: input,
  });
}

export async function getAiJobStatus(processLogId: number) {
  return request<AiJobStatusResponse>(`/ai/jobs/${processLogId}/status`);
}

export async function listRecruitmentApplicants(recruitmentId: number, query: ListQuery = {}) {
  return request<{ items: Applicant[] }>(`/company/recruitments/${recruitmentId}/applicants`, { query });
}

export async function getApplicantEvaluation(applicantId: number) {
  return request<ApplicantEvaluation>(`/company/applicants/${applicantId}/evaluation`);
}

export async function createApplicantInterviewMediaSession(applicantId: number, fileId: number) {
  const path = `/company/applicants/${applicantId}/media/${fileId}/session`;
  const response = await authFetch(`${getApiBaseUrl()}/api/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "면접 녹화 파일을 불러올 수 없습니다."));
  }
  const payload = (await response.json()) as ApiEnvelope<{ mediaUrl: string; expiresInSeconds: number }>;
  return {
    expiresInSeconds: payload.data.expiresInSeconds,
    mediaUrl: new URL(payload.data.mediaUrl, getApiBaseUrl()).toString(),
  };
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function updateScreeningStatus(applicantId: number, input: UpdateScreeningStatusInput) {
  return request<Applicant>(`/company/applicants/${applicantId}/screening-status`, {
    method: "PATCH",
    body: input,
  });
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
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

async function requestFormData<T>(path: string, body: FormData): Promise<ApiEnvelope<T>> {
  const url = new URL(`/api/v1${path}`, getApiBaseUrl());

  const response = await authFetch(url.toString(), {
    method: "POST",
    body,
  });

  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || "error" in payload) {
    const message = "error" in payload ? payload.error.message : "요청 처리 중 오류가 발생했습니다.";
    throw new Error(message);
  }

  return payload;
}
