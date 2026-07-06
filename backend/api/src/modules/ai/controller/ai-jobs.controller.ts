import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DevAuthAdapter } from "../../../common/dev-auth/dev-auth.adapter";
import { CurrentUser } from "../../../common/dev-auth/current-user";
import { ApiDevAuthHeaders, ApiEnvelopeResponse, ApiErrorResponses, ApiOperationId, ApiParamId } from "../../../swagger/swagger.decorators";
import {
  CriteriaSuggestRequestDto,
  DocumentExtractRequestDto,
  FollowUpQuestionRequestDto,
  MockQuestionGenerateRequestDto,
  PostingDraftGenerateRequestDto,
  QuestionGenerateRequestDto,
  QuestionSetGenerateRequestDto,
  SttRequestDto,
} from "../dto/ai-job.dto";
import { AiJobResponseDto } from "../../report/dto/report-response.dto";
import { AiJobDispatcherService } from "../../report/service/ai-job-dispatcher.service";
import { AiProcessNotFoundError, REPORT_REPOSITORY, ReportRepository } from "../../report/repository/report.repository";
import { AiProcessType, QueuedAiProcessSnapshot } from "../../report/report.types";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";

type HeaderMap = Record<string, string | string[] | undefined>;
type CandidateAiRequest = {
  headers: HeaderMap;
  currentUser?: {
    userId: number;
    userType: CurrentUser["userType"];
    companyId?: number | null;
    candidateId?: number | null;
  };
};
type CompanyAiRequest = CandidateAiRequest;
type AiJobRequestedBy = {
  userId?: unknown;
  userType?: unknown;
  companyId?: unknown;
  candidateId?: unknown;
};

@ApiTags("Candidate AI Jobs")
@ApiBearerAuth("bearer")
@ApiDevAuthHeaders()
@ApiErrorResponses()
@UseGuards(JwtAuthGuard)
@Controller("candidate")
export class CandidateAiJobsController {
  constructor(
    @Inject(DevAuthAdapter) private readonly devAuthAdapter: DevAuthAdapter,
    @Inject(AiJobDispatcherService) private readonly dispatcher: AiJobDispatcherService
  ) {}

