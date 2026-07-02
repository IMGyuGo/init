"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getPublicApplicationStatus, type PublicApplicationStatus } from "./public-application-api";
import { buildPublicApplicationInterviewHref } from "./routes";

type AsyncState<T> = {
  data?: T;
  loading: boolean;
  error?: string;
};

export function PublicApplicationStatusPage({ token, backHref = "/" }: { token?: string; backHref?: string }) {
  const [state, setState] = useState<AsyncState<PublicApplicationStatus>>({ loading: Boolean(token) });

  const loadStatus = useCallback(async () => {
    if (!token) {
      setState({ loading: false });
      return;
    }
    setState({ loading: true });
    try {
      const result = await getPublicApplicationStatus(token);
      setState({ data: result.data, loading: false });
    } catch (error) {
      setState({ loading: false, error: toErrorMessage(error) });
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return (
    <main className="app-shell">
      <section className="app-page glass-page">
        <header className="page-head">
          <div>
            <p className="eyebrow">APPLICATION STATUS</p>
            <h1>지원 현황 확인</h1>
            <p className="page-sub">이 화면은 이메일로 받은 매직링크를 통해 접근하는 지원자 전용 화면입니다.</p>
          </div>
          <Link className="btn secondary" href={backHref}>
            돌아가기
          </Link>
        </header>

        {state.loading ? <p className="notice">지원 현황을 확인하는 중입니다.</p> : null}
        {state.error ? <p className="notice danger">{state.error}</p> : null}

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{state.data ? `${state.data.name}님의 지원 현황` : "매직링크 확인"}</h2>
              <p>지원 현황은 이메일 소유 확인이 끝난 지원자에게만 공개됩니다.</p>
            </div>
          </div>
          {!token ? (
            <div className="empty">
              지원 현황은 이메일로 받은 매직링크에서만 확인할 수 있습니다. 지원서를 제출한 뒤 받은 메일의 링크로 다시
              접속해주세요.
            </div>
          ) : null}
          {state.data ? (
            <>
              <div className="public-status-grid" aria-label="지원 진행 상태">
                <StatusCard label="지원 상태" value={state.data.applicationStatus} />
                <StatusCard label="서류 상태" value={state.data.documentStatus} />
                <StatusCard label="면접 상태" value={state.data.interviewStatus} />
                <StatusCard label="리포트 상태" value={state.data.reportStatus} />
              </div>
              <dl className="detail-list public-status-meta">
                <DetailItem label="지원자" value={state.data.name} />
                <DetailItem label="이메일" value={state.data.email} />
                <DetailItem label="직무" value={state.data.jobRole} />
                <DetailItem label="최종 갱신" value={formatDateTime(state.data.updatedAt)} />
              </dl>
              <div className="form-actions">
                {token && state.data.interviewEntry.enabled ? (
                  <Link
                    className="btn primary"
                    href={buildPublicApplicationInterviewHref(state.data.applicationId, token)}
                  >
                    {state.data.interviewEntry.label}
                  </Link>
                ) : (
                  <button className="btn secondary" disabled type="button">
                    {state.data.interviewEntry.label}
                  </button>
                )}
              </div>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value?: string | null }) {
  const status = formatStatus(value);
  return (
    <article className={`public-status-card ${status.tone}`}>
      <span>{label}</span>
      <strong>{status.label}</strong>
    </article>
  );
}

function DetailItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(value?: string | null) {
  const key = value ?? "";
  const label =
    STATUS_LABELS[key] ??
    key
      .toLowerCase()
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") ??
    "-";
  return { label: label || "-", tone: getStatusTone(key) };
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "지원 완료",
  DRAFT: "작성 중",
  INVITED: "초대 완료",
  WITHDRAWN: "지원 철회",
  NOT_SUBMITTED: "미제출",
  SCREENING: "검토 중",
  PASSED: "통과",
  REJECTED: "반려",
  NOT_READY: "준비 전",
  READY: "준비 완료",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  FAILED: "실패",
  PENDING: "대기 중",
  GENERATING: "생성 중",
  NONE_OR_GENERATING: "없음/생성 중",
  GENERATED: "생성 완료",
  PASS: "합격",
  HOLD: "보류",
  FAIL: "불합격",
  UNDECIDED: "미정",
};

function getStatusTone(value: string) {
  if (["SUBMITTED", "READY", "COMPLETED", "GENERATED", "PASSED", "PASS"].includes(value)) {
    return "success";
  }
  if (["IN_PROGRESS", "SCREENING", "GENERATING", "PENDING", "HOLD", "NONE_OR_GENERATING"].includes(value)) {
    return "warning";
  }
  if (["FAILED", "REJECTED", "FAIL", "WITHDRAWN"].includes(value)) {
    return "danger";
  }
  return "neutral";
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
}
