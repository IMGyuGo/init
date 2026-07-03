import { strict as assert } from "node:assert";
import { interviewApiRoutePrefix, interviewApiRoutes } from "./interview.routes";

assert.equal(interviewApiRoutePrefix, "candidate");
assert.equal(interviewApiRoutes.mockInterviews, "mock-interviews");
assert.equal(interviewApiRoutes.mockHistory, "mock-interviews/history");
assert.equal(interviewApiRoutes.mockRuntime, "mock-interviews/:sessionId");
assert.equal(interviewApiRoutes.mockQuestions, "mock-interviews/:sessionId/questions");
assert.equal(interviewApiRoutes.mockAnswers, "mock-interviews/:sessionId/answers");
assert.equal(interviewApiRoutes.mockNextQuestion, "mock-interviews/:sessionId/next-question");
assert.equal(interviewApiRoutes.mockComplete, "mock-interviews/:sessionId/complete");
assert.equal(interviewApiRoutes.mockStt, "mock-interviews/:sessionId/stt");
assert.equal(interviewApiRoutes.mockFollowUpQuestion, "mock-interviews/:sessionId/follow-up-question");
assert.equal(interviewApiRoutes.mockFollowUpQuestionInsert, "mock-interviews/:sessionId/follow-up-questions/insert");
assert.equal(interviewApiRoutes.deviceCheck, "interviews/:sessionId/device-check");
assert.equal(interviewApiRoutes.startInterview, "applications/:applicationId/interview/start");
assert.equal(interviewApiRoutes.interviewRuntime, "applications/:applicationId/interview");
assert.equal(interviewApiRoutes.recruitingQuestions, "interviews/:sessionId/questions");
assert.equal(interviewApiRoutes.recruitingAnswers, "interviews/:sessionId/answers");
assert.equal(interviewApiRoutes.media, "interviews/:sessionId/media");
assert.equal(interviewApiRoutes.recruitingNextQuestion, "interviews/:sessionId/next-question");
assert.equal(interviewApiRoutes.recruitingComplete, "interviews/:sessionId/complete");
assert.equal(interviewApiRoutes.recruitingStt, "interviews/:sessionId/stt");
assert.equal(interviewApiRoutes.recruitingFollowUpQuestion, "interviews/:sessionId/follow-up-question");
assert.equal(interviewApiRoutes.recruitingFollowUpQuestionInsert, "interviews/:sessionId/follow-up-questions/insert");

test("interview routes contract", () => {
  assert.ok(interviewApiRoutes.mockInterviews);
});
