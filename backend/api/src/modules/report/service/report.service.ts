import { Inject, Injectable } from "@nestjs/common";
import {
  CandidateDomainError,
  CandidateService,
  type ApiListResponse,
  type ApiResponse,
  type CurrentCandidateUser,
  type FileAsset,
  type ReportStatus,
} from "../../candidate";
import {
  INTERVIEW_REPOSITORY,
  type InterviewAnswer,
  type InterviewQuestion,
  type InterviewRepository,
  type RuntimeInterviewSession,
} from "../../interview";
import {
  CandidateAiProcessView,
  CandidateApplicationStatusView,
  CandidateFollowUpQuestionView,
  CandidateMockInterviewHistoryItem,
  CandidateMockReportFeedback,
  CandidateMockReportMedia,
  CandidateMockReportMediaItem,
  CandidateMockReportSummary,
  CandidateRecruitingReportView,
  CandidateReportAnswerView,
  CandidateReportEvidenceView,
  CandidateReportFileReference,
  CandidateReportGenerationHandoff,
  CandidateReportScoreView,
} from "../candidate-report.types";
import {
  CANDIDATE_REPORT_REPOSITORY,
  type CandidateAiProcessRecord,
  type CandidateFollowUpQuestionRecord,
  type CandidateReportCriterionRecord,
  type CandidateReportEvidenceRecord,
  type CandidateReportRepository,
  type CandidateReportScoreRecord,
  type CandidateStoredReport,
} from "../repository/candidate-report.repository";
import {
  type EvaluationCriterionInput,
  type GenerateReportRequest,
  type InterviewAnswerInput as ReportInterviewAnswerInput,
  type ReportType,
} from "../report.types";
import { AiJobDispatcherService } from "./ai-job-dispatcher.service";
import { buildDefaultReportCriteria, normalizeReportCriterionName } from "./service-interview-rubric";

type ReportAnswerSession = Pick<RuntimeInterviewSession, "sessionId" | "interviewType" | "showQuestionText">;
type ReportGenerationKind = "MOCK_REPORT_GENERATE" | "RECRUITING_REPORT_GENERATE";
const DEFAULT_STT_UNAVAILABLE_REASON =
  "STT 실패로 transcript가 없어 임시 0점 처리되었습니다. 이 점수는 답변 품질이 아니라 음성 인식 실패에 따른 임시 처리입니다.";
type ReportGenerationInput = {
  reportId: number;
  applicationId?: number;
  reportType: ReportType;
  kind: ReportGenerationKind;
  session: ReportAnswerSession;
  postingId?: number;
  companyName?: string;
  jobTitle?: string;
  jobRole?: string;
  jobDescription: string;
  currentUser: CurrentCandidateUser;
};
type BuiltReportGenerationInput = {
  reportId: number;
  applicationId?: number;
  sessionId: number;
  reportType: ReportType;
  answerIds: number[];
  fileIds: number[];
  input: {
    kind: ReportGenerationKind;
    requestedBy: {
      userId: number;
      userType: CurrentCandidateUser["userType"];
      candidateId: number;
    };
    payload: GenerateReportRequest & {
      reportId: number;
      applicationId?: number;
      sessionId: number;
    };
  };
};

@Injectable()
export class ReportService {
  constructor(
    @Inject(CandidateService) private readonly candidateService: CandidateService,
    @Inject(INTERVIEW_REPOSITORY) private readonly interviewRepository: InterviewRepository,
    @Inject(CANDIDATE_REPORT_REPOSITORY) private readonly candidateReportRepository: CandidateReportRepository,
    @Inject(AiJobDispatcherService) private readonly aiJobDispatcher: AiJobDispatcherService,
  ) {}

  async listMockReports(currentUser: CurrentCandidateUser): Promise<ApiListResponse<CandidateMockReportSummary>> {
    const sessions = await this.interviewRepository.listOwnedMockSessions(currentUser.candidateId);
    const items = await Promise.all(sessions.map((session) => this.toMockReportSummary(session)));

    return this.listEnvelope(items);
  }

  async listMockInterviewHistory(currentUser: CurrentCandidateUser): Promise<ApiListResponse<CandidateMockInterviewHistoryItem>> {
    const sessions = await this.interviewRepository.listOwnedMockSessions(currentUser.candidateId);
    const items = await Promise.all(sessions.map((session) => this.toMockHistoryItem(session)));

    return this.listEnvelope(items);
  }

