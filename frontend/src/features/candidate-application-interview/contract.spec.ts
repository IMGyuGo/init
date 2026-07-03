import type {
  ApiErrorBody,
  CandidateApplicationSummary,
  CandidateJobDetail,
  CandidateJobListPostingStatus,
  CandidateJobQuery,
  CandidateJobSummary,
  CandidateMockReportFeedback,
  CandidateMockReportSummary,
  CandidateRecruitingReportView,
  CreatePortfolioLinkRequest,
  InterviewDeviceCheckRequest,
  SaveInterviewAnswerRequest,
  SaveInterviewConsentRequest,
  StartMockInterviewRequest,
  SubmitApplicationRequest,
  UploadResumeRequest,
} from "./api";
import { candidateApiPaths } from "./api";
import {
  getCandidateApplicationInterviewActionHref,
  getCandidateApplicationReportHref,
  getCandidateJobDetailActionHref,
  getMockInterviewHref,
  getMockReportHref,
  isCandidateFacingMockFeedbackSafe,
  isCandidateInterviewStartEnabled,
  isCandidateRecruitingReportLimited,
  shouldShowInterviewDeviceSetup,
  toRuntimeQuestionSpeechText,
  toDeviceCheckRequest,
  toCreatePortfolioLinkRequest,
  toSaveInterviewAnswerRequest,
  toSaveInterviewConsentRequest,
  toStartMockInterviewRequest,
  toSubmitApplicationRequest,
  toUploadResumeRequest,
} from "./view-model";

const listPostingStatus: CandidateJobListPostingStatus = "OPEN";
const query: CandidateJobQuery = {
  page: 1,
  limit: 20,
  q: "android",
  jobRole: "Android",
  jobGroup: "Engineering",
  location: "Pangyo",
  careerLevel: "Entry",
  postingStatus: listPostingStatus,
  sort: "endsOn",
  order: "asc",
};

// @ts-expect-error Closed postings are not a valid candidate list filter value.
const closedFilterQuery: CandidateJobQuery = { postingStatus: "CLOSED" };

const submitRequest: SubmitApplicationRequest = toSubmitApplicationRequest({
  candidateName: " Kim ",
  email: " kim@example.com ",
  phone: " 010-0000-0000 ",
  resumeFileId: 1,
  portfolioUrl: " https://portfolio.example.com/kim ",
  consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
});

const resumeRequest: UploadResumeRequest = toUploadResumeRequest({
  candidateId: 1,
  storageKey: "candidate/1/resume.pdf",
  originalName: " resume.pdf ",
  mimeType: "application/pdf",
  sizeBytes: 1024,
});

const portfolioRequest: CreatePortfolioLinkRequest = toCreatePortfolioLinkRequest({
  linkType: "GITHUB",
  url: "https://github.com/example",
  description: " GitHub ",
});

const interviewConsentRequest: SaveInterviewConsentRequest = toSaveInterviewConsentRequest({
  consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"],
});

const deviceCheckRequest: InterviewDeviceCheckRequest = toDeviceCheckRequest({
  cameraGranted: true,
  microphoneGranted: true,
  networkStable: true,
});

const startMockRequest: StartMockInterviewRequest = toStartMockInterviewRequest({
  jobRole: " Android ",
  difficulty: "NORMAL",
  questionTypes: ["INTRO", "TECHNICAL"],
  showQuestionText: false,
});

const answerRequest: SaveInterviewAnswerRequest = toSaveInterviewAnswerRequest({
  questionId: 1,
  videoFile: {
    storageKey: "candidate/1/mock-answer.webm",
    originalName: "mock-answer.webm",
    mimeType: "video/webm",
    sizeBytes: 1024,
  },
  durationSeconds: 30,
});

const questionSpeechText = toRuntimeQuestionSpeechText({
  content: "최근 프로젝트에서 가장 어려웠던 기술적 문제는 무엇이었나요?",
  audioPrompt: "audio://candidate/mock-question/1",
});

const audioPromptSpeechText = toRuntimeQuestionSpeechText({
  audioPrompt: "자기소개를 1분 안에 들려주세요.",
});

const applicationSummary: CandidateApplicationSummary = {
  applicationId: 1,
  postingId: 1,
  candidateId: 1,
  companyName: "Init Labs",
  jobTitle: "Backend Developer",
  jobRole: "Backend",
  location: "Seoul",
  applicationStatus: "SUBMITTED",
  documentStatus: "SUBMITTED",
  interviewStatus: "READY",
  reportStatus: "PENDING",
  submittedAt: "2026-06-29T00:00:00.000Z",
  updatedAt: "2026-06-29T00:00:00.000Z",
  sessionId: 1,
  interviewType: "RECRUITING",
  interviewSessionStatus: "READY",
  interviewWindowStartsAt: "2026-06-29T00:00:00.000Z",
  interviewWindowEndsAt: "2026-07-06T00:00:00.000Z",
  consentCompleted: true,
  deviceCheckCompleted: true,
  canStartInterview: true,
};

