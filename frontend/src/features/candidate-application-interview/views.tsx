"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  CandidateFileAsset,
  CandidateJobDetail,
  CandidateJobListPostingStatus,
  CandidateJobQuery,
  CandidateJobSummary,
  ConsentType,
} from "./api";
import { candidateApplicationInterviewRoutes } from "./routes";
import {
  type CandidateApplicationFormState,
  getCandidateJobDetailActionHref,
  hasPortfolioArtifact,
  hasRequiredConsents,
  toSubmitApplicationRequest,
} from "./view-model";
import { JobDescriptionViewer } from "../company-recruiting/JobDescriptionViewer";

export interface CandidateJobsViewProps {
  jobs: CandidateJobSummary[];
  query: CandidateJobQuery;
  totalItems: number;
  onQueryChange: (query: CandidateJobQuery) => void;
}

const SORT_OPTIONS: { value: NonNullable<CandidateJobQuery["sort"]>; label: string }[] = [
  { value: "createdAt", label: "최신순" },
  { value: "endsOn", label: "마감임박순" },
  { value: "title", label: "제목순" },
];

const SEARCH_SUGGESTIONS = ["백엔드", "프론트엔드", "AI·ML", "DevOps", "신입"];

type FilterKey = "jobRole" | "careerLevel" | "location" | "postingStatus";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterCategory {
  key: FilterKey;
  label: string;
  hint: string;
  options: FilterOption[];
}

// 개발자 전용 사이트 → 직무는 IT·개발 하위만 노출. value 는 백엔드 jobRole 값과 맞춰야 함(D 영역 정렬 필요).
const IT_DEV_ROLES: FilterOption[] = [
  "서버·백엔드",
  "프론트엔드",
  "웹풀스택",
  "안드로이드",
  "iOS",
  "크로스플랫폼",
  "DevOps·SRE",
  "데이터 엔지니어",
  "AI·ML",
  "QA·테스트",
  "시스템·네트워크",
  "보안",
  "블록체인",
  "개발 PM",
  "기타 IT·개발",
].map((value) => ({ value, label: value }));

const FILTER_CATEGORIES: FilterCategory[] = [
  { key: "jobRole", label: "직무", hint: "IT·개발 직무 중 하나를 선택하세요", options: IT_DEV_ROLES },
  {
    key: "careerLevel",
    label: "경력",
    hint: "경력 수준을 선택하세요",
    options: [
      { value: "신입", label: "신입" },
      { value: "주니어", label: "주니어 · 1~3년" },
      { value: "미들", label: "미들 · 4~7년" },
      { value: "시니어", label: "시니어 · 8년+" },
    ],
  },
  {
    key: "location",
    label: "지역",
    hint: "근무 지역을 선택하세요",
    options: [
      { value: "Seoul", label: "서울" },
      { value: "Pangyo", label: "판교" },
      { value: "Gyeonggi", label: "경기" },
      { value: "Remote", label: "원격" },
    ],
  },
  {
    key: "postingStatus",
    label: "채용 상태",
    hint: "공고 상태를 선택하세요",
    options: [
      { value: "OPEN", label: "모집중" },
      { value: "CLOSING_SOON", label: "마감임박" },
    ],
  },
];

function filterOptionLabel(key: FilterKey, value: string): string {
  const category = FILTER_CATEGORIES.find((item) => item.key === key);
  return category?.options.find((option) => option.value === value)?.label ?? value;
}

type FilterDraft = Record<FilterKey, string>;
const EMPTY_DRAFT: FilterDraft = { jobRole: "", careerLevel: "", location: "", postingStatus: "" };
const FILTER_KEYS: FilterKey[] = ["jobRole", "careerLevel", "location", "postingStatus"];

