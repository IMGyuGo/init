import { CandidateApiError, type ApiErrorDetail } from "./api";
import { hasPortfolioArtifact, hasRequiredConsents, isCandidateNameConfirmed, type CandidateApplicationFormState } from "./view-model";

export type CandidateApplicationField =
  | "candidateName"
  | "email"
  | "phone"
  | "githubUrl"
  | "blogUrl"
  | "profileSnapshot"
  | "profileSummary"
  | "profileCoverLetter"
  | "profileEducations"
  | "profileCareers"
  | "profileActivities"
  | "profileCredentials"
  | "resumeFileId"
  | "portfolio"
  | "portfolioUrl"
  | "motivation"
  | "additionalInfo"
  | "consentTypes";

export type CandidateApplicationStep = 0 | 1 | 2;

export interface CandidateApplicationErrorState {
  summary: string;
  issues: string[];
  fieldErrors: Partial<Record<CandidateApplicationField, string>>;
  firstField?: CandidateApplicationField;
  step: CandidateApplicationStep;
}

type ApiErrorContext = {
  fallbackField?: CandidateApplicationField;
  operation?: "이력서 업로드" | "포트폴리오 업로드" | "지원서 제출";
};

const fieldOrder: CandidateApplicationField[] = [
  "candidateName",
  "email",
  "phone",
  "githubUrl",
  "blogUrl",
  "profileSummary",
  "profileCoverLetter",
  "profileEducations",
  "profileCareers",
  "profileActivities",
  "profileCredentials",
  "profileSnapshot",
  "resumeFileId",
  "portfolio",
  "portfolioUrl",
  "motivation",
  "additionalInfo",
  "consentTypes",
];

const fieldLabels: Record<CandidateApplicationField, string> = {
  candidateName: "이름",
  email: "이메일",
  phone: "연락처",
  githubUrl: "GitHub URL",
  blogUrl: "블로그 URL",
  profileSnapshot: "프로필",
  profileSummary: "한 줄 소개",
  profileCoverLetter: "자기소개서",
  profileEducations: "학력",
  profileCareers: "경력",
  profileActivities: "프로젝트·경험·활동·교육",
  profileCredentials: "자격·어학·수상",
  resumeFileId: "이력서",
  portfolio: "포트폴리오",
  portfolioUrl: "포트폴리오 URL",
  motivation: "지원 동기",
  additionalInfo: "추가 설명",
  consentTypes: "동의 항목",
};

const fieldSteps: Record<CandidateApplicationField, CandidateApplicationStep> = {
  candidateName: 0,
  email: 0,
  phone: 0,
  githubUrl: 0,
  blogUrl: 0,
  profileSnapshot: 0,
  profileSummary: 0,
  profileCoverLetter: 0,
  profileEducations: 0,
  profileCareers: 0,
  profileActivities: 0,
  profileCredentials: 0,
  resumeFileId: 1,
  portfolio: 1,
  portfolioUrl: 1,
  motivation: 1,
  additionalInfo: 1,
  consentTypes: 2,
};