  @Post("documents/extract")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-076")
  @ApiOperation({ summary: "서류 텍스트 추출 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async extractDocument(@Req() request: CandidateAiRequest, @Body() body: DocumentExtractRequestDto) {
    const currentUser = this.candidate(request);
    this.requirePositive(body.applicationId, "applicationId");
    this.requirePositive(body.documentId, "documentId");
    this.requirePositive(body.fileId, "fileId");
    this.requireText(body.s3Key, "s3Key");
    this.forbidRawPayload(body, ["fileContent", "rawContent", "base64", "fileBytes"]);

    return this.dispatcher.dispatch({
      processType: "DOCUMENT_EXTRACT",
      input: this.input("DOCUMENT_EXTRACT", body, currentUser),
      refs: { applicationId: Number(body.applicationId) }
    });
  }

  @Post("mock-interviews/:sessionId/stt")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-050")
  @ApiOperation({ summary: "모의면접 STT 작업 생성" })
  @ApiParamId("sessionId", "모의면접 세션 ID")
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async transcribeMockInterview(@Param("sessionId") sessionIdParam: string, @Req() request: CandidateAiRequest, @Body() body: SttRequestDto) {
    return this.transcribe("MOCK_INTERVIEW_STT", sessionIdParam, request, body);
  }

  @Post("interviews/:sessionId/stt")
  @HttpCode(HttpStatus.ACCEPTED)
  async transcribeRecruitingInterview(
    @Param("sessionId") sessionIdParam: string,
    @Req() request: CandidateAiRequest,
    @Body() body: SttRequestDto
  ) {
    return this.transcribe("RECRUITING_INTERVIEW_STT", sessionIdParam, request, body);
  }

  @Post("mock-interviews/:sessionId/follow-up-question")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-051")
  @ApiOperation({ summary: "모의면접 꼬리질문 생성 작업 생성" })
  @ApiParamId("sessionId", "모의면접 세션 ID")
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async mockFollowUp(@Param("sessionId") sessionIdParam: string, @Req() request: CandidateAiRequest, @Body() body: FollowUpQuestionRequestDto) {
    return this.followUp("MOCK_FOLLOW_UP", sessionIdParam, request, body);
  }

  @Post("interviews/:sessionId/follow-up-question")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-071")
  @ApiOperation({ summary: "채용면접 꼬리질문 생성 작업 생성" })
  @ApiParamId("sessionId", "채용면접 세션 ID")
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async recruitingFollowUp(@Param("sessionId") sessionIdParam: string, @Req() request: CandidateAiRequest, @Body() body: FollowUpQuestionRequestDto) {
    return this.followUp("RECRUITING_FOLLOW_UP", sessionIdParam, request, body);
  }

  @Post("mock-interviews/questions/generate")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-045")
  @ApiOperation({ summary: "연습용 질문 목록 구성 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async generateMockQuestions(@Req() request: CandidateAiRequest, @Body() body: MockQuestionGenerateRequestDto) {
    const currentUser = this.candidate(request);
    this.requirePositive(body.questionCount, "questionCount");

    return this.dispatcher.dispatch({
      processType: "QUESTION_GENERATE",
      input: this.input("MOCK_QUESTION_GENERATE", body, currentUser)
    });
  }

  private async transcribe(kind: string, sessionIdParam: string, request: CandidateAiRequest, body: SttRequestDto) {
    const currentUser = this.candidate(request);
    const sessionId = this.parseId(sessionIdParam, "sessionId");
    this.requirePositive(body.answerId, "answerId");
    this.requirePositive(body.audioFileId, "audioFileId");
    this.requireText(body.audioS3Key, "audioS3Key");
    this.forbidRawPayload(body, ["audioContent", "audioBase64", "fileContent", "rawContent", "base64", "fileBytes"]);

    return this.dispatcher.dispatch({
      processType: "STT",
      input: this.input(kind, { ...body, sessionId }, currentUser),
      refs: { sessionId }
    });
  }

  private async followUp(kind: string, sessionIdParam: string, request: CandidateAiRequest, body: FollowUpQuestionRequestDto) {
    const currentUser = this.candidate(request);
    const sessionId = this.parseId(sessionIdParam, "sessionId");
    this.requirePositive(body.answerId, "answerId");
    this.requireText(body.previousQuestion, "previousQuestion");
    this.requireText(body.transcript, "transcript");
    if (kind === "RECRUITING_FOLLOW_UP") {
      this.requireAnyText(body, ["jobDescription", "documentSummary"]);
    }

    return this.dispatcher.dispatch({
      processType: "FOLLOW_UP",
      input: this.input(kind, { ...body, sessionId }, currentUser),
      refs: { sessionId }
    });
  }

  private candidate(request: CandidateAiRequest): CurrentUser {
    const currentUser = request.currentUser
      ? {
          userId: request.currentUser.userId,
          userType: request.currentUser.userType,
          companyId: request.currentUser.companyId ?? undefined,
          candidateId: request.currentUser.candidateId ?? undefined,
        }
      : this.devAuthAdapter.parse(request.headers);
    this.devAuthAdapter.assertCandidate(currentUser);
    return currentUser;
  }

  private input(kind: string, body: object, currentUser: CurrentUser) {
    return {
      kind,
      requestedBy: {
        userId: currentUser.userId,
        userType: currentUser.userType,
        candidateId: currentUser.candidateId
      },
      payload: body
    };
  }

  private parseId(value: string, name: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw this.validation(`${name} must be a positive integer.`);
    }
    return parsed;
  }

  private requirePositive(value: unknown, name: string): void {
    if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
      throw this.validation(`${name} must be a positive integer.`);
    }
  }

  private requireText(value: unknown, name: string): void {
    if (typeof value !== "string" || !value.trim()) {
      throw this.validation(`${name} is required.`);
    }
  }

  private requireAnyText(body: object, names: string[]): void {
    const payload = body as Record<string, unknown>;
    if (!names.some((name) => typeof payload[name] === "string" && String(payload[name]).trim())) {
      throw this.validation(`${names.join(" or ")} is required.`);
    }
  }

  private forbidRawPayload(body: object, names: string[]): void {
    const payload = body as Record<string, unknown>;
    const providedName = names.find((name) => payload[name] !== undefined && payload[name] !== null);
    if (providedName) {
      throw this.validation(`${providedName} must not be sent. Use fileId and S3 object key references.`);
    }
  }

  private validation(message: string): BadRequestException {
    return new BadRequestException({
      code: "COMMON_VALIDATION_FAILED",
      message
    });
  }
}

@ApiTags("Company AI Jobs")
@ApiBearerAuth("bearer")
@ApiDevAuthHeaders()
@ApiErrorResponses()
@UseGuards(JwtAuthGuard)
@Controller("company/recruitments")
export class CompanyRecruitmentAiJobsController {
  constructor(
    @Inject(DevAuthAdapter) private readonly devAuthAdapter: DevAuthAdapter,
    @Inject(AiJobDispatcherService) private readonly dispatcher: AiJobDispatcherService
  ) {}

