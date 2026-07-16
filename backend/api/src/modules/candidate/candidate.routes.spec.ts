import { strict as assert } from "node:assert";
import { candidateApiRoutePrefix, candidateApiRoutes } from "./candidate.routes";

assert.equal(candidateApiRoutePrefix, "candidate");
assert.equal(candidateApiRoutes.jobs, "jobs");
assert.equal(candidateApiRoutes.jobDetail, "jobs/:jobId");
assert.equal(candidateApiRoutes.applyView, "jobs/:jobId/apply");
assert.equal(candidateApiRoutes.submitApplication, "jobs/:jobId/applications");
assert.equal(candidateApiRoutes.applications, "applications");
assert.equal(candidateApiRoutes.cancelApplication, "applications/:applicationId/cancel");
assert.equal(candidateApiRoutes.interviewGuide, "applications/:applicationId/interview-guide");
assert.equal(candidateApiRoutes.interviewConsent, "applications/:applicationId/consent");
assert.equal(candidateApiRoutes.resume, "resume");
assert.equal(candidateApiRoutes.portfolioLinks, "portfolio-links");
assert.equal(candidateApiRoutes.folders, "folders");
assert.equal(candidateApiRoutes.folderDetail, "folders/:folderId");

test("candidate routes contract", () => {
  assert.ok(candidateApiRoutes.jobs);
});
