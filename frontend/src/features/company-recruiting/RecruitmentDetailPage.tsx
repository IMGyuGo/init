"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import detailApplicantsIcon from "./assets/detail-applicants.png";
import detailCompletionIcon from "./assets/detail-completion.png";
import detailReportIcon from "./assets/detail-report.png";

import {
  getRecruitment,
  getRecruitmentApplicantSummary,
  listRecruitmentApplicants,
  publishRecruitment,
  confirmScreeningResults,
  updateScreeningReview,
} from "./api";
import {
  APPLICANTS_PAGE_SIZE,
  APPLICANT_SORT_OPTIONS,
  DEFAULT_APPLICANT_SORT,
  applyScreeningDecisionCountChange,
  canEditScreeningDecision,
  getApplicantSortQuery,
  getApplicantSummaryMetrics,
  getScreeningConfirmationPreview,
  type ApplicantSort,
} from "./applicant-list";
import { BackButton, Breadcrumb, StatusBadge } from "./CompanyRecruitingChrome";
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
import type { Applicant, ApplicantSummary, PageMeta, Recruitment, ScreeningDecision } from "./types";

const decisions: ScreeningDecision[] = ["PASS", "HOLD", "FAIL"];
const decisionFilters: ScreeningDecision[] = ["PASS", "HOLD", "FAIL", "RETRY", "UNDECIDED"];

type ApplicantFilters = {
  applicationStatus: string;
  documentStatus: string;
  interviewStatus: string;
  reportStatus: string;
  screeningDecision: string;
};

const EMPTY_APPLICANT_FILTERS: ApplicantFilters = {
  applicationStatus: "",
  documentStatus: "",
  interviewStatus: "",
  reportStatus: "",
  screeningDecision: "",
};

const APPLICATION_STATUS_OPTIONS = ["DRAFT", "SUBMITTED", "IN_REVIEW", "INTERVIEW_WAITING", "INTERVIEW_DONE", "COMPLETED"];
const DOCUMENT_STATUS_OPTIONS = ["NOT_SUBMITTED", "SUBMITTED", "EXTRACTING", "EXTRACTED", "FAILED"];
const INTERVIEW_STATUS_OPTIONS = ["NOT_READY", "READY", "IN_PROGRESS", "COMPLETED", "FAILED"];
const REPORT_STATUS_OPTIONS = ["PENDING", "GENERATING", "COMPLETED", "FAILED"];

// 점수가 높을수록 진한 파랑으로 표시하는 단계. (#289)
function screeningScoreTier(score: number): string {
  if (score >= 80) return "tier-top";
  if (score >= 65) return "tier-high";
  if (score >= 50) return "tier-mid";
  return "tier-low";
}

