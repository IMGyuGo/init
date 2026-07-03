"use client";

import type { FormEvent } from "react";
import type {
  CandidateFileAsset,
  CandidateJobDetail,
  CandidateJobListPostingStatus,
  CandidateJobQuery,
  CandidateJobSummary,
  ConsentType,
} from "./api";
import { candidateApplicationInterviewRoutes } from "./routes";
import {
  type CandidateApplicationFormState,
  getCandidateJobDetailActionHref,
  hasPortfolioArtifact,
  hasRequiredConsents,
  toSubmitApplicationRequest,
} from "./view-model";
import { JobDescriptionViewer } from "../company-recruiting/JobDescriptionViewer";

export interface CandidateJobsViewProps {
  jobs: CandidateJobSummary[];
  query: CandidateJobQuery;
  totalItems: number;
  onQueryChange: (query: CandidateJobQuery) => void;
}

export function CandidateJobsView({ jobs, query, totalItems, onQueryChange }: CandidateJobsViewProps) {
  return (
    <section aria-label="채용공고 목록" className="panel candidate-jobs-panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>채용 공고</h2>
          <span className="count-pill">{totalItems}</span>
        </div>
        <form
          className="toolbar candidate-jobs-filter"
          onSubmit={(event) => {
            event.preventDefault();
            onQueryChange({ ...query, page: 1 });
          }}
        >
          <label className="candidate-jobs-search">
            <span className="sr-only">검색어</span>
            <input
              name="q"
              placeholder="회사·직무 검색"
              value={query.q ?? ""}
              onChange={(event) => onQueryChange({ ...query, q: event.currentTarget.value, page: 1 })}
            />
          </label>
          <label>
            <span className="sr-only">직무</span>
            <select
              name="jobRole"
              value={query.jobRole ?? ""}
              onChange={(event) => onQueryChange({ ...query, jobRole: event.currentTarget.value, page: 1 })}
            >
              <option value="">전체 직무</option>
              <option value="Backend">백엔드</option>
              <option value="Android">안드로이드</option>
              <option value="Frontend">프론트엔드</option>
              <option value="AI Engineer">AI 엔지니어</option>
            </select>
          </label>
          <label>
            <span className="sr-only">지역</span>
            <select
              name="location"
              value={query.location ?? ""}
              onChange={(event) => onQueryChange({ ...query, location: event.currentTarget.value, page: 1 })}
            >
              <option value="">전체 지역</option>
              <option value="Seoul">서울</option>
              <option value="Pangyo">판교</option>
              <option value="Remote">원격</option>
            </select>
          </label>
          <label>
            <span className="sr-only">채용 상태</span>
            <select
              name="postingStatus"
              value={query.postingStatus ?? ""}
              onChange={(event) =>
                onQueryChange({
                  ...query,
                  postingStatus: toOptionalPostingStatus(event.currentTarget.value),
                  page: 1,
                })
              }
            >
              <option value="">전체 상태</option>
              <option value="OPEN">모집중</option>
              <option value="CLOSING_SOON">마감임박</option>
            </select>
          </label>
          <button className="btn secondary" type="submit">조회</button>
        </form>
      </div>

      {jobs.length ? (
        <div className="posting-list candidate-job-list" role="list">
          {jobs.map((job, index) => (
            <article className="posting candidate-job-row" key={job.jobId} role="listitem">
              <CompanyLogoMark companyLogoUrl={job.companyLogoUrl} fallbackLabel={companyLogoLabel(index)} />
              <div className="posting-info">
                <div className="posting-title-row">
                  <h3>{job.title}</h3>
                  <StatusBadge status={job.postingStatus} />
                </div>
                <p>{job.companyName} · {displayLocation(job.location)}</p>
              </div>
              <span className={`candidate-job-available${job.alreadyApplied ? " is-applied" : ""}`}>
                {job.alreadyApplied ? "지원 완료" : "지원 가능"}
              </span>
              <div className="posting-actions">
                <a className="btn secondary compact" href={candidateApplicationInterviewRoutes.jobDetail(job.jobId)}>
                  상세 보기
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">조건에 맞는 채용공고가 없습니다.</p>
      )}
      <span className="sr-only">지원 가능한 공고 {totalItems}건</span>
    </section>
  );
}

export interface CandidateJobDetailViewProps {
  job: CandidateJobDetail;
}

export function CandidateJobDetailView({ job }: CandidateJobDetailViewProps) {
  const actionHref = getCandidateJobDetailActionHref(job);

  return (
    <section aria-labelledby="candidate-job-detail-heading" className="candidate-job-detail-page glass-page">
      <div className="page-head">
        <div className="candidate-job-detail-title">
          <CompanyLogoMark companyLogoUrl={job.companyLogoUrl} fallbackLabel={companyLogoLabelFromName(job.companyName)} />
          <div>
            <h1 id="candidate-job-detail-heading">{job.companyName}</h1>
            <p>{job.title} · <StatusBadge status={job.postingStatus} /></p>
          </div>
        </div>
        <div className="page-actions">
          <a className="btn secondary" href={candidateApplicationInterviewRoutes.jobs}>목록</a>
          <a aria-disabled={!actionHref} className="btn primary" href={actionHref || "#"} tabIndex={actionHref ? undefined : -1}>
            {job.alreadyApplied ? "지원 완료" : "지원하기"}
          </a>
        </div>
      </div>

      <div className="candidate-job-detail-grid">
        <section className="panel candidate-job-detail-card">
          <div className="panel-head">
            <div className="panel-title">
              <h2>회사 정보</h2>
            </div>
          </div>
          <div className="candidate-job-detail-box">{job.companyProfile || "산업군, 규모, 주요 서비스 등"}</div>
        </section>
        <section className="panel candidate-job-detail-card">
          <div className="panel-head">
            <div className="panel-title">
              <h2>채용 공고</h2>
            </div>
          </div>
          <div className="candidate-job-detail-box">
            <JobDescriptionViewer value={job.jobDescription} emptyMessage="등록된 JD가 없습니다." />
            <ul className="candidate-feature__tags">
              {job.techStacks.map((techStack) => (
                <li key={techStack}>{techStack}</li>
              ))}
            </ul>
          </div>
        </section>
        <section className="panel candidate-job-detail-meta">
          <div>
            <CompanyLogoMark companyLogoUrl={job.companyLogoUrl} fallbackLabel={companyLogoLabelFromName(job.companyName)} />
            <div>
              <strong>{job.title}</strong>
              <span>{job.companyName}</span>
            </div>
          </div>
          <p>채용 기간 · {formatDateForDisplay(job.startsOn)} ~ {formatDateForDisplay(job.endsOn)}</p>
        </section>
      </div>
    </section>
  );
}

export interface CandidateApplicationViewProps {
  job: CandidateJobDetail;
  state: CandidateApplicationFormState;
  latestResumeFile?: CandidateFileAsset;
  busy?: boolean;
  onResumeFileSelect?: (file: File) => void | Promise<void>;
  onStateChange: (state: CandidateApplicationFormState) => void;
  onSubmit: (request: ReturnType<typeof toSubmitApplicationRequest>) => void | Promise<void>;
}

export function CandidateApplicationView({
  job,
  state,
  latestResumeFile,
  busy = false,
  onResumeFileSelect,
  onStateChange,
  onSubmit,
}: CandidateApplicationViewProps) {
  const basicComplete = Boolean(state.candidateName.trim() && state.email.trim() && state.phone.trim());
  const resumeComplete = Boolean(state.resumeFileId);
  const portfolioComplete = hasPortfolioArtifact(state);
  const consentCount = applicationConsentOptions.filter((consentType) => state.consentTypes.includes(consentType)).length;
  const canSubmit =
    resumeComplete &&
    portfolioComplete &&
    hasRequiredConsents(state.consentTypes) &&
    job.canApply &&
    !job.alreadyApplied &&
    !busy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(toSubmitApplicationRequest(state));
  }

  return (
    <form aria-label="지원서 제출" className="candidate-apply-page" onSubmit={handleSubmit}>
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
        <section aria-labelledby="candidate-basic-info-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-basic-info-heading">기본 정보</p>
          <label>
            이름 *
            <input
              placeholder="김지원"
              required
              value={state.candidateName}
              onChange={(event) => onStateChange({ ...state, candidateName: event.currentTarget.value })}
            />
          </label>
          <label>
            이메일 *
            <input
              placeholder="jiwon@example.com"
              required
              type="email"
              value={state.email}
              onChange={(event) => onStateChange({ ...state, email: event.currentTarget.value })}
            />
          </label>
          <label>
            연락처 *
            <input
              placeholder="010-0000-0000"
              required
              value={state.phone}
              onChange={(event) => onStateChange({ ...state, phone: event.currentTarget.value })}
            />
          </label>
          <label>
            깃허브 / 블로그
            <input
              placeholder="github.com/jiwon"
              type="url"
              value={state.portfolioUrl ?? ""}
              onChange={(event) => onStateChange({ ...state, portfolioUrl: event.currentTarget.value })}
            />
          </label>
        </section>

        <section aria-labelledby="candidate-document-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-document-heading">서류 업로드</p>
          <label className="candidate-apply-file-label">
            이력서 *
            <span className="candidate-apply-file-row">
              <input
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
              <span>{latestResumeFile?.originalName ?? "이력서 파일을 선택하세요"}</span>
              <strong>{latestResumeFile ? "업로드 완료" : "파일 선택"}</strong>
            </span>
          </label>
          <label>
            포트폴리오
            <input
              placeholder="포트폴리오 파일 또는 주소"
              type="url"
              value={state.portfolioUrl ?? ""}
              onChange={(event) => onStateChange({ ...state, portfolioUrl: event.currentTarget.value })}
            />
          </label>
          <p className="candidate-apply-note">PDF, DOCX · 20MB 이하</p>
        </section>

        <section aria-labelledby="candidate-cover-letter-heading" className="candidate-apply-card">
          <p className="panel-title" id="candidate-cover-letter-heading">지원 동기 / 추가 설명</p>
          <textarea
            placeholder="지원 직무 관련 프로젝트 경험, 본인이 맡은 역할, AI 면접에서 강조하고 싶은 내용을 입력하세요."
            value={state.coverLetter ?? ""}
            onChange={(event) => onStateChange({ ...state, coverLetter: event.currentTarget.value })}
          />
        </section>

        <section className="candidate-apply-card">
          <p className="panel-title">제출 상태 점검</p>
          <div className="candidate-apply-check-table" role="table" aria-label="지원서 제출 상태 점검">
            <StatusCheck label="필수 정보" ready={basicComplete} readyText="완료" pendingText="입력 필요" />
            <StatusCheck label="이력서" ready={resumeComplete} readyText="업로드 완료" pendingText="필수" />
            <StatusCheck label="포트폴리오" ready={portfolioComplete} readyText="입력 완료" pendingText="선택 입력" />
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

function StatusBadge({ status }: { status: CandidateJobSummary["postingStatus"] }) {
  return <span className="candidate-detail-status" data-status={status}>{statusLabel[status]}</span>;
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

function toOptionalPostingStatus(value: string): CandidateJobListPostingStatus | undefined {
  return value === "OPEN" || value === "CLOSING_SOON" ? value : undefined;
}

function companyLogoLabel(index: number): string {
  return `${String.fromCharCode(65 + (index % 26))}사`;
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

const statusLabel: Record<CandidateJobSummary["postingStatus"], string> = {
  DRAFT: "비공개",
  OPEN: "채용중",
  CLOSING_SOON: "마감 임박",
  CLOSED: "마감",
  ARCHIVED: "보관",
};

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
