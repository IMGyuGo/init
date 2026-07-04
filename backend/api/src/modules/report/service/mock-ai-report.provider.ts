import { Injectable } from "@nestjs/common";
import {
  AnswerEvaluationRequest,
  CommunicationAnalysis,
  CommunicationAnalysisRequest,
  EvaluationContext,
  EvaluationContextRequest,
  GenerateReportRequest,
  GeneratedReport,
  QuestionEvaluation,
  ReportEvaluationConfidence,
  ReportScore
} from "../report.types";

interface StructuredEvaluation {
  scores: ReportScore[];
  questionEvaluations: QuestionEvaluation[];
}

const STT_UNAVAILABLE_TEMP_ZERO_REASON =
  "STT transcript is unavailable; this answer is temporarily scored as 0 because speech recognition failed, not because of answer quality.";

@Injectable()
export class MockAiReportProvider {
  buildEvaluationContext(input: EvaluationContextRequest): EvaluationContext {
    return {
      reportType: input.reportType,
      companyId: input.company.companyId,
      postingId: input.posting.postingId,
      applicationId: input.application.applicationId,
      candidateId: input.application.candidateId,
      jobDescription: input.posting.jobDescription,
      criteria: input.criteria,
      answers: input.answers,
      documentText: input.application.documentText,
      manualEvaluations: input.manualEvaluations ?? []
    };
  }

  evaluateAnswers(input: AnswerEvaluationRequest): ReportScore[] {
    return this.buildStructuredEvaluation(input.criteria, input.answers, input.documentText).scores;
  }

  evaluateQuestions(input: AnswerEvaluationRequest): QuestionEvaluation[] {
    return this.buildStructuredEvaluation(input.criteria, input.answers, input.documentText).questionEvaluations;
  }

  analyzeCommunication(input: CommunicationAnalysisRequest): CommunicationAnalysis {
    return {
      usage: "AUXILIARY_ONLY",
      mediaQuality: input.mediaQuality,
      metrics: input.metrics ?? {},
      notes: [
        "Communication metrics are auxiliary only and must not be used as a decisive hiring signal.",
        ...(input.notes ?? [])
      ],
      decisionWeight: 0
    };
  }

  generate(input: GenerateReportRequest): GeneratedReport {
    const { scores, questionEvaluations } = this.buildStructuredEvaluation(
      input.criteria,
      input.answers,
      input.documentText
    );
    const totalScore = Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length);