const candidateJobSummary: CandidateJobSummary = {
  jobId: 1,
  companyName: "Init Labs",
  companyLogoUrl: "https://cdn.example.com/assets/company/1/profile-logo/init.png",
  title: "Backend Developer",
  jobGroup: "Engineering",
  jobRole: "Backend",
  location: "Seoul",
  careerLevel: "Junior",
  employmentType: "Full-time",
  postingStatus: "OPEN",
  startsOn: "2026-07-01",
  endsOn: "2026-07-31",
  canApply: true,
  alreadyApplied: false,
};

const candidateJobDetail: CandidateJobDetail = {
  ...candidateJobSummary,
  companyId: 1,
  isPublic: true,
  companyIndustry: "SaaS",
  companyProfile: "AI recruiting workflow",
  jobDescription: "NestJS API",
  techStacks: ["Node.js", "NestJS"],
  createdAt: "2026-07-01T00:00:00.000Z",
};

const mockReport: CandidateMockReportSummary = {
  sessionId: 10001,
  reportId: 10001,
  interviewType: "MOCK",
  status: "COMPLETED",
  reportStatus: "COMPLETED",
  startedAt: "2026-06-29T00:00:00.000Z",
  completedAt: "2026-06-29T00:10:00.000Z",
  updatedAt: "2026-06-29T00:10:00.000Z",
  totalQuestions: 2,
  answeredCount: 2,
  reportType: "MOCK_INTERVIEW_REPORT",
  feedbackEndpoint: "/api/v1/candidate/mock-interview/reports/10001/feedback",
  mediaEndpoint: "/api/v1/candidate/mock-interview/reports/10001/media",
  generateEndpoint: "/api/v1/candidate/mock-interview/reports/10001/generate",
};

const mockFeedback: CandidateMockReportFeedback = {
  reportId: 10001,
  sessionId: 10001,
  reportType: "MOCK_INTERVIEW_REPORT",
  status: "COMPLETED",
  totalScore: 82,
  summary: "연습 피드백이 준비되었습니다.",
  strengths: ["질문 순서에 맞춰 답변을 제출했습니다."],
  improvements: ["예시는 더 간결하게 정리해보세요."],
  nextPractice: ["녹화된 답변을 다시 확인하세요."],
  scores: [],
  visibilityPolicy: {
    candidateFacingOnly: true,
    excludesHiringDecision: true,
    excludesInternalScores: true,
    excludesCompanyMemo: true,
  },
};

const recruitingReport: CandidateRecruitingReportView = {
  applicationId: 1,
  sessionId: 1,
  reportType: "RECRUITING_REPORT",
  status: "GENERATING",
  applicationStatus: "SUBMITTED",
  interviewStatus: "COMPLETED",
  companyName: "Init Labs",
  jobTitle: "Backend Developer",
  candidateMessage: "면접 분석이 진행 중입니다.",
  nextStepLabel: "분석 진행 중",
  scores: [],
  answers: [],
  visibilityPolicy: {
    candidateFacingOnly: true,
    excludesDetailedScores: true,
    excludesEvaluationEvidence: true,
    excludesInternalMemo: true,
    excludesManualEvaluation: true,
  },
};

const applicationInterviewHref = getCandidateApplicationInterviewActionHref(applicationSummary);
const applicationReportHref = getCandidateApplicationReportHref(applicationSummary);
const applicationCanStart = isCandidateInterviewStartEnabled(applicationSummary);
const mockInterviewHref = getMockInterviewHref({ sessionId: 10001 });
const mockReportHref = getMockReportHref(mockReport);
const mockFeedbackIsSafe = isCandidateFacingMockFeedbackSafe(mockFeedback);
const recruitingReportIsLimited = isCandidateRecruitingReportLimited(recruitingReport);
const recruitingReadyShowsDeviceSetup = shouldShowInterviewDeviceSetup({
  mode: "recruiting",
  setupCompleted: false,
  runtimeStatus: "READY",
});
const recruitingInProgressSkipsDeviceSetup = shouldShowInterviewDeviceSetup({
  mode: "recruiting",
  setupCompleted: false,
  runtimeStatus: "IN_PROGRESS",
});
const completedInterviewSkipsDeviceSetup = shouldShowInterviewDeviceSetup({
  mode: "recruiting",
  setupCompleted: false,
  runtimeStatus: "COMPLETED",
});

