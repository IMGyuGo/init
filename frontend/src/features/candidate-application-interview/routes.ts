export const candidateApplicationInterviewRoutes = {
  jobs: "/candidate/jobs",
  jobDetail: (jobId: number) => `/candidate/jobs/${jobId}`,
  apply: (jobId: number) => `/candidate/jobs/${jobId}/apply`,
  mockInterviewStart: "/candidate/mock-interview/start",
  mockInterview: (sessionId: number) => `/candidate/mock-interviews/${sessionId}`,
  mockReports: "/candidate/mock-interview/reports",
  mockReportDetail: (reportId: number) => `/candidate/mock-interview/reports/${reportId}`,
  applications: "/candidate/applications",
  interviewGuide: (applicationId: number) => `/candidate/applications/${applicationId}/interview-guide`,
  interview: (applicationId: number) => `/candidate/applications/${applicationId}/interview`,
  applicationReport: (applicationId: number) => `/candidate/applications/${applicationId}/report`,
  publicInterview: (applicationId: number, sessionId?: number) =>
    `/public/applications/${applicationId}/interview/runtime${sessionId ? `?sessionId=${sessionId}` : ""}`,
  publicInterviewComplete: (applicationId: number) => `/public/applications/${applicationId}/interview/runtime/complete`,
  mypage: "/candidate/mypage",
  applicationSets: "/candidate/application-sets",
  billing: "/candidate/billing",
} as const;

export const candidateApplicationInterviewFeature = {
  owner: "D",
  featureFolder: "frontend/src/features/candidate-application-interview",
  routes: candidateApplicationInterviewRoutes,
} as const;
