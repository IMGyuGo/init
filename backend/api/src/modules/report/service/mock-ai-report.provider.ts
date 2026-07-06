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
  ReportScore
} from "../report.types";
import {
  assessReportEvidence,
  normalizeReportCriterionName,
  type ReportEvidenceAssessment,
  scoreBandFor,
  weightedTotalScore
} from "./service-interview-rubric";

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
      input.documentText,
      input.jobDescription
    );
    const totalScore = weightedTotalScore(scores, input.criteria);

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
    documentText?: string,
    jobDescription?: string
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
      const evidences = this.buildEvidences(answer.answerId, transcript, documentText);
      const structured = this.assessEvidence(transcript, documentText, criterion.description, jobDescription);
      const score = structured.score;
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

  private localizedCriterionName(name: string): string {
    return normalizeReportCriterionName(name);
  }

  private scoreRationale(
    criterionName: string,
    score: number,
    _transcript: string,
    assessment: ReturnType<MockAiReportProvider["assessEvidence"]>
  ): string {
    const band = scoreBandFor(score);
    const improvement = assessment.uncertaintyReasons.includes("정량 성과나 전후 비교가 부족합니다.")
      ? "성과를 수치, 전후 비교, 검증 결과로 보강하면 더 설득력 있는 답변이 됩니다."
      : "행동과 결과가 함께 제시되어 답변 근거의 신뢰도가 비교적 높습니다.";
    const subject = `${criterionName}${topicParticle(criterionName)}`;

    if (criterionName === "직무 적합성") {
      return `${subject} ${score}점(${band.label})입니다. JD와 연결되는 기술 경험과 역할 이해를 답변 근거로 확인했습니다. ${improvement}`;
    }

    if (criterionName === "문제 해결력") {
      return `${subject} ${score}점(${band.label})입니다. 문제를 확인 가능한 단위로 나누고 원인을 좁혀 가는 접근이 보입니다. ${improvement}`;
    }

    if (criterionName === "실행력과 성과") {
      return `${subject} ${score}점(${band.label})입니다. 직접 실행한 작업과 그 결과를 답변에서 확인했습니다. ${improvement}`;
    }

    if (criterionName === "학습 민첩성") {
      return `${subject} ${score}점(${band.label})입니다. 새로 익힌 내용을 실제 문제에 적용한 흐름을 답변에서 확인했습니다. ${improvement}`;
    }

    if (criterionName === "커뮤니케이션") {
      return `${subject} ${score}점(${band.label})입니다. 상황과 역할을 설명하는 흐름을 답변에서 확인했습니다. 이해관계자 조정 과정까지 더하면 전달력이 좋아집니다. ${improvement}`;
    }

    if (criterionName === "성장 가능성") {
      return `${subject} ${score}점(${band.label})입니다. 문제를 검증하고 다음 개선으로 이어가려는 태도를 답변 근거로 확인했습니다. ${improvement}`;
    }

    return `${subject} ${score}점(${band.label})입니다. 답변 흐름을 바탕으로 관련 역량을 평가했습니다. ${improvement}`;
  }

  private assessEvidence(
    transcript: string,
    documentText?: string,
    criterionDescription?: string,
    jobDescription?: string
  ): ReportEvidenceAssessment {
    return assessReportEvidence(transcript, documentText, criterionDescription, jobDescription);
  }

  private summary(input: GenerateReportRequest, totalScore: number): string {
    const reportLabel =
      input.reportType === "RECRUITING_REPORT" ? "채용 면접 리포트" : "모의면접 피드백";
    const band = scoreBandFor(totalScore);
    return `${reportLabel}는 ${input.answers.length}개 답변과 ${input.criteria.length}개 평가 기준을 바탕으로 생성되었습니다. 총점은 ${totalScore}점(${band.label})이며, 최종 판단은 사람이 검토해야 합니다.`;
  }
}

function topicParticle(value: string): "은" | "는" {
  const lastChar = value.trim().at(-1);
  if (!lastChar) return "은";
  const charCode = lastChar.charCodeAt(0);
  if (charCode < 0xac00 || charCode > 0xd7a3) return "은";
  return (charCode - 0xac00) % 28 === 0 ? "는" : "은";
}
