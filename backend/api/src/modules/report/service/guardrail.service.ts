import { Injectable } from "@nestjs/common";
import { GeneratedReport, GuardrailDecision, QuestionEvaluation, ReportEvidence, ReportScore, ReportType } from "../report.types";

const VALID_CONFIDENCE = new Set(["HIGH", "MEDIUM", "LOW"]);

const MOCK_REPORT_BANNED_TERMS = ["합격", "탈락", "채용 적합", "채용 부적합", "선별"];

@Injectable()
export class GuardrailService {
  validateReport(reportType: ReportType, report: GeneratedReport): GuardrailDecision {
    if (!report.summary.trim()) {
      return this.block("summary is required");
    }

    const scoreDecision = this.validateScores(reportType, report.scores, report.summary);
    if (scoreDecision.result === "BLOCKED") {
      return scoreDecision;
    }

    return this.validateQuestionEvaluations(report.questionEvaluations);
  }

  validateScores(reportType: ReportType, scores: ReportScore[], summary = ""): GuardrailDecision {
    if (scores.length === 0) {
      return this.block("at least one score is required");
    }

    for (const score of scores) {
      const structuredDecision = this.validateStructuredScore(score);
      if (structuredDecision.result === "BLOCKED") {
        return structuredDecision;
      }

      if (!score.rationale.trim()) {
        return this.block(`rationale is required for criterion ${score.criterionId}`);
      }

      if (score.evidences.length === 0 || score.evidences.some((evidence) => !evidence.text.trim())) {
        return this.block(`evidence is required for criterion ${score.criterionId}`);
      }

      for (const evidence of score.evidences) {
        if (!["INTERVIEW_ANSWER", "APPLICATION_DOCUMENT"].includes(evidence.sourceType)) {
          return this.block(`evidence source type is required for criterion ${score.criterionId}`);
        }
        if (evidence.sourceType === "INTERVIEW_ANSWER" && !evidence.answerId) {
          return this.block(`answer evidence source is required for criterion ${score.criterionId}`);
        }
        if (
          evidence.sourceType === "APPLICATION_DOCUMENT" &&
          !evidence.documentId &&
          !evidence.documentRef?.trim()
        ) {
          return this.block(`document evidence source is required for criterion ${score.criterionId}`);
        }
      }
    }

    if (reportType === "MOCK_INTERVIEW_REPORT") {
      const combinedText = [
        summary,
        ...scores.map((score) => score.rationale),
        ...scores.map((score) => score.rubricAnchor),
        ...scores.flatMap((score) => score.uncertaintyReasons),
        ...scores.flatMap((score) => score.evidences.map((evidence) => evidence.text))
      ].join("\n");

      const bannedTerm = MOCK_REPORT_BANNED_TERMS.find((term) => combinedText.includes(term));
      if (bannedTerm) {
        return this.block(`mock interview feedback cannot include hiring decision expression: ${bannedTerm}`);
      }
    }

    return {
      result: "PASS",
      reason: null
    };
  }

  private validateStructuredScore(score: ReportScore): GuardrailDecision {
    if (!score.rubricAnchor?.trim()) {
      return this.block(`rubric anchor is required for criterion ${score.criterionId}`);
    }
    if (!VALID_CONFIDENCE.has(score.confidence)) {
      return this.block(`confidence is required for criterion ${score.criterionId}`);
    }
    if (!Array.isArray(score.uncertaintyReasons)) {
      return this.block(`uncertainty reasons are required for criterion ${score.criterionId}`);
    }
    if (score.uncertaintyReasons.some((reason) => !reason.trim())) {
      return this.block(`uncertainty reasons must be non-empty for criterion ${score.criterionId}`);
    }

    return {
      result: "PASS",
      reason: null
    };
  }

  private validateQuestionEvaluations(questionEvaluations: QuestionEvaluation[]): GuardrailDecision {
    if (!Array.isArray(questionEvaluations) || questionEvaluations.length === 0) {
      return this.block("question evaluations are required");
    }

    for (const evaluation of questionEvaluations) {
      if (!evaluation.answerId || !evaluation.question?.trim()) {
        return this.block(`question evaluation source is required for criterion ${evaluation.criterionId}`);
      }
      if (!evaluation.rubricAnchor?.trim()) {
        return this.block(`question evaluation rubric anchor is required for criterion ${evaluation.criterionId}`);
      }
      if (!VALID_CONFIDENCE.has(evaluation.confidence)) {
        return this.block(`question evaluation confidence is required for criterion ${evaluation.criterionId}`);
      }
      if (!Array.isArray(evaluation.uncertaintyReasons)) {
        return this.block(`question evaluation uncertainty reasons are required for criterion ${evaluation.criterionId}`);
      }
      if (evaluation.uncertaintyReasons.some((reason) => !reason.trim())) {
        return this.block(
          `question evaluation uncertainty reasons must be non-empty for criterion ${evaluation.criterionId}`
        );
      }
      if (!Array.isArray(evaluation.evidences) || evaluation.evidences.length === 0) {
        return this.block(`question evaluation evidence is required for criterion ${evaluation.criterionId}`);
      }

      const evidenceDecision = this.validateEvidenceRefs(evaluation.criterionId, evaluation.evidences);
      if (evidenceDecision.result === "BLOCKED") {
        return evidenceDecision;
      }
    }

    return {
      result: "PASS",
      reason: null
    };
  }

  private validateEvidenceRefs(criterionId: number, evidences: ReportEvidence[]): GuardrailDecision {
    for (const evidence of evidences) {
      if (!["INTERVIEW_ANSWER", "APPLICATION_DOCUMENT"].includes(evidence.sourceType)) {
        return this.block(`evidence source type is required for criterion ${criterionId}`);
      }
      if (evidence.sourceType === "INTERVIEW_ANSWER" && !evidence.answerId) {
        return this.block(`answer evidence source is required for criterion ${criterionId}`);
      }
      if (
        evidence.sourceType === "APPLICATION_DOCUMENT" &&
        !evidence.documentId &&
        !evidence.documentRef?.trim()
      ) {
        return this.block(`document evidence source is required for criterion ${criterionId}`);
      }
    }

    return {
      result: "PASS",
      reason: null
    };
  }

  markRegenerated(decision: GuardrailDecision, reason?: string): GuardrailDecision {
    if (decision.result !== "PASS") {
      return decision;
    }

    return {
      result: "REGENERATED",
      reason: reason?.trim() || "output regenerated after guardrail review"
    };
  }

  private block(reason: string): GuardrailDecision {
    return {
      result: "BLOCKED",
      reason,
      failureCategory: "NON_RETRYABLE"
    };
  }
}
