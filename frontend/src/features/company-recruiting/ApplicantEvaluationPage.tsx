"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { createApplicantInterviewMediaSession, getApplicantDocument, getApplicantEvaluation, updateScreeningStatus } from "./api";
import { Breadcrumb, StatusBadge } from "./CompanyRecruitingChrome";
import { formatRecruitingStatusLabel } from "./status-labels";
import type { ApplicantEvaluation, ApplicantInterviewFileAsset, ScreeningDecision } from "./types";

const decisions: ScreeningDecision[] = ["UNDECIDED", "PASS", "HOLD", "FAIL"];

// 전형 결정 카드 라디오에 표시할 설명/톤. (#289)
const DECISION_OPTION_META: Record<ScreeningDecision, { description: string; tone: "neutral" | "pass" | "hold" | "fail" }> = {
  UNDECIDED: { description: "아직 결정하지 않음", tone: "neutral" },
  PASS: { description: "다음 전형으로 진행", tone: "pass" },
  HOLD: { description: "추가 검토 후 결정", tone: "hold" },
  FAIL: { description: "채용 진행 중단", tone: "fail" },
};

type ReportTab = "overview" | "answers" | "submission" | "decision";

const REPORT_TABS: ReadonlyArray<{ id: ReportTab; label: string }> = [
  { id: "overview", label: "종합" },
  { id: "answers", label: "면접 답변" },
  { id: "submission", label: "지원 정보" },
  { id: "decision", label: "전형 결정" },
];

