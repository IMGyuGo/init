export const reportApiRoutePrefix = "candidate";

export const reportApiRoutes = {
  mockReports: "mock-interview/reports",
  mockFeedback: "mock-interview/reports/:reportId/feedback",
  mockMedia: "mock-interview/reports/:reportId/media",
  mockMediaSession: "mock-interview/reports/:reportId/media/session",
  mockMediaFile: "mock-interview/reports/:reportId/media/:fileId",
  mockGenerate: "mock-interview/reports/:reportId/generate",
  applicationReport: "applications/:applicationId/report",
  applicationReportGenerate: "applications/:applicationId/report/generate",
  applicationStatus: "applications/:applicationId/status",
} as const;