const mockInterviewsPath = candidateApiPaths.mockInterviews;
const mockRuntimePath = candidateApiPaths.mockRuntime(10001);
const mockQuestionsPath = candidateApiPaths.mockQuestions(10001);
const mockAnswerPath = candidateApiPaths.mockAnswers(10001);
const mockNextQuestionPath = candidateApiPaths.mockNextQuestion(10001);
const mockCompletePath = candidateApiPaths.mockComplete(10001);
const mockSttPath = candidateApiPaths.mockStt(10001);
const mockFollowUpPath = candidateApiPaths.mockFollowUpQuestion(10001);
const mockFollowUpInsertPath = candidateApiPaths.mockFollowUpQuestionInsert(10001);
const mockReportsPath = candidateApiPaths.mockReports;
const mockHistoryPath = candidateApiPaths.mockHistory;
const mockReportFeedbackPath = candidateApiPaths.mockReportFeedback(10001);
const mockReportMediaPath = candidateApiPaths.mockReportMedia(10001);
const mockReportGeneratePath = candidateApiPaths.mockReportGenerate(10001);
const applicationsPath = candidateApiPaths.applications;
const interviewGuidePath = candidateApiPaths.interviewGuide(1);
const applicationReportPath = candidateApiPaths.applicationReport(1);
const applicationReportGeneratePath = candidateApiPaths.applicationReportGenerate(1);
const applicationStatusPath = candidateApiPaths.applicationStatus(1);
const deviceCheckPath = candidateApiPaths.deviceCheck(1);
const startInterviewPath = candidateApiPaths.startInterview(1);
const runtimePath = candidateApiPaths.interviewRuntime(1);
const recruitingQuestionsPath = candidateApiPaths.recruitingQuestions(1);
const recruitingAnswerPath = candidateApiPaths.recruitingAnswers(1);
const recruitingNextQuestionPath = candidateApiPaths.recruitingNextQuestion(1);
const recruitingCompletePath = candidateApiPaths.recruitingComplete(1);
const recruitingSttPath = candidateApiPaths.recruitingStt(1);
const recruitingFollowUpPath = candidateApiPaths.recruitingFollowUpQuestion(1);
const recruitingFollowUpInsertPath = candidateApiPaths.recruitingFollowUpQuestionInsert(1);

const applyActionHref = getCandidateJobDetailActionHref({
  jobId: 1,
  canApply: true,
  alreadyApplied: false,
});

const appliedActionHref = getCandidateJobDetailActionHref({
  jobId: 1,
  canApply: false,
  alreadyApplied: true,
});

const disabledActionHref = getCandidateJobDetailActionHref({
  jobId: 1,
  canApply: false,
  alreadyApplied: false,
});

const errorBody: ApiErrorBody = {
  error: {
    code: "COMMON_VALIDATION_FAILED",
    message: "입력값을 확인해주세요.",
    details: [{ field: "email", reason: "INVALID_FORMAT" }],
  },
  meta: {
    traceId: "trace-test",
    timestamp: "2026-06-29T00:00:00.000Z",
  },
};

void query;
void closedFilterQuery;
void submitRequest;
void resumeRequest;
void portfolioRequest;
void interviewConsentRequest;
void deviceCheckRequest;
void startMockRequest;
void answerRequest;
void questionSpeechText;
void audioPromptSpeechText;
void applicationSummary;
void candidateJobSummary;
void candidateJobDetail;
void mockReport;
void mockFeedback;
void recruitingReport;
void applicationInterviewHref;
void applicationReportHref;
void applicationCanStart;
void mockInterviewHref;
void mockReportHref;
void mockFeedbackIsSafe;
void recruitingReportIsLimited;
void recruitingReadyShowsDeviceSetup;
void recruitingInProgressSkipsDeviceSetup;
void completedInterviewSkipsDeviceSetup;
void mockInterviewsPath;
void mockRuntimePath;
void mockQuestionsPath;
void mockAnswerPath;
void mockNextQuestionPath;
void mockCompletePath;
void mockSttPath;
void mockFollowUpPath;
void mockFollowUpInsertPath;
void mockReportsPath;
void mockHistoryPath;
void mockReportFeedbackPath;
void mockReportMediaPath;
void mockReportGeneratePath;
void applicationsPath;
void interviewGuidePath;
void applicationReportPath;
void applicationReportGeneratePath;
void applicationStatusPath;
void deviceCheckPath;
void startInterviewPath;
void runtimePath;
void recruitingQuestionsPath;
void recruitingAnswerPath;
void recruitingNextQuestionPath;
void recruitingCompletePath;
void recruitingSttPath;
void recruitingFollowUpPath;
void recruitingFollowUpInsertPath;
void applyActionHref;
void appliedActionHref;
void disabledActionHref;
void errorBody;
