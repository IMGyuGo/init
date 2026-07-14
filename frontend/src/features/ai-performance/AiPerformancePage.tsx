"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AiWorkCategory,
  AiPerformanceJob,
  AiPerformanceSummary,
  ClientPerformanceEvent,
  getAiPerformanceSummary,
  listAiPerformanceJobs,
  listClientPerformanceEvents
} from "./api";
import type { ClientNextStepType } from "./client-next-step";
import styles from "./AiPerformancePage.module.css";

const PROCESS_TYPE_LABELS: Readonly<Record<string, string>> = {
  DOCUMENT_EXTRACT: "문서 내용 읽기",
  STT: "음성 답변을 글로 변환",
  FOLLOW_UP: "꼬리질문 만들기",
  REPORT_GENERATE: "면접 결과 리포트 만들기",
  EMBEDDING: "AI 검색용 데이터 준비",
  GUARDRAIL_VALIDATE: "AI 결과 검사",
  CRITERIA_SUGGEST: "평가 항목 추천하기",
  QUESTION_GENERATE: "면접 질문 만들기",
  QUESTION_SET_GENERATE: "면접 질문 세트 만들기",
  POSTING_DRAFT_GENERATE: "채용공고 초안 만들기"
};

const CLIENT_EVENT_LABELS: Readonly<Record<string, string>> = {
  ANSWER_SUBMIT_TO_NEXT_READY: "답변 완료 후 다음 질문 표시"
};

const AI_WORK_CATEGORY_LABELS: Readonly<Record<AiWorkCategory, string>> = {
  VOICE_TRANSCRIPTION: "음성 답변 변환",
  FOLLOW_UP_GENERATION: "꼬리질문 생성",
  REPORT_GENERATION: "보고서 생성",
  QUESTION_PREPARATION: "사전 질문 준비",
  CRITERIA_PREPARATION: "평가 기준 준비",
  OTHER: "기타"
};

const CLIENT_NEXT_STEP_LABELS: Readonly<Record<ClientNextStepType, string>> = {
  STANDARD_QUESTION: "일반 질문",
  FOLLOW_UP_QUESTION: "꼬리질문",
  INTERVIEW_COMPLETE: "면접 완료",
  NOT_READY: "다음 단계 준비 실패",
  UNKNOWN: "분류 불가"
};

type PageState = {
  summary?: AiPerformanceSummary;
  jobs: AiPerformanceJob[];
  clientEvents: ClientPerformanceEvent[];
  loading: boolean;
  error?: string;
};

