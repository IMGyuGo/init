import { Inject, Injectable } from "@nestjs/common";
import {
  CandidateDomainError,
  CandidateService,
  type ApiResponse,
  type ConsentType,
  type CurrentCandidateUser,
} from "../../candidate";
import { DeviceCheckDto } from "../dto/interview.device-check.dto";
import { AiInterviewRequestDto, CreateRealtimeInterviewSessionDto, InsertFollowUpQuestionDto, SaveInterviewAnswerDto } from "../dto/interview.runtime.dto";
import { InterviewService } from "../service/interview.service";
import type { UploadedInterviewMediaFile } from "../service/interview.service";
import {
  PUBLIC_APPLICATION_ACCESS_VERIFIER,
  type PublicApplicationAccessVerifier,
} from "./public-application-access.verifier";
import { PublicInterviewStartDto, type PublicInterviewStartResponse } from "./public-interview.dto";
import {
  type PublicInterviewAccess,
  PublicInterviewAccessTokenService,
} from "./public-interview-access-token.service";

const PUBLIC_INTERVIEW_REQUIRED_CONSENTS: ConsentType[] = [
  "PRIVACY_COLLECTION",
  "AI_DOCUMENT_ANALYSIS",
  "AI_INTERVIEW_RECORDING",
];

@Injectable()
export class PublicInterviewService {
  constructor(
    @Inject(PUBLIC_APPLICATION_ACCESS_VERIFIER)
    private readonly applicationAccessVerifier: PublicApplicationAccessVerifier,
    @Inject(PublicInterviewAccessTokenService)
    private readonly accessTokenService: PublicInterviewAccessTokenService,
    @Inject(CandidateService) private readonly candidateService: CandidateService,
    @Inject(InterviewService) private readonly interviewService: InterviewService,
  ) {}