  async getMockReportFeedback(
    reportId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateMockReportFeedback>> {
    const session = await this.getOwnedMockReportSession(reportId, currentUser);
    const report = await this.candidateReportRepository.findLatestReportBySession(
      session.sessionId,
      "MOCK_INTERVIEW_REPORT",
    );
    const process = await this.candidateReportRepository.findLatestReportProcessBySession(session.sessionId);
    const status = await this.resolveMockReportStatus(session, report, process);

    if (status === "PENDING") {
      this.throwReportNotReady(reportId);
    }

    if (status === "GENERATING") {
      return this.envelope({
        reportId,
        sessionId: session.sessionId,
        reportType: "MOCK_INTERVIEW_REPORT",
        status,
        aiProcess: this.toAiProcessView(process),
        summary: "모의면접 피드백을 생성하는 중입니다.",
        strengths: [],
        improvements: [],
        nextPractice: [],
        scores: [],
        visibilityPolicy: this.mockFeedbackVisibilityPolicy(),
      });
    }

    if (status === "FAILED") {
      return this.envelope({
        reportId,
        sessionId: session.sessionId,
        reportType: "MOCK_INTERVIEW_REPORT",
        status,
        aiProcess: this.toAiProcessView(process),
        summary: report?.failureReason ?? process?.failureReason ?? "모의면접 피드백 생성에 실패했습니다.",
        strengths: [],
        improvements: ["잠시 후 리포트 생성을 다시 요청해 주세요."],
        nextPractice: [],
        scores: report ? this.toCandidateScores(report.scores) : [],
        visibilityPolicy: this.mockFeedbackVisibilityPolicy(),
      });
    }

    if (!report) {
      this.throwReportNotReady(reportId);
    }

    const scores = this.toCandidateScores(report.scores);
    const totalScore = this.toCandidateFacingTotalScore(report.totalScore, scores);
    return this.envelope({
      reportId,
      sessionId: session.sessionId,
      reportType: "MOCK_INTERVIEW_REPORT",
      status: report.status,
      aiProcess: this.toAiProcessView(process),
      generatedAt: report.generatedAt,
      totalScore,
      summary: this.toCandidateFacingSummary(report.summary, totalScore),
      strengths: this.deriveStrengths(report.scores),
      improvements: this.deriveImprovements(report.scores),
      nextPractice: this.deriveNextPractice(report.scores),
      scores,
      visibilityPolicy: this.mockFeedbackVisibilityPolicy(),
    });
  }

  async getMockReportMedia(
    reportId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateMockReportMedia>> {
    const session = await this.getOwnedMockReportSession(reportId, currentUser);
    if (session.status !== "COMPLETED") {
      this.throwReportNotReady(reportId);
    }

    const report = await this.candidateReportRepository.findLatestReportBySession(
      session.sessionId,
      "MOCK_INTERVIEW_REPORT",
    );
    const process = await this.candidateReportRepository.findLatestReportProcessBySession(session.sessionId);
    const status = await this.resolveMockReportStatus(session, report, process);
    const answers = await this.interviewRepository.listAnswersBySession(session.sessionId);
    const followUpsByAnswerId = await this.followUpsByAnswerId(answers);
    const unavailableReasonsByAnswerId = this.sttUnavailableReasonsByAnswerId(report);
    const media = await Promise.all(
      answers.map((answer) =>
        this.toMockReportMediaItem(
          answer,
          session,
          currentUser,
          followUpsByAnswerId,
          this.transcriptUnavailableReasonForAnswer(
            answer,
            this.cleanOptionalText(answer.transcript),
            report,
            unavailableReasonsByAnswerId,
          ),
        ),
      ),
    );

    return this.envelope({
      reportId,
      sessionId: session.sessionId,
      reportType: "MOCK_INTERVIEW_REPORT",
      status,
      media,
    });
  }

  async requestMockReportGeneration(
    reportId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateReportGenerationHandoff>> {
    const session = await this.getOwnedMockReportSession(reportId, currentUser);
    if (session.status !== "COMPLETED") {
      this.throwReportNotReady(reportId);
    }

    const reportInput = await this.buildReportGenerationInput({
      reportId,
      reportType: "MOCK_INTERVIEW_REPORT",
      kind: "MOCK_REPORT_GENERATE",
      session,
      companyName: "모의면접",
      jobTitle: "연습 면접",
      jobRole: "Practice",
      jobDescription: "Mock interview practice session",
      currentUser,
    });
    const dispatched = await this.aiJobDispatcher.dispatchReportGeneration({
      reportId,
      reportType: "MOCK_INTERVIEW_REPORT",
      input: reportInput.input,
      refs: { sessionId: session.sessionId },
    });

    await this.candidateReportRepository.saveMockReportStatus(reportId, dispatched.report.status);
    return this.envelope(this.toReportGenerationHandoff(reportInput, dispatched));
  }

  async requestApplicationReportGeneration(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateReportGenerationHandoff>> {
    const { application, session, job } = await this.candidateService.getOwnedApplicationReportContext(
      applicationId,
      currentUser,
    );
    if (session.status !== "COMPLETED") {
      this.throwReportNotReady(applicationId);
    }

    const reportId = session.sessionId;
    const reportInput = await this.buildReportGenerationInput({
      reportId,
      applicationId: application.applicationId,
      reportType: "RECRUITING_REPORT",
      kind: "RECRUITING_REPORT_GENERATE",
      session,
      postingId: application.postingId,
      companyName: job.companyName,
      jobTitle: job.title,
      jobRole: job.jobRole,
      jobDescription: job.jobDescription,
      currentUser,
    });
    const dispatched = await this.aiJobDispatcher.dispatchReportGeneration({
      reportId,
      reportType: "RECRUITING_REPORT",
      input: reportInput.input,
      refs: { applicationId: application.applicationId, sessionId: session.sessionId },
    });

    return this.envelope(this.toReportGenerationHandoff(reportInput, dispatched));
  }

  async getApplicationStatus(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateApplicationStatusView>> {
    const { application, session, job } = await this.candidateService.getOwnedApplicationReportContext(
      applicationId,
      currentUser,
    );
    const report = await this.candidateReportRepository.findLatestReportByApplication(
      application.applicationId,
      session.sessionId,
    );
    const process = await this.candidateReportRepository.findLatestReportProcessByApplication(
      application.applicationId,
      session.sessionId,
    );
    const reportStatus = this.resolveReportStatus(application.reportStatus, report, process);

    return this.envelope({
      applicationId: application.applicationId,
      postingId: application.postingId,
      companyName: job.companyName,
      jobTitle: job.title,
      jobRole: job.jobRole,
      applicationStatus: application.applicationStatus,
      documentStatus: application.documentStatus,
      interviewStatus: application.interviewStatus,
      reportStatus,
      sessionId: session.sessionId,
      interviewSessionStatus: session.status,
      submittedAt: application.submittedAt,
      updatedAt: application.updatedAt,
      reportAvailable: reportStatus === "COMPLETED" && Boolean(report),
    });
  }

  async getApplicationReport(
    applicationId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<ApiResponse<CandidateRecruitingReportView>> {
    const { application, session, job } = await this.candidateService.getOwnedApplicationReportContext(
      applicationId,
      currentUser,
    );

    if (session.status !== "COMPLETED") {
      this.throwReportNotReady(applicationId);
    }

    const report = await this.candidateReportRepository.findLatestReportByApplication(
      application.applicationId,
      session.sessionId,
    );
    const process = await this.candidateReportRepository.findLatestReportProcessByApplication(
      application.applicationId,
      session.sessionId,
    );
    const status = this.resolveReportStatus(application.reportStatus, report, process);

    const base = {
      applicationId: application.applicationId,
      sessionId: session.sessionId,
      reportType: "RECRUITING_REPORT" as const,
      status,
      applicationStatus: application.applicationStatus,
      interviewStatus: application.interviewStatus,
      companyName: job.companyName,
      jobTitle: job.title,
      reportId: report?.reportId,
      aiProcess: this.toAiProcessView(process),
      generatedAt: report?.generatedAt,
      totalScore: undefined,
      summary: undefined,
      scores: [] as CandidateReportScoreView[],
      answers: [] as CandidateReportAnswerView[],
      visibilityPolicy: this.recruitingVisibilityPolicy(),
    };

    if (status === "PENDING") {
      return this.envelope({
        ...base,
        candidateMessage: "면접 답변은 제출되었고 분석 요청을 기다리는 중입니다.",
        nextStepLabel: "분석 대기",
      });
    }

    if (status === "GENERATING") {
      return this.envelope({
        ...base,
        candidateMessage: "면접 분석이 진행 중입니다. 분석이 완료되면 기업 검토 단계로 전달됩니다.",
        nextStepLabel: "분석 진행 중",
      });
    }

    if (status === "FAILED") {
      return this.envelope({
        ...base,
        candidateMessage: report?.failureReason ?? process?.failureReason ?? "면접 분석을 완료하지 못했습니다.",
        nextStepLabel: "분석 재시도 필요",
      });
    }

    return this.envelope({
      ...base,
      candidateMessage: "AI 분석이 완료되어 기업 검토 단계로 전달되었습니다.",
      nextStepLabel: "기업 검토 대기",
    });
  }

  private async buildReportGenerationInput(args: ReportGenerationInput): Promise<BuiltReportGenerationInput> {
    const answers = await this.interviewRepository.listAnswersBySession(args.session.sessionId);
    if (answers.length === 0) {
      throw new CandidateDomainError("COMMON_CONFLICT", "Report generation requires interview answers.", 409, [
        { field: "answers", reason: "answers are missing" },
      ]);
    }

    const body: GenerateReportRequest = {
      reportType: args.reportType,
      ...(args.companyName ? { companyName: args.companyName } : {}),
      ...(args.jobTitle ? { jobTitle: args.jobTitle } : {}),
      ...(args.jobRole ? { jobRole: args.jobRole } : {}),
      ...(args.postingId !== undefined ? { postingId: args.postingId } : {}),
      jobDescription: this.cleanOptionalText(args.jobDescription) ?? "Interview report generation",
      criteria: await this.reportCriteria(args.reportType, args.postingId, answers),
      answers: await this.reportAnswerInputs(answers, args.reportType),
    };

    return {
      reportId: args.reportId,
      ...(args.applicationId !== undefined ? { applicationId: args.applicationId } : {}),
      sessionId: args.session.sessionId,
      reportType: args.reportType,
      answerIds: answers.map((answer) => answer.answerId),
      fileIds: this.uniqueFileIds(answers),
      input: {
        kind: args.kind,
        requestedBy: {
          userId: args.currentUser.userId,
          userType: args.currentUser.userType,
          candidateId: args.currentUser.candidateId,
        },
        payload: {
          ...body,
          reportId: args.reportId,
          ...(args.applicationId !== undefined ? { applicationId: args.applicationId } : {}),
          sessionId: args.session.sessionId,
        },
      },
    };
  }

  private async reportAnswerInputs(
    answers: InterviewAnswer[],
    reportType: ReportType,
  ): Promise<ReportInterviewAnswerInput[]> {
    const followUpsByAnswerId = await this.followUpsByAnswerId(answers);
    const parentAnswerIdByFollowUpContent = new Map<string, number>();
    for (const [answerId, followUps] of followUpsByAnswerId.entries()) {
      for (const followUp of followUps) {
        parentAnswerIdByFollowUpContent.set(this.normalizeQuestionContent(followUp.content), answerId);
      }
    }

    return Promise.all(
      answers.map(async (answer) => {
        const transcript = this.cleanOptionalText(answer.transcript);
        const question = await this.interviewRepository.findQuestion(answer.questionId);
        const isFollowUpAnswer = question?.questionType === "FOLLOW_UP";
        const parentAnswerId = isFollowUpAnswer
          ? parentAnswerIdByFollowUpContent.get(this.normalizeQuestionContent(question?.content))
          : undefined;
        const unavailableReason = DEFAULT_STT_UNAVAILABLE_REASON;
        return {
          answerId: answer.answerId,
          questionId: answer.questionId,
          question: question?.content ?? `Interview question ${answer.questionId}`,
          ...(question?.questionType ? { questionType: question.questionType } : {}),
          ...(question?.sortOrder !== undefined ? { sortOrder: question.sortOrder } : {}),
          ...(isFollowUpAnswer ? { isFollowUpAnswer: true } : {}),
          ...(parentAnswerId !== undefined ? { parentAnswerId } : {}),
          ...(transcript ? { transcript } : {}),
          ...(reportType === "MOCK_INTERVIEW_REPORT" && answer.nonverbalMetadata
            ? { nonverbalMetadata: answer.nonverbalMetadata }
            : {}),
          evaluationStatus: transcript ? "EVALUATED" : "STT_UNAVAILABLE",
          transcriptUnavailableReason: transcript ? undefined : unavailableReason,
        };
      }),
    );
  }

  private async reportCriteria(
    reportType: ReportType,
    postingId: number | undefined,
    answers: InterviewAnswer[],
  ): Promise<EvaluationCriterionInput[]> {
    if (postingId !== undefined) {
      const storedCriteria = await this.candidateReportRepository.listEvaluationCriteriaByPosting(postingId);
      if (storedCriteria.length > 0) {
        return storedCriteria.map((criterion) => this.toEvaluationCriterionInput(criterion));
      }
    }

    if (reportType === "RECRUITING_REPORT") {
      return this.defaultReportCriteria(reportType);
    }

    const questionCriteria = await this.reportCriteriaFromQuestions(answers);
    return questionCriteria.length > 0 ? questionCriteria : this.defaultReportCriteria(reportType);
  }

  private async reportCriteriaFromQuestions(answers: InterviewAnswer[]): Promise<EvaluationCriterionInput[]> {
    const criteriaById = new Map<number, EvaluationCriterionInput>();
    for (const answer of answers) {
      const question = await this.interviewRepository.findQuestion(answer.questionId);
      if (!question?.criterionId || criteriaById.has(question.criterionId)) {
        continue;
      }
      criteriaById.set(question.criterionId, {
        criterionId: question.criterionId,
        name: this.questionCriterionName(question),
        description: question.content,
        weight: 1,
      });
    }

    const criteria = [...criteriaById.values()];
    const weight = criteria.length > 0 ? Math.max(1, Math.floor(100 / criteria.length)) : 100;
    return criteria.map((criterion) => ({ ...criterion, weight }));
  }

  private toEvaluationCriterionInput(criterion: CandidateReportCriterionRecord): EvaluationCriterionInput {
    return {
      criterionId: criterion.criterionId,
      name: criterion.name,
      description: criterion.description,
      weight: criterion.weight,
    };
  }

  private defaultReportCriteria(reportType: ReportType): EvaluationCriterionInput[] {
    return buildDefaultReportCriteria(reportType);
  }

  private questionCriterionName(question: InterviewQuestion): string {
    return `${this.questionTypeLabel(question.questionType)} question`;
  }

  private questionTypeLabel(questionType: InterviewQuestion["questionType"]): string {
    return {
      INTRO: "Intro",
      TECHNICAL: "Technical",
      EXPERIENCE: "Experience",
      SITUATION: "Situation",
      FOLLOW_UP: "Follow-up",
      CLOSING: "Closing",
    }[questionType];
  }

  private toReportGenerationHandoff(
    input: BuiltReportGenerationInput,
    dispatched: Awaited<ReturnType<AiJobDispatcherService["dispatchReportGeneration"]>>,
  ): CandidateReportGenerationHandoff {
    return {
      accepted: dispatched.queued,
      queued: dispatched.queued,
      processLogId: dispatched.processLogId,
      processType: "REPORT_GENERATE",
      status: dispatched.status,
      reportStatus: dispatched.report.status,
      reportId: input.reportId,
      sessionId: input.sessionId,
      ...(input.applicationId !== undefined ? { applicationId: input.applicationId } : {}),
      reportType: input.reportType,
      answerIds: input.answerIds,
      fileIds: input.fileIds,
      callbackTopic: "ai.report.generate.requested",
      inputRef: dispatched.inputRef,
    };
  }

  private async getOwnedMockReportSession(
    reportId: number,
    currentUser: CurrentCandidateUser,
  ): Promise<RuntimeInterviewSession> {
    this.assertPositiveIntegerId(reportId, "reportId");
    const session = await this.interviewRepository.findMockSession(reportId);
    if (!session) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview session was not found.", 404, [
        { field: "reportId", reason: "mock interview report not found" },
      ]);
    }
    if (session.candidateId !== currentUser.candidateId) {
      throw new CandidateDomainError("COMMON_FORBIDDEN", "Interview session does not belong to current candidate.", 403, [
        { field: "reportId", reason: "candidate owner mismatch" },
      ]);
    }
    return session;
  }

  private async toMockReportSummary(session: RuntimeInterviewSession): Promise<CandidateMockReportSummary> {
    const reportId = session.sessionId;
    return {
      ...(await this.toMockHistoryItem(session)),
      reportType: "MOCK_INTERVIEW_REPORT",
      feedbackEndpoint: `/api/v1/candidate/mock-interview/reports/${reportId}/feedback`,
      mediaEndpoint: `/api/v1/candidate/mock-interview/reports/${reportId}/media`,
      generateEndpoint: `/api/v1/candidate/mock-interview/reports/${reportId}/generate`,
    };
  }

  private async toMockHistoryItem(session: RuntimeInterviewSession): Promise<CandidateMockInterviewHistoryItem> {
    const report = await this.candidateReportRepository.findLatestReportBySession(
      session.sessionId,
      "MOCK_INTERVIEW_REPORT",
    );
    const process = await this.candidateReportRepository.findLatestReportProcessBySession(session.sessionId);
    return {
      sessionId: session.sessionId,
      reportId: session.sessionId,
      interviewType: "MOCK",
      status: session.status,
      reportStatus: await this.resolveMockReportStatus(session, report, process),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      updatedAt: session.updatedAt,
      totalQuestions: session.questionIds.length,
      answeredCount: await this.interviewRepository.countAnswersBySession(session.sessionId),
    };
  }

  private async toMockReportMediaItem(
    answer: InterviewAnswer,
    session: RuntimeInterviewSession,
    currentUser: CurrentCandidateUser,
    followUpsByAnswerId: Map<number, CandidateFollowUpQuestionView[]>,
    transcriptUnavailableReason?: string,
  ): Promise<CandidateMockReportMediaItem> {
    const question = await this.interviewRepository.findQuestion(answer.questionId);
    if (!question) {
      throw new CandidateDomainError("COMMON_NOT_FOUND", "Interview question was not found.", 404, [
        { field: "questionId", reason: "question not found" },
      ]);
    }
    return {
      answerId: answer.answerId,
      questionId: answer.questionId,
      questionType: question.questionType,
      sortOrder: question.sortOrder,
      questionContent: session.showQuestionText ? question.content : undefined,
      videoFile: answer.videoFileId
        ? this.toFileReference(await this.candidateService.getInterviewFileAsset(answer.videoFileId, currentUser, "videoFileId"))
        : undefined,
      audioFile: answer.audioFileId
        ? this.toFileReference(await this.candidateService.getInterviewFileAsset(answer.audioFileId, currentUser, "audioFileId"))
        : undefined,
      durationSeconds: answer.durationSeconds,
      submittedAt: answer.submittedAt,
      transcriptStatus: this.toTranscriptStatus(answer.transcript, transcriptUnavailableReason),
      transcript: this.cleanOptionalText(answer.transcript),
      nonverbalMetadata: answer.nonverbalMetadata,
      evaluationStatus: transcriptUnavailableReason ? "STT_UNAVAILABLE" : this.cleanOptionalText(answer.transcript) ? "EVALUATED" : undefined,
      transcriptUnavailableReason,
      followUpQuestions: followUpsByAnswerId.get(answer.answerId) ?? [],
    };
  }

  private async toCandidateReportAnswers(
    session: ReportAnswerSession,
    report?: CandidateStoredReport,
  ): Promise<CandidateReportAnswerView[]> {
    const answers = await this.interviewRepository.listAnswersBySession(session.sessionId);
    const followUpsByAnswerId = await this.followUpsByAnswerId(answers);
    const evidencesByAnswerId = this.evidencesByAnswerId(report?.scores ?? []);
    const unavailableReasonsByAnswerId = this.sttUnavailableReasonsByAnswerId(report);

    return Promise.all(
      answers.map(async (answer) => {
        const question = await this.interviewRepository.findQuestion(answer.questionId);
        const transcript = this.cleanOptionalText(answer.transcript);
        const transcriptUnavailableReason = this.transcriptUnavailableReasonForAnswer(
          answer,
          transcript,
          report,
          unavailableReasonsByAnswerId,
        );
        return {
          answerId: answer.answerId,
          questionId: answer.questionId,
          questionType: question?.questionType,
          sortOrder: question?.sortOrder,
          questionContent: this.visibleQuestionContent(session, question),
          durationSeconds: answer.durationSeconds,
          submittedAt: answer.submittedAt,
          transcriptStatus: this.toTranscriptStatus(answer.transcript, transcriptUnavailableReason),
          transcript,
          nonverbalMetadata: answer.nonverbalMetadata,
          evaluationStatus: transcriptUnavailableReason ? "STT_UNAVAILABLE" : transcript ? "EVALUATED" : undefined,
          transcriptUnavailableReason,
          followUpQuestions: followUpsByAnswerId.get(answer.answerId) ?? [],
          evidences: evidencesByAnswerId.get(answer.answerId) ?? [],
        };
      }),
    );
  }

  private visibleQuestionContent(
    session: ReportAnswerSession,
    question: InterviewQuestion | undefined,
  ): string | undefined {
    if (!question) {
      return undefined;
    }
    return session.showQuestionText || session.interviewType === "RECRUITING" ? question.content : undefined;
  }

  private async followUpsByAnswerId(answers: InterviewAnswer[]): Promise<Map<number, CandidateFollowUpQuestionView[]>> {
    const followUps = await this.candidateReportRepository.listFollowUpQuestionsByAnswerIds(
      answers.map((answer) => answer.answerId),
    );
    return followUps.reduce((map, followUp) => {
      const items = map.get(followUp.answerId) ?? [];
      items.push(this.toFollowUpView(followUp));
      map.set(followUp.answerId, items);
      return map;
    }, new Map<number, CandidateFollowUpQuestionView[]>());
  }

  private evidencesByAnswerId(scores: CandidateReportScoreRecord[]): Map<number, CandidateReportEvidenceView[]> {
    return scores
      .flatMap((score) => score.evidences)
      .reduce((map, evidence) => {
        if (!evidence.answerId) {
          return map;
        }
        const items = map.get(evidence.answerId) ?? [];
        items.push(this.toCandidateEvidence(evidence));
        map.set(evidence.answerId, items);
        return map;
      }, new Map<number, CandidateReportEvidenceView[]>());
  }

  private sttUnavailableReasonsByAnswerId(report?: CandidateStoredReport): Map<number, string> {
    const reasons = new Map<number, string>();
    if (report?.status !== "COMPLETED") {
      return reasons;
    }

    for (const score of report.scores) {
      for (const evidence of score.evidences) {
        if (!evidence.answerId || !this.isSttUnavailableScore(score, evidence)) {
          continue;
        }
        reasons.set(evidence.answerId, score.rationale ?? evidence.evidenceText ?? DEFAULT_STT_UNAVAILABLE_REASON);
      }
    }

    return reasons;
  }

  private transcriptUnavailableReasonForAnswer(
    answer: InterviewAnswer,
    transcript: string | undefined,
    report: CandidateStoredReport | undefined,
    unavailableReasonsByAnswerId: Map<number, string>,
  ): string | undefined {
    if (transcript) {
      return undefined;
    }
    return unavailableReasonsByAnswerId.get(answer.answerId) ?? (report?.status === "COMPLETED" ? DEFAULT_STT_UNAVAILABLE_REASON : undefined);
  }

  private isSttUnavailableScore(
    score: CandidateReportScoreRecord,
    evidence: CandidateReportEvidenceRecord,
  ): boolean {
    const text = `${score.rationale ?? ""} ${evidence.evidenceText ?? ""}`.toUpperCase();
    return score.score === 0 && (text.includes("STT") || text.includes("음성 인식"));
  }

  private toFileReference(fileAsset: FileAsset): CandidateReportFileReference {
    return {
      fileId: fileAsset.fileId,
      storageKey: fileAsset.storageKey,
      originalName: fileAsset.originalName,
      mimeType: fileAsset.mimeType,
      sizeBytes: fileAsset.sizeBytes,
      status: fileAsset.status,
      createdAt: fileAsset.createdAt,
    };
  }

  private async resolveMockReportStatus(
    session: RuntimeInterviewSession,
    report?: CandidateStoredReport,
    process?: CandidateAiProcessRecord,
  ): Promise<ReportStatus> {
    const overriddenStatus = await this.candidateReportRepository.findMockReportStatus(session.sessionId);
    return this.resolveReportStatus(session.status === "COMPLETED" ? "PENDING" : "PENDING", report, process, overriddenStatus);
  }

  private resolveReportStatus(
    fallback: ReportStatus,
    report?: CandidateStoredReport,
    process?: CandidateAiProcessRecord,
    overriddenStatus?: ReportStatus,
  ): ReportStatus {
    if (report) {
      return report.status;
    }
    if (process?.status === "FAILED") {
      return "FAILED";
    }
    if (process) {
      return "GENERATING";
    }
    return overriddenStatus ?? fallback;
  }

  private uniqueFileIds(answers: InterviewAnswer[]): number[] {
    return [
      ...new Set(
        answers.flatMap((answer) => [answer.videoFileId, answer.audioFileId]).filter((fileId): fileId is number => Boolean(fileId)),
      ),
    ];
  }

  private mockFeedbackVisibilityPolicy(): CandidateMockReportFeedback["visibilityPolicy"] {
    return {
      candidateFacingOnly: true,
      excludesHiringDecision: true,
      excludesInternalScores: true,
      excludesCompanyMemo: true,
    };
  }

  private recruitingVisibilityPolicy(): CandidateRecruitingReportView["visibilityPolicy"] {
    return {
      candidateFacingOnly: true,
      excludesDetailedScores: true,
      excludesEvaluationEvidence: true,
      excludesInternalMemo: true,
      excludesManualEvaluation: true,
    };
  }

  private toCandidateScores(scores: CandidateReportScoreRecord[]): CandidateReportScoreView[] {
    return scores.map((score) => {
      const criterionName = this.displayCriterionName(score);
      const candidateScore = this.toCandidateFacingScore(score.score);
      return {
        scoreId: score.scoreId,
        criterionId: score.criterionId,
        criterionName,
        score: candidateScore,
        rationale: this.toCandidateFacingRationale(score.rationale, criterionName, candidateScore),
        evidences: score.evidences.map((evidence) => this.toCandidateEvidence(evidence)),
      };
    });
  }

  private toCandidateFacingTotalScore(totalScore: number | undefined, scores: CandidateReportScoreView[]): number | undefined {
    if (scores.length > 0) {
      return Math.round(scores.reduce((sum, score) => sum + score.score, 0) / scores.length);
    }
    return totalScore === undefined ? undefined : this.toCandidateFacingScore(totalScore);
  }

  private toCandidateFacingScore(score: number): number {
    if (score >= 90) {
      return 86;
    }
    if (score >= 85) {
      return score - 4;
    }
    if (score >= 80) {
      return score - 3;
    }
    if (score >= 75) {
      return score - 2;
    }
    return score;
  }

  private toCandidateFacingRationale(
    rationale: string | undefined,
    criterionName: string | undefined,
    score: number,
  ): string | undefined {
    if (!criterionName) {
      return rationale ? `이 항목은 ${score}점입니다. 답변 내용과 제출된 근거를 바탕으로 산정했습니다.` : undefined;
    }
    const subject = `${criterionName}${this.topicParticle(criterionName)}`;
    const base = `${subject} ${score}점입니다.`;

    if (criterionName === "직무 적합성") {
      return `${base} JD와 연결되는 기술 경험과 역할 이해가 답변에서 확인됩니다. 선택 이유와 적용 결과를 함께 말하면 더 설득력 있습니다.`;
    }
    if (criterionName === "문제 해결력") {
      return `${base} 문제를 단계로 나누어 확인하려는 흐름이 보입니다. 원인, 시도한 방법, 최종 결과를 더 분명히 연결해 보세요.`;
    }
    if (criterionName === "실행력과 성과") {
      return `${base} 직접 맡은 작업 흐름은 드러납니다. 완료 기준이나 개선 효과를 수치 또는 전후 비교로 보강하면 좋습니다.`;
    }
    if (criterionName === "학습 민첩성") {
      return `${base} 새로 익힌 내용을 실제 문제에 적용한 점이 보입니다. 학습 전후의 변화나 다음 적용 계획을 더하면 좋습니다.`;
    }
    if (criterionName === "커뮤니케이션") {
      return `${base} 상황과 역할을 설명하는 흐름이 있습니다. 함께 일한 대상, 조율 방식, 공유 결과를 덧붙이면 전달력이 좋아집니다.`;
    }
    if (criterionName === "성장 가능성") {
      return `${base} 문제를 검증하고 개선하려는 태도가 보입니다. 회고, 재발 방지, 다음 계획까지 설명하면 성장 가능성이 더 잘 드러납니다.`;
    }

    return `${base} 답변 내용과 제출된 근거를 바탕으로 산정했습니다. 구체적인 행동과 결과를 더 보강해 보세요.`;
  }

  private toCandidateFacingSummary(summary: string | undefined, score: number | undefined): string | undefined {
    if (!summary || score === undefined) {
      return summary;
    }
    return summary.replace(/총점은\s+\d+점/g, `총점은 ${score}점`);
  }

  private toCandidateEvidence(evidence: CandidateReportEvidenceRecord): CandidateReportEvidenceView {
    return {
      evidenceId: evidence.evidenceId,
      sourceType: evidence.sourceType,
      answerId: evidence.answerId,
      documentId: evidence.documentId,
      documentRef: evidence.documentRef,
      evidenceText: evidence.evidenceText,
    };
  }

  private toFollowUpView(followUp: CandidateFollowUpQuestionRecord): CandidateFollowUpQuestionView {
    return {
      followUpId: followUp.followUpId,
      content: followUp.content,
      generationStatus: followUp.generationStatus,
      policy: followUp.policy,
      createdAt: followUp.createdAt,
    };
  }

  private toAiProcessView(process?: CandidateAiProcessRecord): CandidateAiProcessView | undefined {
    if (!process) {
      return undefined;
    }
    return {
      processLogId: process.processLogId,
      processType: process.processType,
      status: process.status,
      failureCategory: process.failureCategory,
      failureReason: process.failureReason,
      createdAt: process.createdAt,
    };
  }

  private toTranscriptStatus(transcript?: string, transcriptUnavailableReason?: string): "PENDING" | "AVAILABLE" | "UNAVAILABLE" {
    if (this.cleanOptionalText(transcript)) {
      return "AVAILABLE";
    }
    return transcriptUnavailableReason ? "UNAVAILABLE" : "PENDING";
  }

  private cleanOptionalText(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private normalizeQuestionContent(value?: string): string {
    return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
  }

  private deriveStrengths(scores: CandidateReportScoreRecord[]): string[] {
    return scores
      .filter((score) => score.score >= 80)
      .sort((left, right) => right.score - left.score)
      .map((score) => `${this.displayCriterionName(score) ?? "평가 항목"}에서 답변 근거가 비교적 잘 드러났습니다.`)
      .slice(0, 3);
  }

  private deriveImprovements(scores: CandidateReportScoreRecord[]): string[] {
    const improvementTargets = scores
      .filter((score) => score.score < 80)
      .sort((left, right) => left.score - right.score);
    const targets = improvementTargets.length > 0 ? improvementTargets : [...scores].sort((left, right) => left.score - right.score);

    return targets
      .map((score) => `${this.displayCriterionName(score) ?? "평가 항목"} 답변은 상황, 본인 행동, 결과를 더 구분해서 말하면 좋아집니다.`)
      .slice(0, 3);
  }

  private deriveNextPractice(scores: CandidateReportScoreRecord[]): string[] {
    const lowScores = scores.filter((score) => score.score < 70);
    if (lowScores.length === 0) {
      return scores.length > 0 ? ["저장된 STT와 근거를 기준으로 답변 흐름을 다시 점검해 보세요."] : [];
    }
    return lowScores
      .map((score) => `${this.displayCriterionName(score) ?? "평가 항목"} 답변을 더 구체적인 사례와 수치로 보강해 보세요.`)
      .slice(0, 3);
  }

  private displayCriterionName(score: CandidateReportScoreRecord): string | undefined {
    const name = score.criterionName ?? this.criterionNameFromRationale(score.rationale);
    return name ? normalizeReportCriterionName(name) : undefined;
  }

  private criterionNameFromRationale(rationale?: string): string | undefined {
    const match = rationale?.match(
      /^(직무 적합성|직무\/기술 역량|문제 해결력|실행력과 성과|학습 민첩성|협업\/커뮤니케이션|커뮤니케이션|학습\/성장성|책임감\/신뢰성|성장 가능성)(?:은|는)\s+\d+점/,
    );
    return match?.[1];
  }

  private topicParticle(value: string): "은" | "는" {
    const lastChar = value.trim().at(-1);
    if (!lastChar) return "은";
    const charCode = lastChar.charCodeAt(0);
    if (charCode < 0xac00 || charCode > 0xd7a3) return "은";
    return (charCode - 0xac00) % 28 === 0 ? "는" : "은";
  }

  private throwReportNotReady(id: number): never {
    throw new CandidateDomainError("REPORT_NOT_READY", "Report is not ready yet.", 409, [
      { field: "reportId", reason: `resource ${id} is pending or still being prepared` },
    ]);
  }

  private assertPositiveIntegerId(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1) {
      throw new CandidateDomainError("COMMON_VALIDATION_FAILED", "Path parameter is invalid.", 400, [
        { field, reason: `${field} must be a positive integer` },
      ]);
    }
  }

  private listEnvelope<T>(items: T[]): ApiListResponse<T> {
    return {
      data: { items },
      meta: {
        traceId: "local-candidate-module",
        timestamp: new Date().toISOString(),
        page: {
          page: 1,
          limit: Math.max(items.length, 1),
          totalItems: items.length,
          totalPages: items.length > 0 ? 1 : 0,
          hasNext: false,
        },
      },
    };
  }

  private envelope<T>(data: T): ApiResponse<T> {
    return {
      data,
      meta: {
        traceId: "local-candidate-module",
        timestamp: new Date().toISOString(),
      },
    };
  }
}
