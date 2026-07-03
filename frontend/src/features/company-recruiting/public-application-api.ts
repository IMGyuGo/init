import type { ApiEnvelope, ApiErrorEnvelope, Recruitment } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

export type PublicRecruitment = Pick<
  Recruitment,
  | "recruitmentId"
  | "postingId"
  | "title"
  | "jobRole"
  | "jobDescription"
  | "careerRequirement"
  | "educationRequirement"
  | "salaryInfo"
  | "workLocation"
  | "employmentType"
  | "startsOn"
  | "endsOn"
  | "status"
> & {
  companyName: string;
};

export type PublicApplicationInput = {
  name: string;
  email: string;
  phone: string;
  githubBlogUrl?: string;
  portfolioMode: "URL" | "FILE";
  portfolioUrl?: string;
  portfolioFile?: File | null;
  resumeFile?: File | null;
  motivation?: string;
  additionalInfo?: string;
  resumeText?: string;
  consentAgreed: boolean;
};

export type PublicApplicationResult = {
  applicationId: number;
  recruitmentId: number;
  email: string;
  applicationStatus: string;
  emailVerificationStatus: "PENDING";
  nextAction: "CHECK_EMAIL";
  temporary: boolean;
  temporaryBoundary: string | null;
  magicLinkDeliveryStatus: "SENT" | "FAILED" | "NOT_SENT_TEMPORARY";
  magicLinkExpiresInSeconds: number;
};

export type PublicApplicationAccessLinkResult = {
  recruitmentId: number;
  email: string;
  emailVerificationStatus: "PENDING";
  nextAction: "CHECK_EMAIL";
  magicLinkDeliveryStatus: "SENT" | "FAILED";
  magicLinkExpiresInSeconds: number;
};

export type PublicApplicationStatus = {
  applicationId: number;
  recruitmentId: number;
  email: string;
  name: string;
  jobRole: string;
  applicationStatus: string;
  documentStatus: string;
  interviewStatus: string;
  reportStatus: string;
  interviewEntry: {
    href: `/public/applications/${number}/interview`;
    label: "면접 시작" | "면접 이어가기" | "면접 완료";
    enabled: boolean;
    integrationStatus: "D_PUBLIC_CONTEXT_PENDING";
    temporary: true;
    temporaryBoundary: "B_MODULE_PUBLIC_INTERVIEW_ADAPTER";
    message: string;
  };
  submittedAt: string | null;
  updatedAt: string;
};

export type PublicInterviewStartResult = {
  applicationId: number;
  sessionId: number;
  interviewStatus: string;
  interviewSessionStatus: string;
  runtimePath: string;
  publicAccessToken: string;
};

export async function getPublicRecruitment(recruitmentId: number) {
  return request<PublicRecruitment>(`/public/recruitments/${recruitmentId}`);
}

export async function submitPublicApplication(recruitmentId: number, input: PublicApplicationInput) {
  const body = new FormData();
  appendFormValue(body, "name", input.name);
  appendFormValue(body, "email", input.email);
  appendFormValue(body, "phone", input.phone);
  appendFormValue(body, "githubBlogUrl", input.githubBlogUrl);
  appendFormValue(body, "portfolioMode", input.portfolioMode);
  appendFormValue(body, "portfolioUrl", input.portfolioMode === "URL" ? input.portfolioUrl : undefined);
  appendFormValue(body, "motivation", input.motivation);
  appendFormValue(body, "additionalInfo", input.additionalInfo);
  appendFormValue(body, "consentAgreed", String(input.consentAgreed));
  if (input.resumeFile) {
    body.append("resumeFile", input.resumeFile);
  }
  if (input.portfolioMode === "FILE" && input.portfolioFile) {
    body.append("portfolioFile", input.portfolioFile);
  }

  return request<PublicApplicationResult>(`/public/recruitments/${recruitmentId}/applications`, {
    method: "POST",
    body,
  });
}

export async function requestPublicApplicationAccessLink(recruitmentId: number, email: string) {
  return request<PublicApplicationAccessLinkResult>(`/public/recruitments/${recruitmentId}/applications/access-link`, {
    method: "POST",
    body: { email },
  });
}

export async function getPublicApplicationStatus(token: string) {
  const searchParams = new URLSearchParams({ token });
  return request<PublicApplicationStatus>(`/public/applications/status?${searchParams.toString()}`);
}

export async function startPublicApplicationInterview(applicationId: number, token: string) {
  return request<PublicInterviewStartResult>(`/public/applications/${applicationId}/interview/start`, {
    method: "POST",
    body: { token },
  });
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
  } = {},
): Promise<ApiEnvelope<T>> {
  const url = new URL(`/api/v1${path}`, API_BASE_URL);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const requestBody: BodyInit | undefined = isFormData
    ? (options.body as FormData)
    : options.body
      ? JSON.stringify(options.body)
      : undefined;
  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: isFormData
      ? undefined
      : {
          "Content-Type": "application/json",
        },
    body: requestBody,
  });

  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || "error" in payload) {
    const message = "error" in payload ? payload.error.message : "요청 처리 중 오류가 발생했습니다.";
    throw new Error(message);
  }

  return payload;
}

function appendFormValue(body: FormData, key: string, value: string | undefined) {
  const normalized = value?.trim();
  if (normalized) {
    body.append(key, normalized);
  }
}