export function AiPerformancePage() {
  const [state, setState] = useState<PageState>({ jobs: [], clientEvents: [], loading: true });
  const [jobCategoryFilter, setJobCategoryFilter] = useState<AiWorkCategory | "ALL">("ALL");
  const [clientNextStepFilter, setClientNextStepFilter] = useState<ClientNextStepType | "ALL">("ALL");

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

  const filteredJobs = state.jobs.filter(
    (job) => jobCategoryFilter === "ALL" || job.workCategory === jobCategoryFilter
  );
  const filteredClientEvents = state.clientEvents.filter(
    (event) => clientNextStepFilter === "ALL" || event.nextQuestionType === clientNextStepFilter
  );

  return (
    <section className="app-page glass-page notion list-page">
      <header className="page-head">
        <div>
          <p className="page-eyebrow">Internal Monitoring</p>
          <h1>AI 지표</h1>
          <p className="page-sub">AI 작업 시간, 사용자 체감 시간, 토큰/오디오 사용량과 추정 비용을 확인합니다.</p>
        </div>
        <div className="page-actions">
          <Link className="btn secondary" href="/">
            홈으로
          </Link>
        </div>
      </header>

      {state.loading ? <p className="empty">AI 지표 정보를 불러오는 중입니다.</p> : null}
      {state.error ? <p className="notice danger">{state.error}</p> : null}

      {state.summary ? (
        <>
          <div className={`kpi-summary ${styles.kpiSummary}`}>
            <Metric label="전체 작업 건수" value={`${state.summary.jobs.count.toLocaleString()}건`} />
            <Metric label="전체 추정 비용" value={`$${state.summary.cost.estimatedCostUsd.toFixed(6)}`} />
            <Metric
              label="전체 토큰 사용량"
              value={`${(state.summary.cost.inputTokens + state.summary.cost.outputTokens).toLocaleString()} tok`}
            />
            <Metric label="전체 오디오 처리량" value={`${state.summary.cost.audioSeconds.toLocaleString()}초`} />
          </div>
          <p className="page-sub">상단 전체량과 아래 요약은 최근 최대 {state.summary.sampleLimit}건 기준입니다.</p>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>AI 작업 성격별 요약</h2>
                <p>최근 최대 {state.summary.sampleLimit}건을 작업 목적에 따라 나누어 비교합니다.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>작업 성격</th>
                    <th>건수</th>
                    <th>평균</th>
                    <th>p95</th>
                    <th>실패율</th>
                    <th>추정 비용</th>
                  </tr>
                </thead>
                <tbody>
                  {state.summary.byWorkCategory.length ? (
                    state.summary.byWorkCategory.map((item) => (
                      <tr key={item.workCategory}>
                        <td>
                          <strong>{formatWorkCategory(item.workCategory)}</strong>
                        </td>
                        <td>{item.count}</td>
                        <td>{formatMs(item.averageDurationMs)}</td>
                        <td>{formatMs(item.p95DurationMs)}</td>
                        <td>{formatRate(item.failureRate)}</td>
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

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>사용자 체감 시간 요약</h2>
                <p>최근 최대 {state.summary.sampleLimit}건에서 실제로 준비된 다음 단계별 시간을 비교합니다.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>다음 단계</th>
                    <th>건수</th>
                    <th>평균</th>
                    <th>p95</th>
                    <th>4초 초과율</th>
                    <th>실패율</th>
                  </tr>
                </thead>
                <tbody>
                  {state.summary.byClientNextStep.map((item) => (
                    <tr key={item.nextQuestionType}>
                      <td>
                        <strong>{formatClientNextStep(item.nextQuestionType)}</strong>
                      </td>
                      <td>{item.count}</td>
                      <td>{formatMs(item.averageDurationMs)}</td>
                      <td>{formatMs(item.p95DurationMs)}</td>
                      <td>{formatRate(item.over4sRate)}</td>
                      <td>{formatRate(item.failureRate)}</td>
                    </tr>
                  ))}
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
            <p>worker가 처리한 최근 30건의 상태, 처리 시간, 사용량입니다.</p>
          </div>
          <div className="toolbar">
            <select
              className="input"
              aria-label="최근 AI 작업 성격 필터"
              value={jobCategoryFilter}
              onChange={(event) => setJobCategoryFilter(event.target.value as AiWorkCategory | "ALL")}
            >
              <option value="ALL">전체 작업</option>
              {Object.entries(AI_WORK_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
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
              {filteredJobs.length ? (
                filteredJobs.map((job) => (
                  <tr key={job.processLogId}>
                    <td>{job.processLogId}</td>
                    <td>{formatProcessType(job.processType)}</td>
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
                <EmptyRow colSpan={7} message="선택한 성격의 최근 AI 작업이 없습니다." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>최근 사용자 체감 시간</h2>
            <p>브라우저에서 측정한 최근 30건의 답변 제출 후 다음 단계 준비 완료 시간입니다.</p>
          </div>
          <div className="toolbar">
            <select
              className="input"
              aria-label="최근 사용자 체감 시간 다음 단계 필터"
              value={clientNextStepFilter}
              onChange={(event) => setClientNextStepFilter(event.target.value as ClientNextStepType | "ALL")}
            >
              <option value="ALL">전체</option>
              <option value="STANDARD_QUESTION">일반 질문</option>
              <option value="FOLLOW_UP_QUESTION">꼬리질문</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>이벤트</th>
                <th>다음 질문 종류</th>
                <th>세션</th>
                <th>질문</th>
                <th>시간</th>
                <th>기록 시각</th>
              </tr>
            </thead>
            <tbody>
              {filteredClientEvents.length ? (
                filteredClientEvents.map((event) => (
                  <tr key={event.clientPerformanceLogId}>
                    <td>{formatClientEvent(event.eventName)}</td>
                    <td>{formatClientNextStep(event.nextQuestionType)}</td>
                    <td>{event.sessionId ?? "-"}</td>
                    <td>{event.questionId ?? "-"}</td>
                    <td>{formatMs(event.durationMs)}</td>
                    <td>{formatDateTime(event.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={6} message="선택한 종류의 최근 사용자 체감 시간 기록이 없습니다." />
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

function formatProcessType(processType: string): string {
  return PROCESS_TYPE_LABELS[processType] ?? processType;
}

function formatWorkCategory(workCategory: AiWorkCategory): string {
  return AI_WORK_CATEGORY_LABELS[workCategory];
}

function formatClientEvent(eventName: string): string {
  return CLIENT_EVENT_LABELS[eventName] ?? eventName;
}

function formatClientNextStep(nextQuestionType: ClientNextStepType): string {
  return CLIENT_NEXT_STEP_LABELS[nextQuestionType];
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