export function ApplicantEvaluationPage({ applicantId }: { applicantId: number }) {
  const [evaluation, setEvaluation] = useState<ApplicantEvaluation | null>(null);
  const [decision, setDecision] = useState<ScreeningDecision>("UNDECIDED");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<number | null>(null);
  const [tab, setTab] = useState<ReportTab>("overview");

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

  async function handleOpenDocument(fileId: number) {
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setOpeningDocumentId(fileId);
    setMessage("");
    try {
      const blob = await getApplicantDocument(applicantId, fileId);
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = objectUrl;
      } else {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.target = "_blank";
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      previewWindow?.close();
      setMessage(error instanceof Error ? error.message : "제출 서류를 불러오지 못했습니다.");
    } finally {
      setOpeningDocumentId(null);
    }
  }

  const report = evaluation?.report ?? null;
  const displayAnswers = evaluation ? getDisplayAnswers(evaluation.answers) : [];
  const integritySummary = evaluation ? buildRecruitingIntegritySummary(displayAnswers) : null;

  return (
    <section className="app-page glass-page notion applicant-report-page">
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
                    ]
                  : []),
                { label: evaluation?.applicant.name ?? "평가 상세" },
              ]}
            />
            <h1>{evaluation?.applicant.name ?? "지원자 평가 상세"}</h1>
            {evaluation ? <p className="page-sub">{evaluation.applicant.email}</p> : null}
          </div>
          {evaluation ? (
            <Link className="btn secondary" href={`/company/recruitments/${evaluation.recruitment.recruitmentId}`}>
              공고 대시보드
            </Link>
          ) : null}
        </div>

        {message ? <p className="notice">{message}</p> : null}

        {evaluation ? (
          <>
            <nav className="report-tabs" role="tablist" aria-label="지원자 리포트 탭">
              {REPORT_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`report-tab${tab === item.id ? " is-active" : ""}`}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {tab === "overview" ? (
              <div className="report-tabpanel" role="tabpanel">
                <ReportOverview report={report} integritySummary={integritySummary} />
              </div>
            ) : null}

            {tab === "submission" ? (
              <div className="report-tabpanel" role="tabpanel">
            <section className="panel applicant-submission-panel">
              <div className="panel-head">
                <div>
                  <h2>지원 정보</h2>
                </div>
              </div>
              <dl className="applicant-submission-details">
                <SubmissionItem label="이름" value={evaluation.submission.name} />
                <SubmissionItem label="이메일" value={evaluation.submission.email} />
                <SubmissionItem label="연락처" value={evaluation.submission.phone} />
                <SubmissionLink label="GitHub" value={evaluation.submission.githubUrl} />
                <SubmissionLink label="블로그" value={evaluation.submission.blogUrl} />
                <SubmissionLink label="포트폴리오 URL" value={evaluation.submission.portfolioUrl} />
                <SubmissionItem label="지원동기" value={evaluation.submission.motivation} multiline />
                <SubmissionItem label="추가 설명" value={evaluation.submission.additionalInfo} multiline />
              </dl>
              <div className="applicant-submission-documents">
                <h3>제출 서류</h3>
                {evaluation.submission.documents.length ? (
                  evaluation.submission.documents.map((documentItem) => (
                    <div className="applicant-document-row" key={documentItem.documentId}>
                      <div>
                        <strong>{documentItem.documentType === "RESUME" ? "이력서" : "포트폴리오"}</strong>
                        <span>{documentItem.originalName} · {formatFileSize(documentItem.sizeBytes)}</span>
                      </div>
                      <button
                        className="btn secondary compact"
                        type="button"
                        disabled={openingDocumentId === documentItem.fileId}
                        onClick={() => void handleOpenDocument(documentItem.fileId)}
                      >
                        {openingDocumentId === documentItem.fileId ? "여는 중" : "파일 열기"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty">제출된 파일을 찾을 수 없습니다.</div>
                )}
              </div>
            </section>
              </div>
            ) : null}

            {tab === "decision" ? (
              <div className="report-tabpanel" role="tabpanel">
                <form className="panel decision-panel" onSubmit={handleSubmit}>
                  <div className="panel-head">
                    <div>
                      <h2>전형 결정</h2>
                    </div>
                  </div>

                  <DecisionSummary report={report} />

                  <div className="decision-field">
                    <span className="decision-field-label">전형 상태</span>
                    <div className="decision-options" role="radiogroup" aria-label="전형 상태 선택">
                      {decisions.map((item) => {
                        const optionMeta = DECISION_OPTION_META[item];
                        const isSelected = decision === item;
                        return (
                          <button
                            key={item}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            className={`decision-option tone-${optionMeta.tone}${isSelected ? " is-selected" : ""}`}
                            onClick={() => setDecision(item)}
                          >
                            <strong>{formatRecruitingStatusLabel(item)}</strong>
                            <span>{optionMeta.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="decision-field">
                    <label className="decision-field-label" htmlFor="decision-memo">수동 메모</label>
                    <textarea
                      id="decision-memo"
                      className="decision-memo"
                      value={memo}
                      placeholder="결정 사유나 참고 사항을 남겨주세요. 팀원들이 함께 볼 수 있어요."
                      onChange={(event) => setMemo(event.target.value)}
                    />
                  </div>

                  <div className="decision-actions">
                    <button className="btn primary" type="submit" disabled={loading}>
                      저장
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {tab === "answers" ? (
              <div className="report-tabpanel" role="tabpanel">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>면접 답변</h2>
                </div>
              </div>

              {displayAnswers.length > 0 ? (
                <div className="company-answer-list">
                  {displayAnswers.map((answer, index) => (
                    <article className="company-answer-item" key={answer.answerId}>
                      <div className="company-answer-rail">
                        <span className="company-answer-qnum">{index + 1}</span>
                      </div>
                      <div className="company-answer-body">
                      <header className="company-answer-qhead">
                        <span className="company-answer-qmeta">
                          질문 {index + 1}
                          <span className="company-answer-type">{formatQuestionTypeLabel(answer.questionType)}</span>
                        </span>
                        <h3>{answer.questionContent ?? "질문 정보 없음"}</h3>
                      </header>

                      <CompanyAnswerMedia
                        applicantId={applicantId}
                        audioFile={answer.audioFile}
                        videoFile={answer.videoFile}
                      />

                      <div className="company-answer-block company-answer-bubble">
                        <span className="company-answer-label is-answer">답변</span>
                        {answer.transcript?.trim() ? (
                          <CollapsibleText text={answer.transcript} />
                        ) : (
                          <p className="company-answer-empty-text">답변 스크립트가 없습니다.</p>
                        )}
                      </div>

                      <RecruitingIntegritySignalView metadata={answer.nonverbalMetadata} />

                      {answer.followUpQuestions.length > 0 ? (
                        <div className="company-answer-block company-answer-section">
                          <span className="company-answer-label">꼬리질문</span>
                          <ol className="company-followup-list">
                            {answer.followUpQuestions.map((followUp) => (
                              <li className="company-followup-card" key={followUp.followUpId}>
                                <p className="company-follow-up-question">{followUp.content}</p>
                                <div className="company-follow-up-answer">
                                  <span className="company-answer-label is-sub is-answer">답변</span>
                                  <CompanyAnswerMedia
                                    applicantId={applicantId}
                                    audioFile={followUp.answer?.audioFile ?? null}
                                    compact
                                    videoFile={followUp.answer?.videoFile ?? null}
                                  />
                                  <p>{followUp.answer?.transcript?.trim() ? followUp.answer.transcript : "저장된 꼬리질문 답변이 없습니다."}</p>
                                  <RecruitingIntegritySignalView metadata={followUp.answer?.nonverbalMetadata ?? null} compact />
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}

                      {answer.durationSeconds != null ? (
                        <div className="company-answer-meta">답변 시간 {answer.durationSeconds}초</div>
                      ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty">저장된 면접 답변이 없습니다.</div>
              )}
            </section>
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty">평가 상세를 불러오는 중입니다.</div>
        )}
    </section>
  );
}

// 전형 결정 탭 상단 평가 요약 — 다른 탭에 가지 않고 여기서 바로 판단할 수 있게 핵심만 보여준다. (#289)
function DecisionSummary({ report }: { report: ApplicantEvaluation["report"] }) {
  if (!report) {
    return (
      <div className="decision-summary is-empty">
        <p>아직 생성된 평가 리포트가 없습니다. 리포트 없이도 전형 상태를 저장할 수 있어요.</p>
      </div>
    );
  }

  const displayedScore = report.adjustedTotalScore ?? report.totalScore ?? null;
  const band = scoreBand(displayedScore);
  const result = reportResult(report.result);
  const findings = (report.keyFindings ?? []).slice(0, 3);

  return (
    <div className="decision-summary">
      <div className="decision-summary-head">
        <span className="decision-summary-label">평가 요약</span>
        <div className="decision-summary-badges">
          {displayedScore != null ? <strong className="decision-summary-score">{displayedScore}점</strong> : null}
          {band ? <span className={`report-score-band band-${band.tone}`}>{band.label}</span> : null}
          {result ? (
            <span className={`report-result result-${result.tone} decision-summary-result`}>
              <span className="report-result-dot" aria-hidden="true" />
              AI 추천 {result.label}
            </span>
          ) : null}
        </div>
      </div>
      {findings.length > 0 ? (
        <ul className="decision-summary-findings">
          {findings.map((finding, index) => (
            <li key={index} className={finding.isGap ? "is-gap" : undefined}>{finding.text}</li>
          ))}
        </ul>
      ) : report.summary?.trim() ? (
        <p className="decision-summary-text">{stripHtml(report.summary)}</p>
      ) : null}
    </div>
  );
}

function CollapsibleText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      setOverflowing(el.scrollHeight > el.clientHeight + 2);
    }
  }, [text]);

  return (
    <>
      <p ref={ref} className={`company-answer-transcript${expanded ? " is-expanded" : ""}`}>
        {text}
      </p>
      {overflowing || expanded ? (
        <button type="button" className="company-answer-more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "접기" : "더 보기"}
        </button>
      ) : null}
    </>
  );
}

function ReportOverview({
  report,
  integritySummary,
}: {
  report: ApplicantEvaluation["report"];
  integritySummary: RecruitingIntegritySummary | null;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const toggleExpanded = (scoreId: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(scoreId)) {
        next.delete(scoreId);
      } else {
        next.add(scoreId);
      }
      return next;
    });
  // 레이더(육각형) 그래프에서 클릭한 역량. 기본은 최고 점수 역량. (#289)
  const [selectedScoreId, setSelectedScoreId] = useState<number | null>(null);

  if (!report) {
    return (
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>종합 평가</h2>
          </div>
          <StatusBadge value="NONE_OR_GENERATING" />
        </div>
        <div className="empty">리포트가 없거나 생성 중입니다.</div>
      </section>
    );
  }

  const displayedScore = report.adjustedTotalScore ?? report.totalScore ?? null;
  const band = scoreBand(displayedScore);
  const scorePercent = displayedScore == null ? null : clampPercent(displayedScore);
  const flaggedAnswers = integritySummary?.signalAnswers ?? 0;
  const result = reportResult(report.result);
  const gaugeTone = result ? result.tone : "accent";
  const keyFindings = report.keyFindings ?? [];
  const followUp = report.followUp ?? null;
  const topScore = report.scores.length > 0 ? [...report.scores].sort((a, b) => b.score - a.score)[0] : null;
  const selectedScore = report.scores.find((score) => score.scoreId === selectedScoreId) ?? topScore;

  return (
    <section className="panel report-overview">
      <div className="panel-head">
        <div>
          <h2>종합 평가</h2>
        </div>
        <StatusBadge value={report.status ?? "NONE_OR_GENERATING"} />
      </div>

      <div className="report-score-hero">
        <div className={`report-gauge gauge-${gaugeTone}`} role="img" aria-label={displayedScore == null ? "종합 점수 없음" : `최종 점수 ${displayedScore}점`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="report-gauge-track" cx="60" cy="60" r="52" />
            {scorePercent != null ? (
              <circle
                className="report-gauge-fill"
                cx="60"
                cy="60"
                r="52"
                strokeDasharray={`${(scorePercent / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
              />
            ) : null}
            {report.passScore != null ? (
              (() => {
                // 총점 합격선 마커. svg 전체가 -90도 회전되어 있어 0도가 12시 방향이다. (#289)
                const cutAngle = (clampPercent(report.passScore) / 100) * 2 * Math.PI;
                const cos = Math.cos(cutAngle);
                const sin = Math.sin(cutAngle);
                return (
                  <line
                    className="report-gauge-cutline"
                    x1={60 + 45 * cos}
                    y1={60 + 45 * sin}
                    x2={60 + 59 * cos}
                    y2={60 + 59 * sin}
                  />
                );
              })()
            ) : null}
          </svg>
          <div className="report-gauge-value">
            <strong>{displayedScore ?? "—"}</strong>
            <span>최종 점수</span>
          </div>
        </div>

        <div className="report-score-side">
          <span className="report-result-row">
            {result ? (
              <span className={`report-result result-${result.tone}`}>
                <span className="report-result-dot" aria-hidden="true" />
                {result.label}
              </span>
            ) : band ? (
              <span className={`report-score-band band-${band.tone}`}>{band.label}</span>
            ) : null}
            {report.passScore != null ? (
              <span className="report-cutline-caption">합격선 {report.passScore}점</span>
            ) : null}
          </span>
          {flaggedAnswers > 0 ? (
            <div className="report-integrity-note">
              <div className="report-integrity-note-head">
                <span className="report-integrity-badge level-medium">응시 무결성 참고 신호</span>
                <span className="report-integrity-raw">{flaggedAnswers}개 답변 확인 필요</span>
              </div>
              <p className="report-integrity-hint">미검증 참고 신호로, 점수에는 반영되지 않았습니다. 면접 답변 탭에서 답변별 신호를 확인하세요.</p>
            </div>
          ) : null}
          <p className="report-summary-text">{stripHtml(report.summary) || "요약이 아직 없습니다."}</p>
        </div>
      </div>

      <div className="report-competency">
        <h3>역량별 평가</h3>
        {report.scores.length >= 3 ? (
          <div className="report-competency-layout">
            <div className="report-radar-wrap">
              <CompetencyRadar
                scores={report.scores}
                selectedId={selectedScore?.scoreId ?? -1}
                onSelect={setSelectedScoreId}
              />
              <p className="report-radar-hint">
                그래프의 역량을 클릭하면 오른쪽에서 근거를 볼 수 있어요.
                {report.scores.every((score) => score.passScore != null) ? " 붉은 점선은 역량별 합격선이에요." : ""}
              </p>
            </div>
            {selectedScore ? <CompetencyDetailCard score={selectedScore} /> : null}
          </div>
        ) : report.scores.length > 0 ? (
          <ul className="report-competency-list">
            {[...report.scores]
              .sort((a, b) => b.score - a.score)
              .map((score) => {
              const pct = clampPercent(score.score);
              const scoreTone = competencyBand(score.score).tone;
              const hasDetail = Boolean(score.rationale?.trim()) || score.evidences.length > 0;
              const isOpen = expanded.has(score.scoreId);
              return (
                <li className="report-competency-item" key={score.scoreId}>
                  <div className="report-competency-row">
                    <span className="report-competency-namewrap">
                      <span className="report-competency-name">{formatScoreCriterionName(score.criterionName, score.rationale)}</span>
                      {score.weight != null ? <span className="report-competency-weight">가중치 {score.weight}%</span> : null}
                    </span>
                    <span className={`report-competency-score tone-${scoreTone}`}>{score.score}</span>
                  </div>
                  <div className="report-competency-bar" aria-hidden="true">
                    <span className={`tone-${scoreTone}`} style={{ width: `${pct}%` }} />
                  </div>
                  {hasDetail ? (
                    <>
                      <button
                        type="button"
                        className="report-competency-toggle"
                        aria-expanded={isOpen}
                        onClick={() => toggleExpanded(score.scoreId)}
                      >
                        {isOpen ? "근거 숨기기" : "근거 보기"}
                        <span className={`report-competency-caret${isOpen ? " is-open" : ""}`} aria-hidden="true">⌄</span>
                      </button>
                      {isOpen ? (
                        <div className="report-competency-detail">
                          {score.rationale?.trim() ? <p className="report-competency-rationale">{score.rationale}</p> : null}
                          {score.evidences.length > 0 ? (
                            <div className="report-competency-evidence">
                              {score.evidences.map((evidence) => (
                                <blockquote key={evidence.evidenceId}>{evidence.evidenceText}</blockquote>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">세부 점수와 근거가 아직 없습니다.</div>
        )}
      </div>

      {keyFindings.length > 0 ? (
        <div className="report-findings">
          <h3>주요 근거</h3>
          <ul className="report-findings-list">
            {keyFindings.map((finding, index) => (
              <li key={index} className={finding.isGap ? "is-gap" : undefined}>
                {finding.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {followUp ? (
        <div className="report-followup">
          <h3>꼬리질문</h3>
          <div className="report-followup-box">
            <div className="report-followup-row">
              <span className="report-followup-label">부족 포인트</span>
              <span className="report-followup-text">{followUp.gapPoint}</span>
            </div>
            <div className="report-followup-row">
              <span className="report-followup-label">꼬리질문 답변</span>
              <span className="report-followup-text">{followUp.answerStatus}</span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type ReportScore = NonNullable<ApplicantEvaluation["report"]>["scores"][number];

// 역량별 레이더(육각형) 그래프. 꼭짓점/라벨 클릭 시 우측 상세로 연동한다. (#289)
const RADAR_VIEW_WIDTH = 460;
const RADAR_VIEW_HEIGHT = 340;
const RADAR_CX = 230;
const RADAR_CY = 170;
const RADAR_RADIUS = 104;

function CompetencyRadar({
  scores,
  selectedId,
  onSelect,
}: {
  scores: ReportScore[];
  selectedId: number;
  onSelect: (scoreId: number) => void;
}) {
  // hover한 역량 축을 통째로 하이라이트(축선·꼭짓점·라벨)한다. (#289)
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const count = scores.length;
  const angleAt = (index: number) => ((-90 + (360 / count) * index) * Math.PI) / 180;
  const pointAt = (index: number, r: number): [number, number] => [
    RADAR_CX + r * Math.cos(angleAt(index)),
    RADAR_CY + r * Math.sin(angleAt(index)),
  ];
  const ringPoints = (r: number) =>
    scores.map((_, index) => pointAt(index, r).map((value) => value.toFixed(1)).join(",")).join(" ");
  const dataPoints = scores.map((score, index) => pointAt(index, (RADAR_RADIUS * clampPercent(score.score)) / 100));
  // 역량별 합격선. 모든 역량에 합격선이 있을 때만 점선 다각형으로 표시한다. (#289)
  const hasCutline = scores.every((score) => score.passScore != null);
  const cutlinePoints = hasCutline
    ? scores
        .map((score, index) =>
          pointAt(index, (RADAR_RADIUS * clampPercent(score.passScore ?? 0)) / 100)
            .map((value) => value.toFixed(1))
            .join(","),
        )
        .join(" ")
    : null;

  return (
    <svg
      className="report-radar"
      viewBox={`0 0 ${RADAR_VIEW_WIDTH} ${RADAR_VIEW_HEIGHT}`}
      role="img"
      aria-label="역량별 점수 그래프"
    >
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <polygon key={fraction} className="report-radar-ring" points={ringPoints(RADAR_RADIUS * fraction)} />
      ))}
      {scores.map((score, index) => {
        const [x, y] = pointAt(index, RADAR_RADIUS);
        const isHot = score.scoreId === hoveredId || score.scoreId === selectedId;
        return (
          <line
            key={score.scoreId}
            className={`report-radar-axis${isHot ? " is-hot" : ""}`}
            x1={RADAR_CX}
            y1={RADAR_CY}
            x2={x}
            y2={y}
          />
        );
      })}
      {cutlinePoints ? <polygon className="report-radar-cutline" points={cutlinePoints} /> : null}
      <g className="report-radar-shape">
        <polygon
          className="report-radar-area"
          points={dataPoints.map((point) => point.map((value) => value.toFixed(1)).join(",")).join(" ")}
        />
        {dataPoints.map((point, index) => {
          const isSelected = scores[index].scoreId === selectedId;
          const isHovered = scores[index].scoreId === hoveredId;
          return (
            <g key={scores[index].scoreId}>
              {isSelected || isHovered ? (
                <circle className="report-radar-halo" cx={point[0]} cy={point[1]} r={13} />
              ) : null}
              <circle
                className={`report-radar-dot${isSelected ? " is-selected" : ""}`}
                cx={point[0]}
                cy={point[1]}
                r={isSelected ? 6 : isHovered ? 5.5 : 4}
                onClick={() => onSelect(scores[index].scoreId)}
                onMouseEnter={() => setHoveredId(scores[index].scoreId)}
                onMouseLeave={() => setHoveredId(null)}
              />
            </g>
          );
        })}
      </g>
      {scores.map((score, index) => {
        const [labelX, labelY] = pointAt(index, RADAR_RADIUS + 24);
        const cos = Math.cos(angleAt(index));
        const sin = Math.sin(angleAt(index));
        const anchor = Math.abs(cos) < 0.35 ? "middle" : cos > 0 ? "start" : "end";
        const baseY = sin < -0.35 ? labelY - 14 : labelY;
        const isSelected = score.scoreId === selectedId;
        const isHovered = score.scoreId === hoveredId;
        return (
          <g
            key={score.scoreId}
            className={`report-radar-label${isSelected ? " is-selected" : ""}${isHovered ? " is-hot" : ""}`}
            onClick={() => onSelect(score.scoreId)}
            onMouseEnter={() => setHoveredId(score.scoreId)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <text x={labelX} y={baseY} textAnchor={anchor}>
              <tspan className="report-radar-label-name" x={labelX} dy="0">
                {formatScoreCriterionName(score.criterionName, score.rationale)}
              </tspan>
              <tspan className="report-radar-label-score" x={labelX} dy="16">
                {score.score}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// 레이더에서 선택한 역량의 근거/증거 상세. (#289)
function CompetencyDetailCard({ score }: { score: ReportScore }) {
  const band = competencyBand(score.score);
  return (
    <aside className="report-competency-detailpanel" key={score.scoreId}>
      <div className="report-competency-detailpanel-head">
        <span className="report-competency-namewrap">
          <span className="report-competency-name">{formatScoreCriterionName(score.criterionName, score.rationale)}</span>
          {score.weight != null ? <span className="report-competency-weight">가중치 {score.weight}%</span> : null}
        </span>
        <span className="report-competency-detailpanel-score">
          <span className={`report-competency-band tone-${band.tone}`}>{band.label}</span>
          <span className={`report-competency-score tone-${band.tone}`}>{score.score}</span>
        </span>
      </div>
      {score.passScore != null ? (
        <span className={`report-competency-cutstatus ${score.score >= score.passScore ? "is-met" : "is-missed"}`}>
          합격선 {score.passScore}점 · {score.score >= score.passScore ? "충족" : "미달"}
        </span>
      ) : null}
      {score.rationale?.trim() ? (
        <p className="report-competency-rationale">{score.rationale}</p>
      ) : (
        <p className="report-competency-rationale is-empty">등록된 근거가 없습니다.</p>
      )}
      {score.evidences.length > 0 ? (
        <div className="report-competency-evidence">
          {score.evidences.map((evidence) => (
            <blockquote key={evidence.evidenceId}>{evidence.evidenceText}</blockquote>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;

function reportResult(result: string | null | undefined): { label: string; tone: "pass" | "hold" | "fail" } | null {
  if (result === "PASS") return { label: "합격", tone: "pass" };
  if (result === "HOLD") return { label: "보류", tone: "hold" };
  if (result === "FAIL") return { label: "불합격", tone: "fail" };
  return null;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function scoreBand(score: number | null): { label: string; tone: "high" | "mid" | "low" | "min" } | null {
  if (score == null) return null;
  if (score >= 80) return { label: "우수", tone: "high" };
  if (score >= 60) return { label: "양호", tone: "mid" };
  if (score >= 40) return { label: "보통", tone: "low" };
  return { label: "미흡", tone: "min" };
}

type CompetencyTone = "high" | "good" | "mid" | "low";

function competencyBand(score: number): { label: string; tone: CompetencyTone } {
  if (score >= 80) return { label: "우수", tone: "high" };
  if (score >= 65) return { label: "양호", tone: "good" };
  if (score >= 50) return { label: "보통", tone: "mid" };
  return { label: "미흡", tone: "low" };
}

function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function CompanyAnswerMedia({
  applicantId,
  audioFile,
  compact = false,
  videoFile,
}: {
  applicantId: number;
  audioFile: ApplicantInterviewFileAsset | null;
  compact?: boolean;
  videoFile: ApplicantInterviewFileAsset | null;
}) {
  const primaryFile = videoFile ?? audioFile;
  const primaryMediaType = videoFile ? "video" : "audio";
  const cachedUrl = getCachedRecordingObjectUrl(primaryFile?.storageKey);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);

  useEffect(() => {
    if (!primaryFile || cachedUrl) {
      setMediaUrl(null);
      setMediaError("");
      setMediaLoading(false);
      return;
    }

    let disposed = false;
    setMediaLoading(true);
    setMediaError("");

    createApplicantInterviewMediaSession(applicantId, primaryFile.fileId)
      .then((session) => {
        if (disposed) {
          return;
        }
        setMediaUrl(session.mediaUrl);
      })
      .catch((error) => {
        if (!disposed) {
          setMediaError(error instanceof Error ? error.message : "면접 녹화 파일을 불러올 수 없습니다.");
        }
      })
      .finally(() => {
        if (!disposed) {
          setMediaLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [applicantId, cachedUrl, primaryFile]);

  if (!primaryFile) {
    return null;
  }

  const playableUrl = cachedUrl ?? mediaUrl ?? undefined;

  return (
    <div className={`company-answer-media ${compact ? "compact" : ""}`}>
      {playableUrl && primaryMediaType === "video" ? (
        <video controls crossOrigin="use-credentials" preload="metadata" src={playableUrl}>
          답변 영상을 재생할 수 없습니다.
        </video>
      ) : playableUrl ? (
        <audio controls crossOrigin="use-credentials" preload="metadata" src={playableUrl}>
          답변 음성을 재생할 수 없습니다.
        </audio>
      ) : (
        <div className="company-answer-media-placeholder">
          <strong>{mediaLoading ? "녹화 파일을 불러오는 중" : videoFile ? "영상 파일 저장됨" : "음성 파일 저장됨"}</strong>
          <span>{mediaError || "기업 권한을 확인한 뒤 녹화 파일을 재생합니다."}</span>
        </div>
      )}
    </div>
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

function formatScoreCriterionName(criterionName: string | null, rationale: string | null) {
  if (criterionName?.trim()) {
    return criterionName;
  }

  const match = rationale?.match(/^(.+?)(?:은|는)\s*\d+점/);
  return match?.[1]?.trim() || "기준 없음";
}

type RecruitingIntegrityCounts = {
  screenAway: number;
  cameraLost: number;
  faceAway: number;
  multipleFaces: number;
  faceShift: number;
  gazeAway: number;
  voiceMouthMismatch: number;
  voiceWithoutFace: number;
  staticVideoFrame: number;
  earlyScreenAway: number;
};

type RecruitingIntegritySummary = {
  answerCount: number;
  answersWithMetadata: number;
  signalAnswers: number;
  screenAwayAnswers: number;
  faceAwayAnswers: number;
  multipleFaceAnswers: number;
  gazeAwayAnswers: number;
  audioVisualAnswers: number;
  staticVideoAnswers: number;
};

function RecruitingIntegritySignalView({
  compact = false,
  metadata,
}: {
  compact?: boolean;
  metadata?: Record<string, unknown> | null;
}) {
  const flags = buildRecruitingIntegrityFlags(metadata);
  if (flags.length === 0) return null;

  return (
    <div className={`company-integrity-signals ${compact ? "compact" : ""}`}>
      <strong>
        <svg className="company-integrity-warn" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 2 20h20L12 3z" fill="#E03E3E" />
          <rect x="11" y="9" width="2" height="5" rx="1" fill="#fff" />
          <circle cx="12" cy="16.6" r="1.1" fill="#fff" />
        </svg>
        응시 무결성 확인 신호
      </strong>
      <div>
        {flags.map((flag) => (
          <span className="company-integrity-chip" key={flag.key}>
            {flag.label}{flag.count > 1 ? ` ${flag.count}회` : ""}
          </span>
        ))}
      </div>
      <p>자동 감지 신호이므로 부정행위로 단정하지 말고, 답변 영상과 스크립트를 함께 확인해 주세요.</p>
    </div>
  );
}

function buildRecruitingIntegritySummary(answers: ApplicantEvaluation["answers"]): RecruitingIntegritySummary {
  const reviewTargets = answers.flatMap((answer) => [
    { nonverbalMetadata: answer.nonverbalMetadata },
    ...answer.followUpQuestions
      .map((followUp) => followUp.answer)
      .filter((answer): answer is NonNullable<typeof answer> => Boolean(answer))
      .map((answer) => ({ nonverbalMetadata: answer.nonverbalMetadata })),
  ]);

  return reviewTargets.reduce<RecruitingIntegritySummary>((summary, item) => {
    summary.answerCount += 1;
    if (!item.nonverbalMetadata) return summary;

    summary.answersWithMetadata += 1;
    const counts = readRecruitingIntegrityCounts(item.nonverbalMetadata);
    const hasSignal = hasRecruitingIntegritySignal(counts);

    if (hasSignal) summary.signalAnswers += 1;
    if (counts.screenAway > 0 || counts.earlyScreenAway > 0) summary.screenAwayAnswers += 1;
    if (counts.faceAway > 0 || counts.cameraLost > 0 || counts.faceShift > 0) summary.faceAwayAnswers += 1;
    if (counts.multipleFaces > 0) summary.multipleFaceAnswers += 1;
    if (counts.gazeAway > 0) summary.gazeAwayAnswers += 1;
    if (counts.voiceMouthMismatch > 0 || counts.voiceWithoutFace > 0) summary.audioVisualAnswers += 1;
    if (counts.staticVideoFrame > 0) summary.staticVideoAnswers += 1;

    return summary;
  }, {
    answerCount: 0,
    answersWithMetadata: 0,
    signalAnswers: 0,
    screenAwayAnswers: 0,
    faceAwayAnswers: 0,
    multipleFaceAnswers: 0,
    gazeAwayAnswers: 0,
    audioVisualAnswers: 0,
    staticVideoAnswers: 0,
  });
}

function buildRecruitingIntegrityFlags(metadata?: Record<string, unknown> | null) {
  if (!metadata) return [];

  const counts = readRecruitingIntegrityCounts(metadata);
  const flags = [
    { key: "screenAway", label: "화면/탭 이탈", count: counts.screenAway },
    { key: "earlyScreenAway", label: "질문 직후 이탈", count: counts.earlyScreenAway },
    { key: "cameraLost", label: "카메라 이탈", count: counts.cameraLost },
    { key: "faceAway", label: "얼굴 미검출/화면 밖", count: counts.faceAway },
    { key: "multipleFaces", label: "여러 사람", count: counts.multipleFaces },
    { key: "faceShift", label: "얼굴 위치 급변", count: counts.faceShift },
    { key: "gazeAway", label: "시선 이탈", count: counts.gazeAway },
    { key: "voiceMouthMismatch", label: "음성-입모양 불일치", count: counts.voiceMouthMismatch },
    { key: "voiceWithoutFace", label: "얼굴 미검출 중 음성", count: counts.voiceWithoutFace },
    { key: "staticVideoFrame", label: "영상 프레임 고정", count: counts.staticVideoFrame },
  ];

  return flags.filter((flag) => flag.count > 0);
}

function readRecruitingIntegrityCounts(metadata: Record<string, unknown>): RecruitingIntegrityCounts {
  return {
    screenAway: readSummaryCount(metadata, "screenAwayCount") || readEventCount(metadata, ["TAB_HIDDEN", "WINDOW_BLUR"]),
    cameraLost: readSummaryCount(metadata, "cameraLostCount") || readEventCount(metadata, ["CAMERA_LOST"]),
    faceAway:
      readSummaryCount(metadata, "faceMissingCount") +
      readSummaryCount(metadata, "faceOutOfFrameCount") ||
      readEventCount(metadata, ["FACE_MISSING", "FACE_OUT_OF_FRAME"]),
    multipleFaces: readSummaryCount(metadata, "multipleFacesCount") || readEventCount(metadata, ["MULTIPLE_FACES"]),
    faceShift: readSummaryCount(metadata, "facePositionShiftCount") || readEventCount(metadata, ["FACE_POSITION_SHIFT"]),
    gazeAway: readSummaryCount(metadata, "gazeAwayCount") || readEventCount(metadata, ["GAZE_AWAY"]),
    voiceMouthMismatch: readSummaryCount(metadata, "voiceMouthMismatchCount") || readEventCount(metadata, ["VOICE_MOUTH_MISMATCH"]),
    voiceWithoutFace: readSummaryCount(metadata, "voiceWithoutFaceCount") || readEventCount(metadata, ["VOICE_WITHOUT_FACE"]),
    staticVideoFrame: readSummaryCount(metadata, "staticVideoFrameCount") || readEventCount(metadata, ["STATIC_VIDEO_FRAME"]),
    earlyScreenAway: readSummaryCount(metadata, "earlyScreenAwayCount") || readEventCount(metadata, ["EARLY_SCREEN_AWAY"]),
  };
}

function hasRecruitingIntegritySignal(counts: RecruitingIntegrityCounts) {
  return Object.values(counts).some((count) => count > 0);
}

function readSummaryCount(metadata: Record<string, unknown>, key: string) {
  const summary = readRecord(metadata.integritySummary);
  return readNumber(summary?.[key]);
}

function readEventCount(metadata: Record<string, unknown>, types: string[]) {
  const events = Array.isArray(metadata.integrityEvents) ? metadata.integrityEvents : [];
  return events.filter((event) => {
    const record = readRecord(event);
    return typeof record?.type === "string" && types.includes(record.type);
  }).length;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getDisplayAnswers(answers: ApplicantEvaluation["answers"]) {
  return answers.filter((answer) => answer.questionType !== "FOLLOW_UP" || !isLinkedFollowUpAnswer(answers, answer));
}

function SubmissionItem({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className={multiline ? "is-wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value || "미입력"}</dd>
    </div>
  );
}

function SubmissionLink({ label, value }: { label: string; value: string | null }) {
  const safeUrl = toSafeExternalUrl(value);
  return (
    <div>
      <dt>{label}</dt>
      <dd>{safeUrl ? <a href={safeUrl} target="_blank" rel="noreferrer">링크 열기</a> : "미입력"}</dd>
    </div>
  );
}

function toSafeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
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

type CandidateRecordingCacheEntry = {
  url: string;
  blob: Blob;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  createdAt: number;
};

type CandidateRecordingCacheWindow = Window & {
  __candidateRecordingCache?: Map<string, CandidateRecordingCacheEntry>;
};

function getCachedRecordingObjectUrl(storageKey?: string | null): string | undefined {
  if (!storageKey || typeof window === "undefined") {
    return undefined;
  }
  const cacheWindow = window as CandidateRecordingCacheWindow;
  return cacheWindow.__candidateRecordingCache?.get(storageKey)?.url;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)}MB`;
  }
  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)}KB`;
  }
  return `${sizeBytes}B`;
}
