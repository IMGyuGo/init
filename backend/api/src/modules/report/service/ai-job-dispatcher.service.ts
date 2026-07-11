import { Inject, Injectable } from "@nestjs/common";
import { AI_JOB_QUEUE_PUBLISHER, AiJobQueuePublisher } from "./ai-job-queue.publisher";
import { REPORT_REPOSITORY, ReportRepository } from "../repository/report.repository";
import {
  AiProcessRefs,
  AiProcessType,
  EvaluationReportSnapshot,
  FailureReason,
  QueuedAiProcessSnapshot,
  ReportType
} from "../report.types";

export interface DispatchAiJobCommand {
  processType: AiProcessType;
  input: unknown;
  persistedInput?: unknown;
  refs?: AiProcessRefs;
}

export interface DispatchAiJobResult extends QueuedAiProcessSnapshot {
  queued: boolean;
}

export interface DispatchReportGenerationCommand {
  reportId: number;
  reportType: ReportType;
  input: unknown;
  refs?: AiProcessRefs;
}

export interface DispatchReportGenerationResult extends DispatchAiJobResult {
  report: EvaluationReportSnapshot;
}

@Injectable()
export class AiJobDispatcherService {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly repository: ReportRepository,
    @Inject(AI_JOB_QUEUE_PUBLISHER) private readonly queuePublisher: AiJobQueuePublisher
  ) {}

  async dispatch(command: DispatchAiJobCommand): Promise<DispatchAiJobResult> {
    const queueInputRef = JSON.stringify(command.input);
    const persistedInputRef = JSON.stringify(command.persistedInput ?? command.input);
    const process = await this.repository.createQueuedProcess(command.processType, persistedInputRef, command.refs);

    try {
      await this.queuePublisher.publish({
        processLogId: process.processLogId,
        processType: process.processType,
        inputRef: queueInputRef,
        attempt: 1
      });
    } catch (error) {
      const failed = await this.repository.markQueuedProcessFailed(process.processLogId, this.queuePublishFailure(error));
      return {
        ...failed,
        queued: false
      };
    }

    return {
      ...process,
      queued: true
    };
  }

  async dispatchReportGeneration(command: DispatchReportGenerationCommand): Promise<DispatchReportGenerationResult> {
    const report = await this.repository.markReportGenerating(command.reportId, command.reportType, command.refs);
    const process = await this.dispatch({
      processType: "REPORT_GENERATE",
      input: command.input,
      refs: command.refs
    });
    const finalReport =
      process.status === "FAILED" && process.failure
        ? await this.repository.markReportFailed(command.reportId, process.failure)
        : report;

    return {
      ...process,
      report: finalReport
    };
  }

  private queuePublishFailure(error: unknown): FailureReason {
    const reason = error instanceof Error ? error.message : "unknown queue publish failure";
    return {
      category: "RETRYABLE",
      reason: `AI queue publish failed: ${reason}`,
      retryable: true
    };
  }
}