    return {
      summary: this.summary(input, totalScore),
      totalScore,
      scores,
      questionEvaluations
    };
  }

  private buildStructuredEvaluation(
    criteria: AnswerEvaluationRequest["criteria"],
    answers: AnswerEvaluationRequest["answers"],
    documentText?: string
  ): StructuredEvaluation {
    const scores: ReportScore[] = [];
    const questionEvaluations: QuestionEvaluation[] = [];
    const evaluatedAnswerIds = new Set<number>();

    criteria.forEach((criterion, index) => {
      const answer = answers[index % answers.length];
      if (answer.evaluationStatus === "STT_UNAVAILABLE") {
        const zeroEvaluation = this.unavailableTranscriptEvaluation(criterion, answer);
        scores.push(zeroEvaluation.score);
        questionEvaluations.push(zeroEvaluation.questionEvaluation);
        evaluatedAnswerIds.add(answer.answerId);
        return;
      }

      const transcript = answer.transcript ?? "";
      const evidenceText = this.pickEvidence(transcript, documentText);
      const score = this.scoreFor(criterion.weight, evidenceText);
      const evidences = this.buildEvidences(answer.answerId, transcript, documentText);
      const structured = this.assessEvidence(transcript, documentText, criterion.description);

      const reportScore: ReportScore = {
        criterionId: criterion.criterionId,
        criterionName: criterion.name,
        score,
        rationale: `${criterion.name} was evaluated from structured interview answer evidence.`,
        rubricAnchor: structured.rubricAnchor,
        confidence: structured.confidence,
        uncertaintyReasons: structured.uncertaintyReasons,
        evidences
      };

      scores.push(reportScore);
      questionEvaluations.push({
        criterionId: criterion.criterionId,
        criterionName: criterion.name,
        answerId: answer.answerId,
        question: answer.question ?? `Answer ${answer.answerId}`,
        rubricAnchor: structured.rubricAnchor,
        confidence: structured.confidence,
        uncertaintyReasons: structured.uncertaintyReasons,
        evidences
      });
      evaluatedAnswerIds.add(answer.answerId);
    });

    answers
      .filter((answer) => answer.evaluationStatus === "STT_UNAVAILABLE" && !evaluatedAnswerIds.has(answer.answerId))
      .forEach((answer) => {
        const criterion = criteria[scores.length % criteria.length];
        const zeroEvaluation = this.unavailableTranscriptEvaluation(criterion, answer);
        scores.push(zeroEvaluation.score);
        questionEvaluations.push(zeroEvaluation.questionEvaluation);
        evaluatedAnswerIds.add(answer.answerId);
      });

    return { scores, questionEvaluations };
  }

  private unavailableTranscriptEvaluation(
    criterion: AnswerEvaluationRequest["criteria"][number],
    answer: AnswerEvaluationRequest["answers"][number]
  ): { score: ReportScore; questionEvaluation: QuestionEvaluation } {
    const reason = answer.transcriptUnavailableReason?.trim() || STT_UNAVAILABLE_TEMP_ZERO_REASON;
    const evidences: ReportScore["evidences"] = [
      {
        sourceType: "INTERVIEW_ANSWER",
        answerId: answer.answerId,
        text: reason
      }
    ];
    const score: ReportScore = {
      criterionId: criterion.criterionId,
      criterionName: criterion.name,
      score: 0,
      rationale: reason,
      rubricAnchor: "STT_UNAVAILABLE_TEMP_ZERO",
      confidence: "LOW",
      uncertaintyReasons: [reason],
      evidences
    };
    return {
      score,
      questionEvaluation: {
        criterionId: criterion.criterionId,
        criterionName: criterion.name,
        answerId: answer.answerId,
        question: answer.question ?? `Answer ${answer.answerId}`,
        rubricAnchor: score.rubricAnchor,
        confidence: score.confidence,
        uncertaintyReasons: score.uncertaintyReasons,
        evidences
      }
    };
  }

  private buildEvidences(answerId: number, transcript: string, documentText?: string): ReportScore["evidences"] {
    const evidences: ReportScore["evidences"] = [
      {
        sourceType: "INTERVIEW_ANSWER",
        answerId,
        text: this.pickEvidence(transcript)
      }
    ];

    if (documentText?.trim()) {
      evidences.push({
        sourceType: "APPLICATION_DOCUMENT",
        documentRef: "application.documentText",
        text: this.pickEvidence(documentText)
      });
    }

    return evidences;
  }

  private pickEvidence(transcript: string, documentText?: string): string {
    const source = transcript.trim() || documentText?.trim() || "";
    return source.length > 160 ? `${source.slice(0, 157)}...` : source;
  }

  private scoreFor(weight: number, evidenceText: string): number {
    const weightBonus = Math.min(10, Math.max(0, Math.round(weight / 10)));
    const evidenceBonus = Math.min(10, Math.floor(evidenceText.length / 30));
    return Math.min(95, 70 + weightBonus + evidenceBonus);
  }

  private assessEvidence(
    transcript: string,
    documentText?: string,
    criterionDescription?: string
  ): {
    rubricAnchor: string;
    confidence: ReportEvaluationConfidence;
    uncertaintyReasons: string[];
  } {
    const combined = `${transcript}\n${documentText ?? ""}`.toLowerCase();
    const hasAction = /\b(found|analyzed|improved|optimized|built|designed|implemented|resolved|added|reduced)\b/.test(
      combined
    );
    const hasResult = /\b(result|performance|latency|cache|ttl|policy|policies|reduced|improved|increased)\b/.test(
      combined
    );
    const hasMetric = /\d|%|ms|sec|minute|hour|x\b/.test(combined);
    const hasDocumentContext = Boolean(documentText?.trim());
    const uncertaintyReasons = [
      ...(hasMetric ? [] : ["No explicit measurable outcome was provided."]),
      ...(hasDocumentContext ? [] : ["Application document evidence was not provided."]),
      ...(hasAction ? [] : ["Candidate action is not explicit in the answer."]),
      ...(hasResult ? [] : ["Result or impact is not explicit in the answer."])
    ];
    const confidence: ReportEvaluationConfidence =
      hasAction && hasResult && hasDocumentContext
        ? "HIGH"
        : hasAction && (hasResult || hasDocumentContext)
          ? "MEDIUM"
          : "LOW";

    return {
      rubricAnchor: criterionDescription?.trim()
        ? `Matches criterion: ${this.pickEvidence(criterionDescription)}`
        : "Structured interview evidence is mapped to the requested evaluation criterion.",
      confidence,
      uncertaintyReasons
    };
  }

  private summary(input: GenerateReportRequest, totalScore: number): string {
    const reportLabel =
      input.reportType === "RECRUITING_REPORT" ? "Recruiting report" : "Mock interview feedback";
    return `${reportLabel} generated from ${input.answers.length} answer(s), ${input.criteria.length} criterion item(s), and document context. Total score: ${totalScore}.`;
  }
}