export function validateCandidateApplication(state: CandidateApplicationFormState): CandidateApplicationErrorState | null {
  const fieldErrors: CandidateApplicationErrorState["fieldErrors"] = {};
  const candidateName = state.candidateName.trim();
  const email = state.email.trim();
  const phone = state.phone.trim();
  const githubUrl = state.githubUrl.trim();
  const blogUrl = state.blogUrl.trim();
  const portfolioUrl = state.portfolioUrl?.trim() ?? "";
  const motivation = state.motivation.trim();
  const additionalInfo = state.additionalInfo.trim();

  if (!candidateName) fieldErrors.candidateName = "이름을 입력해주세요.";
  else if (!isCandidateNameConfirmed(candidateName, email)) fieldErrors.candidateName = "OAuth 계정 ID 대신 실제 이름을 입력해주세요.";
  else if (candidateName.length > 100) fieldErrors.candidateName = lengthMessage(100, candidateName.length);

  if (!email) fieldErrors.email = "이메일을 입력해주세요.";
  else if (!isEmail(email)) fieldErrors.email = "올바른 이메일 주소를 입력해주세요.";
  else if (email.length > 255) fieldErrors.email = lengthMessage(255, email.length);

  if (!phone) fieldErrors.phone = "연락처를 입력해주세요.";
  else if (phone.length > 50) fieldErrors.phone = lengthMessage(50, phone.length);

  validateOptionalUrl(githubUrl, "githubUrl", fieldErrors);
  validateOptionalUrl(blogUrl, "blogUrl", fieldErrors);

  if (!state.resumeFileId) fieldErrors.resumeFileId = "이력서 PDF를 선택해주세요.";
  if (!hasPortfolioArtifact(state)) fieldErrors.portfolio = "URL 또는 PDF 중 하나를 제출해주세요.";
  else if (portfolioUrl && !isHttpUrl(portfolioUrl)) fieldErrors.portfolioUrl = "http:// 또는 https://로 시작하는 주소를 입력해주세요.";
  else if (portfolioUrl.length > 500) fieldErrors.portfolioUrl = lengthMessage(500, portfolioUrl.length);

  if (!motivation) fieldErrors.motivation = "지원 동기를 입력해주세요.";
  else if (motivation.length > 3000) fieldErrors.motivation = lengthMessage(3000, motivation.length);

  if (!additionalInfo) fieldErrors.additionalInfo = "추가 설명을 입력해주세요.";
  else if (additionalInfo.length > 5000) fieldErrors.additionalInfo = lengthMessage(5000, additionalInfo.length);

  if (!hasRequiredConsents(state.consentTypes)) fieldErrors.consentTypes = "필수 동의 항목을 모두 체크해주세요.";

  return buildErrorState(fieldErrors);
}

export function toCandidateApplicationError(error: unknown, context: ApiErrorContext = {}): CandidateApplicationErrorState {
  if (!(error instanceof CandidateApiError)) {
    return fallbackError(undefined, { ...context, fallbackField: undefined });
  }

  if (error.status === 401) {
    return {
      summary: "로그인이 만료되었습니다. 다시 로그인해주세요.",
      issues: ["로그인 화면에서 다시 로그인한 뒤 지원서를 제출해주세요."],
      fieldErrors: {},
      step: 0,
    };
  }

  const code = error.body?.error.code;
  if (code === "APPLICATION_ALREADY_SUBMITTED") {
    return {
      summary: "이미 지원한 채용공고입니다.",
      issues: ["지원 내역에서 제출된 지원서를 확인할 수 있습니다."],
      fieldErrors: {},
      step: 2,
    };
  }

  const fieldErrors: CandidateApplicationErrorState["fieldErrors"] = {};
  const issues: string[] = [];
  for (const detail of error.body?.error.details ?? []) {
    const field = resolveField(detail.field, context.fallbackField);
    const issue = field ? detailMessage(field, detail) : unmappedDetailMessage(detail);
    if (field && !fieldErrors[field]) fieldErrors[field] = issue;
    if (!issues.includes(issue)) issues.push(issue);
  }

  if (Object.keys(fieldErrors).length === 0 && context.fallbackField) {
    const message = error.body?.error.message;
    fieldErrors[context.fallbackField] = isGenericMessage(message)
      ? defaultFieldMessage(context.fallbackField)
      : message ?? defaultFieldMessage(context.fallbackField);
  }

  return buildErrorState(fieldErrors, {
    fallbackSummary: specificMessage(error.body?.error.message) ?? operationFailureMessage(context.operation),
    issues: issues.length ? issues : [apiFailureIssue(error, context)],
  }) ?? fallbackError(error.body?.error.message, context);
}

export function candidateApplicationFieldStep(field: CandidateApplicationField): CandidateApplicationStep {
  return fieldSteps[field];
}

