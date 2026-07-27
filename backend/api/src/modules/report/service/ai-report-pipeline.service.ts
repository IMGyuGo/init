import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { GuardrailService } from "./guardrail.service";
import { MockAiReportProvider } from "./mock-ai-report.provider";
import { REPORT_REPOSITORY, ReportRepository } from "../repository/report.repository";
import {
  AnswerEvaluationRequest,
  AnswerEvaluationResult,
  CommunicationAnalysisRequest,
  CommunicationAnalysisResult,
  EvaluationContextRequest,
  EvaluationContextResult,
  FailureReason,
  GenerateReportRequest,
  GenerateReportResult,
  isRetryableFailureCategory,
  ReportCommand,
  ReportPipelineStep,
  ReportType
} from "../report.types";

@Injectable()
export class AiReportPipelineService {
  constructor(
    @Inject(MockAiReportProvider) private readonly mockProvider: MockAiReportProvider,
    @Inject(GuardrailService) private readonly guardrailService: GuardrailService,
    @Inject(REPORT_REPOSITORY) private readonly repository: ReportRepository
  ) {}

  async buildEvaluationContext(command: ReportCommand<EvaluationContextRequest>): Promise<EvaluationContextResult> {
    this.validateEvaluationContext(command.body);
    const processLog = await this.start(command.reportId, command.body.reportType, "EVALUATION_CONTEXT");

    try {
      const context = this.mockProvider.buildEvaluationContext(command.body);
      await this.repository.saveGuardrailLog(processLog.processLogId, "EVALUATION_CONTEXT_VALIDATE", {
        result: "PASS",
        reason: null
      });
      await this.repository.saveContext(command.reportId, context);
      const completedProcess = await this.repository.markProcessCompleted(processLog.processLogId);

      return {
        ...(await this.baseResult(command.reportId, completedProcess)),
        context
      };
    } catch (error) {
      return (await this.fail(
        command.reportId,
        processLog.processLogId,
        this.toFailure(error, "RETRYABLE")
      )) as EvaluationContextResult;
    }
  }

  async evaluateAnswers(command: ReportCommand<AnswerEvaluationRequest>): Promise<AnswerEvaluationResult> {
    this.validateAnswerEvaluation(command.body);
    const processLog = await this.start(command.reportId, command.body.reportType, "ANSWER_EVALUATION");

    try {
      const scores = this.mockProvider.evaluateAnswers(command.body);
      const questionEvaluations = this.mockProvider.evaluateQuestions(command.body);
      const guardrail = this.guardrailService.validateScores(command.body.reportType, scores);
      await this.repository.saveGuardrailLog(processLog.processLogId, "ANSWER_EVIDENCE_REQUIRED", guardrail);

      if (guardrail.result === "BLOCKED") {
        const failure = this.failure("NON_RETRYABLE", guardrail.reason ?? "answer evaluation blocked by guardrail");
        const failed = await this.fail(command.reportId, processLog.processLogId, failure);
        return {
          ...failed,
          scores,
          questionEvaluations,
          guardrail,
          stored: await this.repository.countStored(command.reportId)
        };
      }

      const stored = await this.repository.saveScoresAndEvidences(command.reportId, scores);
      const completedProcess = await this.repository.markProcessCompleted(processLog.processLogId);

      return {
        ...(await this.baseResult(command.reportId, completedProcess)),
        scores,
        questionEvaluations,
        guardrail,
        stored
      };
    } catch (error) {
      const failed = await this.fail(command.reportId, processLog.processLogId, this.toFailure(error, "RETRYABLE"));
      return {
        ...failed,
        scores: [],
        questionEvaluations: [],
        guardrail: { result: "BLOCKED", reason: failed.failure?.reason ?? "answer evaluation failed" },
        stored: await this.repository.countStored(command.reportId)
      };
    }
  }

  async analyzeCommunication(command: ReportCommand<CommunicationAnalysisRequest>): Promise<CommunicationAnalysisResult> {
    this.validateCommunicationAnalysis(command.body);
    const processLog = await this.start(command.reportId, command.body.reportType, "COMMUNICATION_ANALYSIS");

    try {
      const communicationAnalysis = this.mockProvider.analyzeCommunication(command.body);
      await this.repository.saveGuardrailLog(processLog.processLogId, "COMMUNICATION_ANALYSIS_AUXILIARY_ONLY", {
        result: "PASS",
        reason: null
      });
      await this.repository.saveCommunicationAnalysis(command.reportId, communicationAnalysis);
      const completedProcess = await this.repository.markProcessCompleted(processLog.processLogId);

      return {
        ...(await this.baseResult(command.reportId, completedProcess)),
        communicationAnalysis
      };
    } catch (error) {
      return (await this.fail(
        command.reportId,
        processLog.processLogId,
        this.toFailure(error, "RETRYABLE")
      )) as CommunicationAnalysisResult;
    }
  }

