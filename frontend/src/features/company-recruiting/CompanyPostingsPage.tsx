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
import { getCompanyProfile } from "../company-profile/api";
import { getCompanyDisplayName } from "../company-profile/company-profile-display";
import type { CompanyProfile } from "../company-profile/types";
import agreementIcon from "./assets/kpi-agreement.png";
import expiredIcon from "./assets/kpi-expired.png";
import personalGrowthIcon from "./assets/kpi-personal-growth.png";
import taskPlanningIcon from "./assets/kpi-task-planning.png";
import postingBanner from "./assets/posting-banner.png";

type StatusFilter = "ALL" | RecruitmentStatus;

type CompletionStat = { rate: number; done: number; total: number };

const ACTIVE_STATUSES: RecruitmentStatus[] = ["OPEN", "CLOSING_SOON"];
const INTERVIEW_DONE_STATUSES = ["COMPLETED", "DONE"];
const URGENT_DDAY = 3;
const recruitmentPageSize = 10;

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
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);
  const [completion, setCompletion] = useState<Record<number, CompletionStat>>({});
  const [reviewPending, setReviewPending] = useState<number | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const paginationPages = getRecruitmentPaginationPages(pageMeta);

  // list API에는 응시 완료율이 없어 공고별 지원자를 읽어 면접 완료 비율을 계산한다.
  const loadCompletion = useCallback(async (list: Recruitment[]) => {
    try {
      const results = await Promise.all(
        list.map(async (item) => {
          const res = await listRecruitmentApplicants(item.recruitmentId, { page: 1, limit: 100 });
          const applicants = res.data.items;
          const done = applicants.filter((a) => INTERVIEW_DONE_STATUSES.includes(a.interviewStatus)).length;
          const pending = applicants.filter((a) => a.screeningDecision === "UNDECIDED").length;
          const total = applicants.length;
          const rate = total > 0 ? Math.round((done / total) * 100) : 0;
          return { id: item.recruitmentId, stat: { rate, done, total }, pending };
        }),
      );
      setCompletion(Object.fromEntries(results.map((r) => [r.id, r.stat])));
      setReviewPending(results.reduce((sum, r) => sum + r.pending, 0));
    } catch {
      // 완료율/검토 대기는 보조 지표 — 실패해도 목록 자체는 유지한다.
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
  }, [loadCompanyProfile, loadRecruitments]);

  useEffect(() => {
    if (items.length > 0) {
      void loadCompletion(items);
    }
  }, [items, loadCompletion]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRecruitments(q, statusFilter, { page: 1 });
  }

  // KPI는 list 응답에서 파생 가능한 값만 사용한다.
  const activeCount = items.filter((item) => ACTIVE_STATUSES.includes(item.status)).length;
  const totalApplicants = items.reduce((sum, item) => sum + item.applicantCount, 0);
  const closingItems = items.filter((item) => {
    const left = daysUntil(item.endsOn);
    return left !== null && left >= 0 && left <= 7 && item.status !== "CLOSED" && item.status !== "ARCHIVED";
  });
  const nearestDday = closingItems.length
    ? Math.min(...closingItems.map((item) => daysUntil(item.endsOn) as number))
    : null;
  const companyDisplayName = getCompanyDisplayName(companyProfile);

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
            <form className="toolbar" onSubmit={handleSearch}>
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
            <div className="posting-list">
              {items.map((item) => {
                const stat = completion[item.recruitmentId];
                const rate = stat?.rate ?? 0;
                const actions = getCompanyPostingActions(item);
                const manageHref = actions.includes("manage") ? `/company/recruitments/${item.recruitmentId}` : null;
                const left = daysUntil(item.endsOn);
                const urgent = left !== null && left >= 0 && left <= URGENT_DDAY;
                return (
                  <article
                    className={`posting${manageHref ? " is-clickable" : ""}`}
                    key={item.recruitmentId}
                    role={manageHref ? "link" : undefined}
                    tabIndex={manageHref ? 0 : undefined}
                    onClick={manageHref ? () => router.push(manageHref) : undefined}
                    onKeyDown={manageHref ? (event) => handleRowKey(event, () => router.push(manageHref)) : undefined}
                  >
                    <div className="posting-info">
                      <div className="posting-title-row">
                        <h3>{item.title}</h3>
                        <StatusBadge value={item.status} />
                      </div>
                      <p>
                        {item.jobRole} · {formatPeriod(item)} · <b className={`dday${urgent ? " dday-urgent" : ""}`}>{ddayLabel(item.endsOn)}</b>
                      </p>
                    </div>
                    <div className="posting-progress">
                      <div className="progress">
                        <i style={{ width: `${rate}%` }} />
                      </div>
                      <span>{stat ? `응시 완료 ${rate}% · ${stat.done}/${stat.total}명` : "응시 완료 집계 중…"}</span>
                    </div>
                    <div className="posting-actions">
                      {manageHref ? <span className="posting-chevron" aria-hidden="true">›</span> : null}
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

function formatPeriod(item: Recruitment) {
  if (!item.startsOn && !item.endsOn) {
    return "기간 미정";
  }
  return `${item.startsOn ?? "시작 미정"} ~ ${item.endsOn ?? "마감 미정"}`;
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
    return "마감 미정";
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
