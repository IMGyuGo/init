import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAiResultRepository } from "./ai-result.repository";
import { createDocumentExtractionStartHandler, createReportFailureHandler } from "./report-failure.handler";
import { AiWorkerJob, FailureReason } from "./worker.types";

test("document extraction lifecycle handlers mark application document status", async () => {
  const results = new InMemoryAiResultRepository();
  const onStart = createDocumentExtractionStartHandler(results);
  const onFailure = createReportFailureHandler(results);
  const job = workerJob("DOCUMENT_EXTRACT", {
    payload: {
      documentId: 7,
      fileId: 9
    }
  });

  await onStart(job);
  await onFailure(job, failure("NON_RETRYABLE", "s3 object was not readable"));

  assert.deepEqual(results.documentParseStatusEvents, [
    { documentId: 7, fileId: 9, status: "EXTRACTING" },
    { documentId: 7, fileId: 9, status: "FAILED" }
  ]);
  assert.equal(results.documentParseStatuses.get(7), "FAILED");
});

test("follow-up publish failure does not roll an already extracted document back to failed", async () => {
  const results = new InMemoryAiResultRepository();
  await results.saveDocumentExtraction({
    documentId: 7,
    fileId: 9,
    s3Key: "candidate/206/resume.pdf",
    extractedText: "복구 가능한 추출 결과",
  });

  await createReportFailureHandler(results)(
    workerJob("DOCUMENT_EXTRACT", { payload: { documentId: 7, fileId: 9 } }),
    failure("RETRYABLE", "AccessDenied: sqs:SendMessage"),
  );

  assert.equal(results.documentParseStatuses.get(7), "EXTRACTED");
  assert.deepEqual(results.documentParseStatusEvents.map((event) => event.status), ["EXTRACTED"]);
});

test("resume-question publish failure is recorded for the exact usage scope", async () => {
  const results = new InMemoryAiResultRepository();
  const onFailure = createReportFailureHandler(results);
  const failureReason = failure("RETRYABLE", "AccessDenied for applicant@example.com transcript=private");

  await onFailure({
    processLogId: 2,
    processType: "RESUME_QUESTION_GENERATE",
    inputRef: JSON.stringify({
      applicationId: 206,
      postingId: 10,
      documentId: 7,
      policyVersion: 1,
      criteriaVersion: 1,
      inputVersion: "input-206-demo",
      resumeDocumentHash: "resume-hash",
      jdSnapshotHash: "jd-hash",
      usageScope: "DEMO_PRESET",
    }),
    attempt: 1,
  }, failureReason);

  assert.deepEqual(results.scopedFailedResumeQuestions.get("206:DEMO_PRESET"), {
    category: "RETRYABLE",
    reason: "Temporary AI processing failure.",
    retryable: true,
  });
  assert.equal(results.failedResumeQuestions.has(206), false);
});

test("report failure handler records report retryability from process input", async () => {
  const results = new InMemoryAiResultRepository();
  const onFailure = createReportFailureHandler(results);
  const job = workerJob("REPORT_GENERATE", {
    payload: {
      reportId: 30,
      reportType: "RECRUITING_REPORT",
      applicationId: 22,
      sessionId: 65
    }
  });

  await onFailure(job, failure("RETRYABLE", "provider timeout for applicant@example.com transcript=private"));

  assert.deepEqual(results.failedReports.get(30), {
    reportId: 30,
    reportType: "RECRUITING_REPORT",
    applicationId: 22,
    sessionId: 65,
    failureCategory: "RETRYABLE",
    failureReason: "Temporary AI processing failure."
  });
});

test("failure handlers ignore malformed input references without hiding process failure", async () => {
  const results = new InMemoryAiResultRepository();
  const onStart = createDocumentExtractionStartHandler(results);
  const onFailure = createReportFailureHandler(results);
  const malformedJob: AiWorkerJob = {
    processLogId: 42,
    processType: "DOCUMENT_EXTRACT",
    inputRef: "not-json",
    attempt: 1
  };

  await onStart(malformedJob);
  await onFailure(malformedJob, failure("NON_RETRYABLE", "invalid inputRef"));
  await onFailure(
    workerJob("REPORT_GENERATE", {
      payload: {
        reportId: 31,
        reportType: "UNKNOWN"
      }
    }),
    failure("NON_RETRYABLE", "invalid reportType")
  );

  assert.deepEqual(results.documentParseStatusEvents, []);
  assert.equal(results.failedReports.size, 0);
});

function workerJob(processType: AiWorkerJob["processType"], input: unknown): AiWorkerJob {
  return {
    processLogId: 10,
    processType,
    inputRef: JSON.stringify(input),
    attempt: 1
  };
}

function failure(category: FailureReason["category"], reason: string): FailureReason {
  return {
    category,
    reason,
    retryable: category === "RETRYABLE"
  };
}
