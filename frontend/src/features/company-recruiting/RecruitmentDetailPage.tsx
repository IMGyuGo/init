"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import detailApplicantsIcon from "./assets/detail-applicants.png";
import detailCompletionIcon from "./assets/detail-completion.png";
import detailReportIcon from "./assets/detail-report.png";

import { getRecruitment, listRecruitmentApplicants, updateScreeningStatus } from "./api";
import { Breadcrumb, StatusBadge } from "./CompanyRecruitingChrome";
import { JobDescriptionViewer } from "./JobDescriptionViewer";
import { PostingExtraInfoSummary } from "./PostingExtraInfoFields";
import { extractPostingExtraInfo, postingExtraInfoFromApiFields } from "./posting-extra-info";
import { getPublicApplicationLinkState } from "./public-application-link";
import { buildInterviewSettingsHref } from "./routes";
import { formatRecruitingStatusLabel } from "./status-labels";
import {
  extractStructuredJobDescription,
  getStructuredJobDescriptionGallery,
  structuredJobSectionDefinitions,
  type StructuredJobDescription,
  type StructuredJobImage,
} from "./structured-job-description";
import {
  getScreeningAutosaveFieldState,
  hasScreeningDraftChanged,
  markScreeningAutosaveError,
  markScreeningAutosaveSaving,
  markScreeningAutosaveSuccess,
  type ScreeningAutosaveField,
  type ScreeningAutosaveState,
  type ScreeningDraft,
} from "./screening-autosave";
import type { Applicant, Recruitment, ScreeningDecision } from "./types";

const decisions: ScreeningDecision[] = ["UNDECIDED", "PASS", "HOLD", "FAIL"];

