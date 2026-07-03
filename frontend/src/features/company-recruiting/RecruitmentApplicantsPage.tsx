"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { getRecruitment, listRecruitmentApplicants } from "./api";
import { Breadcrumb, StatusBadge } from "./CompanyRecruitingChrome";
import { buildPaginationRange } from "./pagination";
import type { Applicant, PageMeta, Recruitment } from "./types";

const applicantPageSize = 20;

export function RecruitmentApplicantsPage({ recruitmentId }: { recruitmentId: number }) {
  const [recruitment, setRecruitment] = useState<Recruitment | null>(null);
  const [items, setItems] = useState<Applicant[]>([]);
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const paginationPages = buildPaginationRange({
    page: pageMeta?.page ?? page,
    totalPages: pageMeta?.totalPages ?? 0,
  });

  const load = useCallback(async (search: string, options: { clearMessage?: boolean; page?: number } = {}) => {
    const requestedPage = options.page ?? 1;
    setLoading(true);
    if (options.clearMessage !== false) {
      setMessage("");
    }

    try {
      const [detail, applicants] = await Promise.all([
        getRecruitment(recruitmentId),
        listRecruitmentApplicants(recruitmentId, {
          page: requestedPage,
          limit: applicantPageSize,
          q: search,
          sort: "updatedAt",
          order: "desc",
        }),
      ]);
      setRecruitment(detail.data);
      setItems(applicants.data.items);
      setPage(applicants.meta.page?.page ?? requestedPage);
      setPageMeta(applicants.meta.page ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지원자 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [recruitmentId]);

  useEffect(() => {
    void load("");
  }, [load]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(q, { page: 1 });
  }

  return (
    <section className="app-page glass-page">
      <div className="page-head">
        <div>
          <Breadcrumb
            items={[
              { label: "공고 목록", href: "/company/recruitments" },
              { label: recruitment?.title ?? "공고", href: `/company/recruitments/${recruitmentId}` },
              { label: "지원자 관리" },
            ]}
          />
          <h1>지원자 관리</h1>
          <p className="page-sub">공개 지원 링크로 제출된 지원자와 평가 상태를 확인합니다.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>지원자 목록</h2>
            <p>지원 상태, 면접 상태, 리포트 상태를 한 곳에서 확인합니다.</p>
          </div>
          <form className="toolbar list-filter-toolbar" onSubmit={handleSearch}>
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="이름, 이메일 검색" />
            <button className="btn secondary" type="submit" disabled={loading}>
              조회
            </button>
          </form>
        </div>

        {message ? <p className="notice">{message}</p> : null}
        {loading && items.length === 0 ? (
          <div className="empty">지원자를 불러오는 중입니다…</div>
        ) : items.length === 0 ? (
          <div className="empty">아직 공개 지원으로 제출된 지원자가 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>지원자</th>
                  <th>직무</th>
                  <th>지원 상태</th>
                  <th>면접</th>
                  <th>리포트</th>
                  <th>전형</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.applicationId}>
                    <td>
                      <strong>{item.name}</strong>
                      <span>{item.email}</span>
                    </td>
                    <td>{item.jobRole}</td>
                    <td>
                      <StatusBadge value={item.applicationStatus} />
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
                      <StatusBadge value={item.screeningDecision} />
                    </td>
                    <td>
                      <Link className="text-link" href={`/company/applicants/${item.applicationId}/evaluation`}>
                        평가 상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageMeta && pageMeta.totalItems > 0 ? (
          <div className="pagination" aria-label="지원자 목록 페이지네이션">
            <div className="pagination-summary">
              총 {pageMeta.totalItems}명 · {pageMeta.page}/{Math.max(pageMeta.totalPages, 1)}페이지
            </div>
            <div className="pagination-actions">
              <button className="btn secondary compact" type="button" disabled={loading || pageMeta.page <= 1} onClick={() => void load(q, { page: pageMeta.page - 1 })}>
                이전
              </button>
              {paginationPages.map((pageNumber) => (
                <button
                  className={`page-button ${pageNumber === pageMeta.page ? "active" : ""}`}
                  key={pageNumber}
                  type="button"
                  aria-current={pageNumber === pageMeta.page ? "page" : undefined}
                  disabled={loading}
                  onClick={() => void load(q, { page: pageNumber })}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                className="btn secondary compact"
                type="button"
                disabled={loading || !pageMeta.hasNext}
                onClick={() => void load(q, { page: pageMeta.page + 1 })}
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
