import { strict as assert } from "node:assert";
import { reportApiRoutePrefix, reportApiRoutes } from "./report.routes";

assert.equal(reportApiRoutePrefix, "candidate");
assert.equal(reportApiRoutes.mockReports, "mock-interview/reports");
assert.equal(reportApiRoutes.mockFeedback, "mock-interview/reports/:reportId/feedback");
assert.equal(reportApiRoutes.mockMedia, "mock-interview/reports/:reportId/media");
assert.equal(reportApiRoutes.mockMediaSession, "mock-interview/reports/:reportId/media/session");
assert.equal(reportApiRoutes.mockMediaFile, "mock-interview/reports/:reportId/media/:fileId");
assert.equal(reportApiRoutes.mockGenerate, "mock-interview/reports/:reportId/generate");
assert.equal(reportApiRoutes.applicationReport, "applications/:applicationId/report");
assert.equal(reportApiRoutes.applicationReportGenerate, "applications/:applicationId/report/generate");
assert.equal(reportApiRoutes.applicationStatus, "applications/:applicationId/status");

test("report routes contract", () => {
  assert.ok(reportApiRoutes.mockReports);
});