  @Post("ai-draft")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-085")
  @ApiOperation({ summary: "공고 생성 AI 초안 작성 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async generatePostingDraft(@Req() request: CompanyAiRequest, @Body() body: PostingDraftGenerateRequestDto) {
    const currentUser = this.company(request);
    this.requireText(body.title, "title");
    this.requireText(body.jobRole, "jobRole");

    return this.dispatcher.dispatch({
      processType: "POSTING_DRAFT_GENERATE",
      input: {
        kind: "POSTING_DRAFT_GENERATE",
        requestedBy: {
          userId: currentUser.userId,
          userType: currentUser.userType,
          companyId: currentUser.companyId
        },
        payload: {
          title: body.title.trim(),
          jobRole: body.jobRole.trim(),
          keywords: Array.isArray(body.keywords) ? body.keywords.filter((keyword) => typeof keyword === "string" && keyword.trim()).map((keyword) => keyword.trim()) : [],
          summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
          careerRequirement: typeof body.careerRequirement === "string" ? body.careerRequirement.trim() : undefined,
          employmentType: typeof body.employmentType === "string" ? body.employmentType.trim() : undefined,
          workLocation: typeof body.workLocation === "string" ? body.workLocation.trim() : undefined
        }
      }
    });
  }

  private company(request: CompanyAiRequest): CurrentUser {
    const currentUser = request.currentUser
      ? {
          userId: request.currentUser.userId,
          userType: request.currentUser.userType,
          companyId: request.currentUser.companyId ?? undefined,
          candidateId: request.currentUser.candidateId ?? undefined,
        }
      : this.devAuthAdapter.parse(request.headers);
    this.devAuthAdapter.assertCompany(currentUser);
    return currentUser;
  }

  private requireText(value: unknown, name: string): void {
    if (typeof value !== "string" || !value.trim()) {
      throw this.validation(`${name} is required.`);
    }
  }

  private validation(message: string): BadRequestException {
    return new BadRequestException({
      code: "COMMON_VALIDATION_FAILED",
      message
    });
  }
}

@ApiTags("Company AI Jobs")
@ApiBearerAuth("bearer")
@ApiDevAuthHeaders()
@ApiErrorResponses()
@UseGuards(JwtAuthGuard)
@Controller("company/interviews")
export class CompanyAiJobsController {
  constructor(
    @Inject(DevAuthAdapter) private readonly devAuthAdapter: DevAuthAdapter,
    @Inject(AiJobDispatcherService) private readonly dispatcher: AiJobDispatcherService
  ) {}