function buildErrorState(
  fieldErrors: CandidateApplicationErrorState["fieldErrors"],
  options: { fallbackSummary?: string; issues?: string[] } = {},
): CandidateApplicationErrorState | null {
  const fields = fieldOrder.filter((field) => Boolean(fieldErrors[field]));
  const firstField = fields[0];
  const issues = options.issues?.length
    ? [...new Set(options.issues)]
    : fields.map((field) => fieldErrors[field]!).filter((issue, index, all) => all.indexOf(issue) === index);
  if (!firstField) {
    if (!options.fallbackSummary) return null;
    return { summary: options.fallbackSummary, issues, fieldErrors, step: 0 };
  }
  return {
    summary: `입력값 ${fields.length}곳을 확인해주세요.`,
    issues,
    fieldErrors,
    firstField,
    step: fieldSteps[firstField],
  };
}

function resolveField(field: string | undefined, fallbackField?: CandidateApplicationField): CandidateApplicationField | undefined {
  if (!field || field === "file") return fallbackField;
  if (field === "profileSnapshot") return "profileSnapshot";
  if (field.startsWith("profileSnapshot.")) {
    const profileField = field.slice("profileSnapshot.".length).split(".")[0];
    if (profileField === "name") return "candidateName";
    if (profileField === "email") return "email";
    if (profileField === "phone") return "phone";
    if (profileField === "githubUrl") return "githubUrl";
    if (profileField === "blogUrl") return "blogUrl";
    if (profileField === "portfolioUrl") return "portfolioUrl";
    if (profileField === "summary") return "profileSummary";
    if (profileField === "coverLetter") return "profileCoverLetter";
    if (profileField === "educations") return "profileEducations";
    if (profileField === "careers") return "profileCareers";
    if (profileField === "activities") return "profileActivities";
    if (profileField === "credentials") return "profileCredentials";
    return "profileSnapshot";
  }
  const normalized = field.split(".")[0];
  if (normalized === "name") return "candidateName";
  if (normalized === "summary") return "profileSummary";
  if (normalized === "coverLetter") return "profileCoverLetter";
  if (normalized === "educations") return "profileEducations";
  if (normalized === "careers") return "profileCareers";
  if (normalized === "activities") return "profileActivities";
  if (normalized === "credentials") return "profileCredentials";
  if (normalized === "basicInfo") return "candidateName";
  if (normalized === "applicationDetails") return "motivation";
  if (normalized === "portfolioFileId") return "portfolio";
  if (normalized in fieldLabels) return normalized as CandidateApplicationField;
  return fallbackField;
}

function detailMessage(field: CandidateApplicationField, detail: ApiErrorDetail): string {
  if (field.startsWith("profile")) return profileDetailMessage(detail, field);
  if (detail.reason === "MAX_LENGTH" && detail.limit) return lengthMessage(detail.limit, detail.actualLength);
  if (["githubUrl", "blogUrl", "portfolioUrl"].includes(field)) return "http:// 또는 https://로 시작하는 주소를 입력해주세요.";
  if (field === "email") return "올바른 이메일 주소를 입력해주세요.";
  if (field === "consentTypes") return "필수 동의 항목을 모두 체크해주세요.";
  if (field === "resumeFileId") return "이력서 PDF를 다시 선택해주세요.";
  if (field === "portfolio") return "포트폴리오 제출 방식을 확인해주세요.";
  if (detail.message && /[가-힣]/.test(detail.message)) return detail.message;
  return defaultFieldMessage(field);
}

function defaultFieldMessage(field: CandidateApplicationField): string {
  if (field.startsWith("profile")) return `${fieldLabels[field]} 입력값을 확인해주세요.`;
  if (field === "resumeFileId") return "이력서 파일을 확인해주세요.";
  if (field === "portfolio" || field === "portfolioUrl") return "포트폴리오를 확인해주세요.";
  if (field === "consentTypes") return "필수 동의 항목을 확인해주세요.";
  return `${fieldLabels[field]} 입력값을 확인해주세요.`;
}

