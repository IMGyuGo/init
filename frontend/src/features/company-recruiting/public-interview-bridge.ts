const PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY = "init.publicInterviewAccessToken";

type PublicInterviewStartBridgeInput = {
  applicationId: number;
  sessionId: number;
  interviewStatus?: string;
  interviewSessionStatus?: string;
  runtimePath: string;
  publicAccessToken: string;
};

export type PublicInterviewBridgeResult = {
  applicationId: number;
  sessionId: number;
  runtimePath: string;
  publicAccessToken: string;
};

export function buildPublicInterviewBridgeResult(
  expectedApplicationId: number,
  response: PublicInterviewStartBridgeInput,
): PublicInterviewBridgeResult {
  if (response.applicationId !== expectedApplicationId) {
    throw new Error("면접 시작 응답이 지원서 정보와 일치하지 않습니다.");
  }

  if (!Number.isInteger(response.sessionId) || response.sessionId < 1) {
    throw new Error("면접 세션 정보를 확인하지 못했습니다.");
  }

  const expectedRuntimePrefix = `/public/applications/${expectedApplicationId}/interview/runtime`;
  if (!response.runtimePath.startsWith(expectedRuntimePrefix)) {
    throw new Error("면접 런타임 경로가 지원서 정보와 일치하지 않습니다.");
  }

  if (!response.publicAccessToken.trim()) {
    throw new Error("면접 접근 토큰을 발급받지 못했습니다.");
  }

  return {
    applicationId: response.applicationId,
    sessionId: response.sessionId,
    runtimePath: response.runtimePath,
    publicAccessToken: response.publicAccessToken,
  };
}

export function persistPublicInterviewAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.sessionStorage.setItem(PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY, token);
    return;
  }
  window.sessionStorage.removeItem(PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY);
}