  @Post("evaluation-criteria/suggest")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-035")
  @ApiOperation({ summary: "AI 평가 역량 태그 추천 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async suggestCriteria(@Req() request: CompanyAiRequest, @Body() body: CriteriaSuggestRequestDto) {
    this.requirePositive(body.postingId, "postingId");
    this.requireText(body.jobDescription, "jobDescription");
    this.requireText(body.talentProfile, "talentProfile");
    this.requireText(body.evaluationPolicy, "evaluationPolicy");

    return this.dispatchCompanyJob("CRITERIA_SUGGEST", "CRITERIA_SUGGEST", request, body);
  }

  @Post("questions/generate")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-038")
  @ApiOperation({ summary: "JD 기반 직무 질문 생성 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async generateQuestions(@Req() request: CompanyAiRequest, @Body() body: QuestionGenerateRequestDto) {
    this.requirePositive(body.postingId, "postingId");
    this.requireText(body.jobDescription, "jobDescription");
    this.requirePositive(body.questionCount, "questionCount");

    return this.dispatchCompanyJob("QUESTION_GENERATE", "RECRUITING_QUESTION_GENERATE", request, body);
  }

  @Post("question-sets")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-039")
  @ApiOperation({ summary: "면접 질문 목록 구성 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async generateQuestionSet(@Req() request: CompanyAiRequest, @Body() body: QuestionSetGenerateRequestDto) {
    this.requirePositive(body.postingId, "postingId");
    this.requirePositive(body.questionCount, "questionCount");
    this.requireNonEmptyArray(body.criteria, "criteria");
    this.requireNonEmptyArray(body.questionTypes, "questionTypes");

    return this.dispatchCompanyJob("QUESTION_SET_GENERATE", "QUESTION_SET_GENERATE", request, body);
  }

  private async dispatchCompanyJob(processType: AiProcessType, kind: string, request: CompanyAiRequest, body: object) {
    const currentUser = this.company(request);

    return this.dispatcher.dispatch({
      processType,
      input: {
        kind,
        requestedBy: {
          userId: currentUser.userId,
          userType: currentUser.userType,
          companyId: currentUser.companyId
        },
        payload: body
      }
    });
  }

  private company(request: CompanyAiRequest): CurrentUser {
    const currentUser = request.currentUser
      ? {
          userId: request.currentUser.userId,
          userType: request.currentUser.userType,
          companyId: request.currentUser.companyId ?? undefined,
          candidateId: request.currentUser.candidateId ?? undefined,
        }
      : this.devAuthAdapter.parse(request.headers);
    this.devAuthAdapter.assertCompany(currentUser);
    return currentUser;
  }

  private requirePositive(value: unknown, name: string): void {
    if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
      throw this.validation(`${name} must be a positive integer.`);
    }
  }

  private requireText(value: unknown, name: string): void {
    if (typeof value !== "string" || !value.trim()) {
      throw this.validation(`${name} is required.`);
    }
  }

  private requireNonEmptyArray(value: unknown, name: string): void {
    if (!Array.isArray(value) || value.length === 0) {
      throw this.validation(`${name} is required.`);
    }
  }

  private validation(message: string): BadRequestException {
    return new BadRequestException({
      code: "COMMON_VALIDATION_FAILED",
      message
    });
  }
}

@ApiTags("AI Job Status")
@ApiBearerAuth("bearer")
@ApiDevAuthHeaders()
@ApiErrorResponses()
@UseGuards(JwtAuthGuard)
@Controller("ai/jobs")
export class AiJobsStatusController {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly repository: ReportRepository
  ) {}

  @Get(":processLogId/status")
  @ApiOperationId("API-080")
  @ApiOperation({ summary: "AI 작업 상태 조회" })
  @ApiParamId("processLogId", "AI process log ID")
  @ApiEnvelopeResponse(AiJobResponseDto)
  async getStatus(@Req() request: CandidateAiRequest, @Param("processLogId") processLogIdParam: string) {
    const processLogId = this.parseId(processLogIdParam, "processLogId");
    const currentUser = this.authenticatedUser(request);

    try {
      const process = await this.repository.getProcess(processLogId);
      this.assertProcessVisibleToUser(process, currentUser);
      return process;
    } catch (error) {
      if (error instanceof AiProcessNotFoundError) {
        throw new NotFoundException({
          code: "AI_PROCESS_NOT_FOUND",
          message: error.message
        });
      }
      throw error;
    }
  }

  private authenticatedUser(request: CandidateAiRequest): CurrentUser {
    if (!request.currentUser) {
      throw new ForbiddenException({
        code: "AI_PROCESS_FORBIDDEN",
        message: "AI 작업 상태를 조회할 수 없습니다."
      });
    }
    return {
      userId: request.currentUser.userId,
      userType: request.currentUser.userType,
      companyId: request.currentUser.companyId ?? undefined,
      candidateId: request.currentUser.candidateId ?? undefined
    };
  }

  private assertProcessVisibleToUser(process: QueuedAiProcessSnapshot, currentUser: CurrentUser): void {
    if (currentUser.userType === "ADMIN") return;

    const requestedBy = this.readRequestedBy(process.inputRef);
    if (!requestedBy || requestedBy.userType !== currentUser.userType) {
      throw this.forbiddenProcess();
    }

    if (currentUser.userType === "COMPANY") {
      const companyId = this.toPositiveNumber(requestedBy.companyId);
      const userId = this.toPositiveNumber(requestedBy.userId);
      if ((currentUser.companyId && companyId === currentUser.companyId) || userId === currentUser.userId) return;
      throw this.forbiddenProcess();
    }

    if (currentUser.userType === "CANDIDATE") {
      const candidateId = this.toPositiveNumber(requestedBy.candidateId);
      const userId = this.toPositiveNumber(requestedBy.userId);
      if ((currentUser.candidateId && candidateId === currentUser.candidateId) || userId === currentUser.userId) return;
      throw this.forbiddenProcess();
    }

    throw this.forbiddenProcess();
  }

  private readRequestedBy(inputRef: string): AiJobRequestedBy | undefined {
    try {
      const parsed = JSON.parse(inputRef) as unknown;
      if (!this.isRecord(parsed)) return undefined;
      const requestedBy = parsed.requestedBy;
      return this.isRecord(requestedBy) ? requestedBy : undefined;
    } catch {
      return undefined;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private forbiddenProcess(): ForbiddenException {
    return new ForbiddenException({
      code: "AI_PROCESS_FORBIDDEN",
      message: "AI 작업 상태를 조회할 수 없습니다."
    });
  }

  private parseId(value: string, name: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException({
        code: "COMMON_VALIDATION_FAILED",
        message: `${name} must be a positive integer.`
      });
    }
    return parsed;
  }
}
