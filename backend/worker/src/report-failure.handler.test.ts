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

  await onFailure(job, failure("RETRYABLE", "provider timeout"));

  assert.deepEqual(results.failedReports.get(30), {
    reportId: 30,
    reportType: "RECRUITING_REPORT",
    applicationId: 22,
    sessionId: 65,
    failureCategory: "RETRYABLE",
    failureReason: "provider timeout"
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
