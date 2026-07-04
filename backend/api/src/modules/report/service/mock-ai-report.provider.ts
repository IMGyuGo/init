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
    documentText?: string
  ): StructuredEvaluation {
    const scores: ReportScore[] = [];
    const questionEvaluations: QuestionEvaluation[] = [];

    criteria.forEach((criterion, index) => {
      const answer = answers[index % answers.length];
      const evidences = this.buildEvidences(answer.answerId, answer.transcript, documentText);
      const structured = this.assessEvidence(answer.transcript, documentText, criterion.description);
      const score = structured.score;
      const criterionName = this.localizedCriterionName(criterion.name);

      const reportScore: ReportScore = {
        criterionId: criterion.criterionId,
        criterionName,
        score,
        rationale: this.scoreRationale(criterionName, score, answer.transcript, structured),
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
        question: answer.question,
        rubricAnchor: structured.rubricAnchor,
        confidence: structured.confidence,
        uncertaintyReasons: structured.uncertaintyReasons,
        evidences
      });
    });

    return { scores, questionEvaluations };
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
    transcript: string,
    assessment: ReturnType<MockAiReportProvider["assessEvidence"]>
  ): string {
    const evidence = this.pickEvidence(transcript);
    const band = scoreBandFor(score);
    const improvement = assessment.uncertaintyReasons.includes("정량 성과나 전후 비교가 부족합니다.")
      ? "성과를 수치, 전후 비교, 검증 결과로 보강하면 더 설득력 있는 답변이 됩니다."
      : "행동과 결과가 함께 제시되어 답변 근거의 신뢰도가 비교적 높습니다.";

    if (criterionName === "직무/기술 역량") {
      return `${criterionName}은 ${score}점(${band.label})입니다. 답변에서 "${evidence}"를 통해 JD와 연결되는 기술 경험과 구현 판단을 확인했습니다. ${improvement}`;
    }

    if (criterionName === "문제 해결력") {
      return `${criterionName}은 ${score}점(${band.label})입니다. 문제를 확인 가능한 단위로 나누고 원인을 좁혀 가는 접근이 드러납니다. ${improvement}`;
    }

    if (criterionName === "실행력과 성과") {
      return `${criterionName}은 ${score}점(${band.label})입니다. 본인이 맡은 실행 과정과 결과를 답변 근거로 확인했습니다. ${improvement}`;
    }

    if (criterionName === "협업/커뮤니케이션") {
      return `${criterionName}은 ${score}점(${band.label})입니다. 상황과 역할을 전달하는 흐름을 확인했습니다. 이해관계자 조정 과정까지 더하면 전달력이 좋아집니다. ${improvement}`;
    }

    if (criterionName === "학습/성장성") {
      return `${criterionName}은 ${score}점(${band.label})입니다. 새로운 도구나 문제를 학습해 실제 흐름에 적용한 단서를 확인했습니다. ${improvement}`;
    }

    if (criterionName === "책임감/신뢰성") {
      return `${criterionName}은 ${score}점(${band.label})입니다. 문제를 끝까지 확인하고 검증하려는 태도가 답변 근거에서 확인됩니다. ${improvement}`;
    }

    return `${criterionName}은 ${score}점(${band.label})입니다. 답변에서 "${evidence}"를 근거로 관련 역량을 확인했습니다. ${improvement}`;
  }

  private assessEvidence(
    transcript: string,
    documentText?: string,
    criterionDescription?: string
  ): ReportEvidenceAssessment {
    return assessReportEvidence(transcript, documentText, criterionDescription);
  }

  private summary(input: GenerateReportRequest, totalScore: number): string {
    const reportLabel =
      input.reportType === "RECRUITING_REPORT" ? "채용 면접 리포트" : "모의면접 피드백";
    const band = scoreBandFor(totalScore);
    return `${reportLabel}는 ${input.answers.length}개 답변과 ${input.criteria.length}개 평가 기준을 바탕으로 생성되었습니다. 총점은 ${totalScore}점(${band.label})이며, 최종 판단은 사람이 검토해야 합니다.`;
  }
}