export function RecruitmentDetailPage({ recruitmentId }: { recruitmentId: number }) {
  const [recruitment, setRecruitment] = useState<Recruitment | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [screeningDrafts, setScreeningDrafts] = useState<Record<number, ScreeningDraft>>({});
  const [savedScreeningDrafts, setSavedScreeningDrafts] = useState<Record<number, ScreeningDraft>>({});
  const [autosaveState, setAutosaveState] = useState<ScreeningAutosaveState>({});
  const [publicLinkOrigin, setPublicLinkOrigin] = useState("");
  const [isRecruitmentInfoOpen, setIsRecruitmentInfoOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (options: { clearMessage?: boolean } = {}) => {
    setLoading(true);
    if (options.clearMessage !== false) {
      setMessage("");
    }
    try {
      const [detail, applicantList] = await Promise.all([
        getRecruitment(recruitmentId),
        listRecruitmentApplicants(recruitmentId, { page: 1, limit: 20, sort: "updatedAt", order: "desc" }),
      ]);
      const nextDrafts = Object.fromEntries(
        applicantList.data.items.map((item) => [item.applicationId, toScreeningDraft(item)]),
      );
      setRecruitment(detail.data);
      setApplicants(applicantList.data.items);
      setScreeningDrafts(nextDrafts);
      setSavedScreeningDrafts(nextDrafts);
      setAutosaveState({});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공고 대시보드를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [recruitmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPublicLinkOrigin(window.location.origin);
  }, []);

  async function handlePublicApplicationLinkCopy() {
    if (!recruitment) {
      return;
    }

    const state = getPublicApplicationLinkState(recruitment, publicLinkOrigin || window.location.origin);
    if (!state.isAvailable) {
      window.alert("OPEN 상태 공고에서만 공개 지원 링크를 복사할 수 있습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(state.url);
      window.alert("공개 지원 링크가 복사되었습니다.");
    } catch {
      window.alert("브라우저에서 복사를 허용하지 않았습니다. 링크를 직접 선택해 복사해주세요.");
    }
  }

  async function handleDecisionChange(applicant: Applicant, decision: ScreeningDecision) {
    const nextDraft = {
      decision,
      memo: screeningDrafts[applicant.applicationId]?.memo ?? "",
    };
    updateDraft(applicant.applicationId, nextDraft);
    await saveScreeningField(applicant, "decision", nextDraft);
  }

  async function handleMemoBlur(applicant: Applicant) {
    const draft = screeningDrafts[applicant.applicationId];
    const savedDraft = savedScreeningDrafts[applicant.applicationId];
    if (!draft || (savedDraft && draft.memo === savedDraft.memo)) {
      return;
    }
    await saveScreeningField(applicant, "memo", draft);
  }

  async function saveScreeningField(applicant: Applicant, field: ScreeningAutosaveField, draft: ScreeningDraft) {
    const savedDraft = savedScreeningDrafts[applicant.applicationId];
    if (savedDraft && !hasScreeningDraftChanged(savedDraft, draft)) {
      return;
    }

    setAutosaveState((current) => markScreeningAutosaveSaving(current, applicant.applicationId, field));
    try {
      const result = await updateScreeningStatus(applicant.applicationId, {
        screeningDecision: draft.decision,
        screeningMemo: draft.memo || undefined,
      });
      const updatedDraft = toScreeningDraft(result.data);
      setApplicants((current) =>
        current.map((item) => (item.applicationId === result.data.applicationId ? result.data : item)),
      );
      setSavedScreeningDrafts((current) => ({
        ...current,
        [applicant.applicationId]: updatedDraft,
      }));
      setScreeningDrafts((current) => {
        const currentDraft = current[applicant.applicationId];
        if (currentDraft && hasScreeningDraftChanged(draft, currentDraft)) {
          return current;
        }
        return {
          ...current,
          [applicant.applicationId]: updatedDraft,
        };
      });
      setAutosaveState((current) => markScreeningAutosaveSuccess(current, applicant.applicationId, field));
    } catch {
      setAutosaveState((current) => markScreeningAutosaveError(current, applicant.applicationId, field));
    }
  }

  function updateDraft(applicationId: number, patch: Partial<ScreeningDraft>) {
    setScreeningDrafts((current) => ({
      ...current,
      [applicationId]: {
        decision: current[applicationId]?.decision ?? "UNDECIDED",
        memo: current[applicationId]?.memo ?? "",
        ...patch,
      },
    }));
  }

  const completedInterviews = applicants.filter((item) => isCompleted(item.interviewStatus)).length;
  const reportCompleted = applicants.filter((item) => item.report && isCompleted(item.report.status)).length;
  const completionRate = applicants.length === 0 ? 0 : Math.round((completedInterviews / applicants.length) * 100);
  const parsedJobDescription = extractPostingExtraInfo(recruitment?.jobDescription);
  const postingExtraInfo = recruitment
    ? postingExtraInfoFromApiFields(recruitment, parsedJobDescription.extraInfo)
    : parsedJobDescription.extraInfo;

  return (
    <section className="app-page glass-page notion">
        <div className="page-head">
          <div>
            <Breadcrumb
              items={[
                { label: "공고 목록", href: "/company/recruitments" },
                { label: recruitment?.title ?? "공고 대시보드" },
              ]}
            />
            <h1>{recruitment?.title ?? "공고 대시보드"}</h1>
            <p className="page-sub">공고 운영 현황과 다음 전형 대상자를 확인합니다.</p>
          </div>
          <div className="page-actions">
            <button className="btn secondary" type="button" disabled={!recruitment} onClick={() => void handlePublicApplicationLinkCopy()}>
              공개 지원 링크
            </button>
            <Link className="btn secondary" href={`/company/recruitments/${recruitmentId}/settings`}>
              공고 설정
            </Link>
            <Link className="btn secondary" href={buildInterviewSettingsHref(recruitmentId)}>
              면접 관리
            </Link>
            <Link className="btn primary" href={`/company/recruitments/${recruitmentId}/applicants`}>
              지원자 관리
            </Link>
          </div>
        </div>

        {message ? <p className="notice">{message}</p> : null}
        {recruitment ? (
          <>
            <section className="kpi-row">
              <div className="kpi">
                <Image className="kpi-icon" src={detailApplicantsIcon} alt="" width={28} height={28} aria-hidden="true" />
                <span>지원자 수</span>
                <strong>{recruitment.applicantCount}</strong>
              </div>
              <div className="kpi">
                <Image className="kpi-icon" src={detailCompletionIcon} alt="" width={28} height={28} aria-hidden="true" />
                <span>응시 완료율</span>
                <strong>{completionRate}%</strong>
              </div>
              <div className="kpi">
                <Image className="kpi-icon" src={detailReportIcon} alt="" width={28} height={28} aria-hidden="true" />
                <span>리포트 생성 완료</span>
                <strong>{reportCompleted}건</strong>
              </div>
            </section>

            <section className={`panel info-toggle-panel ${isRecruitmentInfoOpen ? "is-open" : ""}`}>
              <button
                aria-controls="recruitment-info-content"
                aria-expanded={isRecruitmentInfoOpen}
                className="panel-head info-toggle-button"
                type="button"
                onClick={() => setIsRecruitmentInfoOpen((current) => !current)}
              >
                <div>
                  <h2>공고 정보</h2>
                  <p>
                    {recruitment.jobRole} · {formatPeriod(recruitment)}
                  </p>
                </div>
                <span className="info-toggle-meta">
                  <span className="info-toggle-chevron" aria-hidden="true">
                    ▾
                  </span>
                </span>
              </button>
              {isRecruitmentInfoOpen ? (
                <div className="info-toggle-body" id="recruitment-info-content">
                  <PostingExtraInfoSummary value={postingExtraInfo} />
                  <RecruitmentInfoDescription
                    value={parsedJobDescription.jobDescription}
                    emptyMessage="등록된 JD가 없습니다. 면접 설정은 C 역할 영역에서 별도 연결합니다."
                  />
                </div>
              ) : null}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>다음 전형 대상자 선별</h2>
                  <p>전형 상태와 수동 메모는 B 소유 필드만 저장합니다.</p>
                </div>
              </div>

              {applicants.length === 0 ? (
                <div className="empty">등록된 지원자가 없습니다. 우측 상단의 지원자 관리에서 먼저 등록하세요.</div>
              ) : (
                <div className="table-wrap">
                  <table className="screening-table">
                    <colgroup>
                      <col className="screening-col-candidate" />
                      <col className="screening-col-interview" />
                      <col className="screening-col-report" />
                      <col className="screening-col-decision" />
                      <col className="screening-col-memo" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>지원자</th>
                        <th>면접</th>
                        <th>리포트</th>
                        <th>전형 상태</th>
                        <th>메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applicants.map((item) => {
                        const decisionState = getScreeningAutosaveFieldState(autosaveState, item.applicationId, "decision");
                        const memoState = getScreeningAutosaveFieldState(autosaveState, item.applicationId, "memo");

                        return (
                          <tr key={item.applicationId}>
                            <td>
                              <strong>{item.name}</strong>
                              <span>{item.email}</span>
                            </td>
                            <td>
                              <StatusBadge value={item.interviewStatus} />
                            </td>
                            <td>
                              {item.report ? (
                                <span className="status-with-note">
                                  <StatusBadge value={item.report.status} />
                                  <span>{item.report.totalScore ?? "점수 없음"}</span>
                                </span>
                              ) : (
                                <StatusBadge value="NONE_OR_GENERATING" />
                              )}
                            </td>
                            <td>
                              <div className={`autosave-field ${decisionState === "saving" ? "is-saving" : ""} ${decisionState === "error" ? "is-error" : ""}`}>
                                <select
                                  aria-label={`${item.name} 전형 상태`}
                                  value={screeningDrafts[item.applicationId]?.decision ?? "UNDECIDED"}
                                  onChange={(event) => void handleDecisionChange(item, event.target.value as ScreeningDecision)}
                                >
                                  {decisions.map((decision) => (
                                    <option key={decision} value={decision}>
                                      {formatRecruitingStatusLabel(decision)}
                                    </option>
                                  ))}
                                </select>
                                <span className="autosave-state" aria-live="polite">
                                  {decisionState === "error" ? "저장 실패" : ""}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className={`autosave-field ${memoState === "saving" ? "is-saving" : ""} ${memoState === "error" ? "is-error" : ""}`}>
                                <input
                                  aria-label={`${item.name} 메모`}
                                  value={screeningDrafts[item.applicationId]?.memo ?? ""}
                                  onBlur={() => void handleMemoBlur(item)}
                                  onChange={(event) => updateDraft(item.applicationId, { memo: event.target.value })}
                                  placeholder="수동 메모"
                                />
                                <span className="autosave-state" aria-live="polite">
                                  {memoState === "error" ? "저장 실패" : ""}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </>
        ) : (
          <div className="empty">{loading ? "공고 대시보드를 불러오는 중입니다." : "공고 대시보드를 불러올 수 없습니다."}</div>
        )}
    </section>
  );
}

function formatPeriod(item: Recruitment) {
  if (!item.startsOn && !item.endsOn) {
    return "기간 미정";
  }
  return `${item.startsOn ?? "시작 미정"} ~ ${item.endsOn ?? "마감 미정"}`;
}

function isCompleted(value: string) {
  return ["COMPLETED", "DONE", "GENERATED"].includes(value);
}

function RecruitmentInfoDescription({ value, emptyMessage }: { value: string | null | undefined; emptyMessage: string }) {
  const parsed = extractStructuredJobDescription(value);
  const gallery = getStructuredJobDescriptionGallery(value);

  if (!parsed.structured) {
    return (
      <div className="description-box">
        <JobDescriptionViewer value={parsed.fallbackHtml} emptyMessage={emptyMessage} />
      </div>
    );
  }

  return (
    <div className="recruitment-info-description">
      <RecruitmentInfoGallery gallery={gallery} />
      <RecruitmentStructuredInfo structured={parsed.structured} fallbackHtml={parsed.fallbackHtml} emptyMessage={emptyMessage} />
    </div>
  );
}

function RecruitmentInfoGallery({ gallery }: { gallery: StructuredJobImage[] }) {
  if (gallery.length === 0) {
    return null;
  }

  return (
    <div className="recruitment-info-gallery" aria-label="공고 이미지">
      {gallery.map((image, index) => (
        <figure key={`${image.url}-${index}`}>
          <span style={{ backgroundImage: `url(${image.url})` }} aria-label={image.name || "공고 이미지"} role="img" />
          <figcaption>{image.name || `공고 이미지 ${index + 1}`}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function RecruitmentStructuredInfo({
  structured,
  fallbackHtml,
  emptyMessage,
}: {
  structured: StructuredJobDescription;
  fallbackHtml: string;
  emptyMessage: string;
}) {
  const sections = structuredJobSectionDefinitions.filter((section) => structured.sections[section.key]?.trim());
  const hasContent = sections.length > 0 || structured.tags.length > 0 || fallbackHtml.trim();

  if (!hasContent) {
    return <div className="description-box">{emptyMessage}</div>;
  }

  return (
    <div className="description-box recruitment-structured-info">
      {sections.map((section) => (
        <section key={section.key}>
          <h3>{section.title}</h3>
          <div className="jd-content" dangerouslySetInnerHTML={{ __html: structured.sections[section.key] }} />
        </section>
      ))}
      {structured.tags.length > 0 ? (
        <section>
          <h3>태그</h3>
          <div className="recruitment-info-tags">
            {structured.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </section>
      ) : null}
      {fallbackHtml.trim() ? <JobDescriptionViewer value={fallbackHtml} emptyMessage="" /> : null}
    </div>
  );
}

function toScreeningDraft(item: Applicant): ScreeningDraft {
  return {
    decision: normalizeDecision(item.screeningDecision),
    memo: item.screeningMemo ?? "",
  };
}

function normalizeDecision(value: string): ScreeningDecision {
  return decisions.includes(value as ScreeningDecision) ? (value as ScreeningDecision) : "UNDECIDED";
}
