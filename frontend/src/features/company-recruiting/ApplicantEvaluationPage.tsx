"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { getApplicantEvaluation, updateScreeningStatus } from "./api";
import { Breadcrumb, StatusBadge } from "./CompanyRecruitingChrome";
import { formatRecruitingStatusLabel } from "./status-labels";
import type { ApplicantEvaluation, ScreeningDecision } from "./types";

const decisions: ScreeningDecision[] = ["UNDECIDED", "PASS", "HOLD", "FAIL"];

export function ApplicantEvaluationPage({ applicantId }: { applicantId: number }) {
  const [evaluation, setEvaluation] = useState<ApplicantEvaluation | null>(null);
  const [decision, setDecision] = useState<ScreeningDecision>("UNDECIDED");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (options: { clearMessage?: boolean } = {}) => {
    setLoading(true);
    if (options.clearMessage !== false) {
      setMessage("");
    }
    try {
      const result = await getApplicantEvaluation(applicantId);
      setEvaluation(result.data);
      setDecision(result.data.screening.decision);
      setMemo(result.data.screening.memo ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "평가 상세를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await updateScreeningStatus(applicantId, {
        screeningDecision: decision,
        screeningMemo: memo || undefined,
      });
      await load({ clearMessage: false });
      window.alert("저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "전형 상태 저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const report = evaluation?.report ?? null;
  const displayAnswers = evaluation ? getDisplayAnswers(evaluation.answers) : [];

  return (
    <section className="app-page glass-page notion">
        <div className="page-head">
          <div>
            <Breadcrumb
              items={[
                { label: "공고 목록", href: "/company/recruitments" },
                ...(evaluation
                  ? [
                      {
                        label: evaluation.recruitment.title,
                        href: `/company/recruitments/${evaluation.recruitment.recruitmentId}`,
                      },
                      {
                        label: "지원자 관리",
                        href: `/company/recruitments/${evaluation.recruitment.recruitmentId}/applicants`,
                      },
                    ]
                  : []),
                { label: evaluation?.applicant.name ?? "평가 상세" },
              ]}
            />
            <h1>{evaluation?.applicant.name ?? "지원자 평가 상세"}</h1>
            {evaluation ? <p className="page-sub">{evaluation.applicant.email}</p> : null}
          </div>
          {evaluation ? (
            <Link className="btn secondary" href={`/company/recruitments/${evaluation.recruitment.recruitmentId}/applicants`}>
              지원자 목록
            </Link>
          ) : null}
        </div>

        {message ? <p className="notice">{message}</p> : null}

        {evaluation ? (
          <>
            <section className="kpi-row status-row">
              <div className="kpi">
                <span>지원 상태</span>
                <strong>{formatRecruitingStatusLabel(evaluation.statuses.applicationStatus)}</strong>
              </div>
              <div className="kpi">
                <span>서류 상태</span>
                <strong>{formatRecruitingStatusLabel(evaluation.statuses.documentStatus)}</strong>
              </div>
              <div className="kpi">
                <span>면접 상태</span>
                <strong>{formatRecruitingStatusLabel(evaluation.statuses.interviewStatus)}</strong>
              </div>
              <div className="kpi">
                <span>리포트 상태</span>
                <strong>{formatRecruitingStatusLabel(evaluation.statuses.reportStatus)}</strong>
              </div>
            </section>

            <form className="panel" onSubmit={handleSubmit}>
              <div className="panel-head">
                <div>
                  <h2>전형 상태</h2>
                  <p>저장 가능한 값은 미정, 합격, 보류, 불합격입니다.</p>
                </div>
                <button className="btn primary" type="submit" disabled={loading}>
                  저장
                </button>
              </div>
              <div className="grid-2">
                <label>
                  전형 상태
                  <select value={decision} onChange={(event) => setDecision(event.target.value as ScreeningDecision)}>
                    {decisions.map((item) => (
                      <option key={item} value={item}>
                        {formatRecruitingStatusLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wide">
                  수동 메모
                  <textarea value={memo} onChange={(event) => setMemo(event.target.value)} />
                </label>
              </div>
            </form>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>채용 리포트</h2>
                  <p>리포트가 없으면 없음/생성중 상태로 표시합니다.</p>
                </div>
                <StatusBadge value={report?.status ?? "NONE_OR_GENERATING"} />
              </div>

              {report ? (
                <div className="detail-stack">
                  <div className="score-summary">
                    <span>총점</span>
                    <strong>{report.totalScore ?? "점수 없음"}</strong>
                    <p>{report.summary ?? "요약이 아직 없습니다."}</p>
                  </div>
                  {report.scores.length > 0 ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>기준</th>
                            <th>점수</th>
                            <th>근거</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.scores.map((score) => (
                            <tr key={score.scoreId}>
                              <td>{score.criterionName ?? "기준 없음"}</td>
                              <td>{score.score}</td>
                              <td>
                                {score.rationale ?? "근거 없음"}
                                {score.evidences.map((evidence) => (
                                  <span key={evidence.evidenceId}>{evidence.evidenceText}</span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty">세부 점수와 근거가 아직 없습니다.</div>
                  )}
                </div>
              ) : (
                <div className="empty">리포트가 없거나 생성 중입니다.</div>
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>면접 답변</h2>
                  <p>지원자가 실제로 받은 질문과 답변 스크립트를 확인합니다.</p>
                </div>
              </div>

              {displayAnswers.length > 0 ? (
                <div className="company-answer-list">
                  {displayAnswers.map((answer, index) => (
                    <article className="company-answer-card" key={answer.answerId}>
                      <div className="company-answer-card-head">
                        <div>
                          <span>질문 {index + 1}</span>
                          <h3>{answer.questionContent ?? "질문 정보 없음"}</h3>
                        </div>
                        <span className="company-question-type">{formatQuestionTypeLabel(answer.questionType)}</span>
                      </div>

                      <div className="company-answer-block">
                        <strong>답변</strong>
                        <p>{answer.transcript?.trim() ? answer.transcript : "답변 스크립트가 없습니다."}</p>
                      </div>

                      {answer.followUpQuestions.length > 0 ? (
                        <div className="company-answer-block">
                          <strong>생성된 꼬리질문</strong>
                          <ul>
                            {answer.followUpQuestions.map((followUp) => (
                              <li key={followUp.followUpId}>
                                <span className="company-follow-up-question">{followUp.content}</span>
                                <div className="company-follow-up-answer">
                                  <strong>꼬리질문 답변</strong>
                                  <p>{followUp.answer?.transcript?.trim() ? followUp.answer.transcript : "저장된 꼬리질문 답변이 없습니다."}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {answer.durationSeconds != null ? (
                        <div className="company-answer-meta">답변 시간 {answer.durationSeconds}초</div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty">저장된 면접 답변이 없습니다.</div>
              )}
            </section>
          </>
        ) : (
          <div className="empty">평가 상세를 불러오는 중입니다.</div>
        )}
    </section>
  );
}

function formatQuestionTypeLabel(value?: string | null) {
  const labels: Record<string, string> = {
    INTRO: "자기소개",
    TECHNICAL: "기술 질문",
    EXPERIENCE: "경험 질문",
    SITUATION: "상황 질문",
    FOLLOW_UP: "꼬리질문",
    CLOSING: "마무리",
  };
  return value ? labels[value] ?? value : "질문";
}

function getDisplayAnswers(answers: ApplicantEvaluation["answers"]) {
  return answers.filter((answer) => answer.questionType !== "FOLLOW_UP" || !isLinkedFollowUpAnswer(answers, answer));
}

function isLinkedFollowUpAnswer(answers: ApplicantEvaluation["answers"], candidate: ApplicantEvaluation["answers"][number]) {
  const content = normalizeQuestionText(candidate.questionContent);
  if (!content) {
    return false;
  }
  return answers.some((answer) =>
    answer.followUpQuestions.some((followUp) => normalizeQuestionText(followUp.content) === content && followUp.answer?.answerId === candidate.answerId),
  );
}

function normalizeQuestionText(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}
