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

type ReportAnswerSession = Pick<RuntimeInterviewSession, "sessionId" | "interviewType" | "showQuestionText">;
type ReportGenerationKind = "MOCK_REPORT_GENERATE" | "RECRUITING_REPORT_GENERATE";
type ReportGenerationInput = {
  reportId: number;
  applicationId?: number;
  reportType: ReportType;
  kind: ReportGenerationKind;
  session: ReportAnswerSession;
  postingId?: number;
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
    return this.envelope({
      reportId,
      sessionId: session.sessionId,
      reportType: "MOCK_INTERVIEW_REPORT",
      status: report.status,
      aiProcess: this.toAiProcessView(process),
      generatedAt: report.generatedAt,
      totalScore: report.totalScore,
      summary: report.summary,
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
    const media = await Promise.all(
      answers.map((answer) => this.toMockReportMediaItem(answer, session, currentUser, followUpsByAnswerId)),
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
    const scores = report ? this.toCandidateScores(report.scores) : [];
    const answers = await this.toCandidateReportAnswers(session, report);

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
      totalScore: report?.totalScore,
      summary: report?.summary,
      scores,
      answers,
      visibilityPolicy: this.recruitingVisibilityPolicy(scores.length > 0),
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
        candidateMessage: "면접 분석이 진행 중입니다. STT와 꼬리질문이 먼저 도착하면 이 화면에 함께 표시됩니다.",
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
      candidateMessage: "AI 면접 분석 결과가 준비되었습니다.",
      nextStepLabel: "지원현황 확인",
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
      jobDescription: this.cleanOptionalText(args.jobDescription) ?? "Interview report generation",
      criteria: await this.reportCriteria(args.reportType, args.postingId, answers),
      answers: await this.reportAnswerInputs(answers),
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

  private async reportAnswerInputs(answers: InterviewAnswer[]): Promise<ReportInterviewAnswerInput[]> {
    const missingTranscriptAnswerIds: number[] = [];
    const reportAnswers = await Promise.all(
      answers.map(async (answer) => {
        const transcript = this.cleanOptionalText(answer.transcript);
        if (!transcript) {
          missingTranscriptAnswerIds.push(answer.answerId);
        }

        const question = await this.interviewRepository.findQuestion(answer.questionId);
        return {
          answerId: answer.answerId,
          question: question?.content ?? `Interview question ${answer.questionId}`,
          transcript: transcript ?? "",
        };
      }),
    );

    if (missingTranscriptAnswerIds.length > 0) {
      throw new CandidateDomainError("REPORT_INPUT_NOT_READY", "Report generation requires STT transcripts.", 409, [
        {
          field: "answers",
          reason: `transcript is missing for answerIds: ${missingTranscriptAnswerIds.join(", ")}`,
        },
      ]);
    }

    return reportAnswers;
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
    const prefix = reportType === "MOCK_INTERVIEW_REPORT" ? 9000 : 8000;
    return [
      {
        criterionId: prefix + 1,
        name: "Role fit",
        description: "Connects experience and decisions to the target role.",
        weight: 40,
      },
      {
        criterionId: prefix + 2,
        name: "Problem solving",
        description: "Explains constraints, tradeoffs, and outcomes with concrete evidence.",
        weight: 35,
      },
      {
        criterionId: prefix + 3,
        name: "Communication",
        description: "Presents answers in a structured and understandable way.",
        weight: 25,
      },
    ];
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
      transcriptStatus: this.toTranscriptStatus(answer.transcript),
      transcript: this.cleanOptionalText(answer.transcript),
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

    return Promise.all(
      answers.map(async (answer) => {
        const question = await this.interviewRepository.findQuestion(answer.questionId);
        return {
          answerId: answer.answerId,
          questionId: answer.questionId,
          questionType: question?.questionType,
          sortOrder: question?.sortOrder,
          questionContent: this.visibleQuestionContent(session, question),
          durationSeconds: answer.durationSeconds,
          submittedAt: answer.submittedAt,
          transcriptStatus: this.toTranscriptStatus(answer.transcript),
          transcript: this.cleanOptionalText(answer.transcript),
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

  private recruitingVisibilityPolicy(hasScores: boolean): CandidateRecruitingReportView["visibilityPolicy"] {
    return {
      candidateFacingOnly: true,
      excludesDetailedScores: !hasScores,
      excludesEvaluationEvidence: !hasScores,
      excludesInternalMemo: true,
      excludesManualEvaluation: true,
    };
  }

  private toCandidateScores(scores: CandidateReportScoreRecord[]): CandidateReportScoreView[] {
    return scores.map((score) => ({
      scoreId: score.scoreId,
      criterionId: score.criterionId,
      criterionName: this.displayCriterionName(score),
      score: score.score,
      rationale: score.rationale,
      evidences: score.evidences.map((evidence) => this.toCandidateEvidence(evidence)),
    }));
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

  private toTranscriptStatus(transcript?: string): "PENDING" | "AVAILABLE" {
    return this.cleanOptionalText(transcript) ? "AVAILABLE" : "PENDING";
  }

  private cleanOptionalText(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private deriveStrengths(scores: CandidateReportScoreRecord[]): string[] {
    return scores
      .filter((score) => score.score >= 70)
      .map((score) => this.scoreSentence(score))
      .slice(0, 3);
  }

  private deriveImprovements(scores: CandidateReportScoreRecord[]): string[] {
    return scores
      .filter((score) => score.score < 70)
      .map((score) => this.scoreSentence(score))
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

  private scoreSentence(score: CandidateReportScoreRecord): string {
    const label = this.displayCriterionName(score) ?? `평가 항목 #${score.criterionId ?? score.scoreId}`;
    return `${label} ${score.score}점${score.rationale ? `: ${score.rationale}` : ""}`;
  }

  private displayCriterionName(score: CandidateReportScoreRecord): string | undefined {
    return score.criterionName ?? this.criterionNameFromRationale(score.rationale);
  }

  private criterionNameFromRationale(rationale?: string): string | undefined {
    const match = rationale?.match(/^(직무 적합성|문제 해결력|커뮤니케이션|기술 이해도)은\s+\d+점/);
    return match?.[1];
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
