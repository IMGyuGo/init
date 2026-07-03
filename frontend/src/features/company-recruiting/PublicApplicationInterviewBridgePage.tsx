"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPublicApplicationStatus,
  startPublicApplicationInterview,
  type PublicApplicationStatus,
} from "./public-application-api";
import {
  buildPublicInterviewBridgeResult,
  persistPublicInterviewAccessToken,
} from "./public-interview-bridge";
import { formatRecruitingStatusLabel } from "./status-labels";

type AsyncState<T> = {
  data?: T;
  loading: boolean;
  error?: string;
  phase?: string;
};

export function PublicApplicationInterviewBridgePage({
  applicationId,
  token,
}: {
  applicationId: number;
  token?: string;
}) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [state, setState] = useState<AsyncState<PublicApplicationStatus>>({
    loading: Boolean(token),
    phase: token ? "매직링크 권한을 확인하는 중입니다." : undefined,
  });

  const prepareInterview = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!token) {
      setState({ loading: false, error: "면접 진입은 이메일 매직링크로만 가능합니다." });
      return;
    }

    persistPublicInterviewAccessToken(null);
    setState({ loading: true, phase: "매직링크 권한을 확인하는 중입니다." });

    try {
      const result = await getPublicApplicationStatus(token);
      if (result.data.applicationId !== applicationId) {
        setState({ loading: false, error: "매직링크가 지원서 정보와 일치하지 않습니다." });
        return;
      }

      setState({ data: result.data, loading: true, phase: "면접 세션을 준비하는 중입니다." });
      const startResult = await startPublicApplicationInterview(applicationId, token);
      const bridgeResult = buildPublicInterviewBridgeResult(applicationId, startResult.data);
      persistPublicInterviewAccessToken(bridgeResult.publicAccessToken);
      router.replace(bridgeResult.runtimePath);
    } catch (error) {
      startedRef.current = false;
      setState({ loading: false, error: toErrorMessage(error) });
    }
  }, [applicationId, router, token]);

  useEffect(() => {
    void prepareInterview();
  }, [prepareInterview]);

  return (
    <main className="app-shell">
      <section className="app-page glass-page">
        <header className="page-head">
          <div>
            <p className="eyebrow">PUBLIC INTERVIEW</p>
            <h1>채용 AI 면접</h1>
            <p className="page-sub">비회원 지원자의 채용 면접 진입을 준비하는 화면입니다.</p>
          </div>
          <Link className="btn secondary" href="/">
            INIT 홈
          </Link>
        </header>

        {state.loading ? <p className="notice">{state.phase ?? "면접 진입을 준비하는 중입니다."}</p> : null}
        {state.error ? <p className="notice danger">{state.error}</p> : null}

        {state.data ? (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>{state.data.name}님의 면접 진입 준비</h2>
                <p>면접 환경을 확인한 뒤 자동으로 면접 화면으로 이동합니다.</p>
              </div>
            </div>
            <dl className="detail-list">
              <DetailItem label="지원 직무" value={state.data.jobRole} />
              <DetailItem label="면접 상태" value={formatRecruitingStatusLabel(state.data.interviewStatus)} />
              <DetailItem label="진입 상태" value={formatRecruitingStatusLabel(state.data.interviewEntry.integrationStatus)} />
            </dl>
            <div className="empty">
              면접 세션을 준비했습니다. 잠시 후 면접 화면으로 이동합니다.
            </div>
          </section>
        ) : null}
      </section>
    </main>
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

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
}