function profileDetailMessage(detail: ApiErrorDetail, field: CandidateApplicationField): string {
  const segments = detail.field?.replace(/^profileSnapshot\.?/, "").split(".").filter(Boolean) ?? [];
  const root = segments[0] ?? "profileSnapshot";
  const index = /^\d+$/.test(segments[1] ?? "") ? Number(segments[1]) + 1 : undefined;
  const leaf = segments[segments.length - 1] ?? root;
  const subject = profileFieldSubject(root, leaf, index, field);
  const reason = detail.reason.toLowerCase();

  if (reason.includes("email") && reason.includes("valid")) return "올바른 이메일 주소를 입력해주세요.";
  if (reason.includes("yyyy-mm-dd")) return `${subject} 항목은 YYYY-MM-DD 형식의 올바른 날짜로 입력해주세요.`;
  if (reason.includes("yyyy-mm")) return `${subject} 항목은 YYYY-MM 형식으로 입력해주세요.`;
  if (reason.includes("valid date")) return `${subject} 항목에 실제 존재하는 날짜를 입력해주세요.`;
  if (reason.includes("end is required when not ongoing")) {
    if (root === "careers") return `경력 ${index ?? 1}번의 퇴사 연월을 입력하거나 재직 중을 체크해주세요.`;
    if (root === "activities") return `활동 ${index ?? 1}번의 종료일을 입력하거나 진행 중을 체크해주세요.`;
    return `${subject} 항목을 입력하거나 진행 중을 체크해주세요.`;
  }
  if (reason.includes("end must be null while ongoing")) return `${subject} 항목은 진행 중일 때 비워주세요.`;
  if (reason.includes("end must be on or after start")) return `${subject} 항목은 시작일과 같거나 이후로 입력해주세요.`;
  if (reason.includes("incompatible with education level")) return `${subject} 선택값이 학력 구분과 맞지 않습니다.`;
  if (reason.includes("unsupported value")) return `${subject} 선택값을 다시 확인해주세요.`;
  if (reason.includes("array of at most 10")) return `${fieldLabels[field]}은 최대 10개까지 입력할 수 있습니다.`;
  if (reason.includes("non-blank") || reason.includes("must not be blank")) return `${subject} 항목을 입력해주세요.`;
  if (reason.includes("must be a boolean")) return `${subject} 체크 상태를 다시 확인해주세요.`;
  if (reason.includes("must be 1")) return "프로필 데이터 형식이 오래되었습니다. 프로필을 다시 불러온 뒤 제출해주세요.";

  const reasonLimit = /(?:of|be) (\d+) characters/.exec(reason)?.[1];
  if (detail.limit || reasonLimit) return lengthMessage(detail.limit ?? Number(reasonLimit), detail.actualLength);
  if (detail.message && /[가-힣]/.test(detail.message)) return detail.message;
  return `${subject} 입력값을 확인해주세요.`;
}

function profileFieldSubject(
  root: string,
  leaf: string,
  index: number | undefined,
  fallbackField: CandidateApplicationField,
): string {
  const sectionLabels: Record<string, string> = {
    educations: "학력",
    careers: "경력",
    activities: "활동",
    credentials: "자격·어학·수상",
  };
  const leafLabels: Record<string, string> = {
    schemaVersion: "프로필 형식",
    name: "이름",
    email: "이메일",
    phone: "연락처",
    githubUrl: "GitHub URL",
    blogUrl: "블로그 URL",
    portfolioUrl: "포트폴리오 URL",
    summary: "한 줄 소개",
    coverLetter: "자기소개서",
    educationLevel: "학력 구분",
    schoolName: "학교명",
    major: "전공",
    degreeType: "학위·대학 구분",
    status: "재학·졸업 상태",
    companyName: "회사명",
    jobRole: "직무",
    department: "근무 부서",
    position: "직급·직책",
    responsibilities: "담당 업무",
    activityType: "활동 구분",
    organizationName: "기관·회사명",
    description: "활동 내용",
    credentialType: "구분",
    issuer: "발행·주최 기관",
    acquiredMonth: "취득 연월",
    result: "점수·등급·수상 결과",
    startMonth: root === "careers" ? "입사 연월" : "시작 연월",
    startDate: "시작일",
    endMonth: root === "careers" ? "퇴사 연월" : "종료 연월",
    endDate: "종료일",
    end: root === "careers" ? "퇴사 연월" : root === "activities" ? "종료일" : "종료 연월",
  };
  const sectionLabel = sectionLabels[root];
  const leafLabel = leafLabels[leaf] ?? fieldLabels[fallbackField];
  return sectionLabel && index ? `${sectionLabel} ${index}번의 ${leafLabel}` : leafLabel;
}

