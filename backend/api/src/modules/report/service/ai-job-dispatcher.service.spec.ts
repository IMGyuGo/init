import { AiJobDispatcherService } from "./ai-job-dispatcher.service";
import { AiJobQueuePublisher } from "./ai-job-queue.publisher";
import { InMemoryReportRepository } from "../repository/in-memory-report.repository";

describe("AiJobDispatcherService", () => {
  it("publishes private input without persisting it in inputRef", async () => {
    const repository = new InMemoryReportRepository();
    let publishedInputRef = "";
    const publisher: AiJobQueuePublisher = {
      async publish(job) {
        publishedInputRef = job.inputRef;
      },
    };
    const service = new AiJobDispatcherService(repository, publisher);

    const result = await service.dispatch({
      processType: "QUESTION_GENERATE",
      input: { requestedBy: { userId: 2 }, payload: { motivation: "private motivation" } },
      persistedInput: { requestedBy: { userId: 2 }, payload: { folderId: 3, scrubbed: true } },
    });

    expect(publishedInputRef).toContain("private motivation");
    expect(result.inputRef).not.toContain("private motivation");
    expect(result.inputRef).toContain("\"scrubbed\":true");
  });

  it("marks queued process failed when SQS publish fails", async () => {
    const repository = new InMemoryReportRepository();
    const publisher: AiJobQueuePublisher = {
      async publish() {
        throw new Error("SQS unavailable");
      }
    };
    const service = new AiJobDispatcherService(repository, publisher);

    const result = await service.dispatch({
      processType: "QUESTION_GENERATE",
      input: {
        kind: "RECRUITING_QUESTION_GENERATE",
        payload: {
          postingId: 2,
          jobDescription: "Backend engineer",
          questionCount: 2
        }
      }
    });

    expect(result.queued).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.failure).toEqual({
      category: "RETRYABLE",
      reason: "AI queue publish failed: SQS unavailable",
      retryable: true
    });
    await expect(repository.getProcess(result.processLogId)).resolves.toMatchObject({
      status: "FAILED",
      failure: result.failure
    });
  });

  it("marks report failed when report generation cannot be published", async () => {
    const repository = new InMemoryReportRepository();
    const publisher: AiJobQueuePublisher = {
      async publish() {
        throw new Error("SQS unavailable");
      }
    };
    const service = new AiJobDispatcherService(repository, publisher);

    const result = await service.dispatchReportGeneration({
      reportId: 3,
      reportType: "RECRUITING_REPORT",
      input: {
        kind: "RECRUITING_REPORT_GENERATE",
        payload: {
          reportId: 3,
          reportType: "RECRUITING_REPORT"
        }
      }
    });

    expect(result.queued).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.report.status).toBe("FAILED");
    expect(result.report.failure).toEqual(result.failure);
  });
});
