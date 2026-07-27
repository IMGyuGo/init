import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DevAuthAdapter } from "../../../common/dev-auth/dev-auth.adapter";
import { ApiDevAuthHeaders, ApiEnvelopeResponse, ApiErrorResponses, ApiOperationId } from "../../../swagger/swagger.decorators";
import { GuardrailValidationRequestDto, GuardrailValidationResultDto } from "../dto/ai-job.dto";
import { GuardrailService } from "../../report/service/guardrail.service";
import { REPORT_REPOSITORY, ReportRepository } from "../../report/repository/report.repository";
import { GuardrailValidationRequest, GuardrailValidationResult } from "../../report/report.types";

type HeaderMap = Record<string, string | string[] | undefined>;

@ApiTags("AI Guardrails")
@ApiBearerAuth("bearer")
@ApiDevAuthHeaders()
@ApiErrorResponses()
@Controller("ai/guardrails")
export class AiGuardrailsController {
  constructor(
    @Inject(DevAuthAdapter) private readonly devAuthAdapter: DevAuthAdapter,
    @Inject(GuardrailService) private readonly guardrailService: GuardrailService,
    @Inject(REPORT_REPOSITORY) private readonly repository: ReportRepository
  ) {}

  @Post("validate")
  @HttpCode(HttpStatus.OK)
  @ApiOperationId("API-079")
  @ApiOperation({ summary: "AI 출력 안전성 검증" })
  @ApiEnvelopeResponse(GuardrailValidationResultDto)
  async validate(@Headers() headers: HeaderMap, @Body() body: GuardrailValidationRequestDto) {
    const currentUser = this.devAuthAdapter.parse(headers);
    this.devAuthAdapter.assertAdmin(currentUser);
    this.validateBody(body);

    let guardrail =
      body.target === "REPORT"
        ? this.guardrailService.validateReport(body.reportType, {
            summary: body.summary ?? "",
            totalScore: body.totalScore ?? 0,
            scores: body.scores,
            questionEvaluations: body.questionEvaluations ?? []
          })
        : this.guardrailService.validateScores(body.reportType, body.scores);

    if (body.regenerated) {
      guardrail = this.guardrailService.markRegenerated(guardrail, body.regenerationReason);
    }

    const policyName = body.policyName ?? "AI_GUARDRAIL_VALIDATE";
    const createdProcess = body.processLogId
      ? null
      : await this.repository.createQueuedProcess("GUARDRAIL_VALIDATE", this.guardrailInputRef(body, policyName));
    const processLogId = body.processLogId ?? createdProcess?.processLogId;
    if (!processLogId) {
      throw this.validation("processLogId could not be resolved.");
    }

    const result: GuardrailValidationResult = {
      target: body.target,
      processLogId,
      guardrail,
      guardrailLogId: await this.repository.saveGuardrailLog(processLogId, policyName, guardrail)
    };

    if (createdProcess) {
      await this.repository.markQueuedProcessCompleted(processLogId, JSON.stringify(result));
    }

    return result;
  }

  private validateBody(body: GuardrailValidationRequest): void {
    if (!body || !["RECRUITING_REPORT", "MOCK_INTERVIEW_REPORT"].includes(body.reportType)) {
      throw this.validation("reportType is invalid.");
    }
    if (!["REPORT", "SCORES"].includes(body.target)) {
      throw this.validation("target is invalid.");
    }
    if (!Array.isArray(body.scores)) {
      throw this.validation("scores is required.");
    }
    if (body.target === "REPORT" && !body.summary?.trim()) {
      throw this.validation("summary is required for report guardrail validation.");
    }
    if (body.processLogId && (!Number.isInteger(body.processLogId) || body.processLogId <= 0)) {
      throw this.validation("processLogId must be a positive integer.");
    }
    if (body.regenerated !== undefined && typeof body.regenerated !== "boolean") {
      throw this.validation("regenerated must be a boolean.");
    }
    if (body.regenerationReason !== undefined && typeof body.regenerationReason !== "string") {
      throw this.validation("regenerationReason must be a string.");
    }
  }

  private validation(message: string): BadRequestException {
    return new BadRequestException({
      code: "COMMON_VALIDATION_FAILED",
      message
    });
  }

  private guardrailInputRef(body: GuardrailValidationRequest, policyName: string): string {
    return JSON.stringify({
      reportType: body.reportType,
      target: body.target,
      policyName,
      regenerated: body.regenerated ?? false
    });
  }
}