// 이 앱에서는 CSS scroll-behavior:smooth 가 취소되므로 rAF 로 직접 부드럽게 스크롤한다.
const CANDIDATE_HEADER_OFFSET = 64;
function smoothScrollWindowTo(y: number, duration = 560): void {
  const startY = window.scrollY;
  const distance = y - startY;
  if (Math.abs(distance) < 2) return;
  // 탭이 숨겨져 있으면 rAF 가 멈추므로 즉시 이동(사용자가 보고 있지 않은 상태).
  if (typeof requestAnimationFrame !== "function" || document.hidden) {
    window.scrollTo(0, y);
    return;
  }
  const startedAt = performance.now();
  function step(now: number) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    window.scrollTo(0, startY + distance * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function candidateJobDday(endsOn: string): string | null {
  if (!endsOn) return null;
  const end = new Date(`${endsOn}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.ceil((end.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days < 0) return "마감";
  if (days === 0) return "D-day";
  return `D-${days}`;
}

export function CandidateJobsView({ jobs, query, totalItems, onQueryChange }: CandidateJobsViewProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<FilterKey>("jobRole");
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);

  // 이 페이지에 있는 동안에만: 최상단(히어로)에서 아래로 스크롤하면 한 번에 공고 목록으로 부드럽게 이동.
  useEffect(() => {
    let animating = false;
    function listTargetY(): number | null {
      const list = document.getElementById("candidate-jobs-list");
      if (!list) return null;
      return list.getBoundingClientRect().top + window.scrollY - CANDIDATE_HEADER_OFFSET;
    }
    function onWheel(event: WheelEvent) {
      if (animating || Math.abs(event.deltaY) < 4) return;
      const target = listTargetY();
      if (target == null) return;
      const atTop = window.scrollY < 40;
      const atList = Math.abs(window.scrollY - target) < 40;
      if (event.deltaY > 0 && atTop) {
        animating = true;
        smoothScrollWindowTo(target);
        window.setTimeout(() => (animating = false), 620);
      } else if (event.deltaY < 0 && atList) {
        animating = true;
        smoothScrollWindowTo(0);
        window.setTimeout(() => (animating = false), 620);
      }
    }
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  function patch(next: Partial<CandidateJobQuery>) {
    onQueryChange({ ...query, ...next, page: 1 });
  }

  function openFilter() {
    setDraft({
      jobRole: query.jobRole ?? "",
      careerLevel: query.careerLevel ?? "",
      location: query.location ?? "",
      postingStatus: query.postingStatus ?? "",
    });
    setActiveCat("jobRole");
    setFilterOpen(true);
  }

  function toggleDraft(key: FilterKey, value: string) {
    setDraft((prev) => ({ ...prev, [key]: prev[key] === value ? "" : value }));
  }

  function applyFilter() {
    onQueryChange({
      ...query,
      page: 1,
      jobRole: draft.jobRole || undefined,
      careerLevel: draft.careerLevel || undefined,
      location: draft.location || undefined,
      postingStatus: toOptionalPostingStatus(draft.postingStatus),
    });
    setFilterOpen(false);
  }

  function clearFilter(key: FilterKey) {
    patch({ [key]: undefined } as Partial<CandidateJobQuery>);
  }

  function scrollToList() {
    const list = document.getElementById("candidate-jobs-list");
    if (list) smoothScrollWindowTo(list.getBoundingClientRect().top + window.scrollY - CANDIDATE_HEADER_OFFSET);
  }

  const activeFilters = FILTER_KEYS.map((key) => ({ key, value: (query[key] as string | undefined) ?? "" })).filter(
    (item) => item.value,
  );
  const draftCount = FILTER_KEYS.filter((key) => draft[key]).length;
  const activeCatMeta = FILTER_CATEGORIES.find((item) => item.key === activeCat);

  return (
    <section aria-label="채용공고 목록" className="candidate-jobs-panel">
      <div className="candidate-jobs-hero">
        <a className="candidate-jobs-myapps" href={candidateApplicationInterviewRoutes.applications}>
          지원현황
        </a>
        <div className="candidate-jobs-hero-inner">
          <h2>
            개발자를 위한 채용공고,
            <br />한곳에서 확인하세요
          </h2>
          <p>회사·공고 제목·직무로 검색하거나, 아래로 스크롤해 전체 공고를 살펴보세요.</p>
          <form
            className="candidate-jobs-search"
            onSubmit={(event) => {
              event.preventDefault();
              onQueryChange({ ...query, page: 1 });
            }}
          >
            <span className="candidate-jobs-search-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              name="q"
              placeholder="어떤 공고를 찾으시나요?"
              value={query.q ?? ""}
              onChange={(event) => patch({ q: event.currentTarget.value })}
            />
            <button className="btn primary" type="submit">
              검색
            </button>
          </form>
          <div className="candidate-jobs-suggestions">
            <span className="candidate-jobs-suggestions-label">추천 검색어</span>
            {SEARCH_SUGGESTIONS.map((keyword) => (
              <button
                key={keyword}
                type="button"
                className={`candidate-jobs-suggestion${query.q === keyword ? " is-active" : ""}`}
                onClick={() => patch({ q: keyword })}
              >
                {keyword}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="candidate-jobs-scrollcue" onClick={scrollToList}>
          <span>공고 보기</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      <div id="candidate-jobs-list" className="candidate-jobs-list">
        <div className="candidate-jobs-toolbar">
          <div className="candidate-jobs-toolbar-left">
            <button type="button" className="candidate-jobs-filter-btn" onClick={openFilter}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5h16M7 12h10M10 19h4" />
              </svg>
              필터
              {activeFilters.length ? <em className="candidate-jobs-filter-count">{activeFilters.length}</em> : null}
            </button>
            <div className="candidate-jobs-active">
              {activeFilters.length ? (
                activeFilters.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="candidate-jobs-chip"
                    onClick={() => clearFilter(item.key)}
                  >
                    {filterOptionLabel(item.key, item.value)}
                    <span aria-hidden="true">✕</span>
                  </button>
                ))
              ) : (
                <span className="candidate-jobs-active-empty">필터로 원하는 공고만 골라보세요</span>
              )}
            </div>
          </div>
          <div className="candidate-jobs-toolbar-right">
            <span className="candidate-jobs-count">
              공고 <strong>{totalItems}</strong>
            </span>
            <select
              aria-label="정렬"
              className="candidate-jobs-sort"
              value={query.sort ?? "createdAt"}
              onChange={(event) => patch({ sort: event.currentTarget.value as CandidateJobQuery["sort"] })}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

      {jobs.length ? (
        <div className="candidate-job-grid" role="list">
          {jobs.map((job) => {
            const dday = candidateJobDday(job.endsOn);
            const tags = Array.from(new Set([job.jobGroup, job.jobRole].filter(Boolean)));
            return (
              <a
                className="candidate-job-card"
                key={job.jobId}
                role="listitem"
                href={candidateApplicationInterviewRoutes.jobDetail(job.jobId)}
              >
                <div className="candidate-job-card-top">
                  <span className="candidate-job-logo" aria-hidden="true">
                    <CompanyLogoMark companyLogoUrl={job.companyLogoUrl} fallbackLabel={companyLogoLabelFromName(job.companyName)} />
                  </span>
                  <div className="candidate-job-card-companyinfo">
                    <p className="candidate-job-card-company">{job.companyName}</p>
                    <p className="candidate-job-card-sub">
                      {[job.careerLevel, job.employmentType, displayLocation(job.location)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <h3 className="candidate-job-card-title">{job.title}</h3>
                {tags.length ? (
                  <div className="candidate-job-card-tags">
                    {tags.map((tag, tagIndex) => (
                      <span key={`${tag}-${tagIndex}`}>#{tag}</span>
                    ))}
                  </div>
                ) : null}
                <div className="candidate-job-card-foot">
                  <span className="candidate-job-card-foot-left">
                    {dday ? <span className={`candidate-job-dday${dday === "마감" ? " is-closed" : ""}`}>{dday}</span> : null}
                    <StatusBadge status={job.postingStatus} />
                  </span>
                  <span className={`candidate-job-available${job.alreadyApplied ? " is-applied" : ""}`}>
                    {job.alreadyApplied ? "지원 완료" : "지원 가능"}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="empty">조건에 맞는 채용공고가 없습니다.</p>
      )}
        <span className="sr-only">지원 가능한 공고 {totalItems}건</span>
      </div>

      {filterOpen ? (
        <div
          className="candidate-filter-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setFilterOpen(false);
          }}
        >
          <div className="candidate-filter-modal" role="dialog" aria-modal="true" aria-label="공고 필터">
            <header className="candidate-filter-head">
              <h3>필터 선택</h3>
              <button type="button" className="candidate-filter-close" onClick={() => setFilterOpen(false)} aria-label="닫기">
                ✕
              </button>
            </header>
            <div className="candidate-filter-body">
              <nav className="candidate-filter-cats" aria-label="필터 카테고리">
                {FILTER_CATEGORIES.map((category) => (
                  <button
                    key={category.key}
                    type="button"
                    className={`candidate-filter-cat${activeCat === category.key ? " is-active" : ""}`}
                    onClick={() => setActiveCat(category.key)}
                  >
                    {category.label}
                    {draft[category.key] ? <em className="candidate-filter-cat-dot" aria-hidden="true" /> : null}
                  </button>
                ))}
              </nav>
              <div className="candidate-filter-options">
                {activeCatMeta ? (
                  <>
                    <div className="candidate-filter-options-head">
                      <strong>{activeCatMeta.label}</strong>
                      <span>{activeCatMeta.hint}</span>
                    </div>
                    <div className="candidate-filter-chips">
                      {activeCatMeta.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`candidate-filter-chip${draft[activeCat] === option.value ? " is-selected" : ""}`}
                          onClick={() => toggleDraft(activeCat, option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <footer className="candidate-filter-foot">
              <button type="button" className="candidate-filter-reset" onClick={() => setDraft(EMPTY_DRAFT)}>
                초기화{draftCount ? ` ${draftCount}` : ""}
              </button>
              <button type="button" className="btn primary" onClick={applyFilter}>
                공고 보기
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export interface CandidateJobDetailViewProps {
  job: CandidateJobDetail;
}

export function CandidateJobDetailView({ job }: CandidateJobDetailViewProps) {
  const actionHref = getCandidateJobDetailActionHref(job);

  return (
    <section aria-labelledby="candidate-job-detail-heading" className="candidate-job-detail-page glass-page notion">
      <div className="page-head">
        <div className="candidate-job-detail-title">
          <CompanyLogoMark companyLogoUrl={job.companyLogoUrl} fallbackLabel={companyLogoLabelFromName(job.companyName)} />
          <div>
            <h1 id="candidate-job-detail-heading">{job.companyName}</h1>
            <p>{job.title} · <StatusBadge status={job.postingStatus} /></p>
          </div>
        </div>
        <div className="page-actions">
          <a className="btn secondary" href={candidateApplicationInterviewRoutes.jobs}>목록</a>
          <a aria-disabled={!actionHref} className="btn primary" href={actionHref || "#"} tabIndex={actionHref ? undefined : -1}>
            {job.alreadyApplied ? "지원 완료" : "지원하기"}
          </a>
        </div>
      </div>

      <div className="candidate-job-detail-grid">
        <section className="panel candidate-job-detail-card">
          <div className="panel-head">
            <div className="panel-title">
              <h2>회사 정보</h2>
            </div>
          </div>
          <div className="candidate-job-detail-box">{job.companyProfile || "산업군, 규모, 주요 서비스 등"}</div>
        </section>
        <section className="panel candidate-job-detail-card">
          <div className="panel-head">
            <div className="panel-title">
              <h2>채용 공고</h2>
            </div>
          </div>
          <div className="candidate-job-detail-box">
            <JobDescriptionViewer value={job.jobDescription} emptyMessage="등록된 JD가 없습니다." />
            <ul className="candidate-feature__tags">
              {job.techStacks.map((techStack) => (
                <li key={techStack}>{techStack}</li>
              ))}
            </ul>
          </div>
        </section>
        <section className="panel candidate-job-detail-meta">
          <div>
            <CompanyLogoMark companyLogoUrl={job.companyLogoUrl} fallbackLabel={companyLogoLabelFromName(job.companyName)} />
            <div>
              <strong>{job.title}</strong>
              <span>{job.companyName}</span>
            </div>
          </div>
          <p>채용 기간 · {formatDateForDisplay(job.startsOn)} ~ {formatDateForDisplay(job.endsOn)}</p>
        </section>
      </div>
    </section>
  );
}

export interface CandidateApplicationViewProps {
  job: CandidateJobDetail;
  state: CandidateApplicationFormState;
  latestResumeFile?: CandidateFileAsset;
  busy?: boolean;
  onResumeFileSelect?: (file: File) => void | Promise<void>;
  onStateChange: (state: CandidateApplicationFormState) => void;
  onSubmit: (request: ReturnType<typeof toSubmitApplicationRequest>) => void | Promise<void>;
}

export function CandidateApplicationView({
  job,
  state,
  latestResumeFile,
  busy = false,
  onResumeFileSelect,
  onStateChange,
  onSubmit,
}: CandidateApplicationViewProps) {
  const basicComplete = Boolean(state.candidateName.trim() && state.email.trim() && state.phone.trim());
  const resumeComplete = Boolean(state.resumeFileId);
  const portfolioComplete = hasPortfolioArtifact(state);
  const consentCount = applicationConsentOptions.filter((consentType) => state.consentTypes.includes(consentType)).length;
  const canSubmit =
    resumeComplete &&
    portfolioComplete &&
    hasRequiredConsents(state.consentTypes) &&
    job.canApply &&
    !job.alreadyApplied &&
    !busy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(toSubmitApplicationRequest(state));
  }

  return (
    <form aria-label="지원서 제출" className="candidate-apply-page glass-page notion" onSubmit={handleSubmit}>
      <section className="candidate-apply-overview">
        <div className="candidate-apply-info-grid">
          <div className="candidate-apply-info-box">
            <span>회사 / 직무</span>
            <strong>{job.companyName} / {job.title}</strong>
          </div>
          <div className="candidate-apply-info-box">
            <span>채용 기간</span>
            <strong>{formatDateRangeCompact(job.startsOn, job.endsOn)}</strong>
          </div>
          <div className="candidate-apply-info-box">
            <span>진행 방식</span>
            <strong>서류 제출 후 AI 면접</strong>
          </div>
        </div>
        <div className="candidate-apply-steps">
          <span className="current"><b>STEP 1</b> 기본 정보</span>
          <span><b>STEP 2</b> 서류 업로드</span>
          <span><b>STEP 3</b> 동의 및 제출</span>
        </div>
      </section>

      <div className="candidate-apply-grid">
        <section aria-labelledby="candidate-basic-info-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-basic-info-heading">기본 정보</p>
          <label>
            이름 *
            <input
              placeholder="김지원"
              required
              value={state.candidateName}
              onChange={(event) => onStateChange({ ...state, candidateName: event.currentTarget.value })}
            />
          </label>
          <label>
            이메일 *
            <input
              placeholder="jiwon@example.com"
              required
              type="email"
              value={state.email}
              onChange={(event) => onStateChange({ ...state, email: event.currentTarget.value })}
            />
          </label>
          <label>
            연락처 *
            <input
              placeholder="010-0000-0000"
              required
              value={state.phone}
              onChange={(event) => onStateChange({ ...state, phone: event.currentTarget.value })}
            />
          </label>
          <label>
            깃허브 / 블로그
            <input
              placeholder="github.com/jiwon"
              type="url"
              value={state.portfolioUrl ?? ""}
              onChange={(event) => onStateChange({ ...state, portfolioUrl: event.currentTarget.value })}
            />
          </label>
        </section>

        <section aria-labelledby="candidate-document-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-document-heading">서류 업로드</p>
          <label className="candidate-apply-file-label">
            이력서 *
            <span className="candidate-apply-file-row">
              <input
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="candidate-hidden-file"
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file && onResumeFileSelect) {
                    void onResumeFileSelect(file);
                  }
                }}
              />
              <span className="candidate-apply-file-icon" aria-hidden="true">
                <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
                  <path d="M8 4h6l4 4v12H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
                  <path d="M14 4v5h5" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </span>
              <span>{latestResumeFile?.originalName ?? "이력서 파일을 선택하세요"}</span>
              <strong>{latestResumeFile ? "업로드 완료" : "파일 선택"}</strong>
            </span>
          </label>
          <label>
            포트폴리오
            <input
              placeholder="포트폴리오 파일 또는 주소"
              type="url"
              value={state.portfolioUrl ?? ""}
              onChange={(event) => onStateChange({ ...state, portfolioUrl: event.currentTarget.value })}
            />
          </label>
          <p className="candidate-apply-note">PDF, DOCX · 20MB 이하</p>
        </section>

        <section aria-labelledby="candidate-cover-letter-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-cover-letter-heading">지원 동기 / 추가 설명</p>
          <textarea
            placeholder="지원 직무 관련 프로젝트 경험, 본인이 맡은 역할, AI 면접에서 강조하고 싶은 내용을 입력하세요."
            value={state.coverLetter ?? ""}
            onChange={(event) => onStateChange({ ...state, coverLetter: event.currentTarget.value })}
          />
        </section>

        <section className="candidate-apply-card">
          <p className="panel-title">제출 상태 점검</p>
          <div className="candidate-apply-check-table" role="table" aria-label="지원서 제출 상태 점검">
            <StatusCheck label="필수 정보" ready={basicComplete} readyText="완료" pendingText="입력 필요" />
            <StatusCheck label="이력서" ready={resumeComplete} readyText="업로드 완료" pendingText="필수" />
            <StatusCheck label="포트폴리오" ready={portfolioComplete} readyText="입력 완료" pendingText="선택 입력" />
            <StatusCheck
              label="동의 항목"
              ready={hasRequiredConsents(state.consentTypes)}
              readyText={`${consentCount} / ${applicationConsentOptions.length} 완료`}
              pendingText={`${consentCount} / ${applicationConsentOptions.length} 완료`}
            />
          </div>
        </section>
      </div>

      <fieldset className="candidate-apply-consent">
        <legend>동의 및 제출 전 확인</legend>
        <div className="candidate-apply-consent__checks">
          {applicationConsentOptions.map((consentType) => (
            <label key={consentType}>
              <input
                checked={state.consentTypes.includes(consentType)}
                type="checkbox"
                onChange={() =>
                  onStateChange({ ...state, consentTypes: toggleConsent(state.consentTypes, consentType) })
                }
              />
              {consentLabel[consentType]}
            </label>
          ))}
        </div>
        <p>필수값, 이력서 업로드, 필수 동의가 모두 완료되면 제출 버튼이 활성화됩니다.</p>
      </fieldset>

      <footer className="candidate-apply-footer">
        <div>
          <a className="btn secondary" href={candidateApplicationInterviewRoutes.jobDetail(job.jobId)}>
            회사 상세로
          </a>
          <button className="btn secondary" type="button">임시저장</button>
          <a className="btn secondary" href={candidateApplicationInterviewRoutes.jobs}>지원 취소</a>
        </div>
        <button className="btn primary" disabled={!canSubmit} type="submit">
          {job.alreadyApplied ? "이미 지원 완료" : "지원서 제출"}
        </button>
      </footer>
    </form>
  );
}

function StatusCheck({
  label,
  ready,
  readyText,
  pendingText,
}: {
  label: string;
  ready: boolean;
  readyText: string;
  pendingText: string;
}) {
  return (
    <div className="candidate-apply-check-row" role="row">
      <span role="cell">{label}</span>
      <strong className={ready ? "is-ready" : "is-pending"} role="cell">
        <span>{ready ? readyText : pendingText}</span>
      </strong>
    </div>
  );
}

function StatusBadge({ status }: { status: CandidateJobSummary["postingStatus"] }) {
  return <span className="candidate-detail-status" data-status={status}>{statusLabel[status]}</span>;
}

function CompanyLogoMark({
  companyLogoUrl,
  fallbackLabel,
}: {
  companyLogoUrl: string | null;
  fallbackLabel: string;
}) {
  if (companyLogoUrl) {
    return (
      <span className="candidate-jobcard__logo has-image" aria-label="회사 로고">
        <span style={{ backgroundImage: `url(${companyLogoUrl})` }} aria-hidden="true" />
      </span>
    );
  }

  return <span className="candidate-jobcard__logo">{fallbackLabel}</span>;
}

function toOptionalPostingStatus(value: string): CandidateJobListPostingStatus | undefined {
  return value === "OPEN" || value === "CLOSING_SOON" ? value : undefined;
}

function companyLogoLabelFromName(companyName: string): string {
  const englishLetter = /([A-Z])/i.exec(companyName);
  if (englishLetter) {
    return `${englishLetter[1].toUpperCase()}사`;
  }

  return companyName.slice(0, 2);
}

function formatDateForDisplay(date: string): string {
  return date.replace(/-/g, ".");
}

function formatDateRangeCompact(startsOn: string, endsOn: string): string {
  const formattedStart = formatDateForDisplay(startsOn);
  const formattedEnd = formatDateForDisplay(endsOn).replace(/^\d{4}\./, "");
  return `${formattedStart} ~ ${formattedEnd}`;
}

function displayLocation(location: string): string {
  const labels: Record<string, string> = {
    Seoul: "서울",
    Pangyo: "판교",
    Remote: "원격",
  };
  return labels[location] ?? location;
}

function toggleConsent(consentTypes: ConsentType[], consentType: ConsentType): ConsentType[] {
  return consentTypes.includes(consentType)
    ? consentTypes.filter((current) => current !== consentType)
    : [...consentTypes, consentType];
}

const statusLabel: Record<CandidateJobSummary["postingStatus"], string> = {
  DRAFT: "비공개",
  OPEN: "채용중",
  CLOSING_SOON: "마감 임박",
  CLOSED: "마감",
  ARCHIVED: "보관",
};

const consentLabel: Record<ConsentType, string> = {
  PRIVACY_COLLECTION: "개인정보 수집·이용 동의",
  AI_DOCUMENT_ANALYSIS: "이력서/포트폴리오 AI 분석 동의",
  AI_INTERVIEW_RECORDING: "AI 면접 녹화·녹음 안내 확인",
};

const applicationConsentOptions: ConsentType[] = [
  "PRIVACY_COLLECTION",
  "AI_DOCUMENT_ANALYSIS",
  "AI_INTERVIEW_RECORDING",
];