export function RecruitmentDetailPage({ recruitmentId }: { recruitmentId: number }) {
  const router = useRouter();
  const [recruitment, setRecruitment] = useState<Recruitment | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantSummary, setApplicantSummary] = useState<ApplicantSummary | null>(null);
  const [applicantPageMeta, setApplicantPageMeta] = useState<PageMeta | null>(null);
  const [screeningDrafts, setScreeningDrafts] = useState<Record<number, ScreeningDraft>>({});
  const [savedScreeningDrafts, setSavedScreeningDrafts] = useState<Record<number, ScreeningDraft>>({});
  const [autosaveState, setAutosaveState] = useState<ScreeningAutosaveState>({});
  const [publicLinkOrigin, setPublicLinkOrigin] = useState("");
  const [isRecruitmentInfoOpen, setIsRecruitmentInfoOpen] = useState(false);
  const [openPromptOpen, setOpenPromptOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [applicantPage, setApplicantPage] = useState(1);
  const [applicantSort, setApplicantSort] = useState<ApplicantSort>(DEFAULT_APPLICANT_SORT);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmingResults, setConfirmingResults] = useState(false);
  const [applicantSearchInput, setApplicantSearchInput] = useState("");
  const [applicantQuery, setApplicantQuery] = useState("");
  const [applicantFilters, setApplicantFilters] = useState<ApplicantFilters>(EMPTY_APPLICANT_FILTERS);
  const totalApplicantPages = Math.max(1, applicantPageMeta?.totalPages ?? 1);
  const currentApplicantPage = applicantPageMeta?.page ?? applicantPage;
  const applicantPageWindow = buildPageWindow(currentApplicantPage, totalApplicantPages, 5);

  useEffect(() => {
    if (!actionMenuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) setActionMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [actionMenuOpen]);

  const loadOverview = useCallback(async (options: { clearMessage?: boolean } = {}) => {
    setLoading(true);
    if (options.clearMessage !== false) {
      setMessage("");
    }
    try {
      const [detail, summary] = await Promise.all([
        getRecruitment(recruitmentId),
        getRecruitmentApplicantSummary(recruitmentId),
      ]);
      setRecruitment(detail.data);
      if (detail.data.status === "DRAFT" && !isOpenPromptDismissed(recruitmentId)) {
        setOpenPromptOpen(true);
      }
      setApplicantSummary(summary.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공고 대시보드를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [recruitmentId]);

  const loadApplicants = useCallback(async () => {
    setApplicantsLoading(true);
    setMessage("");
    try {
      const applicantList = await listRecruitmentApplicants(recruitmentId, {
        page: applicantPage,
        limit: APPLICANTS_PAGE_SIZE,
        q: applicantQuery || undefined,
        applicationStatus: applicantFilters.applicationStatus || undefined,
        documentStatus: applicantFilters.documentStatus || undefined,
        interviewStatus: applicantFilters.interviewStatus || undefined,
        reportStatus: applicantFilters.reportStatus || undefined,
        effectiveScreeningDecision: applicantFilters.screeningDecision || undefined,
        ...getApplicantSortQuery(applicantSort),
      });
      const nextDrafts = Object.fromEntries(
        applicantList.data.items.map((item) => [item.applicationId, toScreeningDraft(item)]),
      );
      setApplicants(applicantList.data.items);
      setApplicantPageMeta(applicantList.meta.page ?? null);
      setScreeningDrafts(nextDrafts);
      setSavedScreeningDrafts(nextDrafts);
      setAutosaveState({});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지원자 목록을 불러오지 못했습니다.");
    } finally {
      setApplicantsLoading(false);
    }
  }, [applicantFilters, applicantPage, applicantQuery, applicantSort, recruitmentId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void loadApplicants();
  }, [loadApplicants]);

  useEffect(() => {
    setPublicLinkOrigin(window.location.origin);
  }, []);

  const { activeTotal, reportCompleted, completionRate } = getApplicantSummaryMetrics(applicantSummary);
  const effectiveCounts = applicantSummary?.effectiveScreeningDecisionCounts ?? {};
  const confirmationPreview = getScreeningConfirmationPreview(applicantSummary);

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

  async function handleOpenConfirmed() {
    setPublishing(true);
    setPublishError("");
    try {
      await publishRecruitment(recruitmentId);
      dismissOpenPrompt(recruitmentId);
      setOpenPromptOpen(false);
      await loadOverview({ clearMessage: false });
      window.alert("공고를 OPEN 상태로 전환했습니다.");
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "공고를 열지 못했습니다.");
    } finally {
      setPublishing(false);
    }
  }

  function handleOpenDismissed() {
    dismissOpenPrompt(recruitmentId);
    setOpenPromptOpen(false);
  }

  async function handleDecisionChange(applicant: Applicant, decision: ScreeningDecision) {
    const previousDraft = screeningDrafts[applicant.applicationId] ?? toScreeningDraft(applicant);
    const nextDraft = {
      decision,
      memo: previousDraft.memo,
    };
    updateDraft(applicant.applicationId, nextDraft);
    if (previousDraft.decision !== decision) {
      setApplicantSummary((current) =>
        applyScreeningDecisionCountChange(current, previousDraft.decision, decision),
      );
    }
    if (
      decision === normalizeDecision(applicant.screeningDecision) ||
      nextDraft.memo.trim().length >= 10
    ) {
      await saveScreeningField(applicant, "decision", nextDraft);
    }
  }

  async function handleMemoBlur(applicant: Applicant) {
    const draft = screeningDrafts[applicant.applicationId];
    const savedDraft = savedScreeningDrafts[applicant.applicationId];
    if (!draft || (savedDraft && !hasScreeningDraftChanged(savedDraft, draft))) {
      return;
    }
    await saveScreeningField(applicant, "memo", draft);
  }

  async function saveScreeningField(applicant: Applicant, field: ScreeningAutosaveField, draft: ScreeningDraft) {
    if (!canEditScreeningDecision({
      autoScreeningPolicyEnabled: applicant.autoScreeningPolicyEnabled,
      reportStatus: applicant.report?.status ?? applicant.reportStatus,
      screeningDecision: applicant.screeningDecision,
      screeningResultConfirmationStatus: applicant.screeningResultConfirmationStatus,
    })) {
      return;
    }
    const savedDraft = savedScreeningDrafts[applicant.applicationId];
    if (savedDraft && !hasScreeningDraftChanged(savedDraft, draft)) {
      return;
    }

    setAutosaveState((current) => markScreeningAutosaveSaving(current, applicant.applicationId, field));
    try {
      const automaticDecision = normalizeDecision(applicant.screeningDecision);
      const resetToAutomatic = draft.decision === automaticDecision;
      if (!resetToAutomatic && draft.memo.trim().length < 10) {
        setAutosaveState((current) => markScreeningAutosaveError(current, applicant.applicationId, "memo"));
        return;
      }
      const result = await updateScreeningReview(applicant.applicationId, {
        screeningReviewerDecision: resetToAutomatic ? null : draft.decision as "PASS" | "HOLD" | "FAIL",
        overrideReason: resetToAutomatic ? null : draft.memo.trim(),
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

  function handleApplicantSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplicantPage(1);
    setApplicantQuery(applicantSearchInput.trim());
  }

  function updateApplicantFilter(field: keyof ApplicantFilters, value: string) {
    setApplicantPage(1);
    setApplicantFilters((current) => ({ ...current, [field]: value }));
  }

  async function handleScreeningResultsConfirm() {
    const expectedEligibleCount = applicantSummary?.confirmationEligibleTotal ?? 0;
    setConfirmingResults(true);
    setMessage("");
    try {
      const result = await confirmScreeningResults(recruitmentId, expectedEligibleCount);
      setConfirmationOpen(false);
      await loadApplicants();
      await loadOverview({ clearMessage: false });
      setMessage(
        `전형 결과 ${result.data.confirmedCount}건을 확정했습니다. 지원자 알림 메일 ${result.data.emailSentCount}건을 발송했습니다.`
        + (result.data.emailFailedCount > 0 ? ` 메일 실패 ${result.data.emailFailedCount}건은 재확인이 필요합니다.` : ""),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "전형 결과 확정 중 오류가 발생했습니다.");
    } finally {
      setConfirmingResults(false);
    }
  }

  const hasApplicantFilter = Boolean(applicantQuery || Object.values(applicantFilters).some(Boolean));
  const parsedJobDescription = extractPostingExtraInfo(recruitment?.jobDescription);
  const postingExtraInfo = recruitment
    ? postingExtraInfoFromApiFields(recruitment, parsedJobDescription.extraInfo)
    : parsedJobDescription.extraInfo;

  return (
    <section className="app-page glass-page notion">
        <div className="page-head">
          <div className="page-head-lead">
            <BackButton fallbackHref="/company/recruitments" />
            <div>
              <Breadcrumb
                items={[
                  { label: "공고 목록", href: "/company/recruitments" },
                  { label: recruitment?.title ?? "공고 대시보드" },
                ]}
              />
              <h1>{recruitment?.title ?? "공고 대시보드"}</h1>
            </div>
          </div>
          <div className="page-actions detail-actions">
            <button
              className="detail-action-icon"
              type="button"
              disabled={!recruitment}
              aria-label="공개 지원 링크 복사"
              data-tooltip="공개 지원 링크 복사"
              onClick={() => void handlePublicApplicationLinkCopy()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
            <div className="detail-action-menu" ref={actionMenuRef}>
              <button
                className="detail-action-icon"
                type="button"
                aria-haspopup="menu"
                aria-expanded={actionMenuOpen}
                aria-label="공고 관리 메뉴"
                data-tooltip="공고 관리"
                onClick={() => setActionMenuOpen((current) => !current)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {actionMenuOpen ? (
                <div className="detail-action-dropdown" role="menu">
                  <Link className="detail-action-item" role="menuitem" href={`/company/recruitments/${recruitmentId}/settings`}>
                    공고 설정
                  </Link>
                  <Link className="detail-action-item" role="menuitem" href={buildInterviewSettingsHref(recruitmentId)}>
                    면접 설정
                  </Link>
                  {recruitment?.status === "DRAFT" ? (
                    <button
                      className="detail-action-item"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setPublishError("");
                        setActionMenuOpen(false);
                        setOpenPromptOpen(true);
                      }}
                    >
                      공고 공개
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {message ? <p className="notice">{message}</p> : null}
        {recruitment ? (
          <>
            <section className="kpi-row">
              <div className="kpi">
                <Image className="kpi-icon" src={detailApplicantsIcon} alt="" width={28} height={28} aria-hidden="true" />
                <span>지원자 수</span>
                <strong>{activeTotal}</strong>
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
                </div>
                {activeTotal > 0 ? (
                  <div className="screening-head-actions">
                    <label className="screening-sort">
                      <span>정렬</span>
                      <select
                        value={applicantSort}
                        onChange={(event) => {
                          setApplicantSort(event.target.value as ApplicantSort);
                          setApplicantPage(1);
                        }}
                      >
                        {APPLICANT_SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="pass-target-control" aria-label="전형 결과 확정">
                      <span className="pass-target-current">합격 {effectiveCounts.PASS ?? 0}명</span>
                      <span className="pass-target-current">보류 {effectiveCounts.HOLD ?? 0}명</span>
                      <span className="pass-target-current">불합격 {effectiveCounts.FAIL ?? 0}명</span>
                      <button
                        className="btn primary pass-mail-button"
                        type="button"
                        disabled={confirmingResults || applicantsLoading || loading || (applicantSummary?.confirmationEligibleTotal ?? 0) === 0}
                        onClick={() => setConfirmationOpen(true)}
                      >
                        결과 확정
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <form className="applicant-filter-toolbar" onSubmit={handleApplicantSearch}>
                <input
                  aria-label="지원자 이름 또는 이메일 검색"
                  value={applicantSearchInput}
                  onChange={(event) => setApplicantSearchInput(event.target.value)}
                  placeholder="이름·이메일 검색"
                />
                <select
                  aria-label="지원 상태 필터"
                  value={applicantFilters.applicationStatus}
                  onChange={(event) => updateApplicantFilter("applicationStatus", event.target.value)}
                >
                  <option value="">지원 상태 전체</option>
                  {APPLICATION_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatRecruitingStatusLabel(status)}</option>)}
                </select>
                <select
                  aria-label="서류 상태 필터"
                  value={applicantFilters.documentStatus}
                  onChange={(event) => updateApplicantFilter("documentStatus", event.target.value)}
                >
                  <option value="">서류 상태 전체</option>
                  {DOCUMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatRecruitingStatusLabel(status)}</option>)}
                </select>
                <select
                  aria-label="면접 상태 필터"
                  value={applicantFilters.interviewStatus}
                  onChange={(event) => updateApplicantFilter("interviewStatus", event.target.value)}
                >
                  <option value="">면접 상태 전체</option>
                  {INTERVIEW_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatRecruitingStatusLabel(status)}</option>)}
                </select>
                <select
                  aria-label="리포트 상태 필터"
                  value={applicantFilters.reportStatus}
                  onChange={(event) => updateApplicantFilter("reportStatus", event.target.value)}
                >
                  <option value="">리포트 상태 전체</option>
                  {REPORT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatRecruitingStatusLabel(status)}</option>)}
                </select>
                <select
                  aria-label="전형 상태 필터"
                  value={applicantFilters.screeningDecision}
                  onChange={(event) => updateApplicantFilter("screeningDecision", event.target.value)}
                >
                  <option value="">전형 상태 전체</option>
                  {decisionFilters.map((decision) => <option key={decision} value={decision}>{formatRecruitingStatusLabel(decision)}</option>)}
                </select>
                <button className="btn secondary" type="submit" disabled={applicantsLoading}>검색</button>
              </form>

              {applicants.length === 0 ? (
                <div className="empty">
                  {applicantsLoading
                    ? "지원자 목록을 불러오는 중입니다."
                    : hasApplicantFilter
                      ? "조건에 맞는 지원자가 없습니다."
                      : "아직 지원한 지원자가 없습니다."}
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="screening-table">
                    <colgroup>
                      <col className="screening-col-candidate" />
                      <col className="screening-col-interview" />
                      <col className="screening-col-report" />
                      <col className="screening-col-score" />
                      <col className="screening-col-decision" />
                      <col className="screening-col-memo" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>지원자</th>
                        <th>면접</th>
                        <th>리포트</th>
                        <th>점수</th>
                        <th>전형 상태</th>
                        <th>메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applicants.map((item) => {
                        const decisionState = getScreeningAutosaveFieldState(autosaveState, item.applicationId, "decision");
                        const memoState = getScreeningAutosaveFieldState(autosaveState, item.applicationId, "memo");
                        const canEditDecision = canEditScreeningDecision({
                          autoScreeningPolicyEnabled: item.autoScreeningPolicyEnabled,
                          reportStatus: item.report?.status ?? item.reportStatus,
                          screeningDecision: item.screeningDecision,
                          screeningResultConfirmationStatus: item.screeningResultConfirmationStatus,
                        });

                        const evaluationHref = `/company/applicants/${item.applicationId}/evaluation`;

                        return (
                          <tr
                            key={item.applicationId}
                            className="screening-row"
                            onClick={() => router.push(evaluationHref)}
                          >
                            <td>
                              <Link
                                className="screening-candidate-link"
                                href={evaluationHref}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <strong>{item.name}</strong>
                                <span>{item.email}</span>
                              </Link>
                            </td>
                            <td>
                              <StatusBadge value={item.interviewStatus} />
                            </td>
                            <td>
                              <StatusBadge value={item.report ? item.report.status : "NONE_OR_GENERATING"} />
                            </td>
                            <td>
                              {item.report?.totalScore != null ? (
                                <span className={`screening-report-score ${screeningScoreTier(item.report.totalScore)}`}>{item.report.totalScore}점</span>
                              ) : (
                                <span className="screening-report-score is-empty">—</span>
                              )}
                            </td>
                            <td onClick={(event) => event.stopPropagation()}>
                              {!canEditDecision ? (
                                <div className="autosave-field">
                                  <StatusBadge value={item.effectiveScreeningDecision} />
                                  <span className="autosave-state">
                                    {item.screeningResultConfirmationStatus === "CONFIRMED" ? "확정" : "자동 판정"}
                                  </span>
                                </div>
                              ) : (
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
                              )}
                            </td>
                            <td onClick={(event) => event.stopPropagation()}>
                              {!canEditDecision ? (
                                <span className="screening-report-score is-empty">
                                  {item.screeningResultConfirmationStatus === "CONFIRMED" ? "변경 불가" : "확인 필요"}
                                </span>
                              ) : (
                                <div className={`autosave-field ${memoState === "saving" ? "is-saving" : ""} ${memoState === "error" ? "is-error" : ""}`}>
                                  <input
                                    aria-label={`${item.name} 메모`}
                                    value={screeningDrafts[item.applicationId]?.memo ?? ""}
                                    onBlur={() => void handleMemoBlur(item)}
                                    onChange={(event) => updateDraft(item.applicationId, { memo: event.target.value })}
                                    placeholder="자동판정 변경 사유(10자 이상)"
                                  />
                                  <span className="autosave-state" aria-live="polite">
                                    {memoState === "error" ? "저장 실패" : ""}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {totalApplicantPages > 1 ? (
                <nav className="applicant-pagination" aria-label="지원자 목록 페이지">
                  <button
                    type="button"
                    className="applicant-page-btn"
                    disabled={applicantsLoading || currentApplicantPage <= 1}
                    aria-label="이전 페이지"
                    onClick={() => setApplicantPage(currentApplicantPage - 1)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
                  </button>
                  {applicantPageWindow.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`applicant-page-num${pageNumber === currentApplicantPage ? " is-active" : ""}`}
                      aria-current={pageNumber === currentApplicantPage ? "page" : undefined}
                      onClick={() => setApplicantPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="applicant-page-btn"
                    disabled={applicantsLoading || currentApplicantPage >= totalApplicantPages}
                    aria-label="다음 페이지"
                    onClick={() => setApplicantPage(currentApplicantPage + 1)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                  </button>
                </nav>
              ) : null}
            </section>

          </>
        ) : (
          <div className="empty">{loading ? "공고 대시보드를 불러오는 중입니다." : "공고 대시보드를 불러올 수 없습니다."}</div>
        )}

        {openPromptOpen && recruitment ? (
          <div className="modal-backdrop" role="presentation">
            <div className="modal open-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="open-recruitment-title">
              <div className="open-confirm-icon" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="8" x2="12" y2="13" />
                  <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
                </svg>
              </div>
              <h2 id="open-recruitment-title" className="open-confirm-title">공고를 여시겠습니까?</h2>
              <p className="open-confirm-desc">공고를 열면 공개 지원 링크로 지원자가 지원할 수 있습니다.</p>
              {publishError ? <p className="notice danger">{publishError}</p> : null}
              <div className="open-confirm-actions">
                {publishError ? (
                  <button className="btn primary" type="button" onClick={handleOpenDismissed}>
                    닫기
                  </button>
                ) : (
                  <>
                    <button className="btn secondary" type="button" disabled={publishing} onClick={handleOpenDismissed}>
                      아니오
                    </button>
                    <button className="btn primary" type="button" disabled={publishing} onClick={() => void handleOpenConfirmed()}>
                      {publishing ? "여는 중…" : "네"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
        {confirmationOpen ? (
          <div className="modal-backdrop" role="presentation">
            <div className="modal open-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="screening-confirm-title" aria-describedby="screening-confirm-description">
              <div className="open-confirm-icon" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="8" x2="12" y2="13" />
                  <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
                </svg>
              </div>
              <h2 id="screening-confirm-title" className="open-confirm-title">전형 결과를 정말 확정하시겠습니까?</h2>
              <p id="screening-confirm-description" className="open-confirm-desc">
                확정 대상 {confirmationPreview.eligibleTotal}명의 PASS·HOLD·FAIL 결과가 지원자에게 공개되고 알림이 발송됩니다. 확정 후에는 이 화면에서 수정할 수 없습니다.
              </p>
              <p className="open-confirm-desc">
                합격 {confirmationPreview.eligibleDecisionCounts.PASS}명 · 보류 {confirmationPreview.eligibleDecisionCounts.HOLD}명 · 불합격 {confirmationPreview.eligibleDecisionCounts.FAIL}명
              </p>
              {(confirmationPreview.excludedDecisionCounts.UNDECIDED + confirmationPreview.excludedDecisionCounts.RETRY) > 0 ? (
                <p className="notice">
                  미판정 {confirmationPreview.excludedDecisionCounts.UNDECIDED}명 · 재처리 {confirmationPreview.excludedDecisionCounts.RETRY}명은 이번 확정에서 제외됩니다.
                </p>
              ) : null}
              <div className="open-confirm-actions">
                <button className="btn secondary" type="button" disabled={confirmingResults} onClick={() => setConfirmationOpen(false)}>
                  취소
                </button>
                <button className="btn primary" type="button" disabled={confirmingResults} onClick={() => void handleScreeningResultsConfirm()}>
                  {confirmingResults ? "확정 중…" : "확정하고 통보"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
    </section>
  );
}

function buildPageWindow(page: number, totalPages: number, windowSize: number): number[] {
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function openPromptDismissKey(recruitmentId: number) {
  return `recruitment-open-prompt-dismissed:${recruitmentId}`;
}

function isOpenPromptDismissed(recruitmentId: number) {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(openPromptDismissKey(recruitmentId)) === "1";
}

function dismissOpenPrompt(recruitmentId: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(openPromptDismissKey(recruitmentId), "1");
}

function formatPeriod(item: Recruitment) {
  if (!item.startsOn && !item.endsOn) {
    return "기간 미정";
  }
  return `${item.startsOn ?? "시작 미정"} ~ ${item.endsOn ?? "마감 미정"}`;
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
    decision: normalizeDecision(item.effectiveScreeningDecision),
    memo: item.screeningDecisionOverrideReason ?? "",
  };
}

function normalizeDecision(value: string): ScreeningDecision {
  return decisions.includes(value as ScreeningDecision) ? (value as ScreeningDecision) : "UNDECIDED";
}
