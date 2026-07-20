import { AiJobQueuePublisher } from "./ai-job-queue.publisher";
import { ScreeningRetryService } from "./screening-retry.service";
import {
  ScreeningRetryPreparation,
  ScreeningRetryRepository,
} from "../repository/screening-retry.repository";

describe("ScreeningRetryService", () => {
  function setup(preparation: ScreeningRetryPreparation, publishError?: Error) {
    const failures: Array<{ processLogId: number; reason: string }> = [];
    const repository: ScreeningRetryRepository = {
      prepare: jest.fn().mockResolvedValue(preparation),
      markPublishFailed: jest.fn(async (processLogId, reason) => {
        failures.push({ processLogId, reason });
      }),
    };
    const published: number[] = [];
    const publisher: AiJobQueuePublisher = {
      async publish(job) {
        if (publishError) throw publishError;
        published.push(job.processLogId);
      },
    };
    return { service: new ScreeningRetryService(repository, publisher), repository, published, failures };
  }

  it("creates an operator retry with one of three attempts and publishes it", async () => {
    const { service, published } = setup({
      action: "REPORT_RETRY",
      created: true,
      process: {
        processLogId: 41,
        processType: "REPORT_GENERATE",
        status: "PENDING",
        inputRef: JSON.stringify({ payload: { reportId: 7 } }),
        attempt: 1,
        maxAttempts: 3,
      },
    });

    await expect(service.retry(10)).resolves.toMatchObject({
      action: "REPORT_RETRY",
      processLogId: 41,
      queued: true,
      idempotentReplay: false,
      attempt: 1,
      maxAttempts: 3,
      operatorReviewRequired: false,
    });
    expect(published).toEqual([41]);
  });

  it("reuses an active report job without publishing another SQS message", async () => {
    const { service, published } = setup({
      action: "REPORT_RETRY",
      created: false,
      process: {
        processLogId: 42,
        processType: "REPORT_GENERATE",
        status: "RUNNING",
        inputRef: "{}",
        attempt: 2,
        maxAttempts: 3,
      },
    });

    await expect(service.retry(10)).resolves.toMatchObject({
      processLogId: 42,
      queued: true,
      idempotentReplay: true,
      attempt: 2,
    });
    expect(published).toEqual([]);
  });

  it("keeps terminal STT unavailable on the candidate reanswer boundary", async () => {
    const { service, published } = setup({ action: "CANDIDATE_REANSWER_REQUIRED" });

    await expect(service.retry(10)).resolves.toEqual({
      action: "CANDIDATE_REANSWER_REQUIRED",
      queued: false,
      idempotentReplay: false,
      operatorReviewRequired: true,
    });
    expect(published).toEqual([]);
  });

  it("persists only a fixed safe reason when queue publication fails", async () => {
    const { service, failures } = setup({
      action: "REPORT_RETRY",
      created: true,
      process: {
        processLogId: 43,
        processType: "REPORT_GENERATE",
        status: "PENDING",
        inputRef: "{}",
        attempt: 1,
        maxAttempts: 3,
      },
    }, new Error("applicant@example.com transcript=private"));

    await expect(service.retry(10)).resolves.toMatchObject({ queued: false, status: "FAILED" });
    expect(failures).toEqual([{
      processLogId: 43,
      reason: "AI queue publish failed during explicit report retry.",
    }]);
  });
});
