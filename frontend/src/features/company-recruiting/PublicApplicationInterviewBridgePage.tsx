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
    phase: token ? "이메일 링크를 확인하는 중입니다." : undefined,
  });

  const prepareInterview = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!token) {
      setState({ loading: false, error: "면접 진입은 지원서 접수 후 이메일로 받은 링크에서만 가능합니다." });
      return;
    }

    persistPublicInterviewAccessToken(null);
    setState({ loading: true, phase: "이메일 링크를 확인하는 중입니다." });

    try {
      const result = await getPublicApplicationStatus(token);
      if (result.data.applicationId !== applicationId) {
        setState({ loading: false, error: "이메일 링크가 지원서 정보와 일치하지 않습니다." });
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
    <main className="candidate-public-page notion">
      <section className="pubbridge">
        {state.error ? (
          <div className="pubbridge-error">
            <h1>면접에 진입할 수 없어요</h1>
            <p>{state.error}</p>
            <Link className="btn secondary pubbridge-home" href="/">
              홈으로
            </Link>
          </div>
        ) : (
          <div className="pubbridge-loading">
            <span className="pubbridge-spinner" aria-hidden="true" />
            <h1>{state.data ? `${state.data.name}님, 면접을 준비하고 있어요` : "면접을 준비하고 있어요"}</h1>
            <p>{state.phase ?? "면접 진입을 준비하는 중이에요."}</p>
            {state.data ? (
              <dl className="pubbridge-meta">
                <div><dt>지원 직무</dt><dd>{state.data.jobRole || "-"}</dd></div>
                <div><dt>면접 상태</dt><dd>{formatRecruitingStatusLabel(state.data.interviewStatus)}</dd></div>
              </dl>
            ) : null}
            <p className="pubbridge-note">준비가 끝나면 장치 점검 화면으로 자동 이동해요.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했어요.";
}
