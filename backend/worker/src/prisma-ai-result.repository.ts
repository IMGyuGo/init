import { createHash } from "node:crypto";
import {
  AiResultRepository,
  AnswerFactCheckRunRecord,
  CommunicationAnalysisRecord,
  DocumentExtractionRecord,
  DocumentExtractionStatusRecord,
  EmbeddingRecord,
  FailedDocumentExtractionRecord,
  FailedReportRecord,
  FollowUpQuestionRecord,
  GeneratedDraftRecord,
  GeneratedReportRecord,
  GeneratedReportScoreRecord,
  NcsAnswerEvaluationRecord,
  PersonalizedQuestionRecord,
  ResumeQuestionGenerationContext,
  ResumeQuestionGenerationResult,
  ResumeQuestionJobReference,
  assertQuestionEvaluationsHaveEvidence,
  assertAnswerFactCheckRecords,
  TranscriptRecord,
  assertScoresHaveEvidence,
  hashSourceText
} from "./ai-result.repository";
import { canonicalNcsProfileIdOf } from "./ncs-question-alignment.adapter";
import {
  exactDemoBindingProfiles,
  extractDemoFactualAnchor,
} from "./demo-preset-personalization";
import { NonRetryableAiWorkerFailure } from "./worker-errors";
import { AiWorkerJob, FailureReason } from "./worker.types";

interface ResumeQuestionDocumentRow {
  documentId: bigint;
  documentType: string;
  parseStatus: string;
  extractedText: string | null;
  application: {
    applicationId: bigint;
    applicationStatus: string;
    submittedAt: Date | null;
    profileSnapshot: unknown;
    motivation: string | null;
    additionalInfo: string | null;
    posting: {
      postingId: bigint;
      jobDescription: string | null;
      questionGenerationPolicy: {
        evaluationFramework: string;
        jdCriteriaQuestionCount: number;
        resumeQuestionCount: number;
        policyVersion: number;
        criteriaVersion: number;
      } | null;
      criteria: Array<{
        criterionId: bigint;
        description: string | null;
        sortOrder: number;
        weight: number;
        ncsProfileId: string | null;
        ncsQuestionMode: string | null;
        ncsProfileVersion: string | null;
        tag: { name: string; category: string };
      }>;
    };
  };
}

interface ResumeQuestionBatchRow {
  batchId: bigint;
  applicationId: bigint;
  latestProcessLogId: bigint;
  status: string;
  policyVersion: number;
  criteriaVersion: number;
  inputVersion: string;
  resumeDocumentHash: string;
  jdSnapshotHash: string;
  usageScope: "STANDARD" | "DEMO_PRESET";
}

const FOLLOW_UP_SOURCE_QUESTION_SELECT = {
  sessionQuestionId: true,
  sortOrder: true,
  questionType: true,
  criterionId: true,
  criterionTitleSnapshot: true,
  ncsProfileId: true,
  ncsQuestionMode: true,
  ncsProfileVersion: true,
  alignmentStatus: true,
  alignmentScore: true,
  alignmentReason: true,
  evaluatorVersion: true,
  generationSource: true,
  usageScope: true,
  policyVersion: true,
  criteriaVersion: true,
  ncsBindings: {
    orderBy: { bindingOrder: "asc" as const },
    select: {
      criterionId: true,
      criterionTitleSnapshot: true,
      ncsProfileId: true,
      ncsProfileVersion: true,
      alignmentStatus: true,
      alignmentScore: true,
      alignmentReason: true,
      evaluatorVersion: true,
      bindingOrder: true,
    },
  },
} as const;

function defaultFollowUpReason(policy: FollowUpQuestionRecord["policy"]): FollowUpQuestionRecord["reason"] {
  return policy === "RECRUITING" ? "NCS_EVIDENCE_GAP" : "GENERAL_EVIDENCE_GAP";
}

