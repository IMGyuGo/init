"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getPublicApplicationStatus, type PublicApplicationStatus } from "./public-application-api";
import { buildPublicApplicationInterviewHref } from "./routes";
import { formatRecruitingStatusLabel, getRecruitingStatusTone } from "./status-labels";

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

  const data = state.data;
  const interviewEnabled = Boolean(token && data?.interviewEntry.enabled);

  return (
    <main className="candidate-public-page notion">
      <section className="pubstatus">
        <header className="pubstatus-banner">
          <div className="pubstatus-banner-copy">
            <h1>{data ? `${data.name}님의 지원 현황` : "지원 현황"}</h1>
            <p>지원서 접수 후 이메일로 받은 링크에서 진행 상태를 확인할 수 있어요.</p>
          </div>
          <Image
            className="pubstatus-banner-art"
            src="/pubstatus-banner.png"
            alt=""
            width={160}
            height={160}
            aria-hidden="true"
            priority
          />
        </header>

        {state.loading ? <p className="pubstatus-notice">지원 현황을 불러오는 중이에요.</p> : null}
        {state.error ? <p className="pubstatus-notice is-danger">{state.error}</p> : null}

        {!token && !state.loading ? (
          <div className="pubstatus-empty">
            지원 현황은 접수 완료 메일에 담긴 링크에서만 확인할 수 있어요.
            <br />
            지원서를 제출한 뒤 받은 이메일의 링크로 다시 접속해주세요.
          </div>
        ) : null}

        {data ? (
          <div className="pubstatus-body">
            <div className="pubstatus-cards" aria-label="지원 진행 상태">
              <StatusCard label="지원 상태" value={data.applicationStatus} />
              <StatusCard label="서류 상태" value={data.documentStatus} />
              <StatusCard label="면접 상태" value={data.interviewStatus} />
              <StatusCard label="리포트 상태" value={data.reportStatus} />
            </div>

            <dl className="pubstatus-rows">
              <StatusRow label="지원자" value={data.name} />
              <StatusRow label="이메일" value={data.email} />
              <StatusRow label="직무" value={data.jobRole} />
              <StatusRow label="최종 갱신" value={formatDateTime(data.updatedAt)} />
            </dl>

            <div className="pubstatus-actions">
              <Link className="pubstatus-back" href={backHref}>
                ← 돌아가기
              </Link>
              <div className="pubstatus-actions-right">
                {!interviewEnabled ? (
                  <p className="pubstatus-hint">면접 세션이 준비되면 이 화면에서 바로 시작할 수 있어요.</p>
                ) : null}
                {interviewEnabled ? (
                  <Link
                    className="btn primary pubstatus-cta"
                    href={buildPublicApplicationInterviewHref(data.applicationId, token as string)}
                  >
                    {data.interviewEntry.label}
                  </Link>
                ) : (
                  <button className="btn secondary pubstatus-cta" disabled type="button">
                    {data.interviewEntry.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value?: string | null }) {
  return (
    <article className={`pubstatus-card ${getRecruitingStatusTone(value)}`}>
      <span>{label}</span>
      <strong>{formatRecruitingStatusLabel(value)}</strong>
    </article>
  );
}

function StatusRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="pubstatus-row">
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했어요.";
}