  async startPublicInterview(
    applicationId: number,
    dto: PublicInterviewStartDto,
  ): Promise<ApiResponse<PublicInterviewStartResponse>> {
    this.assertPositiveIntegerId(applicationId, "applicationId");
    const token = dto.token ?? dto.magicToken;
    if (!token) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Public application token is required.", 400, [
        { field: "token", reason: "token or magicToken is required" },
      ]);
    }

    const verified = await this.applicationAccessVerifier.verifyApplicationToken(token);
    if (verified.applicationId !== applicationId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "Public application token does not match application.", 403, [
        { field: "applicationId", reason: "applicationId mismatch" },
      ]);
    }

    const { application, session, currentUser } = await this.candidateService.getPublicRecruitingInterviewContext(applicationId);
    await this.saveRequiredInterviewConsent(application.applicationId, currentUser);
    const publicAccessToken = this.accessTokenService.issue({
      applicationId: application.applicationId,
      sessionId: session.sessionId,
      candidateId: currentUser.candidateId,
      userId: currentUser.userId,
    });

    return this.envelope({
      sessionId: session.sessionId,
      applicationId: application.applicationId,
      interviewStatus: application.interviewStatus,
      interviewSessionStatus: session.status,
      runtimePath: this.runtimePath(application.applicationId, session.sessionId),
      publicAccessToken,
    });
  }

  async beginPublicInterview(applicationId: number, access: PublicInterviewAccess) {
    this.assertAccessApplication(applicationId, access);
    const currentUser = this.toCurrentCandidateUser(access);
    await this.saveRequiredInterviewConsent(applicationId, currentUser);
    const result = await this.interviewService.startInterview(applicationId, currentUser);
    return {
      ...result,
      data: {
        ...result.data,
        interviewUrl: this.runtimePath(applicationId, result.data.sessionId),
      },
    };
  }

  async getRuntime(applicationId: number, access: PublicInterviewAccess) {
    this.assertAccessApplication(applicationId, access);
    const result = await this.interviewService.getInterviewRuntime(applicationId, this.toCurrentCandidateUser(access));
    return {
      ...result,
      data: {
        ...result.data,
        nextQuestionEndpoint: `/api/v1/public/interviews/${result.data.sessionId}/next-question`,
        answerUploadEndpoint: `/api/v1/public/interviews/${result.data.sessionId}/answers`,
      },
    };
  }

  saveDeviceCheck(sessionId: number, dto: DeviceCheckDto, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.saveDeviceCheck(sessionId, dto, this.toCurrentCandidateUser(access));
  }

  listQuestions(sessionId: number, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.listRecruitingQuestions(sessionId, this.toCurrentCandidateUser(access));
  }

  saveAnswer(sessionId: number, dto: SaveInterviewAnswerDto, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.saveRecruitingAnswer(sessionId, dto, this.toCurrentCandidateUser(access));
  }

  uploadMedia(sessionId: number, file: UploadedInterviewMediaFile | undefined, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.uploadInterviewMedia(sessionId, file, this.toCurrentCandidateUser(access));
  }

  moveNextQuestion(sessionId: number, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.moveRecruitingNextQuestion(sessionId, this.toCurrentCandidateUser(access));
  }

  completeInterview(sessionId: number, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.completeRecruitingInterview(sessionId, this.toCurrentCandidateUser(access));
  }

  requestStt(sessionId: number, dto: AiInterviewRequestDto, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.requestRecruitingStt(sessionId, dto, this.toCurrentCandidateUser(access));
  }

  requestFollowUpQuestion(sessionId: number, dto: AiInterviewRequestDto, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.requestRecruitingFollowUpQuestion(sessionId, dto, this.toCurrentCandidateUser(access));
  }

  insertFollowUpQuestion(sessionId: number, dto: InsertFollowUpQuestionDto, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.insertRecruitingFollowUpQuestion(sessionId, dto, this.toCurrentCandidateUser(access));
  }

  createRealtimeSession(sessionId: number, dto: CreateRealtimeInterviewSessionDto, access: PublicInterviewAccess) {
    this.assertAccessSession(sessionId, access);
    return this.interviewService.createRecruitingRealtimeSession(sessionId, dto, this.toCurrentCandidateUser(access));
  }

  private assertAccessApplication(applicationId: number, access: PublicInterviewAccess): void {
    this.assertPositiveIntegerId(applicationId, "applicationId");
    if (access.applicationId !== applicationId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "Public interview access token does not match application.", 403, [
        { field: "applicationId", reason: "applicationId mismatch" },
      ]);
    }
  }

  private assertAccessSession(sessionId: number, access: PublicInterviewAccess): void {
    this.assertPositiveIntegerId(sessionId, "sessionId");
    if (access.sessionId !== sessionId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "Public interview access token does not match session.", 403, [
        { field: "sessionId", reason: "sessionId mismatch" },
      ]);
    }
  }

  private toCurrentCandidateUser(access: PublicInterviewAccess): CurrentCandidateUser {
    return {
      userId: access.userId,
      candidateId: access.candidateId,
      userType: "CANDIDATE",
    };
  }

  private runtimePath(applicationId: number, sessionId: number): string {
    return `/public/applications/${applicationId}/interview/runtime?sessionId=${sessionId}`;
  }

  private async saveRequiredInterviewConsent(applicationId: number, currentUser: CurrentCandidateUser): Promise<void> {
    await this.candidateService.saveInterviewConsent(
      applicationId,
      { consentTypes: PUBLIC_INTERVIEW_REQUIRED_CONSENTS },
      currentUser,
    );
  }

  private assertPositiveIntegerId(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Path parameter is invalid.", 400, [
        { field, reason: `${field} must be a positive integer` },
      ]);
    }
  }

  private envelope<T>(data: T): ApiResponse<T> {
    return {
      data,
      meta: {
        traceId: "local-public-interview",
        timestamp: new Date().toISOString(),
      },
    };
  }
}
