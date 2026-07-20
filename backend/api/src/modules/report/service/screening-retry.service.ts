import { Inject, Injectable } from "@nestjs/common";
import { AI_JOB_QUEUE_PUBLISHER, AiJobQueuePublisher } from "./ai-job-queue.publisher";
import {
  SCREENING_RETRY_REPOSITORY,
  ScreeningRetryProcess,
  ScreeningRetryRepository,
} from "../repository/screening-retry.repository";

const SAFE_QUEUE_PUBLISH_FAILURE = "AI queue publish failed during explicit report retry.";

@Injectable()
export class ScreeningRetryService {
  constructor(
    @Inject(SCREENING_RETRY_REPOSITORY) private readonly repository: ScreeningRetryRepository,
    @Inject(AI_JOB_QUEUE_PUBLISHER) private readonly queuePublisher: AiJobQueuePublisher,
  ) {}

  async retry(applicationId: number) {
    const preparation = await this.repository.prepare(applicationId);
    if (preparation.action === "CANDIDATE_REANSWER_REQUIRED") {
      return {
        action: preparation.action,
        queued: false,
        idempotentReplay: false,
        operatorReviewRequired: true,
      };
    }

    const { process, created } = preparation;
    if (created) {
      try {
        await this.queuePublisher.publish({
          processLogId: process.processLogId,
          processType: process.processType,
          inputRef: process.inputRef,
          attempt: 1,
        });
      } catch {
        await this.repository.markPublishFailed(process.processLogId, SAFE_QUEUE_PUBLISH_FAILURE);
        return this.response(process, false, false, "FAILED");
      }
    }

    return this.response(process, true, !created, process.status);
  }

  private response(
    process: ScreeningRetryProcess,
    queued: boolean,
    idempotentReplay: boolean,
    status: string,
  ) {
    return {
      action: "REPORT_RETRY" as const,
      processLogId: process.processLogId,
      status,
      queued,
      idempotentReplay,
      attempt: process.attempt,
      maxAttempts: process.maxAttempts,
      nextRetryAt: process.nextRetryAt,
      operatorReviewRequired: false,
    };
  }
}
