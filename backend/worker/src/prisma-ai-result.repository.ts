import {
  AiResultRepository,
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
  assertQuestionEvaluationsHaveEvidence,
  TranscriptRecord,
  assertScoresHaveEvidence,
  hashSourceText
} from "./ai-result.repository";

interface PrismaAiResultClient {
  applicationDocument: {
    updateMany(args: unknown): Promise<unknown>;
  };
  interviewAnswer: {
    updateMany(args: unknown): Promise<unknown>;
  };
  followUpQuestion: {
    upsert(args: unknown): Promise<unknown>;
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
  embedding: {
    upsert(args: unknown): Promise<EmbeddingRecord & { embeddingId?: bigint }>;
  };
  aiProcessLog: {
    update(args: unknown): Promise<unknown>;
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

  async saveDocumentExtraction(record: DocumentExtractionRecord): Promise<void> {
    await this.prisma.applicationDocument.updateMany({
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
    await this.prisma.followUpQuestion.upsert({
      where: {
        answerIdPolicy: {
          answerId: BigInt(record.answerId),
          policy: record.policy
        }
      },
      create: {
        followUpId: this.nextId(),
        answerId: BigInt(record.answerId),
        content: record.content,
        generationStatus: "GENERATED",
        policy: record.policy,
        createdAt: new Date()
      },
      update: {}
    });
  }

  async saveGeneratedDraft(_record: GeneratedDraftRecord): Promise<void> {
    return;
  }

  async saveReportScoresAndEvidences(record: { reportId: number; scores: GeneratedReportScoreRecord[] }): Promise<void> {
    assertScoresHaveEvidence(record.scores);
    await this.replaceReportScores(record.reportId, record.scores);
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
    assertQuestionEvaluationsHaveEvidence(record.questionEvaluations);
    await this.prisma.evaluationReport.upsert({
      where: { reportId: BigInt(record.reportId) },
      create: {
        reportId: BigInt(record.reportId),
        reportType: record.reportType,
        status: "COMPLETED",
        summary: record.summary,
        totalScore: record.totalScore,
        generatedAt: new Date()
      },
      update: {
        reportType: record.reportType,
        status: "COMPLETED",
        summary: record.summary,
        totalScore: record.totalScore,
        generatedAt: new Date(),
        failureCategory: null,
        failureReason: null
      }
    });

    await this.replaceReportScores(record.reportId, record.scores);
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

  private async resolveCriterionId(criterionId: number): Promise<bigint | null> {
    const criterion = await this.prisma.evaluationCriterion.findUnique({
      where: { criterionId: BigInt(criterionId) },
      select: { criterionId: true }
    });
    return criterion ? BigInt(criterionId) : null;
  }
}
