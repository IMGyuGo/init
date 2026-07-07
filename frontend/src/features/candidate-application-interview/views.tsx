"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { extractPostingExtraInfo, postingExtraInfoFields } from "../company-recruiting/posting-extra-info";

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
  const popularGridRef = useRef<HTMLDivElement>(null);
  const quickGridRef = useRef<HTMLDivElement>(null);

  // 가로 스크롤 컨테이너를 한 페이지씩 rAF 로 부드럽게 슬라이드.
  function slideX(el: HTMLDivElement | null, direction: 1 | -1, gap = 20) {
    if (!el) return;
    const pageWidth = el.clientWidth + gap;
    const maxLeft = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft;
    const target = Math.max(0, Math.min(maxLeft, start + direction * pageWidth));
    if (Math.abs(target - start) < 1) return;
    if (typeof requestAnimationFrame !== "function" || document.hidden) {
      el.scrollLeft = target;
      return;
    }
    const node = el;
    const startedAt = performance.now();
    const duration = 440;
    function step(now: number) {
      const p = Math.min((now - startedAt) / duration, 1);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      node.scrollLeft = start + (target - start) * eased;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function scrollPopular(direction: 1 | -1) {
    slideX(popularGridRef.current, direction);
  }
  function scrollQuick(direction: 1 | -1) {
    slideX(quickGridRef.current, direction, 12);
  }

  // 직무 바로가기 캐러셀의 좌/우 끝 위치(버튼·페이드 표시 제어).
  const [quickEdge, setQuickEdge] = useState({ start: true, end: false });
  useEffect(() => {
    const el = quickGridRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setQuickEdge({
        start: el.scrollLeft <= 1,
        end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 1,
      });
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // 검색어는 로컬 상태로 관리해 타이핑마다 재조회하지 않는다. 조회는 제출(검색/Enter) 시에만.
  const [searchText, setSearchText] = useState(query.q ?? "");

  useEffect(() => {
    setSearchText(query.q ?? "");
  }, [query.q]);

  function submitSearch(nextText: string) {
    setSearchText(nextText);
    onQueryChange({ ...query, q: nextText || undefined, page: 1 });
    // 검색하면 아래 공고 목록(2번째 화면)으로 이동해 결과를 바로 보여준다.
    window.setTimeout(() => scrollToJobs(), 60);
  }

  // 이 페이지에 있는 동안에만: 최상단(히어로)에서 아래로 스크롤하면 한 번에 공고 목록으로 부드럽게 이동.
  useEffect(() => {
    let animating = false;
    function listTargetY(): number | null {
      const list = document.getElementById("candidate-jobs-all");
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

  const activeFilters = FILTER_KEYS.map((key) => ({ key, value: (query[key] as string | undefined) ?? "" })).filter(
    (item) => item.value,
  );
  const draftCount = FILTER_KEYS.filter((key) => draft[key]).length;
  const activeCatMeta = FILTER_CATEGORIES.find((item) => item.key === activeCat);

  function scrollToJobs() {
    const el = document.getElementById("candidate-jobs-all");
    if (el) smoothScrollWindowTo(el.getBoundingClientRect().top + window.scrollY - CANDIDATE_HEADER_OFFSET);
  }

  function renderJobCard(job: CandidateJobSummary) {
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
        <p className="candidate-job-card-period">접수 {formatDateRangeCompact(job.startsOn, job.endsOn)}</p>
        <div className="candidate-job-card-foot">
          <span className="candidate-job-card-foot-left">
            {dday ? <span className={`candidate-job-dday${dday === "마감" ? " is-closed" : ""}`}>{dday}</span> : null}
          </span>
          <span className={`candidate-job-available${job.alreadyApplied ? " is-applied" : ""}`}>
            {job.alreadyApplied ? "지원 완료" : "지원 가능"}
          </span>
        </div>
      </a>
    );
  }

  return (
    <section aria-label="채용공고 목록" className="candidate-jobs-panel">
      <div className="candidate-jobs-page1">
      <div className="candidate-jobs-hero">
        <span className="candidate-jobs-hero-videowrap" aria-hidden="true">
          <video className="candidate-jobs-hero-video" autoPlay muted loop playsInline>
            <source src="/candidate-search-bg.mp4" type="video/mp4" />
          </video>
        </span>
        <div className="candidate-jobs-hero-inner">
          <p className="candidate-jobs-hero-eyebrow">init, 인터뷰로 잇다.</p>
          <h2>개발자 채용공고, 한곳에서 확인하세요</h2>
          <form
            className="candidate-jobs-searchbar"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch(searchText);
            }}
          >
            <span className="candidate-jobs-searchbar-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              className="candidate-jobs-searchbar-input"
              name="q"
              value={searchText}
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder="어떤 공고를 찾으시나요?"
              aria-label="공고 검색"
            />
            <button className="cjs-run-sr" type="submit">
              검색
            </button>
          </form>
        </div>
        <button type="button" className="candidate-jobs-scrollcue" onClick={scrollToJobs}>
          <span>공고 목록 보러가기</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      <div className={`candidate-jobs-quickwrap${quickEdge.start ? " is-start" : ""}${quickEdge.end ? " is-end" : ""}`}>
        <div className="candidate-jobs-quicklinks" role="list" aria-label="직무 바로가기" ref={quickGridRef}>
          {IT_DEV_ROLES.map((role) => (
            <button
              key={role.value}
              type="button"
              role="listitem"
              className={`candidate-jobs-quicklink${query.jobRole === role.value ? " is-active" : ""}`}
              onClick={() => {
                patch({ jobRole: role.value });
                window.setTimeout(() => scrollToJobs(), 60);
              }}
            >
              <span>{role.label}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
        {quickEdge.start ? null : (
          <button type="button" className="candidate-jobs-quick-nav prev" aria-label="이전 직무" onClick={() => scrollQuick(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        {quickEdge.end ? null : (
          <button type="button" className="candidate-jobs-quick-nav next" aria-label="다음 직무" onClick={() => scrollQuick(1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      <div id="candidate-jobs-list" className="candidate-jobs-list">
        <div className="candidate-jobs-listhead">
          <h3>인기 TOP 공고</h3>
          <div className="candidate-jobs-nav">
            <button type="button" className="candidate-jobs-navbtn" aria-label="이전 공고" onClick={() => scrollPopular(-1)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button type="button" className="candidate-jobs-navbtn" aria-label="다음 공고" onClick={() => scrollPopular(1)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        {jobs.length ? (
          <div className="candidate-jobs-carousel" role="list" ref={popularGridRef}>
            {jobs.slice(0, 6).map(renderJobCard)}
          </div>
        ) : (
          <p className="empty">조건에 맞는 채용공고가 없습니다.</p>
        )}
      </div>
      </div>

      <div id="candidate-jobs-all" className="candidate-jobs-all">
          <div className="page-banner candidate-jobs-listbanner">
            <video className="candidate-jobs-listbanner-video" autoPlay muted loop playsInline aria-hidden="true">
              <source src="/jobs-banner-bg.mp4" type="video/mp4" />
            </video>
            <div className="page-banner-copy">
              <h1>공고 목록</h1>
              <p className="page-sub">직무·경력·지역으로 원하는 공고를 골라 지원해보세요.</p>
            </div>
          </div>
          <div className="candidate-jobs-toolbar">
            <div className="candidate-jobs-toolbar-left">
              <button type="button" className="candidate-jobs-filter-btn" onClick={openFilter}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
                필터
                {activeFilters.length ? <em className="candidate-jobs-filter-count">{activeFilters.length}</em> : null}
              </button>
              <div className="candidate-jobs-active">
                {activeFilters.map((item) => (
                  <button key={item.key} type="button" className="candidate-jobs-chip" onClick={() => clearFilter(item.key)}>
                    {filterOptionLabel(item.key, item.value)}
                    <span aria-hidden="true">✕</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="candidate-jobs-toolbar-right">
              <span className="candidate-jobs-count">
                공고 <strong>{totalItems}</strong>
              </span>
              <SortDropdown value={query.sort ?? "createdAt"} onChange={(next) => patch({ sort: next })} />
            </div>
          </div>

          {jobs.length ? (
            <div className="candidate-job-grid" role="list">
              {jobs.map(renderJobCard)}
            </div>
          ) : (
            <div className="candidate-jobs-empty">
              <strong>검색 결과가 없습니다</strong>
              <span>다른 키워드나 필터로 다시 검색해보세요.</span>
            </div>
          )}
        </div>
      <span className="sr-only">지원 가능한 공고 {totalItems}건</span>

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

// JD(리치텍스트 HTML)에 삽입된 이미지 src 를 추출한다(상단 캐러셀용, API 변경 없음).
function extractJobImages(jobDescription: string | null | undefined): string[] {
  if (!jobDescription || typeof window === "undefined") return [];
  const doc = new DOMParser().parseFromString(jobDescription, "text/html");
  return Array.from(doc.querySelectorAll("img"))
    .map((img) => img.getAttribute("src") ?? "")
    .filter(Boolean);
}

export function CandidateJobDetailView({ job }: CandidateJobDetailViewProps) {
  const actionHref = getCandidateJobDetailActionHref(job);
  const dday = candidateJobDday(job.endsOn);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<string[]>([]);

  // JD 에서 "공고 조건" 블록을 분리해 요약 그리드로 보여주고, 본문에는 제거된 JD 만 렌더한다.
  const { jobDescription: jdBody, extraInfo } = extractPostingExtraInfo(job.jobDescription);
  const summaryRows = postingExtraInfoFields
    .map((field) => ({ label: field.label, value: extraInfo[field.key].enabled ? extraInfo[field.key].value : "" }))
    .filter((row) => row.value);

  useEffect(() => {
    setImages(extractJobImages(job.jobDescription));
  }, [job.jobDescription]);

  function slideGallery(direction: 1 | -1) {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.9), behavior: "smooth" });
  }

  return (
    <section aria-labelledby="candidate-job-detail-heading" className="candidate-job-detail-page glass-page notion">
      {images.length ? (
        <div className="jobdetail-gallery-wrap">
          <div className="jobdetail-gallery" ref={galleryRef} aria-label="공고 이미지">
            {images.map((src, index) => (
              // JD 에 삽입된 원본 이미지 URL 을 그대로 사용(외부/스토리지 URL 이라 next/image 최적화 대상 아님)
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${src}-${index}`} src={src} alt={`공고 이미지 ${index + 1}`} loading={index > 2 ? "lazy" : undefined} />
            ))}
          </div>
          {images.length > 3 ? (
            <>
              <button type="button" className="jobdetail-gallery-nav prev" aria-label="이전 이미지" onClick={() => slideGallery(-1)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button type="button" className="jobdetail-gallery-nav next" aria-label="다음 이미지" onClick={() => slideGallery(1)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="jobdetail-layout">
        <div className="jobdetail-main">
          <header className="jobdetail-head">
            <div className="jobdetail-company">
              <span className="jobdetail-company-name">{job.companyName}</span>
              <span className="jobdetail-company-meta">
                {[displayLocation(job.location), job.careerLevel, job.employmentType].filter(Boolean).join(" · ")}
              </span>
            </div>
            <h1 id="candidate-job-detail-heading" className="jobdetail-title">{job.title}</h1>
            {job.techStacks.length ? (
              <div className="jobdetail-tags">
                {job.techStacks.map((techStack) => (
                  <span key={techStack}>#{techStack}</span>
                ))}
              </div>
            ) : null}
          </header>

          {summaryRows.length ? (
            <div className="jobdetail-summary">
              {summaryRows.map((row) => (
                <div className="jobdetail-summary-row" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
              <div className="jobdetail-summary-row">
                <span>마감일</span>
                <strong>
                  {dday ?? "-"}
                </strong>
              </div>
            </div>
          ) : null}

          <div className="jobdetail-jd">
            <JobDescriptionViewer value={jdBody} emptyMessage="등록된 JD가 없습니다." />
          </div>

          {job.companyProfile ? (
            <section className="jobdetail-companyinfo">
              <h2>회사 소개</h2>
              <p>{job.companyProfile}</p>
            </section>
          ) : null}
        </div>

        <aside className="jobdetail-aside">
          <a
            aria-disabled={!actionHref}
            className="btn primary jobdetail-apply-cta"
            href={actionHref || "#"}
            tabIndex={actionHref ? undefined : -1}
          >
            {job.alreadyApplied ? "지원 완료" : "지원하기"}
          </a>
        </aside>
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

function SortDropdown({
  value,
  onChange,
}: {
  value: NonNullable<CandidateJobQuery["sort"]>;
  onChange: (value: NonNullable<CandidateJobQuery["sort"]>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const current = SORT_OPTIONS.find((option) => option.value === value) ?? SORT_OPTIONS[0];

  return (
    <div className="candidate-sort" ref={ref}>
      <button
        type="button"
        className="candidate-sort-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {current.label}
        <svg
          className={`candidate-sort-caret${open ? " is-open" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul className="candidate-sort-menu" role="listbox">
          {SORT_OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`candidate-sort-item${option.value === value ? " is-active" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
                {option.value === value ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
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
