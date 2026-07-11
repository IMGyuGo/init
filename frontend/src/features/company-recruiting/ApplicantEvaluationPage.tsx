"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { createApplicantInterviewMediaSession, getApplicantDocument, getApplicantEvaluation, updateScreeningStatus } from "./api";
import { Breadcrumb, StatusBadge } from "./CompanyRecruitingChrome";
import { formatRecruitingStatusLabel } from "./status-labels";
import type { ApplicantEvaluation, ApplicantInterviewFileAsset, ScreeningDecision } from "./types";

const decisions: ScreeningDecision[] = ["UNDECIDED", "PASS", "HOLD", "FAIL"];

export function ApplicantEvaluationPage({ applicantId }: { applicantId: number }) {
  const [evaluation, setEvaluation] = useState<ApplicantEvaluation | null>(null);
  const [decision, setDecision] = useState<ScreeningDecision>("UNDECIDED");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<number | null>(null);

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
  const displayedTotalScore = report?.totalScore ?? null;

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

            <section className="panel applicant-submission-panel">
              <div className="panel-head">
                <div>
                  <h2>지원 정보</h2>
                  <p>지원자가 이 공고에 제출한 정보와 서류입니다.</p>
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
                    <span>최종 평가 점수</span>
                    <strong>{displayedTotalScore ?? "점수 없음"}</strong>
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
                              <td>{formatScoreCriterionName(score.criterionName, score.rationale)}</td>
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

            {integritySummary && integritySummary.answersWithMetadata > 0 ? (
              <RecruitingIntegrityReviewPanel summary={integritySummary} />
            ) : null}

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

                      <CompanyAnswerMedia
                        applicantId={applicantId}
                        audioFile={answer.audioFile}
                        title="답변 녹화"
                        videoFile={answer.videoFile}
                      />

                      <div className="company-answer-block">
                        <strong>답변</strong>
                        <p>{answer.transcript?.trim() ? answer.transcript : "답변 스크립트가 없습니다."}</p>
                      </div>

                      <RecruitingIntegritySignalView metadata={answer.nonverbalMetadata} />

                      {answer.followUpQuestions.length > 0 ? (
                        <div className="company-answer-block">
                          <strong>생성된 꼬리질문</strong>
                          <ul>
                            {answer.followUpQuestions.map((followUp) => (
                              <li key={followUp.followUpId}>
                                <span className="company-follow-up-question">{followUp.content}</span>
                                <div className="company-follow-up-answer">
                                  <strong>꼬리질문 답변</strong>
                                  <CompanyAnswerMedia
                                    applicantId={applicantId}
                                    audioFile={followUp.answer?.audioFile ?? null}
                                    compact
                                    title="꼬리질문 답변 녹화"
                                    videoFile={followUp.answer?.videoFile ?? null}
                                  />
                                  <p>{followUp.answer?.transcript?.trim() ? followUp.answer.transcript : "저장된 꼬리질문 답변이 없습니다."}</p>
                                  <RecruitingIntegritySignalView metadata={followUp.answer?.nonverbalMetadata ?? null} compact />
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

function CompanyAnswerMedia({
  applicantId,
  audioFile,
  compact = false,
  title,
  videoFile,
}: {
  applicantId: number;
  audioFile: ApplicantInterviewFileAsset | null;
  compact?: boolean;
  title: string;
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
      <div className="company-answer-media-head">
        <strong>{title}</strong>
        <span>{primaryFile.originalName}</span>
      </div>
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
      <div className="company-answer-media-meta">
        <span>{primaryFile.mimeType}</span>
        <span>{formatFileSize(primaryFile.sizeBytes)}</span>
      </div>
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

function RecruitingIntegrityReviewPanel({ summary }: { summary: RecruitingIntegritySummary }) {
  const guideItems = buildRecruitingIntegrityGuide(summary);
  const status = summary.signalAnswers > 0 ? "확인 필요" : "특이 신호 없음";

  return (
    <section className="panel company-integrity-panel">
      <div className="panel-head company-integrity-panel-head">
        <div>
          <h2>응시 무결성 참고 신호</h2>
          <p>브라우저에서 수집된 미검증 참고 정보입니다. 부정행위 확정 판정이나 평가 점수에 사용하지 말고 답변 영상과 함께 확인해 주세요.</p>
        </div>
        <StatusBadge value={status} />
      </div>
      <div className="company-integrity-metrics">
        <div>
          <span>분석 답변</span>
          <strong>{summary.answersWithMetadata}/{summary.answerCount}</strong>
        </div>
        <div>
          <span>검토 필요 답변</span>
          <strong>{summary.signalAnswers}</strong>
        </div>
        <div>
          <span>화면 이탈</span>
          <strong>{summary.screenAwayAnswers}</strong>
        </div>
        <div>
          <span>얼굴 이탈</span>
          <strong>{summary.faceAwayAnswers}</strong>
        </div>
        <div>
          <span>여러 사람</span>
          <strong>{summary.multipleFaceAnswers}</strong>
        </div>
        <div>
          <span>시선 이탈</span>
          <strong>{summary.gazeAwayAnswers}</strong>
        </div>
        <div>
          <span>음성/입모양</span>
          <strong>{summary.audioVisualAnswers}</strong>
        </div>
        <div>
          <span>영상 고정</span>
          <strong>{summary.staticVideoAnswers}</strong>
        </div>
      </div>
      <ul className="company-integrity-guide">
        {guideItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

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
      <strong>응시 무결성 확인 신호</strong>
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

function buildRecruitingIntegrityGuide(summary: RecruitingIntegritySummary) {
  if (summary.signalAnswers === 0) {
    return ["면접 답변에서 화면 이탈, 얼굴 이탈, 여러 사람, 시선 이탈 같은 주요 응시 무결성 신호가 감지되지 않았습니다."];
  }

  const items = [`총 ${summary.signalAnswers}개 답변에서 채용 담당자 확인이 필요한 신호가 감지되었습니다.`];
  if (summary.screenAwayAnswers > 0) items.push(`${summary.screenAwayAnswers}개 답변에서 화면/탭 이탈 신호가 있습니다.`);
  if (summary.faceAwayAnswers > 0) items.push(`${summary.faceAwayAnswers}개 답변에서 얼굴 화면 밖, 카메라 이탈, 위치 급변 신호가 있습니다.`);
  if (summary.multipleFaceAnswers > 0) items.push(`${summary.multipleFaceAnswers}개 답변에서 여러 사람 감지 신호가 있습니다.`);
  if (summary.gazeAwayAnswers > 0) items.push(`${summary.gazeAwayAnswers}개 답변에서 긴 시선 이탈 신호가 있습니다.`);
  if (summary.audioVisualAnswers > 0) items.push(`${summary.audioVisualAnswers}개 답변에서 음성-입모양 또는 얼굴 미검출 중 음성 신호가 있습니다.`);
  if (summary.staticVideoAnswers > 0) items.push(`${summary.staticVideoAnswers}개 답변에서 영상 프레임 고정 신호가 있습니다.`);
  return items;
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
