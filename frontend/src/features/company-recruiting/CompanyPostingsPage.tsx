"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useState } from "react";

import { listRecruitmentApplicants, listRecruitments } from "./api";
import { StatusBadge } from "./CompanyRecruitingChrome";
import { formatRecruitmentPaginationSummary, getRecruitmentPaginationPages } from "./recruitment-list-pagination";
import type { Recruitment, RecruitmentStatus } from "./types";
import type { PageMeta } from "./types";
import { getCompanyPostingActions } from "./company-posting-actions";
import { getStructuredJobDescriptionGallery } from "./structured-job-description";
import { getCompanyProfile } from "../company-profile/api";
import { getCompanyDisplayName, getCompanyLogoUrl } from "../company-profile/company-profile-display";
import type { CompanyProfile } from "../company-profile/types";
import agreementIcon from "./assets/kpi-agreement.png";
import expiredIcon from "./assets/kpi-expired.png";
import personalGrowthIcon from "./assets/kpi-personal-growth.png";
import taskPlanningIcon from "./assets/kpi-task-planning.png";
import postingBanner from "./assets/posting-banner.png";
import postingNoImage from "./assets/posting-no-image.png";

type StatusFilter = "ALL" | RecruitmentStatus;

type CompletionStat = { rate: number; done: number; total: number };

const ACTIVE_STATUSES: RecruitmentStatus[] = ["OPEN", "CLOSING_SOON"];
const INTERVIEW_DONE_STATUSES = ["COMPLETED", "DONE"];
const recruitmentPageSize = 10;

// 카드 상단 컬러 헤더 (상태별)
const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "OPEN", label: "모집중" },
  { value: "CLOSING_SOON", label: "마감임박" },
  { value: "DRAFT", label: "작성중" },
  { value: "CLOSED", label: "마감" },
  { value: "ARCHIVED", label: "보관" },
];

