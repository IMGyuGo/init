"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AiPerformanceJob,
  AiPerformanceSummary,
  ClientPerformanceEvent,
  getAiPerformanceSummary,
  listAiPerformanceJobs,
  listClientPerformanceEvents
} from "./api";

type PageState = {
  summary?: AiPerformanceSummary;
  jobs: AiPerformanceJob[];
  clientEvents: ClientPerformanceEvent[];
  loading: boolean;
  error?: string;
};

export function AiPerformancePage() {
  const [state, setState] = useState<PageState>({ jobs: [], clientEvents: [], loading: true });

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [summary, jobs, clientEvents] = await Promise.all([
          getAiPerformanceSummary(),
          listAiPerformanceJobs(),
          listClientPerformanceEvents()
        ]);

        if (!alive) return;
        setState({ summary, jobs, clientEvents, loading: false });
      } catch (error) {
        if (!alive) return;
        setState({
          jobs: [],
          clientEvents: [],
          loading: false,
          error: error instanceof Error ? error.message : "AI 지표 정보를 불러오지 못했습니다."
        });
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="app-page glass-page notion list-page">
      <header className="page-head">
        <div>
          <p className="page-eyebrow">Internal Monitoring</p>
          <h1>AI 지표</h1>
          <p className="page-sub">AI 작업 시간, 사용자 체감 시간, 토큰/오디오 사용량과 추정 비용을 확인합니다.</p>
        </div>
        <div className="page-actions">
          <Link className="btn secondary" href="/candidate/jobs">
            홈으로
          </Link>
        </div>
      </header>

      {state.loading ? <p className="empty">AI 지표 정보를 불러오는 중입니다.</p> : null}
      {state.error ? <p className="notice danger">{state.error}</p> : null}

      {state.summary ? (
        <>
          <div className="kpi-summary">
            <Metric label="AI 평균" value={formatMs(state.summary.jobs.averageDurationMs)} />
            <Metric label="AI p95" value={formatMs(state.summary.jobs.p95DurationMs)} />
            <Metric label="4초 초과율" value={formatRate(state.summary.jobs.over4sRate)} />
            <Metric label="실패율" value={formatRate(state.summary.jobs.failureRate)} />
            <Metric label="추정 비용" value={`$${state.summary.cost.estimatedCostUsd.toFixed(6)}`} />
            <Metric
              label="토큰/오디오"
              value={`${state.summary.cost.inputTokens + state.summary.cost.outputTokens} tok · ${state.summary.cost.audioSeconds}s`}
            />
          </div>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>작업 타입별 요약</h2>
                <p>STT, 꼬리질문, 보고서 생성 등 작업 단위로 성능을 비교합니다.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>작업</th>
                    <th>건수</th>
                    <th>평균</th>
                    <th>p95</th>
                    <th>4초 초과</th>
                    <th>추정 비용</th>
                  </tr>
                </thead>
                <tbody>
                  {state.summary.byProcessType.length ? (
                    state.summary.byProcessType.map((item) => (
                      <tr key={item.processType}>
                        <td>
                          <strong>{item.processType}</strong>
                        </td>
                        <td>{item.count}</td>
                        <td>{formatMs(item.averageDurationMs)}</td>
                        <td>{formatMs(item.p95DurationMs)}</td>
                        <td>{formatRate(item.over4sRate)}</td>
                        <td>${item.estimatedCostUsd.toFixed(6)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={6} message="아직 집계할 AI 작업이 없습니다." />
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>최근 AI 작업</h2>
            <p>worker가 처리한 AI 작업의 상태, 처리 시간, 사용량입니다.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>작업</th>
                <th>상태</th>
                <th>시간</th>
                <th>모델</th>
                <th>사용량</th>
                <th>비용</th>
              </tr>
            </thead>
            <tbody>
              {state.jobs.length ? (
                state.jobs.map((job) => (
                  <tr key={job.processLogId}>
                    <td>{job.processLogId}</td>
                    <td>{job.processType}</td>
                    <td>
                      <span className={`badge ${job.status === "FAILED" ? "danger" : job.status === "COMPLETED" ? "success" : "warning"}`}>
                        {job.status}
                      </span>
                    </td>
                    <td>{formatMs(job.durationMs)}</td>
                    <td>{job.modelName ?? "-"}</td>
                    <td>{formatUsage(job)}</td>
                    <td>{job.estimatedCostUsd === undefined ? "가격 미설정" : `$${job.estimatedCostUsd.toFixed(6)}`}</td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={7} message="최근 AI 작업이 없습니다." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>최근 사용자 체감 시간</h2>
            <p>브라우저에서 측정한 답변 완료 후 다음 질문 표시까지의 시간입니다.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>이벤트</th>
                <th>세션</th>
                <th>질문</th>
                <th>시간</th>
                <th>기록 시각</th>
              </tr>
            </thead>
            <tbody>
              {state.clientEvents.length ? (
                state.clientEvents.map((event) => (
                  <tr key={event.clientPerformanceLogId}>
                    <td>{event.eventName}</td>
                    <td>{event.sessionId ?? "-"}</td>
                    <td>{event.questionId ?? "-"}</td>
                    <td>{formatMs(event.durationMs)}</td>
                    <td>{formatDateTime(event.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={5} message="최근 사용자 체감 시간 기록이 없습니다." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>{message}</td>
    </tr>
  );
}

function formatMs(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
}

function formatRate(value: number | undefined): string {
  return value === undefined ? "-" : `${Math.round(value * 100)}%`;
}

function formatUsage(job: AiPerformanceJob): string {
  const tokens = (job.inputTokens ?? 0) + (job.outputTokens ?? 0);
  const parts = [];

  if (tokens > 0) parts.push(`${tokens} tok`);
  if (job.audioSeconds) parts.push(`${job.audioSeconds}s audio`);

  return parts.length ? parts.join(" · ") : "-";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}
