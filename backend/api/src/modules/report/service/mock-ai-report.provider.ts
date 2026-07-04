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
      const criterionName = this.localizedCriterionName(criterion.name);

      const reportScore: ReportScore = {
        criterionId: criterion.criterionId,
        criterionName,
        score,
        rationale: this.scoreRationale(criterionName, score, transcript, structured),
        rubricAnchor: structured.rubricAnchor,
        confidence: structured.confidence,
        uncertaintyReasons: structured.uncertaintyReasons,
        evidences
      };

      scores.push(reportScore);
      questionEvaluations.push({
        criterionId: criterion.criterionId,
        criterionName,
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

  private localizedCriterionName(name: string): string {
    const normalized = name.toLowerCase();
    if (normalized.includes("role") || normalized.includes("fit")) {
      return "직무 적합성";
    }
    if (normalized.includes("problem") || normalized.includes("solving")) {
      return "문제 해결력";
    }
    if (normalized.includes("communication")) {
      return "커뮤니케이션";
    }
    if (normalized.includes("technical")) {
      return "기술 이해도";
    }
    return name;
  }

  private scoreRationale(
    criterionName: string,
    score: number,
    transcript: string,
    assessment: ReturnType<MockAiReportProvider["assessEvidence"]>
  ): string {
    const evidence = this.pickEvidence(transcript);
    const improvement = assessment.uncertaintyReasons.includes("No explicit measurable outcome was provided.")
      ? "성과나 결과를 수치 또는 전후 비교로 보강하면 더 설득력 있는 답변이 됩니다."
      : "행동과 결과가 함께 제시되어 답변의 신뢰도가 비교적 높습니다.";

    if (criterionName === "직무 적합성") {
      return `${criterionName}은 ${score}점입니다. 답변에서 "${evidence}"를 통해 지원 직무와 연결되는 구현 경험과 관심 분야가 확인됩니다. ${improvement}`;
    }

    if (criterionName === "문제 해결력") {
      return `${criterionName}은 ${score}점입니다. 문제 상황을 확인 가능한 단위로 나누고 원인을 좁혀 가는 접근이 드러납니다. ${improvement}`;
    }

    if (criterionName === "커뮤니케이션") {
      return `${criterionName}은 ${score}점입니다. 경험을 차분하게 설명해 흐름은 이해하기 쉽지만, 상황-행동-결과 순서로 조금 더 압축하면 전달력이 좋아집니다. ${improvement}`;
    }

    return `${criterionName}은 ${score}점입니다. 답변에서 "${evidence}"를 근거로 관련 역량을 확인할 수 있습니다. ${improvement}`;
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
