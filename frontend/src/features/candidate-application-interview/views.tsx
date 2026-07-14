"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  CandidateFileAsset,
  CandidateFolder,
  CandidateJobDetail,
  CandidateJobQuery,
  CandidateJobSummary,
  ConsentType,
  PageMeta,
} from "./api";
import { candidateApplicationInterviewRoutes } from "./routes";
import {
  type CandidateApplicationFormState,
  applyFolderToApplicationForm,
  restoreApplicationSetContent,
  getCandidateJobDetailActionHref,
  hasPortfolioArtifact,
  hasRequiredConsents,
  toSubmitApplicationRequest,
} from "./view-model";
import { JobDescriptionViewer } from "../company-recruiting/JobDescriptionViewer";
import { extractPostingExtraInfo, postingExtraInfoFields } from "../company-recruiting/posting-extra-info";
import { loadKakaoMaps } from "../../lib/kakao-maps";
import { CandidateProfileSnapshotEditor } from "./CandidateProfileSnapshotEditor";

export interface CandidateJobsViewProps {
  jobs: CandidateJobSummary[];
  query: CandidateJobQuery;
  totalItems: number;
  pageMeta?: PageMeta;
  onQueryChange: (query: CandidateJobQuery) => void;
}

const SORT_OPTIONS: { value: NonNullable<CandidateJobQuery["sort"]>; label: string }[] = [
  { value: "createdAt", label: "최신순" },
  { value: "endsOn", label: "마감임박순" },
  { value: "title", label: "제목순" },
];



type FilterCatKey = "jobRole" | "career" | "location" | "recruitment";

interface FilterOption {
  value: string;
  label: string;
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

// 지역 19종. value 는 표시 라벨과 동일한 한글(백엔드 location 값과 정렬 필요, D 협의).
const LOCATION_OPTIONS: FilterOption[] = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "경남",
  "경북",
  "전남",
  "전북",
  "충남",
  "충북",
  "제주",
  "해외",
].map((value) => ({ value, label: value }));

const RECRUITMENT_OPTIONS: FilterOption[] = [
  { value: "상시", label: "상시 채용" },
  { value: "마감형", label: "마감형 채용" },
];

// 필터 옆 발견형 추천 태그(하드코딩·시각용, 동작 없음). ※ PR 미반영 데모.
type RecTagIcon = "rocket" | "badge" | "home" | "star" | "bolt" | "cap";
const RECOMMENDED_TAGS: { icon: RecTagIcon; label: string }[] = [
  { icon: "rocket", label: "네카라쿠배 공채만" },
  { icon: "badge", label: "2026 공채" },
  { icon: "home", label: "재택 가능" },
  { icon: "star", label: "성장기 스타트업" },
  { icon: "bolt", label: "적극 채용 중" },
  { icon: "cap", label: "신입 환영" },
];

function RecTagIcon({ name }: { name: RecTagIcon }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "rocket":
      return (
        <svg {...common}>
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        </svg>
      );
    case "badge":
      return (
        <svg {...common}>
          <path d="m12 2 2.4 1.8 3-.3 1 2.8 2.6 1.5-1 2.9 1 2.9-2.6 1.5-1 2.8-3-.3L12 22l-2.4-1.8-3 .3-1-2.8L3 15.4l1-2.9-1-2.9 2.6-1.5 1-2.8 3 .3z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="m3 10 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "star":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M12 3.5l2.5 5.3 5.5.6-4.1 3.8 1.1 5.4L12 15.9 7 18.6l1.1-5.4L4 9.4l5.5-.6z" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M13 2 4 13h6l-1 9 10-12h-7z" />
        </svg>
      );
    case "cap":
      return (
        <svg {...common}>
          <path d="m22 10-10-5L2 10l10 5 10-5z" />
          <path d="M6 12v5c0 1 3 2 6 2s6-1 6-2v-5" />
        </svg>
      );
  }
}

const FILTER_CATS: { key: FilterCatKey; label: string; hint: string }[] = [
  { key: "jobRole", label: "직무", hint: "관심 직무를 여러 개 선택할 수 있어요" },
  { key: "career", label: "경력", hint: "경력 범위를 지정하거나 무관을 선택하세요" },
  { key: "location", label: "지역", hint: "근무 지역을 선택하세요" },
  { key: "recruitment", label: "채용 형태", hint: "상시/마감형 채용을 선택하세요" },
];

// 경력 슬라이더: 0 = 신입 … CAREER_MAX = 상한(+)
const CAREER_MAX = 10;
function careerRangeLabel(min: number, max: number): string {
  if (min <= 0 && max >= CAREER_MAX) return "전체";
  if (min <= 0 && max === 0) return "신입";
  const maxText = max >= CAREER_MAX ? `${CAREER_MAX}년 이상` : `${max}년`;
  if (min <= 0) return `신입~${maxText}`;
  if (min === max) return `${min}년`;
  return `${min}~${maxText}`;
}

interface FilterDraft {
  jobRoles: string[];
  careerAny: boolean;
  careerMin: number;
  careerMax: number;
  location: string;
  recruitment: string;
}
const EMPTY_DRAFT: FilterDraft = {
  jobRoles: [],
  careerAny: true,
  careerMin: 0,
  careerMax: CAREER_MAX,
  location: "",
  recruitment: "",
};

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

// JD 본문에서 이미지 갤러리(파일명 노출)·태그·근무지역 섹션을 제거한다.
// 태그와 근무지역은 본문 아래에 태그 → 근무지역 순으로 다시 배치한다(JD 섹션은 유지).
function stripStructuredJobMediaSections(jobDescription: string): string {
  return jobDescription
    .replace(/<section\b[^>]*data-init-structured-gallery="true"[^>]*>[\s\S]*?<\/section>/gi, "")
    .replace(/<section\b[^>]*data-init-structured-tags="true"[^>]*>[\s\S]*?<\/section>/gi, "")
    .replace(/<section\b[^>]*data-init-structured-location="true"[^>]*>[\s\S]*?<\/section>/gi, "");
}