function unmappedDetailMessage(detail: ApiErrorDetail): string {
  if (detail.message && /[가-힣]/.test(detail.message)) return detail.message;
  return detail.field
    ? "서버가 거부한 입력값의 형식 또는 필수 여부를 확인해주세요."
    : "서버가 거부한 입력값을 다시 확인해주세요.";
}

function apiFailureIssue(error: CandidateApiError, context: ApiErrorContext): string {
  if (error.status >= 500) return operationRecoveryMessage(context.operation);
  if (error.status === 403) return "이 공고에 지원할 권한이 없거나 현재 지원 가능한 상태가 아닙니다.";
  if (error.status === 404) return "채용공고 또는 지원에 필요한 정보를 찾을 수 없습니다. 목록에서 공고를 다시 열어주세요.";
  if (error.status === 429) return "요청이 너무 많습니다. 잠시 후 다시 제출해주세요.";
  if (error.body?.error.code === "COMMON_VALIDATION_FAILED") {
    return "서버가 입력값을 거부했지만 문제 위치를 전달하지 않았습니다. 각 단계의 필수값을 확인해주세요.";
  }
  return operationRecoveryMessage(context.operation);
}

function validateOptionalUrl(
  value: string,
  field: "githubUrl" | "blogUrl",
  fieldErrors: CandidateApplicationErrorState["fieldErrors"],
) {
  if (!value) return;
  if (!isHttpUrl(value)) fieldErrors[field] = "http:// 또는 https://로 시작하는 주소를 입력해주세요.";
  else if (value.length > 500) fieldErrors[field] = lengthMessage(500, value.length);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function lengthMessage(limit: number, actualLength?: number): string {
  return actualLength && actualLength > limit
    ? `최대 ${limit.toLocaleString("ko-KR")}자까지 입력할 수 있습니다. 현재 ${actualLength.toLocaleString("ko-KR")}자입니다.`
    : `최대 ${limit.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`;
}

function fallbackError(message: string | undefined, context: ApiErrorContext): CandidateApplicationErrorState {
  const summary = specificMessage(message) ?? operationFailureMessage(context.operation);
  if (!context.fallbackField) return { summary, issues: [operationRecoveryMessage(context.operation)], fieldErrors: {}, step: 0 };
  const fieldErrors = { [context.fallbackField]: defaultFieldMessage(context.fallbackField) };
  return buildErrorState(fieldErrors, { fallbackSummary: summary })!;
}

function operationFailureMessage(operation: ApiErrorContext["operation"]): string {
  return operation ? `${operation}에 실패했습니다. 다시 시도해주세요.` : "요청을 완료하지 못했습니다. 다시 시도해주세요.";
}

function operationRecoveryMessage(operation: ApiErrorContext["operation"]): string {
  return operation
    ? `${operation} 중 서버 연결 또는 처리 문제가 발생했습니다. 잠시 후 다시 시도해주세요.`
    : "서버 연결 또는 처리 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
}

function specificMessage(message: string | undefined): string | undefined {
  return isGenericMessage(message) ? undefined : message;
}

function isGenericMessage(message: string | undefined): boolean {
  return !message || message === "요청을 처리할 수 없습니다." || message.startsWith("Candidate API request failed");
}
