import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DevAuthAdapter } from "../../../common/dev-auth/dev-auth.adapter";
import { CurrentUser } from "../../../common/dev-auth/current-user";
import { ApiDevAuthHeaders, ApiEnvelopeResponse, ApiErrorResponses, ApiOperationId, ApiParamId } from "../../../swagger/swagger.decorators";
import {
  DocumentExtractRequestDto,
  FollowUpQuestionRequestDto,
  MockQuestionGenerateRequestDto,
  POSTING_DRAFT_INPUT_LIMITS,
  PostingDraftGenerateRequestDto,
  QuestionGenerateRequestDto,
  SttRequestDto,
} from "../dto/ai-job.dto";
import { AiJobResponseDto } from "../../report/dto/report-response.dto";
import { AiJobDispatcherService } from "../../report/service/ai-job-dispatcher.service";
import { AiProcessNotFoundError, REPORT_REPOSITORY, ReportRepository } from "../../report/repository/report.repository";
import { AiProcessType, QueuedAiProcessSnapshot } from "../../report/report.types";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CandidateDomainError, CandidateService, type CandidateFolderContext, type CandidateProfileAiContextV1, type CurrentCandidateUser } from "../../candidate";
import { InterviewService } from "../../interview";
import { CompanyInterviewService } from "../../company-interview/company-interview.service";
import { getValidationTextLength } from "../../../shared/api-validation";

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
    @Inject(AiJobDispatcherService) private readonly dispatcher: AiJobDispatcherService,
    @Inject(CandidateService) private readonly candidateService: CandidateService,
    @Inject(InterviewService) private readonly interviewService: InterviewService
  ) {}

  @Post("documents/extract")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-076")
  @ApiOperation({ summary: "서류 텍스트 추출 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async extractDocument(@Req() request: CandidateAiRequest, @Body() body: DocumentExtractRequestDto) {
    return this.handleCandidateDomain(async () => {
      const currentUser = this.candidate(request);
      this.requirePositive(body.applicationId, "applicationId");
      this.requirePositive(body.documentId, "documentId");
      this.requirePositive(body.fileId, "fileId");
      this.forbidRawPayload(body, ["fileContent", "rawContent", "base64", "fileBytes"]);

      const payload = await this.candidateService.buildDocumentExtractAiPayload(
        {
          applicationId: Number(body.applicationId),
          documentId: Number(body.documentId),
          fileId: Number(body.fileId),
        },
        currentUser,
      );

      return this.dispatcher.dispatch({
        processType: "DOCUMENT_EXTRACT",
        input: this.input("DOCUMENT_EXTRACT", payload, currentUser),
        refs: { applicationId: Number(body.applicationId) }
      });
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
    return this.handleCandidateDomain(async () => {
      const currentUser = this.candidate(request);
      this.requirePositive(body.questionCount, "questionCount");
      const payload: Record<string, unknown> = { ...body };
      const persistedPayload: Record<string, unknown> = { ...body };
      const profileContext = body.folderId !== undefined && body.folderId !== null
        ? await this.candidateService.getCandidateFolderProfileAiContext(Number(body.folderId), currentUser)
        : await this.candidateService.getCandidateProfileAiContext(currentUser);
      const profileUpdatedAt = await this.candidateService.getCandidateProfileUpdatedAt(currentUser);
      payload.profileContext = profileContext;
      persistedPayload.profileContext = this.toProfileContextLogRef(profileContext, profileUpdatedAt);
      if (body.folderId !== undefined && body.folderId !== null) {
        this.requirePositive(body.folderId, "folderId");
        const folderContext = await this.candidateService.getMockInterviewFolderContext(Number(body.folderId), currentUser);
        payload.folderContext = this.toMockQuestionFolderContext(folderContext);
        persistedPayload.folderContext = this.toMockQuestionFolderLogRef(folderContext);
      }

      return this.dispatcher.dispatch({
        processType: "QUESTION_GENERATE",
        input: this.input("MOCK_QUESTION_GENERATE", payload, currentUser),
        persistedInput: this.input("MOCK_QUESTION_GENERATE", persistedPayload, currentUser),
      });
    });
  }

  private async transcribe(kind: string, sessionIdParam: string, request: CandidateAiRequest, body: SttRequestDto) {
    return this.handleCandidateDomain(async () => {
      const currentUser = this.candidate(request);
      const sessionId = this.parseId(sessionIdParam, "sessionId");
      this.requirePositive(body.answerId, "answerId");
      this.requirePositive(body.audioFileId, "audioFileId");
      this.forbidRawPayload(body, ["audioContent", "audioBase64", "fileContent", "rawContent", "base64", "fileBytes"]);

      const payload = await this.interviewService.buildCanonicalSttPayload(
        sessionId,
        Number(body.answerId),
        Number(body.audioFileId),
        currentUser,
      );

      return this.dispatcher.dispatch({
        processType: "STT",
        input: this.input(kind, payload, currentUser),
        refs: { sessionId }
      });
    });
  }

  private async followUp(kind: string, sessionIdParam: string, request: CandidateAiRequest, body: FollowUpQuestionRequestDto) {
    return this.handleCandidateDomain(async () => {
      const currentUser = this.candidate(request);
      const sessionId = this.parseId(sessionIdParam, "sessionId");
      this.requirePositive(body.answerId, "answerId");
      this.requireText(body.previousQuestion, "previousQuestion");
      this.requireText(body.transcript, "transcript");
      if (kind === "RECRUITING_FOLLOW_UP") {
        this.requireAnyText(body, ["jobDescription", "documentSummary"]);
      }
      const profileContext = await this.candidateService.getCandidateProfileAiContext(currentUser);
      const profileUpdatedAt = await this.candidateService.getCandidateProfileUpdatedAt(currentUser);
      const payload = { ...body, sessionId, profileContext };
      const persistedPayload = {
        ...body,
        sessionId,
        profileContext: this.toProfileContextLogRef(profileContext, profileUpdatedAt),
      };

      return this.dispatcher.dispatch({
        processType: "FOLLOW_UP",
        input: this.input(kind, payload, currentUser),
        persistedInput: this.input(kind, persistedPayload, currentUser),
        refs: { sessionId }
      });
    });
  }

  private candidate(request: CandidateAiRequest): CurrentCandidateUser {
    const currentUser = request.currentUser
      ? {
          userId: request.currentUser.userId,
          userType: request.currentUser.userType,
          companyId: request.currentUser.companyId ?? undefined,
          candidateId: request.currentUser.candidateId ?? undefined,
        }
      : this.devAuthAdapter.parse(request.headers);
    this.devAuthAdapter.assertCandidate(currentUser);
    const candidateId = Number(currentUser.candidateId);
    if (currentUser.userType !== "CANDIDATE" || !Number.isInteger(candidateId) || candidateId <= 0) {
      throw new ForbiddenException({
        code: "COMMON_FORBIDDEN",
        message: "Candidate permission is required.",
      });
    }
    return {
      userId: currentUser.userId,
      userType: "CANDIDATE",
      candidateId,
    };
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
      throw this.validation(`${providedName} must not be sent. Use fileId references.`);
    }
  }

  private toMockQuestionFolderContext(folder: CandidateFolderContext): Record<string, unknown> {
    return {
      folderId: folder.id,
      githubUrl: folder.githubUrl,
      blogUrl: folder.blogUrl,
      portfolioUrl: folder.portfolioUrl,
      motivation: folder.motivation,
      extraNote: folder.extraNote,
      resumeFile: folder.resumeFile
        ? {
            fileId: folder.resumeFile.fileId,
            mimeType: folder.resumeFile.mimeType,
            sizeBytes: folder.resumeFile.sizeBytes,
          }
        : null,
      resumeExtractedText: folder.resumeExtractedText,
    };
  }

  private toMockQuestionFolderLogRef(folder: CandidateFolderContext): Record<string, unknown> {
    return {
      folderId: folder.id,
      resumeFileId: folder.resumeFile?.fileId ?? null,
      fields: {
        githubUrl: Boolean(folder.githubUrl),
        blogUrl: Boolean(folder.blogUrl),
        portfolioUrl: Boolean(folder.portfolioUrl),
        motivationLength: folder.motivation?.length ?? 0,
        extraNoteLength: folder.extraNote?.length ?? 0,
        resumeExtractedTextLength: folder.resumeExtractedText?.length ?? 0,
      },
      scrubbed: true,
    };
  }

  private toProfileContextLogRef(context: CandidateProfileAiContextV1, profileUpdatedAt: string | null): Record<string, unknown> {
    const serialized = JSON.stringify(context);
    return {
      schemaVersion: context.schemaVersion,
      counts: {
        educations: context.educations.length,
        careers: context.careers.length,
        activities: context.activities.length,
        credentials: context.credentials.length,
      },
      charLength: serialized.length,
      contextHash: createHash("sha256").update(serialized).digest("hex"),
      profileUpdatedAt,
      scrubbed: true,
    };
  }

  private async handleCandidateDomain<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof CandidateDomainError) {
        throw new HttpException(
          { code: error.code, message: error.message, details: error.details },
          error.statusCode,
        );
      }
      throw error;
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
    @Inject(AiJobDispatcherService) private readonly dispatcher: AiJobDispatcherService,
  ) {}

  @Post("ai-draft")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-085")
  @ApiOperation({ summary: "공고 생성 AI 초안 작성 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async generatePostingDraft(@Req() request: CompanyAiRequest, @Body() body: PostingDraftGenerateRequestDto) {
    const currentUser = this.company(request);
    const title = this.requiredBoundedText(body.title, "title", POSTING_DRAFT_INPUT_LIMITS.titleMaxLength);
    const jobRole = this.requiredBoundedText(body.jobRole, "jobRole", POSTING_DRAFT_INPUT_LIMITS.jobRoleMaxLength);
    const keywords = this.normalizedKeywords(body.keywords);
    const summary = this.optionalBoundedText(body.summary, "summary", POSTING_DRAFT_INPUT_LIMITS.summaryMaxLength);
    const careerRequirement = this.optionalBoundedText(
      body.careerRequirement,
      "careerRequirement",
      POSTING_DRAFT_INPUT_LIMITS.careerRequirementMaxLength
    );
    const employmentType = this.optionalBoundedText(
      body.employmentType,
      "employmentType",
      POSTING_DRAFT_INPUT_LIMITS.employmentTypeMaxLength
    );
    const workLocation = this.optionalBoundedText(
      body.workLocation,
      "workLocation",
      POSTING_DRAFT_INPUT_LIMITS.workLocationMaxLength
    );

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
          title,
          jobRole,
          keywords,
          summary,
          careerRequirement,
          employmentType,
          workLocation
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

  private requiredBoundedText(value: unknown, name: string, maxLength: number): string {
    this.requireText(value, name);
    const normalized = String(value).trim();
    if (getValidationTextLength(normalized) > maxLength) {
      throw this.validation(`${name} must be ${maxLength} characters or fewer.`);
    }
    return normalized;
  }

  private optionalBoundedText(value: unknown, name: string, maxLength: number): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw this.validation(`${name} must be a string.`);
    }
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    if (getValidationTextLength(normalized) > maxLength) {
      throw this.validation(`${name} must be ${maxLength} characters or fewer.`);
    }
    return normalized;
  }

  private normalizedKeywords(value: unknown): string[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw this.validation("keywords must be an array.");
    }
    if (value.length > POSTING_DRAFT_INPUT_LIMITS.keywordMaxCount) {
      throw this.validation(`keywords must contain ${POSTING_DRAFT_INPUT_LIMITS.keywordMaxCount} items or fewer.`);
    }

    return value
      .map((keyword, index) => {
        if (typeof keyword !== "string") {
          throw this.validation(`keywords[${index}] must be a string.`);
        }
        const normalized = keyword.trim();
        if (getValidationTextLength(normalized) > POSTING_DRAFT_INPUT_LIMITS.keywordMaxLength) {
          throw this.validation(`keywords[${index}] must be ${POSTING_DRAFT_INPUT_LIMITS.keywordMaxLength} characters or fewer.`);
        }
        return normalized;
      })
      .filter((keyword) => keyword.length > 0);
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
    @Inject(AiJobDispatcherService) private readonly dispatcher: AiJobDispatcherService,
    @Inject(CompanyInterviewService) private readonly companyInterviewService: CompanyInterviewService,
  ) {}

  @Post("questions/generate")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperationId("API-038")
  @ApiOperation({ summary: "JD 기반 직무 질문 생성 작업 생성" })
  @ApiEnvelopeResponse(AiJobResponseDto, 202)
  async generateQuestions(@Req() request: CompanyAiRequest, @Body() body: QuestionGenerateRequestDto) {
    const currentUser = this.company(request);
    const payload = await this.companyInterviewService.prepareCommonQuestionGeneration(
      { ...currentUser, companyId: currentUser.companyId ?? null, candidateId: currentUser.candidateId ?? null },
      body,
    );
    return this.dispatchCompanyJob("QUESTION_GENERATE", "RECRUITING_QUESTION_GENERATE", request, payload);
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
        code: "COMMON_FORBIDDEN",
        message: "AI job status is only available to the job owner."
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
      if (userId === currentUser.userId && currentUser.companyId && companyId === currentUser.companyId) return;
      throw this.forbiddenProcess();
    }

    if (currentUser.userType === "CANDIDATE") {
      const candidateId = this.toPositiveNumber(requestedBy.candidateId);
      const userId = this.toPositiveNumber(requestedBy.userId);
      if (userId === currentUser.userId && currentUser.candidateId && candidateId === currentUser.candidateId) return;
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
      code: "COMMON_FORBIDDEN",
      message: "AI job status is only available to the job owner."
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