// JD 본문의 근무지역 섹션 텍스트만 추출한다(태그 아래로 재배치용).
function extractStructuredLocationNote(jobDescription: string): string {
  const raw =
    jobDescription.match(
      /<section\b[^>]*data-init-structured-location="true"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/section>/i,
    )?.[1] ?? "";
  return raw.replace(/<[^>]*>/g, "").trim();
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

// 공고 상세 마감일은 D-day 대신 실제 날짜(YYYY. MM. DD)로 표기한다. 마감일 없으면 상시 채용.
function formatDeadlineDate(endsOn: string): string {
  if (!endsOn) return "상시 채용";
  const end = new Date(`${endsOn}T00:00:00`);
  if (Number.isNaN(end.getTime())) return endsOn;
  return `${end.getFullYear()}. ${String(end.getMonth() + 1).padStart(2, "0")}. ${String(end.getDate()).padStart(2, "0")}`;
}

export function CandidateJobsView({ jobs, query, totalItems, pageMeta, onQueryChange }: CandidateJobsViewProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<FilterCatKey>("jobRole");
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

  function patch(next: Partial<CandidateJobQuery>) {
    onQueryChange({ ...query, ...next, page: 1 });
  }

  function goPage(nextPage: number) {
    onQueryChange({ ...query, page: nextPage });
    window.setTimeout(() => scrollToJobs(), 60);
  }

  function openFilter() {
    const hasCareer = query.careerMinYears != null || query.careerMaxYears != null;
    setDraft({
      jobRoles: query.jobRoles ?? (query.jobRole ? [query.jobRole] : []),
      careerAny: !hasCareer,
      careerMin: query.careerMinYears ?? 0,
      careerMax: query.careerMaxYears ?? CAREER_MAX,
      location: query.location ?? "",
      recruitment: query.recruitmentType ?? "",
    });
    setActiveCat("jobRole");
    setFilterOpen(true);
  }

  function toggleDraftJobRole(value: string) {
    setDraft((prev) => ({
      ...prev,
      jobRoles: prev.jobRoles.includes(value)
        ? prev.jobRoles.filter((item) => item !== value)
        : [...prev.jobRoles, value],
    }));
  }

  function setDraftSingle(key: "location" | "recruitment", value: string) {
    setDraft((prev) => ({ ...prev, [key]: prev[key] === value ? "" : value }));
  }

  function applyFilter() {
    onQueryChange({
      ...query,
      page: 1,
      jobRole: undefined,
      jobRoles: draft.jobRoles.length ? draft.jobRoles : undefined,
      careerMinYears: draft.careerAny ? undefined : draft.careerMin,
      careerMaxYears: draft.careerAny ? undefined : draft.careerMax,
      location: draft.location || undefined,
      recruitmentType: (draft.recruitment as CandidateJobQuery["recruitmentType"]) || undefined,
    });
    setFilterOpen(false);
  }

  // 툴바에 노출할 적용된 필터 칩(각각 개별 해제 가능).
  const activeFilterChips: { id: string; label: string; onClear: () => void }[] = [];
  const appliedRoles = query.jobRoles ?? (query.jobRole ? [query.jobRole] : []);
  appliedRoles.forEach((role) => {
    activeFilterChips.push({
      id: `role-${role}`,
      label: role,
      onClear: () => patch({ jobRole: undefined, jobRoles: appliedRoles.filter((item) => item !== role) }),
    });
  });
  if (query.careerMinYears != null || query.careerMaxYears != null) {
    activeFilterChips.push({
      id: "career",
      label: careerRangeLabel(query.careerMinYears ?? 0, query.careerMaxYears ?? CAREER_MAX),
      onClear: () => patch({ careerMinYears: undefined, careerMaxYears: undefined }),
    });
  }
  if (query.location) {
    activeFilterChips.push({ id: "location", label: query.location, onClear: () => patch({ location: undefined }) });
  }
  if (query.recruitmentType) {
    activeFilterChips.push({
      id: "recruitment",
      label: query.recruitmentType === "상시" ? "상시 채용" : "마감형 채용",
      onClear: () => patch({ recruitmentType: undefined }),
    });
  }

  const draftCount =
    draft.jobRoles.length + (draft.careerAny ? 0 : 1) + (draft.location ? 1 : 0) + (draft.recruitment ? 1 : 0);
  const activeCatMeta = FILTER_CATS.find((item) => item.key === activeCat);

  function scrollToJobs() {
    const el = document.getElementById("candidate-jobs-all");
    if (el) smoothScrollWindowTo(el.getBoundingClientRect().top + window.scrollY - CANDIDATE_HEADER_OFFSET);
  }

  function renderJobCard(job: CandidateJobSummary) {
    const dday = candidateJobDday(job.endsOn);
    const meta = [job.careerLevel, job.employmentType, displayLocation(job.location)].filter(Boolean);
    // 공고에 등록된 태그가 있으면 태그를, 없으면 직무를 기본 태그로 노출한다.
    const tags = job.tags.length ? job.tags : Array.from(new Set([job.jobRole, job.jobGroup].filter(Boolean)));
    const recruitLabel = !job.endsOn ? "상시" : dday && dday !== "마감" ? dday : "마감";
    return (
      <a
        className="candidate-job-card"
        key={job.jobId}
        role="listitem"
        href={candidateApplicationInterviewRoutes.jobDetail(job.jobId)}
      >
        <span className="candidate-job-card-bookmark" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
          </svg>
        </span>
        <div className="candidate-job-card-head">
          <span className="candidate-job-card-logo" aria-hidden="true">
            <CompanyLogoMark companyLogoUrl={job.companyLogoUrl} fallbackLabel={companyLogoLabelFromName(job.companyName)} />
          </span>
          <div className="candidate-job-card-headinfo">
            <p className="candidate-job-card-company">{job.companyName}</p>
            {meta.length ? <p className="candidate-job-card-meta">{meta.join(" · ")}</p> : null}
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
          <span className={`candidate-job-card-recruit${dday === "마감" ? " is-closed" : ""}`}>{recruitLabel}</span>
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
          <h3>
            <svg className="candidate-jobs-star" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11.48 3.5a.6.6 0 0 1 1.04 0l2.28 4.62a.6.6 0 0 0 .45.33l5.1.74a.6.6 0 0 1 .33 1.02l-3.69 3.6a.6.6 0 0 0-.17.53l.87 5.08a.6.6 0 0 1-.87.63l-4.56-2.4a.6.6 0 0 0-.56 0l-4.56 2.4a.6.6 0 0 1-.87-.63l.87-5.08a.6.6 0 0 0-.17-.53l-3.69-3.6a.6.6 0 0 1 .33-1.02l5.1-.74a.6.6 0 0 0 .45-.33L11.48 3.5z" />
            </svg>
            인기 TOP 공고
          </h3>
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
              <source src="/jobs-banner-bg-v2.mp4" type="video/mp4" />
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
                {activeFilterChips.length ? <em className="candidate-jobs-filter-count">{activeFilterChips.length}</em> : null}
              </button>
              {activeFilterChips.length === 0 ? (
                <div className="candidate-jobs-rec" aria-label="추천 태그">
                  {RECOMMENDED_TAGS.map((tag) => (
                    <span key={tag.label} className="candidate-jobs-rec-tag">
                      <span className="candidate-jobs-rec-icon" aria-hidden="true">
                        <RecTagIcon name={tag.icon} />
                      </span>
                      <span className="candidate-jobs-rec-label">{tag.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="candidate-jobs-active">
                {activeFilterChips.map((chip) => (
                  <button key={chip.id} type="button" className="candidate-jobs-chip" onClick={chip.onClear}>
                    {chip.label}
                    <span aria-hidden="true">✕</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="candidate-jobs-toolbar-right">
              <SortDropdown value={query.sort ?? "createdAt"} onChange={(next) => patch({ sort: next })} />
            </div>
          </div>

          <p className="candidate-jobs-count-line">
            해당 공고 <strong>{totalItems}</strong>개
          </p>

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
          {pageMeta && pageMeta.totalPages > 1 ? (
            <JobsPagination page={pageMeta.page} totalPages={pageMeta.totalPages} onPageChange={goPage} />
          ) : null}
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
                {FILTER_CATS.map((category) => {
                  const hasValue =
                    category.key === "jobRole"
                      ? draft.jobRoles.length > 0
                      : category.key === "career"
                        ? !draft.careerAny
                        : category.key === "location"
                          ? Boolean(draft.location)
                          : Boolean(draft.recruitment);
                  return (
                    <button
                      key={category.key}
                      type="button"
                      className={`candidate-filter-cat${activeCat === category.key ? " is-active" : ""}`}
                      onClick={() => setActiveCat(category.key)}
                    >
                      {category.label}
                      {hasValue ? <em className="candidate-filter-cat-dot" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </nav>
              <div className="candidate-filter-options">
                {activeCatMeta ? (
                  <div className="candidate-filter-options-head">
                    <strong>{activeCatMeta.label}</strong>
                    <span>{activeCatMeta.hint}</span>
                  </div>
                ) : null}

                {activeCat === "jobRole" ? (
                  <div className="candidate-filter-chips">
                    {IT_DEV_ROLES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`candidate-filter-chip${draft.jobRoles.includes(option.value) ? " is-selected" : ""}`}
                        onClick={() => toggleDraftJobRole(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {activeCat === "career" ? (
                  <div className="candidate-filter-career">
                    <CareerRangeSlider
                      min={draft.careerMin}
                      max={draft.careerMax}
                      disabled={draft.careerAny}
                      onChange={(nextMin, nextMax) =>
                        setDraft((prev) => ({ ...prev, careerMin: nextMin, careerMax: nextMax }))
                      }
                    />
                    <label className="candidate-filter-anycheck">
                      <input
                        type="checkbox"
                        checked={draft.careerAny}
                        onChange={(event) => {
                          const { checked } = event.currentTarget;
                          setDraft((prev) => ({ ...prev, careerAny: checked }));
                        }}
                      />
                      경력 무관
                    </label>
                  </div>
                ) : null}

                {activeCat === "location" ? (
                  <div className="candidate-filter-chips">
                    {LOCATION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`candidate-filter-chip${draft.location === option.value ? " is-selected" : ""}`}
                        onClick={() => setDraftSingle("location", option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {activeCat === "recruitment" ? (
                  <div className="candidate-filter-chips">
                    {RECRUITMENT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`candidate-filter-chip${draft.recruitment === option.value ? " is-selected" : ""}`}
                        onClick={() => setDraftSingle("recruitment", option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <footer className="candidate-filter-foot">
              <button type="button" className="candidate-filter-reset" onClick={() => setDraft(EMPTY_DRAFT)}>
                초기화{draftCount ? ` ${draftCount}` : ""}
              </button>
              <button type="button" className="btn primary" onClick={applyFilter}>
                공고 적용
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CareerRangeSlider({
  min,
  max,
  disabled,
  onChange,
}: {
  min: number;
  max: number;
  disabled: boolean;
  onChange: (min: number, max: number) => void;
}) {
  const pct = (value: number) => (value / CAREER_MAX) * 100;
  return (
    <div className={`career-slider${disabled ? " is-disabled" : ""}`}>
      <div className="career-slider-value">{disabled ? "경력 무관" : careerRangeLabel(min, max)}</div>
      <div className="career-slider-track">
        <span className="career-slider-rail" aria-hidden="true" />
        <span className="career-slider-fill" style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%` }} aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={CAREER_MAX}
          step={1}
          value={min}
          disabled={disabled}
          aria-label="최소 경력"
          onChange={(event) => onChange(Math.min(Number(event.currentTarget.value), max), max)}
        />
        <input
          type="range"
          min={0}
          max={CAREER_MAX}
          step={1}
          value={max}
          disabled={disabled}
          aria-label="최대 경력"
          onChange={(event) => onChange(min, Math.max(Number(event.currentTarget.value), min))}
        />
      </div>
      <div className="career-slider-ends">
        <span>신입</span>
        <span>{CAREER_MAX}년+</span>
      </div>
    </div>
  );
}

function JobsPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
}) {
  // 현재 페이지 주변으로 최대 5개 번호만 노출한다.
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav className="candidate-jobs-pagination" aria-label="공고 목록 페이지">
      <button
        type="button"
        className="candidate-jobs-page-btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 페이지"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      </button>
      {pages.map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          className={`candidate-jobs-page-num${pageNumber === page ? " is-active" : ""}`}
          aria-current={pageNumber === page ? "page" : undefined}
          onClick={() => onPageChange(pageNumber)}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        className="candidate-jobs-page-btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="다음 페이지"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </nav>
  );
}

export interface CandidateJobDetailViewProps {
  job: CandidateJobDetail;
  /** 같은 직무의 추천 공고(우측 사이드). */
  relatedJobs?: CandidateJobSummary[];
  /** 지정하면 지원하기 버튼이 페이지 이동 대신 이 핸들러(모달 열기)를 호출한다. */
  onApplyClick?: () => void;
}

// JD(리치텍스트 HTML)에 삽입된 이미지 src 를 추출한다(상단 캐러셀용, API 변경 없음).
function extractJobImages(jobDescription: string | null | undefined): string[] {
  if (!jobDescription || typeof window === "undefined") return [];
  const doc = new DOMParser().parseFromString(jobDescription, "text/html");
  return Array.from(doc.querySelectorAll("img"))
    .map((img) => img.getAttribute("src") ?? "")
    .filter(Boolean);
}

// 회사 위치 — 주소 표시 + 좌표가 있으면 카카오 지도에 핀.
// 키 없거나 SDK 로드 실패 시에는 빈 지도 박스 대신 주소만 보여준다.
function WorkplaceMap({ address, lat, lng }: { address: string | null; lat: number | null; lng: number | null }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "failed">("loading");
  const hasCoords = lat != null && lng != null;

  useEffect(() => {
    if (lat == null || lng == null) {
      setMapStatus("failed");
      return;
    }
    setMapStatus("loading");
    let cancelled = false;
    const container = mapRef.current;
    if (!container) return;
    loadKakaoMaps()
      .then((maps) => {
        if (cancelled) return;
        const center = new maps.LatLng(lat, lng);
        const map = new maps.Map(container, { center, level: 3 });
        new maps.Marker({ position: center, map });
        setMapStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  if (!address) return null;
  return (
    <section className="jobdetail-companyinfo">
      <h2>근무지 위치</h2>
      <p>{address}</p>
      {/* 로드 성공/진행 중에만 지도 컨테이너 렌더(실패 시 제거 → 주소만). ref 부착을 위해 실패 전까진 유지. */}
      {hasCoords && mapStatus !== "failed" ? <div className="jobdetail-map" ref={mapRef} aria-label="근무지 지도" /> : null}
    </section>
  );
}

// 추천 공고 로고 — URL 없거나 로드 실패 시 회사명 첫 글자 이니셜로 대체.
function RelatedJobLogo({ logoUrl, companyName }: { logoUrl: string | null; companyName: string }) {
  const [failed, setFailed] = useState(false);
  const initial = companyName.trim().charAt(0) || "?";
  return (
    <span className="jobdetail-related-logo" aria-hidden="true">
      {logoUrl && !failed ? (
        // 외부/스토리지 URL 이라 next/image 최적화 대상 아님
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="jobdetail-related-logo-fallback">{initial}</span>
      )}
    </span>
  );
}

export function CandidateJobDetailView({ job, relatedJobs = [], onApplyClick }: CandidateJobDetailViewProps) {
  const actionHref = getCandidateJobDetailActionHref(job);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<string[]>([]);
  // 갤러리가 가로로 넘칠 때(보이는 것보다 이미지가 많을 때)만 좌우 넘김 버튼을 노출한다.
  const [galleryCanScroll, setGalleryCanScroll] = useState(false);

  // JD 에서 "공고 조건" 블록을 분리해 요약 그리드로 보여주고, 본문에는 제거된 JD 만 렌더한다.
  // 이미지 갤러리(파일명 노출)와 태그 섹션은 상단 캐러셀/헤더 태그로 이미 보여주므로 본문에서만 제거한다(JD 섹션은 유지).
  const { jobDescription: jdWithoutExtraInfo, extraInfo } = extractPostingExtraInfo(job.jobDescription);
  const jdBody = stripStructuredJobMediaSections(jdWithoutExtraInfo);
  const locationNote = extractStructuredLocationNote(jdWithoutExtraInfo);
  const summaryRows = postingExtraInfoFields
    .map((field) => ({ label: field.label, value: extraInfo[field.key].enabled ? extraInfo[field.key].value : "" }))
    .filter((row) => row.value);

  useEffect(() => {
    setImages(extractJobImages(job.jobDescription));
  }, [job.jobDescription]);

  useEffect(() => {
    const el = galleryRef.current;
    if (!el) {
      setGalleryCanScroll(false);
      return;
    }
    const update = () => setGalleryCanScroll(el.scrollWidth > el.clientWidth + 2);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [images]);

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
          {galleryCanScroll ? (
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
                  {formatDeadlineDate(job.endsOn)}
                </strong>
              </div>
            </div>
          ) : null}

          <div className="jobdetail-jd">
            <JobDescriptionViewer value={jdBody} emptyMessage="등록된 JD가 없습니다." />
          </div>

          {job.techStacks.length ? (
            <section className="jobdetail-tagsection">
              <h2>태그</h2>
              <div className="jobdetail-tags">
                {job.techStacks.map((techStack) => (
                  <span key={techStack}>{techStack}</span>
                ))}
              </div>
            </section>
          ) : null}

          {locationNote ? (
            <section className="jobdetail-companyinfo">
              <h2>근무지역</h2>
              <p>{locationNote}</p>
            </section>
          ) : null}

          {job.companyProfile ? (
            <section className="jobdetail-companyinfo">
              <h2>회사 소개</h2>
              <p>{job.companyProfile}</p>
            </section>
          ) : null}

          <WorkplaceMap address={job.workplaceAddress} lat={job.workplaceLat} lng={job.workplaceLng} />
        </div>

        <aside className="jobdetail-aside">
          {onApplyClick ? (
            <button
              type="button"
              className="btn primary jobdetail-apply-cta"
              disabled={!job.canApply || job.alreadyApplied}
              onClick={onApplyClick}
            >
              {job.alreadyApplied ? "지원 완료" : "지원하기"}
            </button>
          ) : (
            <a
              aria-disabled={!actionHref}
              className="btn primary jobdetail-apply-cta"
              href={actionHref || "#"}
              tabIndex={actionHref ? undefined : -1}
            >
              {job.alreadyApplied ? "지원 완료" : "지원하기"}
            </a>
          )}

          {relatedJobs.length ? (
            <section className="jobdetail-related" aria-label="비슷한 공고">
              <h2 className="jobdetail-related-title">비슷한 공고</h2>
              <ul className="jobdetail-related-list">
                {relatedJobs.map((related) => (
                  <li key={related.jobId}>
                    <a className="jobdetail-related-card" href={candidateApplicationInterviewRoutes.jobDetail(related.jobId)}>
                      <RelatedJobLogo logoUrl={related.companyLogoUrl} companyName={related.companyName} />
                      <span className="jobdetail-related-text">
                        <span className="jobdetail-related-company">{related.companyName}</span>
                        <span className="jobdetail-related-name">{related.title}</span>
                        <span className="jobdetail-related-meta">
                          {[related.careerLevel, related.employmentType, displayLocation(related.location)].filter(Boolean).join(", ")}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function formatSetUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

interface ApplicationSetLoaderProps {
  folders: CandidateFolder[];
  activeSetId: number | null;
  onLoad: (folder: CandidateFolder) => void;
  onEdit?: (folder: CandidateFolder) => void;
}

// 저장한 지원서 세트를 지원 폼에 불러오는 패널. 불러온 내용은 수정 가능하고 원본 세트는 바뀌지 않는다. (#272)
function ApplicationSetLoader({ folders, activeSetId, onLoad, onEdit }: ApplicationSetLoaderProps) {
  if (folders.length === 0) {
    return null;
  }
  return (
    <section className="candidate-apply-card candidate-apply-setloader" aria-label="지원서 세트 불러오기">
      <p className="panel-title">지원서 세트 불러오기</p>
      <p className="candidate-apply-note">
        저장한 지원서 세트를 불러와 자동으로 채울 수 있어요. 불러온 내용은 자유롭게 수정할 수 있고, 원본 세트는 변경되지 않습니다.
      </p>
      <div className="candidate-apply-setlist folder-grid">
        {folders.map((folder) => {
          const updatedAt = formatSetUpdatedAt(folder.updatedAt);
          return (
            <article className={`folder-card${activeSetId === folder.id ? " is-active" : ""}`} key={folder.id}>
              <div className="folder-card__top">
                <h3 className="folder-card__name">{folder.name}</h3>
                {onEdit ? (
                  <div className="folder-card__actions">
                    <button type="button" className="folder-icon-btn" aria-label="편집" title={`${folder.name} 편집`} onClick={() => onEdit(folder)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                    </button>
                  </div>
                ) : null}
              </div>
              <div className={`folder-card__resume${folder.resumeFileName ? "" : " is-empty"}`}>
                <span>{folder.resumeFileName ? `이력서 · ${folder.resumeFileName}` : "이력서 없음"}{updatedAt ? ` · 수정 ${updatedAt}` : ""}</span>
              </div>
              <p className="folder-card__motivation">{folder.motivation || "지원 동기 미작성"}</p>
              <button type="button" className="btn secondary compact" onClick={() => onLoad(folder)}>
                {activeSetId === folder.id ? "불러오기 해제" : "이 세트 불러오기"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export interface CandidateApplicationViewProps {
  job: CandidateJobDetail;
  state: CandidateApplicationFormState;
  latestResumeFile?: CandidateFileAsset;
  latestPortfolioFile?: CandidateFileAsset;
  folders?: CandidateFolder[];
  busy?: boolean;
  onResumeFileSelect?: (file: File) => void | Promise<void>;
  onPortfolioFileSelect?: (file: File) => void | Promise<void>;
  onStateChange: (state: CandidateApplicationFormState) => void;
  onSubmit: (request: ReturnType<typeof toSubmitApplicationRequest>) => void | Promise<void>;
}

export function CandidateApplicationView({
  job,
  state,
  latestResumeFile,
  latestPortfolioFile,
  folders = [],
  busy = false,
  onResumeFileSelect,
  onPortfolioFileSelect,
  onStateChange,
  onSubmit,
}: CandidateApplicationViewProps) {
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [loadedResumeName, setLoadedResumeName] = useState<string | null>(null);
  const [loadedPortfolioName, setLoadedPortfolioName] = useState<string | null>(null);
  const [preSetSnapshot, setPreSetSnapshot] = useState<CandidateApplicationFormState | null>(null);

  function handleLoadSet(folder: CandidateFolder) {
    // 이미 불러온 세트를 다시 누르면 불러오기 이전 상태로 되돌린다(아무것도 선택하지 않은 상태). (#272)
    if (activeSetId === folder.id) {
      // 해제: 기본정보/편집은 유지하고 콘텐츠만 세트 이전 값으로 되돌린다.
      if (preSetSnapshot) {
        onStateChange(restoreApplicationSetContent(state, preSetSnapshot));
      }
      setActiveSetId(null);
      setLoadedResumeName(null);
      setLoadedPortfolioName(null);
      setPreSetSnapshot(null);
      return;
    }
    // 세트 콘텐츠의 기준은 "세트 이전" 상태(프로필 자동입력 등)다. 첫 선택이면 현재 폼,
    // 세트 전환이면 최초 스냅샷을 기준으로 삼아 이전 세트 값이 남지 않게 한다. 기본정보 편집은 current 로 유지. (#272 P2)
    const baseline = activeSetId === null ? state : preSetSnapshot ?? state;
    if (activeSetId === null) {
      setPreSetSnapshot(state);
    }
    onStateChange(applyFolderToApplicationForm(state, baseline, folder));
    setActiveSetId(folder.id);
    setLoadedResumeName(folder.resumeFileId ? folder.resumeFileName : null);
    setLoadedPortfolioName(folder.portfolioFileId ? folder.portfolioFileName : null);
  }

  // 표시 파일명은 현재 resumeFileId/portfolioFileId 가 실제로 가리키는 파일 기준으로 정한다.
  // (직접 업로드 후 세트를 불러오면 파일 ID는 세트 것으로 바뀌므로, 업로드 파일명이 남지 않도록.) (#272 P2)
  const resumeFromUpload = Boolean(latestResumeFile && latestResumeFile.fileId === state.resumeFileId);
  const portfolioFromUpload = Boolean(latestPortfolioFile && latestPortfolioFile.fileId === state.portfolioFileId);

  const basicComplete = Boolean(
    state.profileSnapshot && state.candidateName.trim() && state.email.trim() && state.phone.trim(),
  );
  const resumeComplete = Boolean(state.resumeFileId);
  const portfolioComplete = hasPortfolioArtifact(state);
  const detailsComplete = Boolean(state.motivation.trim() && state.additionalInfo.trim());
  const consentCount = applicationConsentOptions.filter((consentType) => state.consentTypes.includes(consentType)).length;
  const canSubmit =
    resumeComplete &&
    portfolioComplete &&
    detailsComplete &&
    basicComplete &&
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
        <ApplicationSetLoader folders={folders} activeSetId={activeSetId} onLoad={handleLoadSet} />
        <section aria-labelledby="candidate-basic-info-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-basic-info-heading">기본 정보</p>
          <label>
            이름 <span className="req-mark">*</span>
            <input
              placeholder="이름을 입력하세요"
              required
              value={state.candidateName}
              onChange={(event) => onStateChange({ ...state, candidateName: event.currentTarget.value })}
            />
          </label>
          <label>
            이메일 <span className="req-mark">*</span>
            <input
              placeholder="example@email.com"
              required
              type="email"
              value={state.email}
              onChange={(event) => onStateChange({ ...state, email: event.currentTarget.value })}
            />
          </label>
          <label>
            연락처 <span className="req-mark">*</span>
            <input
              placeholder="010-0000-0000"
              required
              value={state.phone}
              onChange={(event) => onStateChange({ ...state, phone: event.currentTarget.value })}
            />
          </label>
          <label>
            GitHub URL
            <input
              placeholder="https://github.com/example"
              type="url"
              value={state.githubUrl}
              onChange={(event) => onStateChange({ ...state, githubUrl: event.currentTarget.value })}
            />
          </label>
          <label>
            블로그 URL
            <input
              placeholder="https://blog.example.com"
              type="url"
              value={state.blogUrl}
              onChange={(event) => onStateChange({ ...state, blogUrl: event.currentTarget.value })}
            />
          </label>
        </section>

        <section aria-labelledby="candidate-document-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-document-heading">서류 업로드</p>
          <label className="candidate-apply-file-label">
            이력서 <span className="req-mark">*</span>
            <span className="candidate-apply-file-row">
              <input
                accept=".pdf,application/pdf"
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
              <span>{resumeFromUpload ? latestResumeFile?.originalName : loadedResumeName ?? "이력서 파일을 선택하세요"}</span>
              <strong>{resumeFromUpload ? "업로드 완료" : loadedResumeName ? "세트 이력서" : "파일 선택"}</strong>
            </span>
          </label>
          <label>
            포트폴리오 URL (URL 또는 PDF 중 하나 필수)
            <input
              placeholder="https://portfolio.example.com"
              type="url"
              value={state.portfolioUrl ?? ""}
              onChange={(event) => onStateChange({ ...state, portfolioUrl: event.currentTarget.value })}
            />
          </label>
          <label className="candidate-apply-file-label">
            포트폴리오 PDF (URL 또는 PDF 중 하나 필수)
            <span className="candidate-apply-file-row">
              <input
                accept=".pdf,application/pdf"
                className="candidate-hidden-file"
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file && onPortfolioFileSelect) void onPortfolioFileSelect(file);
                }}
              />
              <span>{portfolioFromUpload ? latestPortfolioFile?.originalName : loadedPortfolioName ?? "포트폴리오 PDF를 선택하세요"}</span>
              <strong>{portfolioFromUpload ? "업로드 완료" : loadedPortfolioName ? "세트 포트폴리오" : "파일 선택"}</strong>
            </span>
          </label>
          <p className="candidate-apply-note">PDF · 20MB 이하</p>
        </section>

        <section aria-labelledby="candidate-cover-letter-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-cover-letter-heading">지원 동기 / 추가 설명</p>
          <textarea
            placeholder="이 공고에 지원한 동기를 입력하세요."
            required
            value={state.motivation}
            onChange={(event) => onStateChange({ ...state, motivation: event.currentTarget.value })}
          />
          <textarea
            placeholder="관련 프로젝트, 본인이 맡은 역할 등 추가 설명을 입력하세요."
            required
            value={state.additionalInfo}
            onChange={(event) => onStateChange({ ...state, additionalInfo: event.currentTarget.value })}
          />
        </section>

        <section className="candidate-apply-card">
          <p className="panel-title">제출 상태 점검</p>
          <div className="candidate-apply-check-table" role="table" aria-label="지원서 제출 상태 점검">
            <StatusCheck label="필수 정보" ready={basicComplete} readyText="완료" pendingText="입력 필요" />
            <StatusCheck label="이력서" ready={resumeComplete} readyText="업로드 완료" pendingText="필수" />
            <StatusCheck label="포트폴리오" ready={portfolioComplete} readyText="입력 완료" pendingText="필수" />
            <StatusCheck label="지원동기·추가 설명" ready={detailsComplete} readyText="입력 완료" pendingText="필수" />
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

export interface CandidateApplyModalProps {
  job: CandidateJobDetail;
  state: CandidateApplicationFormState;
  latestResumeFile?: CandidateFileAsset;
  latestPortfolioFile?: CandidateFileAsset;
  folders?: CandidateFolder[];
  busy?: boolean;
  errorMessage?: string;
  onResumeFileSelect?: (file: File) => void | Promise<void>;
  onPortfolioFileSelect?: (file: File) => void | Promise<void>;
  onStateChange: (state: CandidateApplicationFormState) => void;
  onSubmit: (request: ReturnType<typeof toSubmitApplicationRequest>) => void | Promise<void>;
  onClose: () => void;
  onEditFolder?: (folder: CandidateFolder) => void;
}

const APPLY_STEPS = ["기본 정보", "서류", "동의 및 제출"] as const;

// 공고 상세 위에서 단계별로 지원서를 작성하는 모달(이슈 #207). 기존 제출 API 흐름을 그대로 사용한다.
export function CandidateApplyModal({
  job,
  state,
  latestResumeFile,
  latestPortfolioFile,
  folders = [],
  busy = false,
  errorMessage,
  onResumeFileSelect,
  onPortfolioFileSelect,
  onStateChange,
  onSubmit,
  onClose,
  onEditFolder,
}: CandidateApplyModalProps) {
  const [step, setStep] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [loadedResumeName, setLoadedResumeName] = useState<string | null>(null);
  const [loadedPortfolioName, setLoadedPortfolioName] = useState<string | null>(null);
  const [preSetSnapshot, setPreSetSnapshot] = useState<CandidateApplicationFormState | null>(null);

  function handleLoadSet(folder: CandidateFolder) {
    // 이미 불러온 세트를 다시 누르면 불러오기 이전 상태로 되돌린다(아무것도 선택하지 않은 상태). (#272)
    if (activeSetId === folder.id) {
      // 해제: 기본정보/편집은 유지하고 콘텐츠만 세트 이전 값으로 되돌린다.
      if (preSetSnapshot) {
        onStateChange(restoreApplicationSetContent(state, preSetSnapshot));
      }
      setActiveSetId(null);
      setLoadedResumeName(null);
      setLoadedPortfolioName(null);
      setPreSetSnapshot(null);
      return;
    }
    // 세트 콘텐츠의 기준은 "세트 이전" 상태(프로필 자동입력 등)다. 첫 선택이면 현재 폼,
    // 세트 전환이면 최초 스냅샷을 기준으로 삼아 이전 세트 값이 남지 않게 한다. 기본정보 편집은 current 로 유지. (#272 P2)
    const baseline = activeSetId === null ? state : preSetSnapshot ?? state;
    if (activeSetId === null) {
      setPreSetSnapshot(state);
    }
    onStateChange(applyFolderToApplicationForm(state, baseline, folder));
    setActiveSetId(folder.id);
    setLoadedResumeName(folder.resumeFileId ? folder.resumeFileName : null);
    setLoadedPortfolioName(folder.portfolioFileId ? folder.portfolioFileName : null);
  }

  useEffect(() => {
    setValidationMessage("");
  }, [state]);

  // 표시 파일명은 현재 파일 ID 가 실제로 가리키는 파일 기준. (직접 업로드 후 세트 불러오기 시 불일치 방지) (#272 P2)
  const resumeFromUpload = Boolean(latestResumeFile && latestResumeFile.fileId === state.resumeFileId);
  const portfolioFromUpload = Boolean(latestPortfolioFile && latestPortfolioFile.fileId === state.portfolioFileId);

  const basicComplete = Boolean(
    state.profileSnapshot && state.candidateName.trim() && state.email.trim() && state.phone.trim(),
  );
  const resumeComplete = Boolean(state.resumeFileId);
  const portfolioComplete = hasPortfolioArtifact(state);
  const detailsComplete = Boolean(state.motivation.trim() && state.additionalInfo.trim());
  const consentsComplete = hasRequiredConsents(state.consentTypes);
  const canNext = step === 0 ? basicComplete : step === 1 ? resumeComplete && portfolioComplete && detailsComplete : false;
  const canSubmit =
    basicComplete && resumeComplete && portfolioComplete && detailsComplete && consentsComplete && job.canApply && !job.alreadyApplied && !busy;

  function requestClose() {
    const dirty = Boolean(
      state.resumeFileId || state.portfolioFileId || state.portfolioUrl?.trim() || state.motivation.trim() || state.additionalInfo.trim() || state.consentTypes.length,
    );
    if (dirty && !window.confirm("작성 중인 내용이 있습니다. 지원서를 닫을까요?")) return;
    onClose();
  }

  async function handleFinalSubmit() {
    setValidationMessage("");
    try {
      await onSubmit(toSubmitApplicationRequest(state));
    } catch (error) {
      setValidationMessage(toApplyValidationMessage(error));
    }
  }

  return (
    <div
      className="candidate-apply-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="candidate-apply-modal" role="dialog" aria-modal="true" aria-label="지원서 작성">
        <header className="candidate-apply-modal-head">
          <div>
            <h3>지원서 작성</h3>
            <p>{job.companyName} · {job.title}</p>
          </div>
          <button type="button" className="candidate-filter-close" aria-label="닫기" onClick={requestClose}>
            ✕
          </button>
        </header>

        <div className="candidate-apply-steps-bar" aria-label="지원 단계">
          {APPLY_STEPS.map((label, index) => (
            <span key={label} className={`candidate-apply-step${index === step ? " is-current" : ""}${index < step ? " is-done" : ""}`}>
              <b>{index + 1}</b> {label}
            </span>
          ))}
        </div>

        <div className="candidate-apply-modal-body">
          {errorMessage || validationMessage ? <p className="notice danger">{errorMessage || validationMessage}</p> : null}

          {step === 0 ? (
            <div className="candidate-apply-modal-fields">
              <ApplicationSetLoader folders={folders} activeSetId={activeSetId} onLoad={handleLoadSet} onEdit={onEditFolder} />
              {state.profileSnapshot ? (
                <CandidateProfileSnapshotEditor
                  value={state.profileSnapshot}
                  onChange={(profileSnapshot) => onStateChange({
                    ...state,
                    profileSnapshot,
                    candidateName: profileSnapshot.name,
                    email: profileSnapshot.email,
                    phone: profileSnapshot.phone ?? "",
                    githubUrl: profileSnapshot.githubUrl ?? "",
                    blogUrl: profileSnapshot.blogUrl ?? "",
                    portfolioUrl: profileSnapshot.portfolioUrl ?? undefined,
                  })}
                />
              ) : <p className="candidate-apply-note">마이페이지 프로필을 불러오는 중입니다.</p>}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="candidate-apply-modal-fields">
              <label className="candidate-apply-file-label">
                이력서 <span className="req-mark">*</span>
                <span className="candidate-apply-file-row">
                  <input
                    accept=".pdf,application/pdf"
                    className="candidate-hidden-file"
                    type="file"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file && onResumeFileSelect) {
                        void onResumeFileSelect(file);
                      }
                    }}
                  />
                  <span>{resumeFromUpload ? latestResumeFile?.originalName : loadedResumeName ?? "이력서 PDF를 선택하세요 (20MB 이하)"}</span>
                  <strong>{resumeFromUpload ? "업로드 완료" : loadedResumeName ? "세트 이력서" : "파일 선택"}</strong>
                </span>
              </label>
              <label>
                포트폴리오 URL (URL 또는 PDF 중 하나 필수)
                <input
                  placeholder="https://portfolio.example.com"
                  type="url"
                  value={state.portfolioUrl ?? ""}
                  onChange={(event) => onStateChange({ ...state, portfolioUrl: event.currentTarget.value })}
                />
              </label>
              <label className="candidate-apply-file-label">
                포트폴리오 PDF (URL 또는 PDF 중 하나 필수)
                <span className="candidate-apply-file-row">
                  <input
                    accept=".pdf,application/pdf"
                    className="candidate-hidden-file"
                    type="file"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file && onPortfolioFileSelect) void onPortfolioFileSelect(file);
                    }}
                  />
                  <span>{portfolioFromUpload ? latestPortfolioFile?.originalName : loadedPortfolioName ?? "포트폴리오 PDF를 선택하세요"}</span>
                  <strong>{portfolioFromUpload ? "업로드 완료" : loadedPortfolioName ? "세트 포트폴리오" : "파일 선택"}</strong>
                </span>
              </label>
              <label>
                지원 동기 <span className="req-mark">*</span>
                <textarea
                  placeholder="이 공고에 지원한 동기를 입력하세요."
                  required
                  value={state.motivation}
                  onChange={(event) => onStateChange({ ...state, motivation: event.currentTarget.value })}
                />
              </label>
              <label>
                추가 설명 <span className="req-mark">*</span>
                <textarea
                  placeholder="관련 프로젝트, 본인이 맡은 역할 등 추가 설명을 입력하세요."
                  required
                  value={state.additionalInfo}
                  onChange={(event) => onStateChange({ ...state, additionalInfo: event.currentTarget.value })}
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="candidate-apply-modal-fields">
              <div className="candidate-apply-review">
                <div><span>이름</span><strong>{state.candidateName || "-"}</strong></div>
                <div><span>이메일</span><strong>{state.email || "-"}</strong></div>
                <div><span>연락처</span><strong>{state.phone || "-"}</strong></div>
                <div><span>GitHub</span><strong>{state.githubUrl || "-"}</strong></div>
                <div><span>블로그</span><strong>{state.blogUrl || "-"}</strong></div>
                <div><span>이력서</span><strong>{resumeFromUpload ? latestResumeFile?.originalName : loadedResumeName ?? "-"}</strong></div>
                <div><span>포트폴리오 URL</span><strong>{state.portfolioUrl || "-"}</strong></div>
                <div><span>포트폴리오 PDF</span><strong>{portfolioFromUpload ? latestPortfolioFile?.originalName : loadedPortfolioName ?? "-"}</strong></div>
                <div><span>지원 동기</span><strong>{state.motivation || "-"}</strong></div>
                <div><span>추가 설명</span><strong>{state.additionalInfo || "-"}</strong></div>
              </div>
              <fieldset className="candidate-apply-modal-consents">
                <legend>동의 항목</legend>
                {applicationConsentOptions.map((consentType) => (
                  <label key={consentType}>
                    <input
                      checked={state.consentTypes.includes(consentType)}
                      type="checkbox"
                      onChange={() => onStateChange({ ...state, consentTypes: toggleConsent(state.consentTypes, consentType) })}
                    />
                    {consentLabel[consentType]}
                  </label>
                ))}
              </fieldset>
            </div>
          ) : null}
        </div>

        <footer className="candidate-apply-modal-foot">
          <button
            type="button"
            className="btn secondary"
            onClick={() => (step === 0 ? requestClose() : setStep(step - 1))}
            disabled={busy}
          >
            {step === 0 ? "취소" : "이전"}
          </button>
          {step < APPLY_STEPS.length - 1 ? (
            <button type="button" className="btn primary" disabled={!canNext || busy} onClick={() => setStep(step + 1)}>
              다음
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={!canSubmit}
              onClick={() => void handleFinalSubmit()}
            >
              {busy ? "제출 중…" : "지원서 제출"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function toApplyValidationMessage(error: unknown): string {
  if (!(error instanceof Error)) return "지원서 입력값을 확인해주세요.";
  if (error.message.includes("portfolioFileId") || error.message.includes("portfolioUrl")) {
    return "포트폴리오 URL 또는 PDF를 제출해주세요.";
  }
  if (error.message.includes("githubUrl") || error.message.includes("blogUrl")) return "GitHub·블로그 URL 형식을 확인해주세요.";
  if (error.message.includes("motivation") || error.message.includes("additionalInfo")) return "지원동기와 추가 설명을 모두 입력해주세요.";
  if (error.message.includes("resumeFileId")) return "이력서 파일을 업로드해주세요.";
  if (error.message.includes("candidateName") || error.message.includes("email") || error.message.includes("phone")) {
    return "이름, 이메일, 연락처를 모두 입력해주세요.";
  }
  if (error.message.includes("consentTypes")) return "필수 동의 항목을 모두 체크해주세요.";
  return error.message;
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