  async generate(command: ReportCommand<GenerateReportRequest>): Promise<GenerateReportResult> {
    this.validateGenerateReport(command.body);
    const processLog = await this.start(command.reportId, command.body.reportType, "REPORT_GENERATE");

    try {
      const generatedReport = this.mockProvider.generate(command.body);
      const guardrail = this.guardrailService.validateReport(command.body.reportType, generatedReport);
      await this.repository.saveGuardrailLog(processLog.processLogId, "REPORT_FINAL_SAVE", guardrail);

      if (guardrail.result === "BLOCKED") {
        const failure = this.failure("NON_RETRYABLE", guardrail.reason ?? "report blocked by guardrail");
        const failed = await this.fail(command.reportId, processLog.processLogId, failure);
        return {
          ...failed,
          ...generatedReport,
          guardrail,
          stored: await this.repository.countStored(command.reportId)
        };
      }

      const stored = await this.repository.saveScoresAndEvidences(command.reportId, generatedReport.scores);
      await this.repository.markReportCompleted(command.reportId, generatedReport.summary, generatedReport.totalScore);
      const completedProcess = await this.repository.markProcessCompleted(processLog.processLogId);

      return {
        ...(await this.baseResult(command.reportId, completedProcess)),
        ...generatedReport,
        guardrail,
        stored
      };
    } catch (error) {
      const failed = await this.fail(command.reportId, processLog.processLogId, this.toFailure(error, "RETRYABLE"));
      return {
        ...failed,
        summary: "",
        totalScore: 0,
        scores: [],
        questionEvaluations: [],
        guardrail: { result: "BLOCKED", reason: failed.failure?.reason ?? "report generation failed" },
        stored: await this.repository.countStored(command.reportId)
      };
    }
  }

  private async start(reportId: number, reportType: ReportType, step: ReportPipelineStep) {
    const processLog = await this.repository.startProcess(reportId, reportType, step);
    await this.repository.markReportGenerating(reportId, reportType);
    return this.repository.markProcessRunning(processLog.processLogId);
  }

  private async baseResult(reportId: number, processLog: Awaited<ReturnType<ReportRepository["markProcessCompleted"]>>) {
    return {
      processLogId: processLog.processLogId,
      processType: processLog.processType,
      step: processLog.step,
      status: processLog.status,
      report: await this.repository.getReport(reportId),
      failure: processLog.failure
    };
  }

  private async fail(reportId: number, processLogId: number, failure: FailureReason) {
    const failedProcess = await this.repository.markProcessFailed(processLogId, failure);
    await this.repository.markReportFailed(reportId, failure);
    return this.baseResult(reportId, failedProcess);
  }

  private validateEvaluationContext(input: EvaluationContextRequest): void {
    this.validateReportType(input.reportType);
    if (!input.company?.companyId || !input.posting?.postingId || !input.application?.applicationId) {
      throw this.validation("company, posting, and application are required.");
    }
    if (!input.posting.jobDescription?.trim()) {
      throw this.validation("posting.jobDescription is required.");
    }
    this.validateCriteria(input.criteria);
    this.validateAnswers(input.answers);
  }

  private validateAnswerEvaluation(input: AnswerEvaluationRequest): void {
    this.validateReportType(input.reportType);
    this.validateCriteria(input.criteria);
    this.validateAnswers(input.answers);
  }

  private validateCommunicationAnalysis(input: CommunicationAnalysisRequest): void {
    this.validateReportType(input.reportType);
    if (!input.consentConfirmed) {
      throw this.validation("consentConfirmed is required for communication analysis.");
    }
    if (!input.mediaQuality) {
      throw this.validation("mediaQuality is required.");
    }
  }

  private validateGenerateReport(input: GenerateReportRequest): void {
    this.validateReportType(input.reportType);
    if (!input.jobDescription?.trim()) {
      throw this.validation("jobDescription is required.");
    }
    this.validateCriteria(input.criteria);
    this.validateAnswers(input.answers);
  }

  private validateReportType(reportType: ReportType): void {
    if (!["RECRUITING_REPORT", "MOCK_INTERVIEW_REPORT"].includes(reportType)) {
      throw this.validation("reportType is invalid.");
    }
  }

  private validateCriteria(criteria: GenerateReportRequest["criteria"]): void {
    if (!Array.isArray(criteria) || criteria.length === 0) {
      throw this.validation("criteria is required.");
    }
    for (const criterion of criteria) {
      if (!Number.isInteger(criterion.criterionId) || criterion.criterionId <= 0 || !criterion.name?.trim()) {
        throw this.validation("criterionId and criterion name are required.");
      }
    }
  }

  private validateAnswers(answers: GenerateReportRequest["answers"]): void {
    if (!Array.isArray(answers) || answers.length === 0) {
      throw this.validation("answers is required.");
    }
    for (const answer of answers) {
      if (!Number.isInteger(answer.answerId) || answer.answerId <= 0) {
        throw this.validation("answerId is required.");
      }
      if (answer.evaluationStatus !== "STT_UNAVAILABLE" && !answer.transcript?.trim()) {
        throw this.validation("answer transcript is required unless evaluationStatus is STT_UNAVAILABLE.");
      }
    }
  }

  private validation(message: string): BadRequestException {
    return new BadRequestException({
      code: "COMMON_VALIDATION_FAILED",
      message
    });
  }

  private failure(category: FailureReason["category"], reason: string): FailureReason {
    return { category, reason, retryable: isRetryableFailureCategory(category) };
  }

  private toFailure(error: unknown, fallbackCategory: FailureReason["category"]): FailureReason {
    if (error instanceof BadRequestException) {
      return this.failure("NON_RETRYABLE", error.message);
    }
    return this.failure(fallbackCategory, error instanceof Error ? error.message : "unknown AI report failure");
  }
}
