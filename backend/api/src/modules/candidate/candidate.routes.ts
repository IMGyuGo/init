export const candidateApiRoutePrefix = "candidate";
export const publicCandidateApiRoutePrefix = "public";

export const candidateApiRoutes = {
  profile: "profile",
  jobs: "jobs",
  jobDetail: "jobs/:jobId",
  applyView: "jobs/:jobId/apply",
  submitApplication: "jobs/:jobId/applications",
  applications: "applications",
  interviewGuide: "applications/:applicationId/interview-guide",
  interviewConsent: "applications/:applicationId/consent",
  resume: "resume",
  portfolioLinks: "portfolio-links",
  folders: "folders",
  folderDetail: "folders/:folderId",
} as const;

export const publicCandidateApiRoutes = {
  jobs: "jobs",
} as const;