export function CompanyPostingsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [items, setItems] = useState<Recruitment[]>([]);
  const [allRecruitments, setAllRecruitments] = useState<Recruitment[]>([]);
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);
  const [completion, setCompletion] = useState<Record<number, CompletionStat>>({});
  const [reviewPending, setReviewPending] = useState<number | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const paginationPages = getRecruitmentPaginationPages(pageMeta);

  // list API에는 응시 완료율이 없어 현재 페이지 공고별 지원자를 읽어 카드에 표시할 면접 완료 비율을 계산한다.
  const loadCompletion = useCallback(async (list: Recruitment[]) => {
    try {
      const results = await Promise.all(
        list.map(async (item) => {
          const res = await listRecruitmentApplicants(item.recruitmentId, { page: 1, limit: 100 });
          const applicants = res.data.items;
          const done = applicants.filter((a) => INTERVIEW_DONE_STATUSES.includes(a.interviewStatus)).length;
          const total = applicants.length;
          const rate = total > 0 ? Math.round((done / total) * 100) : 0;
          return { id: item.recruitmentId, stat: { rate, done, total } };
        }),
      );
      setCompletion((current) => ({ ...current, ...Object.fromEntries(results.map((r) => [r.id, r.stat])) }));
    } catch {
      // 완료율은 보조 지표 — 실패해도 목록 자체는 유지한다.
    }
  }, []);

  // KPI(진행 중 공고·총 지원자·검토 대기·마감 임박)는 현재 페이지가 아니라 전체 공고 기준으로 집계한다.
  const loadSummary = useCallback(async () => {
    try {
      const all: Recruitment[] = [];
      let page = 1;
      // 상태 필터/페이지와 무관하게 전체 공고를 모은다.
      for (;;) {
        const res = await listRecruitments({ page, limit: 100, sort: "createdAt", order: "desc" });
        all.push(...res.data.items);
        const meta = res.meta.page;
        if (!meta || !meta.hasNext) break;
        page += 1;
      }
      setAllRecruitments(all);

      // 검토 대기(미정 전형)는 전체 공고의 지원자를 합산해야 "총" 의미가 맞는다.
      const pendings = await Promise.all(
        all.map(async (item) => {
          const res = await listRecruitmentApplicants(item.recruitmentId, { page: 1, limit: 100 });
          return res.data.items.filter((a) => a.screeningDecision === "UNDECIDED").length;
        }),
      );
      setReviewPending(pendings.reduce((sum, n) => sum + n, 0));
    } catch {
      // 집계는 보조 지표 — 실패해도 목록 자체는 유지한다.
    }
  }, []);

  const loadRecruitments = useCallback(async (search: string, status: StatusFilter, options: { page?: number } = {}) => {
    const requestedPage = options.page ?? 1;
    setLoading(true);
    setMessage("");
    try {
      const response = await listRecruitments({
        page: requestedPage,
        limit: recruitmentPageSize,
        q: search,
        status: status === "ALL" ? undefined : status,
        sort: "createdAt",
        order: "desc",
      });
      setItems(response.data.items);
      setPageMeta(response.meta.page ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공고 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCompanyProfile = useCallback(async () => {
    try {
      const profile = await getCompanyProfile();
      setCompanyProfile(profile);
    } catch {
      setCompanyProfile(null);
    }
  }, []);

  useEffect(() => {
    void loadRecruitments("", "ALL");
    void loadCompanyProfile();
    void loadSummary();
  }, [loadCompanyProfile, loadRecruitments, loadSummary]);

  useEffect(() => {
    if (items.length > 0) {
      void loadCompletion(items);
    }
  }, [items, loadCompletion]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRecruitments(q, statusFilter, { page: 1 });
  }

  // KPI는 현재 페이지(items)가 아니라 전체 공고(allRecruitments) 기준으로 파생한다.
  const activeCount = allRecruitments.filter((item) => ACTIVE_STATUSES.includes(item.status)).length;
  const totalApplicants = allRecruitments.reduce((sum, item) => sum + item.applicantCount, 0);
  const closingItems = allRecruitments.filter((item) => {
    const left = daysUntil(item.endsOn);
    return left !== null && left >= 0 && left <= 7 && item.status !== "CLOSED" && item.status !== "ARCHIVED";
  });
  const nearestDday = closingItems.length
    ? Math.min(...closingItems.map((item) => daysUntil(item.endsOn) as number))
    : null;
  const companyDisplayName = getCompanyDisplayName(companyProfile);
  const companyLogoUrl = getCompanyLogoUrl(companyProfile);

  return (
    <section className="app-page glass-page notion list-page">
        <div className="page-banner">
          <div className="page-banner-copy">
            <p className="page-eyebrow">채용 관리</p>
            <h1>공고 목록</h1>
            <p className="page-sub">
              {companyDisplayName ? `${companyDisplayName}의 채용 공고를 한 곳에서 관리하세요. ` : "진행 중인 채용 공고를 한 곳에서 관리하세요. "}
              공고를 선택하면 지원자 현황과 면접·리포트 상태를 바로 확인할 수 있어요.
            </p>
            <Link className="btn primary banner-cta" href="/company/recruitments/new">
              + 공고 생성
            </Link>
          </div>
          <Image className="page-banner-art" src={postingBanner} alt="" width={300} height={300} aria-hidden="true" priority />
        </div>

        <section className="kpi-row kpi-summary">
          <div className="kpi">
            <Image className="kpi-icon" src={taskPlanningIcon} alt="" width={28} height={28} aria-hidden="true" />
            <span>진행 중 공고</span>
            <strong>{activeCount}</strong>
          </div>
          <div className="kpi primary">
            <Image className="kpi-icon" src={personalGrowthIcon} alt="" width={28} height={28} aria-hidden="true" />
            <span>총 지원자</span>
            <strong>{totalApplicants}</strong>
          </div>
          <div className="kpi">
            <Image className="kpi-icon" src={agreementIcon} alt="" width={28} height={28} aria-hidden="true" />
            <span>검토 대기</span>
            <strong>
              {reviewPending ?? "—"}
              {reviewPending !== null && reviewPending > 0 ? <small> 명</small> : null}
            </strong>
          </div>
          <div className="kpi">
            <Image className="kpi-icon" src={expiredIcon} alt="" width={28} height={28} aria-hidden="true" />
            <span>마감 임박</span>
            <strong>
              {closingItems.length}
              {nearestDday !== null ? <small className="kpi-dday"> · D-{nearestDday}</small> : null}
            </strong>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <h2>채용 공고</h2>
              {(pageMeta?.totalItems ?? items.length) > 0 ? <span className="count-pill">{pageMeta?.totalItems ?? items.length}</span> : null}
            </div>
            <form className="toolbar list-filter-toolbar" onSubmit={handleSearch}>
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="프로젝트·직무 검색" />
              <button className="btn secondary" type="submit" disabled={loading}>
                조회
              </button>
            </form>
          </div>

          <div className="posting-filter-chips" role="group" aria-label="상태 필터">
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                className={`filter-chip${statusFilter === chip.value ? " is-active" : ""}`}
                aria-pressed={statusFilter === chip.value}
                onClick={() => {
                  setStatusFilter(chip.value);
                  void loadRecruitments(q, chip.value, { page: 1 });
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {message ? <p className="notice">{message}</p> : null}

          {loading && items.length === 0 ? (
            <div className="empty">공고를 불러오는 중입니다…</div>
          ) : items.length === 0 ? (
            <div className="empty">공고가 없습니다. 오른쪽 상단에서 첫 공고를 생성하세요.</div>
          ) : (
            <div className="posting-grid">
              {items.map((item) => {
                const stat = completion[item.recruitmentId];
                const rate = stat?.rate ?? 0;
                const actions = getCompanyPostingActions(item);
                const manageHref = actions.includes("manage") ? `/company/recruitments/${item.recruitmentId}` : null;
                const galleryUrl = getStructuredJobDescriptionGallery(item.jobDescription)[0]?.url ?? null;
                const coverUrl = galleryUrl ?? companyLogoUrl ?? postingNoImage.src;
                const coverIsPlaceholder = !galleryUrl && !companyLogoUrl;
                return (
                  <article
                    className={`posting-card${manageHref ? " is-clickable" : ""}`}
                    key={item.recruitmentId}
                    role={manageHref ? "link" : undefined}
                    tabIndex={manageHref ? 0 : undefined}
                    onClick={manageHref ? () => router.push(manageHref) : undefined}
                    onKeyDown={manageHref ? (event) => handleRowKey(event, () => router.push(manageHref)) : undefined}
                  >
                    <div
                      className={`pcard-cover has-image${coverIsPlaceholder ? " is-placeholder" : ""}`}
                      style={{ backgroundImage: `url(${coverUrl})` }}
                      aria-hidden="true"
                    />
                    <div className="pcard-body">
                      <div className="pcard-tags">
                        <StatusBadge value={item.status} />
                        <span className={`pcard-dday${ddayLabel(item.endsOn) === "마감" ? " is-danger" : ""}`}>{ddayLabel(item.endsOn)}</span>
                      </div>
                      <h3 className="pcard-title">{item.title}</h3>
                      <p className="pcard-sub">
                        지원 <strong>{item.applicantCount}</strong>명 · 완료 <strong>{rate}%</strong>
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {pageMeta && pageMeta.totalItems > 0 ? (
            <div className="pagination" aria-label="공고 목록 페이지네이션">
              <div className="pagination-summary">{formatRecruitmentPaginationSummary(pageMeta)}</div>
              <div className="pagination-actions">
                <button
                  className="btn secondary compact"
                  type="button"
                  disabled={loading || pageMeta.page <= 1}
                  onClick={() => void loadRecruitments(q, statusFilter, { page: pageMeta.page - 1 })}
                >
                  이전
                </button>
                {paginationPages.map((pageNumber) => (
                  <button
                    className={`page-button ${pageNumber === pageMeta.page ? "active" : ""}`}
                    key={pageNumber}
                    type="button"
                    aria-current={pageNumber === pageMeta.page ? "page" : undefined}
                    disabled={loading}
                    onClick={() => void loadRecruitments(q, statusFilter, { page: pageNumber })}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  className="btn secondary compact"
                  type="button"
                  disabled={loading || !pageMeta.hasNext}
                  onClick={() => void loadRecruitments(q, statusFilter, { page: pageMeta.page + 1 })}
                >
                  다음
                </button>
              </div>
            </div>
          ) : null}
        </section>
    </section>
  );
}

function daysUntil(endsOn: string | null): number | null {
  if (!endsOn) {
    return null;
  }
  const end = new Date(`${endsOn}T23:59:59`);
  if (Number.isNaN(end.getTime())) {
    return null;
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((end.getTime() - startOfToday.getTime()) / 86_400_000);
}

function ddayLabel(endsOn: string | null): string {
  const left = daysUntil(endsOn);
  if (left === null) {
    return "상시";
  }
  if (left < 0) {
    return "마감";
  }
  if (left === 0) {
    return "D-day";
  }
  return `D-${left}`;
}

function handleRowKey(event: KeyboardEvent<HTMLElement>, run: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    run();
  }
}