interface PrismaAiResultClient {
  $transaction?<T>(operation: (transaction: PrismaAiResultClient) => Promise<T>): Promise<T>;
  $executeRawUnsafe?(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe?<T>(query: string, ...values: unknown[]): Promise<T>;
  application: {
    updateMany(args: unknown): Promise<unknown>;
    findUnique?(args: unknown): Promise<ResumeQuestionDocumentRow["application"] | null>;
  };
  applicationDocument: {
    updateMany(args: unknown): Promise<unknown>;
    findUnique?(args: unknown): Promise<ResumeQuestionDocumentRow | null>;
  };
  interviewAnswer: {
    updateMany(args: unknown): Promise<unknown>;
    findUnique?(args: unknown): Promise<any>;
  };
  followUpQuestion: {
    findUnique?(args: unknown): Promise<any>;
    upsert(args: unknown): Promise<any>;
    update?(args: unknown): Promise<any>;
  };
  interviewSessionQuestion?: {
    findFirst(args: unknown): Promise<any>;
    create(args: unknown): Promise<any>;
  };
  evaluationReport: {
    upsert(args: unknown): Promise<unknown>;
  };
  evaluationCriterion: {
    findUnique(args: unknown): Promise<{ criterionId: bigint } | null>;
  };
  reportScore: {
    deleteMany(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
  };
  reportEvidence: {
    deleteMany(args: unknown): Promise<unknown>;
  };
  ncsAnswerEvaluation?: {
    deleteMany(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
  };
  answerFactCheckRun?: {
    deleteMany(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
  };
  embedding: {
    upsert(args: unknown): Promise<EmbeddingRecord & { embeddingId?: bigint }>;
  };
  aiProcessLog: {
    update(args: unknown): Promise<unknown>;
    create?(args: unknown): Promise<unknown>;
  };
  applicationInterviewQuestionBatch?: {
    findUnique(args: unknown): Promise<ResumeQuestionBatchRow | null>;
    create(args: unknown): Promise<ResumeQuestionBatchRow>;
    updateMany(args: unknown): Promise<unknown>;
  };
  applicationInterviewQuestion?: {
    deleteMany(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
  };
}

export class PrismaAiResultRepository implements AiResultRepository {
  constructor(private readonly prisma: PrismaAiResultClient) {}

  async markDocumentExtractionStarted(record: DocumentExtractionStatusRecord): Promise<void> {
    await this.prisma.applicationDocument.updateMany({
      where: {
        documentId: BigInt(record.documentId),
        ...(record.fileId ? { fileId: BigInt(record.fileId) } : {}),
        parseStatus: { not: "EXTRACTED" }
      },
      data: {
        parseStatus: "EXTRACTING"
      }
    });
  }

  async saveDocumentExtraction(record: DocumentExtractionRecord): Promise<AiWorkerJob[]> {
    try {
      return await this.transaction(async (transaction) => {
        await transaction.applicationDocument.updateMany({
          where: {
            documentId: BigInt(record.documentId),
            fileId: BigInt(record.fileId),
            parseStatus: { not: "EXTRACTED" }
          },
          data: {
            parseStatus: "EXTRACTED",
            extractedText: record.extractedText
          }
        });

        return this.prepareResumeQuestionGeneration(transaction, record.documentId);
      });
    } catch (error) {
      if (isUniqueConstraintFailure(error)) return [];
      throw error;
    }
  }

  async markDocumentExtractionFailed(record: FailedDocumentExtractionRecord): Promise<void> {
    await this.prisma.applicationDocument.updateMany({
      where: {
        documentId: BigInt(record.documentId),
        ...(record.fileId ? { fileId: BigInt(record.fileId) } : {}),
        parseStatus: { not: "EXTRACTED" }
      },
      data: {
        parseStatus: "FAILED"
      }
    });
  }

  async loadResumeQuestionGenerationContext(reference: ResumeQuestionJobReference): Promise<ResumeQuestionGenerationContext> {
    const application = await this.prisma.application.findUnique!({
      where: { applicationId: BigInt(reference.applicationId) },
      include: {
        documents: { where: { documentId: BigInt(reference.documentId) } },
        posting: {
          include: {
            questionGenerationPolicy: true,
            criteria: { include: { tag: true }, orderBy: { sortOrder: "asc" } }
          }
        }
      }
    }) as (ResumeQuestionDocumentRow["application"] & { documents: Array<Omit<ResumeQuestionDocumentRow, "application">> }) | null;
    if (!application) {
      throw new NonRetryableAiWorkerFailure("resume question application was not found");
    }

    const document = application.documents[0];
    const policy = application.posting.questionGenerationPolicy;
    const jobDescription = application.posting.jobDescription?.trim();
    if (!document || document.parseStatus !== "EXTRACTED" || !document.extractedText?.trim()) {
      throw new NonRetryableAiWorkerFailure("extracted resume document is required");
    }
    const usageScope = reference.usageScope ?? "STANDARD";
    const standardEnabled =
      usageScope === "STANDARD" &&
      policy &&
      policy.resumeQuestionCount > 0 &&
      (policy.evaluationFramework === "NCS_3_PROFILE_V1" || policy.evaluationFramework === "NCS_ACTIVE_PROFILE_V2");
    const demoEnabled =
      usageScope === "DEMO_PRESET" &&
      policy?.evaluationFramework === "NCS_ACTIVE_PROFILE_V2" &&
      hasAllActiveCanonicalCriteria(application.posting.criteria);
    if (!policy || (!standardEnabled && !demoEnabled)) {
      throw new NonRetryableAiWorkerFailure("NCS resume question policy is not enabled");
    }
    if (!jobDescription) {
      throw new NonRetryableAiWorkerFailure("posting job description is required");
    }

    const resumeDocumentHash = hashText(document.extractedText);
    const jdSnapshotHash = hashText(jobDescription);
    if (
      policy.policyVersion !== reference.policyVersion ||
      policy.criteriaVersion !== reference.criteriaVersion ||
      resumeDocumentHash !== reference.resumeDocumentHash ||
      jdSnapshotHash !== reference.jdSnapshotHash
    ) {
      throw new NonRetryableAiWorkerFailure("resume question input snapshot is stale");
    }

    const batch = await this.prisma.applicationInterviewQuestionBatch!.findUnique({
      where: {
        applicationId_usageScope_policyVersion_criteriaVersion_jdSnapshotHash_resumeDocumentHash: {
          applicationId: BigInt(reference.applicationId),
          usageScope,
          policyVersion: reference.policyVersion,
          criteriaVersion: reference.criteriaVersion,
          jdSnapshotHash,
          resumeDocumentHash
        }
      }
    });
    if (!batch || Number(batch.latestProcessLogId) !== reference.processLogId || batch.status !== "GENERATING") {
      throw new NonRetryableAiWorkerFailure("resume question generation batch is not active");
    }

    const allocatedCriteria = usageScope === "DEMO_PRESET"
      ? demoPresetCriteria(application.posting.criteria)
      : allocateResumeCriteria(
          activeCriteriaForFramework(application.posting.criteria, policy.evaluationFramework),
          policy.jdCriteriaQuestionCount,
          policy.resumeQuestionCount,
        );
    const factualAnchor = usageScope === "DEMO_PRESET"
      ? extractDemoFactualAnchor(
          document.extractedText,
          ...snapshotFactualSources(application.profileSnapshot),
          application.motivation,
          application.additionalInfo,
        )
      : null;

    return {
      ...reference,
      batchId: Number(batch.batchId),
      questionCount: usageScope === "DEMO_PRESET" ? 1 : policy.resumeQuestionCount,
      jobDescription,
      resumeText: document.extractedText,
      criteria: allocatedCriteria,
      factualAnchor,
    };
  }

  async saveResumeQuestionGeneration(record: ResumeQuestionGenerationResult): Promise<void> {
    await this.transaction(async (transaction) => {
      const batch = await transaction.applicationInterviewQuestionBatch!.findUnique({
        where: {
          applicationId_usageScope_policyVersion_criteriaVersion_jdSnapshotHash_resumeDocumentHash: {
            applicationId: BigInt(record.reference.applicationId),
            usageScope: record.reference.usageScope ?? "STANDARD",
            policyVersion: record.reference.policyVersion,
            criteriaVersion: record.reference.criteriaVersion,
            jdSnapshotHash: record.reference.jdSnapshotHash,
            resumeDocumentHash: record.reference.resumeDocumentHash
          }
        }
      });
      if (!batch || Number(batch.latestProcessLogId) !== record.reference.processLogId) {
        throw new NonRetryableAiWorkerFailure("resume question generation batch changed before save");
      }

      await transaction.applicationInterviewQuestion!.deleteMany({ where: { batchId: batch.batchId } });
      if (
        record.reference.usageScope === "DEMO_PRESET" &&
        record.status !== "FAILED" &&
        (record.questions.length !== 1 || !exactDemoBindingProfiles(record.questions[0]!.ncsBindings ?? []))
      ) {
        throw new NonRetryableAiWorkerFailure("DEMO_PRESET requires one question with exact job and problem bindings");
      }
      for (const question of record.questions) {
        await transaction.applicationInterviewQuestion!.create({
          data: {
            batchId: batch.batchId,
            criterionId: BigInt(question.criterionId),
            sourceProcessLogId: BigInt(record.reference.processLogId),
            criterionTitleSnapshot: question.criterionTitleSnapshot,
            source: "RESUME_PERSONALIZED",
            usageScope: record.reference.usageScope ?? "STANDARD",
            questionType: question.questionType,
            content: question.content,
            ncsProfileId: question.ncsProfileId,
            ncsQuestionMode: question.ncsQuestionMode,
            ncsProfileVersion: question.ncsProfileVersion,
            alignmentStatus: question.alignmentStatus,
            alignmentScore: question.alignmentScore,
            alignmentReason: question.alignmentReason,
            evaluatorVersion: question.evaluatorVersion,
            sortOrder: question.sortOrder,
            ncsBindings: {
              create: bindingCreates(question),
            },
          },
        });
      }
      await transaction.applicationInterviewQuestionBatch!.updateMany({
        where: { batchId: batch.batchId, latestProcessLogId: BigInt(record.reference.processLogId) },
        data: {
          status: record.status,
          evaluatorVersion: record.evaluatorVersion,
          failureReason: record.failureReason
        }
      });
    });
  }

  async markResumeQuestionGenerationFailed(reference: ResumeQuestionJobReference, failure: FailureReason): Promise<void> {
    await this.prisma.applicationInterviewQuestionBatch!.updateMany({
      where: {
        applicationId: BigInt(reference.applicationId),
        usageScope: reference.usageScope ?? "STANDARD",
        latestProcessLogId: BigInt(reference.processLogId),
        inputVersion: reference.inputVersion
      },
      data: {
        status: "FAILED",
        failureReason: sanitizeFailureReason(failure.reason)
      }
    });
  }

  async saveTranscript(record: TranscriptRecord): Promise<void> {
    const fileId = BigInt(record.audioFileId);
    await this.prisma.interviewAnswer.updateMany({
      where: {
        answerId: BigInt(record.answerId),
        AND: [
          { OR: [{ audioFileId: fileId }, { videoFileId: fileId }] },
          { OR: [{ transcript: null }, { transcript: "" }] }
        ]
      },
      data: {
        transcript: record.transcript
      }
    });
  }

  async saveFollowUpQuestion(record: FollowUpQuestionRecord): Promise<void> {
    if (!this.prisma.$transaction) {
      throw new NonRetryableAiWorkerFailure("follow-up runtime transition requires a Prisma transaction");
    }

    await this.prisma.$transaction(async (transaction) => {
      const followUps = transaction.followUpQuestion;
      const sessionQuestions = transaction.interviewSessionQuestion;
      if (
        !transaction.$executeRawUnsafe ||
        !transaction.$queryRawUnsafe ||
        !transaction.interviewAnswer.findUnique ||
        !followUps.findUnique ||
        !followUps.update ||
        !sessionQuestions
      ) {
        throw new NonRetryableAiWorkerFailure("follow-up runtime repositories are unavailable");
      }

      await transaction.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock($1)",
        BigInt(record.sessionId),
      );
      const answer = await transaction.interviewAnswer.findUnique({
        where: { answerId: BigInt(record.answerId) },
        select: {
          answerId: true,
          sessionId: true,
          questionId: true,
          sessionQuestionId: true,
          session: {
            select: {
              status: true,
              answerTimeSecSnapshot: true,
            },
          },
          sessionQuestion: {
            select: FOLLOW_UP_SOURCE_QUESTION_SELECT,
          },
        },
      });
      if (!answer || Number(answer.sessionId) !== record.sessionId) {
        throw new NonRetryableAiWorkerFailure("follow-up answer does not belong to the requested session");
      }

      const sourceQuestion =
        answer.sessionQuestion ??
        (answer.questionId
          ? await sessionQuestions.findFirst({
              where: {
                sessionId: answer.sessionId,
                questionId: answer.questionId,
              },
              select: FOLLOW_UP_SOURCE_QUESTION_SELECT,
            })
          : null);
      const key = {
        answerIdPolicy: {
          answerId: BigInt(record.answerId),
          policy: record.policy,
        },
      };
      const existing = await followUps.findUnique({ where: key });
      if (existing?.generationStatus === "INSERTED" || existing?.generationStatus === "SKIPPED") {
        return;
      }

      const demoCommonQuestion =
        sourceQuestion?.usageScope === "DEMO_PRESET" &&
        sourceQuestion.generationSource !== "RESUME_PERSONALIZED";
      const shouldInsert = !demoCommonQuestion && (record.required || existing?.generationStatus === "READY");
      const reason = shouldInsert
        ? existing?.reason ?? record.reason ?? defaultFollowUpReason(record.policy)
        : null;
      const questionMode = existing?.questionMode ?? record.questionMode ?? sourceQuestion?.ncsQuestionMode ?? null;
      const answerTimeSec =
        existing?.answerTimeSec ?? record.answerTimeSec ?? answer.session.answerTimeSecSnapshot ?? null;
      if (!shouldInsert || answer.session.status !== "IN_PROGRESS") {
        const skipReason = shouldInsert ? "SESSION_NOT_IN_PROGRESS" : "NOT_REQUIRED";
        await followUps.upsert({
          where: key,
          create: {
            followUpId: this.nextId(),
            answerId: BigInt(record.answerId),
            sourceSessionQuestionId: sourceQuestion?.sessionQuestionId ?? null,
            insertedSessionQuestionId: null,
            content: "",
            generationStatus: "SKIPPED",
            policy: record.policy,
            reason,
            skipReason,
            questionMode,
            answerTimeSec,
            insertedAt: null,
            createdAt: new Date(),
          },
          update: {
            sourceSessionQuestionId: sourceQuestion?.sessionQuestionId ?? existing?.sourceSessionQuestionId ?? null,
            content: "",
            generationStatus: "SKIPPED",
            reason,
            skipReason,
            questionMode,
            answerTimeSec,
            insertedSessionQuestionId: null,
            insertedAt: null,
          },
        });
        return;
      }

      if (!sourceQuestion || sourceQuestion.questionType === "FOLLOW_UP") {
        throw new NonRetryableAiWorkerFailure("follow-up source must be a base session question");
      }
      const content = existing?.content?.trim() || record.content?.trim();
      if (!content) {
        throw new NonRetryableAiWorkerFailure("follow-up content is required");
      }
      if (record.policy === "RECRUITING") {
        if (!questionMode || !answerTimeSec) {
          throw new NonRetryableAiWorkerFailure("recruiting follow-up mode and answer time snapshot are required");
        }
        const sourceBindings = sourceQuestion.ncsBindings ?? [];
        if (
          sourceQuestion.usageScope === "DEMO_PRESET" &&
          !exactDemoBindingProfiles(sourceBindings)
        ) {
          throw new NonRetryableAiWorkerFailure(
            "DEMO_PRESET follow-up requires exact job and problem bindings",
          );
        }
        if (
          sourceBindings.length < 1 ||
          sourceBindings.length > 2 ||
          sourceBindings.some((binding: any, index: number) =>
            binding.alignmentStatus !== "ALIGNED" ||
            canonicalNcsProfileIdOf(binding.ncsProfileId) !== binding.ncsProfileId ||
            binding.bindingOrder !== index + 1
          )
        ) {
          throw new NonRetryableAiWorkerFailure("recruiting follow-up requires one or two aligned canonical bindings");
        }
        if (sourceQuestion.ncsQuestionMode && questionMode !== sourceQuestion.ncsQuestionMode) {
          throw new NonRetryableAiWorkerFailure("follow-up question mode must match the base question mode");
        }
        if (
          answer.session.answerTimeSecSnapshot &&
          answerTimeSec !== answer.session.answerTimeSecSnapshot
        ) {
          throw new NonRetryableAiWorkerFailure("follow-up answer time must match the session snapshot");
        }
      }

      const ready = existing
        ? await followUps.update({
            where: { followUpId: existing.followUpId },
            data: {
              sourceSessionQuestionId: sourceQuestion.sessionQuestionId,
              content,
              generationStatus: "READY",
              reason,
              skipReason: null,
              questionMode,
              answerTimeSec,
              insertedSessionQuestionId: null,
              insertedAt: null,
            },
          })
        : await followUps.upsert({
            where: key,
            create: {
              followUpId: this.nextId(),
              answerId: BigInt(record.answerId),
              sourceSessionQuestionId: sourceQuestion.sessionQuestionId,
              insertedSessionQuestionId: null,
              content,
              generationStatus: "READY",
              policy: record.policy,
              reason,
              skipReason: null,
              questionMode,
              answerTimeSec,
              insertedAt: null,
              createdAt: new Date(),
            },
            update: {},
          });
      if (ready.generationStatus === "INSERTED") {
        return;
      }

      const [sequence] = await transaction.$queryRawUnsafe<Array<{ questionId: bigint }>>(
        `SELECT nextval('interview_runtime_question_id_seq') AS "questionId"`,
      );
      if (!sequence) {
        throw new NonRetryableAiWorkerFailure("failed to allocate a private runtime question ID");
      }
      const sourceSortOrder = sourceQuestion.sortOrder;
      const reorderOffset = 1_000_000;
      await transaction.$executeRawUnsafe(
        `UPDATE interview_session_questions
         SET sort_order = sort_order + $3
         WHERE session_id = $1 AND sort_order > $2`,
        answer.sessionId,
        sourceSortOrder,
        reorderOffset,
      );
      await transaction.$executeRawUnsafe(
        `UPDATE interview_session_questions
         SET sort_order = sort_order - $3
         WHERE session_id = $1 AND sort_order > $2`,
        answer.sessionId,
        sourceSortOrder + reorderOffset,
        reorderOffset - 1,
      );
      const inserted = await sessionQuestions.create({
        data: {
          sessionId: answer.sessionId,
          questionId: null,
          personalizedQuestionId: null,
          runtimeQuestionId: sequence.questionId,
          criterionId: sourceQuestion.criterionId,
          criterionTitleSnapshot: sourceQuestion.criterionTitleSnapshot,
          generationSource: null,
          usageScope: sourceQuestion.usageScope,
          questionType: "FOLLOW_UP",
          content,
          ncsProfileId: sourceQuestion.ncsProfileId,
          ncsQuestionMode: questionMode,
          ncsProfileVersion: sourceQuestion.ncsProfileVersion,
          alignmentStatus: sourceQuestion.alignmentStatus,
          alignmentScore: sourceQuestion.alignmentScore,
          alignmentReason: sourceQuestion.alignmentReason,
          evaluatorVersion: sourceQuestion.evaluatorVersion,
          policyVersion: sourceQuestion.policyVersion,
          criteriaVersion: sourceQuestion.criteriaVersion,
          sortOrder: sourceSortOrder + 1,
          ncsBindings: {
            create: (sourceQuestion.ncsBindings ?? []).map((binding: any) => ({
              criterionId: binding.criterionId,
              criterionTitleSnapshot: binding.criterionTitleSnapshot,
              ncsProfileId: binding.ncsProfileId,
              ncsProfileVersion: binding.ncsProfileVersion,
              alignmentStatus: binding.alignmentStatus,
              alignmentScore: binding.alignmentScore,
              alignmentReason: binding.alignmentReason,
              evaluatorVersion: binding.evaluatorVersion,
              bindingOrder: binding.bindingOrder,
            })),
          },
        },
      });
      await followUps.update({
        where: { followUpId: ready.followUpId },
        data: {
          generationStatus: "INSERTED",
          insertedSessionQuestionId: inserted.sessionQuestionId,
          insertedAt: new Date(),
        },
      });
    });
  }

  async saveGeneratedDraft(_record: GeneratedDraftRecord): Promise<void> {
    return;
  }

  async saveReportScoresAndEvidences(record: {
    reportId: number;
    scores: GeneratedReportScoreRecord[];
    ncsAnswerEvaluations?: NcsAnswerEvaluationRecord[];
    answerFactChecks?: AnswerFactCheckRunRecord[];
  }): Promise<void> {
    assertScoresHaveEvidence(record.scores);
    await this.replaceReportScores(record.reportId, record.scores);
    if (record.ncsAnswerEvaluations) {
      await this.replaceNcsAnswerEvaluations(record.reportId, record.ncsAnswerEvaluations);
    }
    if (record.answerFactChecks) {
      await this.saveAnswerFactChecks(record.reportId, record.answerFactChecks);
    }
  }

  async saveAnswerFactChecks(reportId: number, records: AnswerFactCheckRunRecord[]): Promise<void> {
    assertAnswerFactCheckRecords(reportId, records);
    const replace = async (client: PrismaAiResultClient): Promise<void> => {
      const repository = client.answerFactCheckRun;
      if (!repository) {
        throw new NonRetryableAiWorkerFailure("answer fact-check repository is unavailable");
      }
      await repository.deleteMany({ where: { reportId: BigInt(reportId) } });
      for (const record of records) {
        await repository.create({
          data: {
            reportId: BigInt(reportId),
            answerId: BigInt(record.answerId),
            followUpAnswerId: record.followUpAnswerId ? BigInt(record.followUpAnswerId) : null,
            inputCompositionVersion: record.inputCompositionVersion,
            providerStatus: record.providerStatus,
            gateStatus: record.gateStatus,
            providerMode: record.providerMode,
            modelVersion: record.modelVersion,
            promptVersion: record.promptVersion,
            knowledgeSnapshotVersion: record.knowledgeSnapshotVersion,
            policyVersion: record.policyVersion,
            failureReason: record.failureReason,
            startedAt: new Date(record.startedAt),
            completedAt: record.completedAt ? new Date(record.completedAt) : null,
            ...(record.claims.length > 0 ? {
              claims: {
                create: record.claims.map((claim, claimIndex) => ({
                  claimText: claim.claimText,
                  answerStartOffset: claim.answerStartOffset,
                  answerEndOffset: claim.answerEndOffset,
                  claimType: claim.claimType,
                  claimRole: claim.claimRole,
                  verdict: claim.verdict,
                  confidence: claim.confidence,
                  rationale: claim.rationale,
                  sortOrder: claimIndex + 1,
                  ...(claim.evidences.length > 0 ? {
                    evidences: {
                      create: claim.evidences.map((evidence, evidenceIndex) => ({
                        evidenceLedgerId: evidence.evidenceLedgerId,
                        sourceSnapshotId: evidence.sourceSnapshotId,
                        sourceKind: evidence.sourceKind,
                        sourceStartOffset: evidence.sourceStartOffset,
                        sourceEndOffset: evidence.sourceEndOffset,
                        sortOrder: evidenceIndex + 1,
                      })),
                    },
                  } : {}),
                })),
              },
            } : {}),
          },
        });
      }
    };

    if (this.prisma.$transaction) {
      await this.prisma.$transaction(replace);
      return;
    }
    await replace(this.prisma);
  }

  async saveCommunicationAnalysis(record: CommunicationAnalysisRecord): Promise<void> {
    await this.prisma.aiProcessLog.update({
      where: { processLogId: BigInt(record.processLogId) },
      data: {
        outputRef: JSON.stringify({
          processLogId: record.processLogId,
          report: {
            reportId: record.reportId,
            reportType: record.reportType,
            status: "GENERATING"
          },
          communicationAnalysis: record.analysis
        })
      }
    });
  }

  async saveGeneratedReport(record: GeneratedReportRecord): Promise<void> {
    assertScoresHaveEvidence(record.scores);
    if (record.questionEvaluations.length > 0) {
      assertQuestionEvaluationsHaveEvidence(record.questionEvaluations);
    }
    const ncsReportData = record.ncsFinalEvaluation
      ? {
          ncsCompletionStatus: record.ncsFinalEvaluation.completionStatus,
          ncsThresholdResult: record.ncsFinalEvaluation.thresholdResult,
          ncsAiDecision: record.ncsFinalEvaluation.aiDecision,
          ncsDecisionReasonCode: record.ncsFinalEvaluation.decisionReasonCode,
          ncsScoringVersion: record.ncsFinalEvaluation.scoringVersion,
          ncsDecisionPolicyVersion: record.ncsFinalEvaluation.decisionPolicyVersion,
          ncsSummaryJson: {
            schemaVersion: record.ncsFinalEvaluation.scoringVersion === "NCS_RECRUITING_SCORING_V2"
              ? "ncs-report-evaluation-output-v2"
              : "ncs-report-evaluation-output-v1",
            result: {
              completionStatus: record.ncsFinalEvaluation.completionStatus,
              thresholdResult: record.ncsFinalEvaluation.thresholdResult,
              aiDecision: record.ncsFinalEvaluation.aiDecision,
              decisionReasonCode: record.ncsFinalEvaluation.decisionReasonCode,
              totalScore: record.ncsFinalEvaluation.totalScore,
            },
            profiles: record.ncsFinalEvaluation.profiles,
            incompleteReasons: record.ncsFinalEvaluation.incompleteReasons,
          },
        }
      : {};
    await this.prisma.evaluationReport.upsert({
      where: { reportId: BigInt(record.reportId) },
      create: {
        reportId: BigInt(record.reportId),
        applicationId: record.applicationId ? BigInt(record.applicationId) : null,
        sessionId: record.sessionId ? BigInt(record.sessionId) : null,
        reportType: record.reportType,
        status: "COMPLETED",
        summary: record.summary,
        totalScore: record.totalScore,
        generatedAt: new Date(),
        ...ncsReportData,
      },
      update: {
        reportType: record.reportType,
        status: "COMPLETED",
        summary: record.summary,
        totalScore: record.totalScore,
        generatedAt: new Date(),
        failureCategory: null,
        failureReason: null,
        ...ncsReportData,
      }
    });

    await this.replaceReportScores(record.reportId, record.scores);
    if (record.ncsFinalEvaluation) {
      await this.createNcsProfileScores(record.reportId, record.ncsFinalEvaluation);
    }
    if (record.ncsAnswerEvaluations) {
      await this.replaceNcsAnswerEvaluations(record.reportId, record.ncsAnswerEvaluations);
    }
    if (record.answerFactChecks) {
      await this.saveAnswerFactChecks(record.reportId, record.answerFactChecks);
    }
    await this.updateApplicationReportStatus(record, "COMPLETED");
  }

  async markReportFailed(record: FailedReportRecord): Promise<void> {
    await this.prisma.evaluationReport.upsert({
      where: { reportId: BigInt(record.reportId) },
      create: {
        reportId: BigInt(record.reportId),
        reportType: record.reportType,
        status: "FAILED",
        failureCategory: record.failureCategory,
        failureReason: record.failureReason
      },
      update: {
        reportType: record.reportType,
        status: "FAILED",
        failureCategory: record.failureCategory,
        failureReason: record.failureReason
      }
    });
    await this.updateApplicationReportStatus(record, "FAILED");
  }

  private async updateApplicationReportStatus(
    record: { applicationId?: number; reportType: "RECRUITING_REPORT" | "MOCK_INTERVIEW_REPORT" },
    status: "COMPLETED" | "FAILED"
  ): Promise<void> {
    if (record.reportType !== "RECRUITING_REPORT" || !record.applicationId) {
      return;
    }

    await this.prisma.application.updateMany({
      where: { applicationId: BigInt(record.applicationId) },
      data: { reportStatus: status }
    });
  }

  async upsertEmbedding(record: Omit<EmbeddingRecord, "sourceTextHash"> & { sourceText: string }): Promise<EmbeddingRecord> {
    const sourceTextHash = hashSourceText(record.sourceText);
    const now = new Date();
    const embedding = await this.prisma.embedding.upsert({
      where: {
        sourceTypeSourceTextHash: {
          sourceType: record.sourceType,
          sourceTextHash
        }
      },
      create: {
        embeddingId: this.nextId(),
        sourceType: record.sourceType,
        sourceTextHash,
        embeddingModel: record.embeddingModel,
        embeddingDimension: record.embeddingDimension,
        embeddingVector: "[]",
        metadataJson: record.metadataJson,
        createdAt: now,
        updatedAt: now
      },
      update: {
        updatedAt: now
      }
    });

    return {
      sourceType: embedding.sourceType,
      sourceTextHash: embedding.sourceTextHash,
      embeddingModel: embedding.embeddingModel,
      embeddingDimension: embedding.embeddingDimension,
      metadataJson: embedding.metadataJson
    };
  }

  private async transaction<T>(operation: (transaction: PrismaAiResultClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction ? this.prisma.$transaction(operation) : operation(this.prisma);
  }

  private async prepareResumeQuestionGeneration(
    transaction: PrismaAiResultClient,
    documentId: number,
  ): Promise<AiWorkerJob[]> {
    const document = await transaction.applicationDocument.findUnique!({
      where: { documentId: BigInt(documentId) },
      include: {
        application: {
          include: {
            posting: {
              include: {
                questionGenerationPolicy: true,
                criteria: { include: { tag: true }, orderBy: { sortOrder: "asc" } }
              }
            }
          }
        }
      }
    });
    if (
      !document ||
      document.documentType !== "RESUME" ||
      document.parseStatus !== "EXTRACTED" ||
      !document.extractedText?.trim() ||
      document.application.applicationStatus !== "SUBMITTED" ||
      !document.application.submittedAt
    ) {
      return [];
    }

    const posting = document.application.posting;
    const policy = posting.questionGenerationPolicy;
    const jobDescription = posting.jobDescription?.trim();
    if (
      !policy ||
      (policy.evaluationFramework !== "NCS_3_PROFILE_V1" && policy.evaluationFramework !== "NCS_ACTIVE_PROFILE_V2") ||
      policy.policyVersion <= 0 ||
      policy.criteriaVersion <= 0 ||
      !jobDescription ||
      !hasCompleteNcsCriteria(activeCriteriaForFramework(posting.criteria, policy.evaluationFramework))
    ) {
      return [];
    }

    const applicationId = Number(document.application.applicationId);
    const postingId = Number(posting.postingId);
    const resumeDocumentHash = hashText(document.extractedText);
    const jdSnapshotHash = hashText(jobDescription);
    const jobs: AiWorkerJob[] = [];
    if (policy.resumeQuestionCount > 0) {
      const standard = await this.prepareResumeQuestionScope(transaction, {
        applicationId,
        postingId,
        documentId,
        usageScope: "STANDARD",
        policyVersion: policy.policyVersion,
        criteriaVersion: policy.criteriaVersion,
        resumeDocumentHash,
        jdSnapshotHash,
      });
      if (standard) jobs.push(standard);
    }
    if (policy.evaluationFramework === "NCS_ACTIVE_PROFILE_V2" && hasAllActiveCanonicalCriteria(posting.criteria)) {
      const demo = await this.prepareResumeQuestionScope(transaction, {
        applicationId,
        postingId,
        documentId,
        usageScope: "DEMO_PRESET",
        policyVersion: policy.policyVersion,
        criteriaVersion: policy.criteriaVersion,
        resumeDocumentHash,
        jdSnapshotHash,
      });
      if (demo) jobs.push(demo);
    }
    return jobs;
  }

  private async prepareResumeQuestionScope(
    transaction: PrismaAiResultClient,
    input: Omit<ResumeQuestionJobReference, "processLogId" | "inputVersion" | "usageScope"> & {
      usageScope: "STANDARD" | "DEMO_PRESET";
    },
  ): Promise<AiWorkerJob | null> {
    const inputVersion = hashText([
      input.applicationId,
      input.usageScope,
      input.policyVersion,
      input.criteriaVersion,
      input.jdSnapshotHash,
      input.resumeDocumentHash,
    ].join(":"));
    const businessKey = {
      applicationId: BigInt(input.applicationId),
      usageScope: input.usageScope,
      policyVersion: input.policyVersion,
      criteriaVersion: input.criteriaVersion,
      jdSnapshotHash: input.jdSnapshotHash,
      resumeDocumentHash: input.resumeDocumentHash,
    };

    await transaction.applicationInterviewQuestionBatch!.updateMany({
      where: {
        applicationId: BigInt(input.applicationId),
        usageScope: input.usageScope,
        status: { in: ["READY", "REVIEW_REQUIRED"] },
        NOT: businessKey,
      },
      data: { status: "STALE" },
    });

    const existing = await transaction.applicationInterviewQuestionBatch!.findUnique({
      where: { applicationId_usageScope_policyVersion_criteriaVersion_jdSnapshotHash_resumeDocumentHash: businessKey },
    });
    if (existing) {
      return null;
    }

    const process = await transaction.aiProcessLog.create!({
      data: {
        applicationId: BigInt(input.applicationId),
        processType: "RESUME_QUESTION_GENERATE",
        status: "PENDING",
        inputRef: null,
      },
      select: { processLogId: true },
    }) as { processLogId: bigint };
    const reference: ResumeQuestionJobReference = {
      processLogId: Number(process.processLogId),
      ...input,
      inputVersion,
    };
    const inputRef = JSON.stringify(reference);
    await transaction.aiProcessLog.update({
      where: { processLogId: process.processLogId },
      data: { inputRef },
    });
    await transaction.applicationInterviewQuestionBatch!.create({
      data: {
        ...businessKey,
        latestProcessLogId: process.processLogId,
        status: "GENERATING",
        inputVersion,
        attemptCount: 1,
      },
    });

    return {
      processLogId: reference.processLogId,
      processType: "RESUME_QUESTION_GENERATE",
      inputRef,
      attempt: 1,
    };
  }

  private nextId(): bigint {
    return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
  }

  private async replaceReportScores(reportId: number, scores: GeneratedReportScoreRecord[]): Promise<void> {
    assertScoresHaveEvidence(scores);
    await this.prisma.reportEvidence.deleteMany({
      where: {
        score: {
          reportId: BigInt(reportId)
        }
      }
    });
    await this.prisma.reportScore.deleteMany({
      where: { reportId: BigInt(reportId) }
    });

    for (const score of scores) {
      const criterionId = await this.resolveCriterionId(score.criterionId);
      await this.prisma.reportScore.create({
        data: {
          scoreId: this.nextId(),
          reportId: BigInt(reportId),
          criterionId,
          score: score.score,
          rationale: score.rationale,
          evidences: {
            create: score.evidences.map((evidence) => ({
              evidenceId: this.nextId(),
              sourceType: evidence.sourceType,
              answerId: evidence.answerId ? BigInt(evidence.answerId) : null,
              documentId: evidence.documentId ? BigInt(evidence.documentId) : null,
              documentRef: evidence.documentRef ?? null,
              evidenceText: evidence.text
            }))
          }
        }
      });
    }
  }

  private async replaceNcsAnswerEvaluations(
    reportId: number,
    evaluations: NcsAnswerEvaluationRecord[],
  ): Promise<void> {
    if (evaluations.some((evaluation) => evaluation.reportId !== reportId)) {
      throw new NonRetryableAiWorkerFailure("NCS answer evaluation reportId mismatch");
    }

    const repository = this.prisma.ncsAnswerEvaluation;
    if (!repository) {
      throw new NonRetryableAiWorkerFailure("NCS answer evaluation repository is unavailable");
    }

    await repository.deleteMany({
      where: { reportId: BigInt(reportId) },
    });
    for (const evaluation of evaluations) {
      const output = evaluation.output;
      await repository.create({
        data: {
          reportId: BigInt(reportId),
          answerId: BigInt(evaluation.answerId),
          sessionQuestionId: BigInt(evaluation.sessionQuestionId),
          criterionId: await this.resolveCriterionId(evaluation.criterionId),
          criterionTitleSnapshot: evaluation.criterionTitleSnapshot,
          ncsProfileId: canonicalNcsProfileId(evaluation.ncsProfileId),
          ncsQuestionMode: evaluation.ncsQuestionMode,
          ncsProfileVersion: evaluation.ncsProfileVersion,
          scoreStatus: output.scoreStatus,
          competencyScore: output.scores.competency,
          evidenceScore: output.scores.evidence,
          totalScore: output.scores.total,
          behaviorPoints: evaluation.behaviorPoints,
          logicPoints: evaluation.logicPoints,
          baseScore: evaluation.baseScore,
          effectiveScore: evaluation.effectiveScore,
          followUpApplied: evaluation.followUpApplied,
          coverage: output.coverage,
          confidence: output.confidence,
          rubricVersion: output.rubricVersion,
          promptVersion: output.promptVersion,
          providerMode: output.providerMode,
          modelName: output.model ?? null,
          resultJson: output,
          evidences: {
            create: evaluation.evidences.map((evidence, index) => ({
              sourceAnswerId: BigInt(evidence.sourceAnswerId),
              sourceKind: evidence.sourceKind,
              quote: evidence.quote,
              sortOrder: index + 1,
            })),
          },
        },
      });
    }
  }

  private async createNcsProfileScores(
    reportId: number,
    evaluation: NonNullable<GeneratedReportRecord["ncsFinalEvaluation"]>,
  ): Promise<void> {
    for (const profile of evaluation.profiles) {
      await this.prisma.reportScore.create({
        data: {
          scoreId: this.nextId(),
          reportId: BigInt(reportId),
          criterionId: profile.criterionId ? await this.resolveCriterionId(profile.criterionId) : null,
          score: profile.normalizedScore,
          rationale: profile.status === "SCORED"
            ? `${profile.displayName} 유효 답변 ${profile.validQuestionCount}개의 5점 평균입니다.`
            : `${profile.displayName} 평가가 완료되지 않았습니다.`,
          ncsProfileId: profile.ncsProfileId,
          averageScore: profile.averageScore,
          normalizedScore: profile.normalizedScore,
          weight: profile.weight,
          weightedScore: profile.weightedScore,
          minimumAverageScore: profile.minimumAverageScore,
          assignedQuestionCount: profile.assignedQuestionCount,
          validQuestionCount: profile.validQuestionCount,
        },
      });
    }
  }

  private async resolveCriterionId(criterionId: number): Promise<bigint | null> {
    const criterion = await this.prisma.evaluationCriterion.findUnique({
      where: { criterionId: BigInt(criterionId) },
      select: { criterionId: true }
    });
    return criterion ? BigInt(criterionId) : null;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value.trim(), "utf8").digest("hex");
}

function canonicalNcsProfileId(
  value: NcsAnswerEvaluationRecord["ncsProfileId"],
): "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING" {
  if (value === "JOB_TECHNICAL") return "JOB_TECHNICAL";
  if (value === "COLLABORATION_COMMUNICATION") return "COLLABORATION_COMMUNICATION";
  return "PROBLEM_SOLVING";
}

function hasCompleteNcsCriteria(criteria: ResumeQuestionDocumentRow["application"]["posting"]["criteria"]): boolean {
  return criteria.length > 0 && criteria.every((criterion) =>
    canonicalNcsProfileIdOf(criterion.ncsProfileId) !== undefined &&
    isNcsQuestionMode(criterion.ncsQuestionMode) &&
    Boolean(criterion.ncsProfileVersion?.trim())
  );
}

function bindingCreates(question: PersonalizedQuestionRecord) {
  const bindings = question.ncsBindings?.length
    ? question.ncsBindings
    : [{
        criterionId: question.criterionId,
        ncsProfileId: question.ncsProfileId,
        ncsProfileVersion: question.ncsProfileVersion,
        alignmentStatus: question.alignmentStatus,
        alignmentScore: question.alignmentScore,
        alignmentReason: question.alignmentReason,
        evaluatorVersion: question.evaluatorVersion,
        bindingOrder: 1 as const,
      }];
  const creates = bindings.map((binding) => ({
    criterionId: BigInt(binding.criterionId),
    ncsProfileId: binding.ncsProfileId,
    ncsProfileVersion: binding.ncsProfileVersion,
    alignmentStatus: binding.alignmentStatus,
    alignmentScore: binding.alignmentScore,
    alignmentReason: binding.alignmentReason,
    evaluatorVersion: binding.evaluatorVersion,
    bindingOrder: binding.bindingOrder,
  }));
  return creates.length === 1 ? creates[0] : creates;
}

function activeCriteriaForFramework(
  criteria: ResumeQuestionDocumentRow["application"]["posting"]["criteria"],
  framework: string,
): ResumeQuestionDocumentRow["application"]["posting"]["criteria"] {
  return framework === "NCS_ACTIVE_PROFILE_V2" ? criteria.filter((criterion) => criterion.weight > 0) : criteria;
}

function hasAllActiveCanonicalCriteria(
  criteria: ResumeQuestionDocumentRow["application"]["posting"]["criteria"],
): boolean {
  const active = activeCriteriaForFramework(criteria, "NCS_ACTIVE_PROFILE_V2");
  const profiles = active.map((criterion) => canonicalNcsProfileIdOf(criterion.ncsProfileId));
  return active.length === 3 &&
    new Set(profiles).size === 3 &&
    ["JOB_TECHNICAL", "COLLABORATION_COMMUNICATION", "PROBLEM_SOLVING"].every((profile) => profiles.includes(profile as any)) &&
    active.reduce((sum, criterion) => sum + criterion.weight, 0) === 100 &&
    hasCompleteNcsCriteria(active);
}

function demoPresetCriteria(
  criteria: ResumeQuestionDocumentRow["application"]["posting"]["criteria"],
): ResumeQuestionGenerationContext["criteria"] {
  if (!hasAllActiveCanonicalCriteria(criteria)) {
    throw new NonRetryableAiWorkerFailure("DEMO_PRESET requires all three active canonical criteria");
  }
  return (["JOB_TECHNICAL", "PROBLEM_SOLVING"] as const).map((profileId, index) => {
    const criterion = criteria.find((candidate) => canonicalNcsProfileIdOf(candidate.ncsProfileId) === profileId)!;
    return {
      criterionId: Number(criterion.criterionId),
      name: criterion.tag.name,
      category: criterion.tag.category,
      description: criterion.description ?? undefined,
      questionCount: index === 0 ? 1 : 0,
      ncsProfileId: profileId,
      ncsQuestionMode: index === 0 ? "TECHNICAL_KNOWLEDGE" : "EXPERIENCE_BEHAVIOR",
      ncsProfileVersion: criterion.ncsProfileVersion!,
      weight: criterion.weight,
    };
  });
}

function snapshotFactualSources(value: unknown): string[] {
  const values: string[] = [];
  const visit = (current: unknown, key = "") => {
    if (/(name|email|phone|url|address|school|gender|birth|salary|health|disability)/i.test(key)) return;
    if (typeof current === "string") {
      if (current.trim()) values.push(current.trim());
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, key));
      return;
    }
    if (current && typeof current === "object") {
      Object.entries(current as Record<string, unknown>).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  return values;
}

function allocateResumeCriteria(
  criteria: ResumeQuestionDocumentRow["application"]["posting"]["criteria"],
  jdQuestionCount: number,
  resumeQuestionCount: number,
): ResumeQuestionGenerationContext["criteria"] {
  if (!hasCompleteNcsCriteria(criteria)) {
    throw new NonRetryableAiWorkerFailure("complete NCS criteria are required");
  }

  const allocations = new Map<number, number>();
  const total = jdQuestionCount + resumeQuestionCount;
  for (let index = jdQuestionCount; index < total; index += 1) {
    const criterion = criteria[index % criteria.length];
    const criterionId = Number(criterion.criterionId);
    allocations.set(criterionId, (allocations.get(criterionId) ?? 0) + 1);
  }

  return criteria
    .map((criterion) => {
      const criterionId = Number(criterion.criterionId);
      const questionCount = allocations.get(criterionId) ?? 0;
      if (questionCount === 0) return null;
      const ncsProfileId = canonicalNcsProfileIdOf(criterion.ncsProfileId);
      if (!ncsProfileId || !isNcsQuestionMode(criterion.ncsQuestionMode) || !criterion.ncsProfileVersion) {
        throw new NonRetryableAiWorkerFailure("NCS criterion metadata is invalid");
      }
      return {
        criterionId,
        name: criterion.tag.name,
        category: criterion.tag.category,
        description: criterion.description ?? undefined,
        questionCount,
        ncsProfileId,
        ncsQuestionMode: criterion.ncsQuestionMode,
        ncsProfileVersion: criterion.ncsProfileVersion,
      };
    })
    .filter((criterion): criterion is NonNullable<typeof criterion> => criterion !== null);
}

function isNcsQuestionMode(value: string | null): value is ResumeQuestionGenerationContext["criteria"][number]["ncsQuestionMode"] {
  return value === "EXPERIENCE_BEHAVIOR" || value === "TECHNICAL_KNOWLEDGE" || value === "SITUATIONAL_DESIGN";
}

function sanitizeFailureReason(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function isUniqueConstraintFailure(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
