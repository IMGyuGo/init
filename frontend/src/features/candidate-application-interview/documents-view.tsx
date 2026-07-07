"use client";

import type { FormEvent } from "react";
import type { CandidateFileAsset, CandidatePortfolioLink } from "./api";
import {
  type CandidatePortfolioLinkFormState,
  type CandidateResumeUploadState,
  createResumeUploadStateFromFile,
  inferPortfolioLinkType,
  isAllowedCandidateDocumentMimeType,
  maxCandidateDocumentSizeBytes,
  toCreatePortfolioLinkRequest,
} from "./view-model";

export interface CandidateDocumentAssetsViewProps {
  candidateId: number;
  resumeState: CandidateResumeUploadState;
  portfolioState: CandidatePortfolioLinkFormState;
  latestResumeFile?: CandidateFileAsset;
  portfolioLinks?: CandidatePortfolioLink[];
  onResumeStateChange: (state: CandidateResumeUploadState) => void;
  onPortfolioStateChange: (state: CandidatePortfolioLinkFormState) => void;
  onResumeSubmit: (file: File) => void | Promise<void>;
  onPortfolioSubmit: (request: ReturnType<typeof toCreatePortfolioLinkRequest>) => void | Promise<void>;
}

export function CandidateDocumentAssetsView({
  candidateId,
  resumeState,
  portfolioState,
  latestResumeFile,
  portfolioLinks = [],
  onResumeStateChange,
  onPortfolioStateChange,
  onResumeSubmit,
  onPortfolioSubmit,
}: CandidateDocumentAssetsViewProps) {
  const canSubmitResume =
    resumeState.storageKey.length > 0 &&
    resumeState.originalName.length > 0 &&
    isAllowedCandidateDocumentMimeType(resumeState.mimeType) &&
    resumeState.sizeBytes > 0 &&
    resumeState.sizeBytes <= maxCandidateDocumentSizeBytes;
  const canSubmitPortfolio = portfolioState.url.trim().length > 0;

  async function handleResumeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeState.file) return;
    await onResumeSubmit(resumeState.file);
  }

  async function handlePortfolioSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onPortfolioSubmit(toCreatePortfolioLinkRequest(portfolioState));
  }

  return (
    <section aria-labelledby="candidate-documents-heading" className="candidate-feature__stack">
      <div className="candidate-cards-2">
        <form aria-labelledby="candidate-resume-heading" className="panel" onSubmit={handleResumeSubmit}>
          <p className="panel-title" id="candidate-resume-heading">이력서 업로드</p>
          <label>
            이력서 파일
            <input
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  onResumeStateChange(createResumeUploadStateFromFile(candidateId, file));
                }
              }}
            />
          </label>
          <p className="note">PDF, DOCX · 20MB 이하</p>
          <dl className="candidate-feature__summary compact">
            <div>
              <dt>선택 파일</dt>
              <dd>{resumeState.originalName || "선택 전"}</dd>
            </div>
            <div>
              <dt>업로드 상태</dt>
              <dd>{latestResumeFile ? "업로드 완료" : "대기"}</dd>
            </div>
          </dl>
          <button className="btn primary" disabled={!canSubmitResume} type="submit">
            이력서 업로드 완료
          </button>
        </form>

        <form
          aria-labelledby="candidate-portfolio-heading"
          className="panel"
          onSubmit={handlePortfolioSubmit}
        >
          <p className="panel-title" id="candidate-portfolio-heading">포트폴리오 / 깃허브</p>
          <label>
            주소
            <input
              type="url"
              value={portfolioState.url}
              onChange={(event) =>
                onPortfolioStateChange({
                  ...portfolioState,
                  url: event.currentTarget.value,
                  linkType: inferPortfolioLinkType(event.currentTarget.value),
                })
              }
            />
          </label>
          <label>
            유형
            <select
              value={portfolioState.linkType}
              onChange={(event) =>
                onPortfolioStateChange({
                  ...portfolioState,
                  linkType: event.currentTarget.value === "GITHUB" ? "GITHUB" : "PORTFOLIO",
                })
              }
            >
              <option value="PORTFOLIO">포트폴리오</option>
              <option value="GITHUB">깃허브</option>
            </select>
          </label>
          <label>
            첨부 파일 번호
            <input
              inputMode="numeric"
              value={portfolioState.fileId ?? ""}
              onChange={(event) =>
                onPortfolioStateChange({
                  ...portfolioState,
                  fileId: toOptionalNumber(event.currentTarget.value),
                })
              }
            />
          </label>
          <label>
            설명
            <input
              value={portfolioState.description}
              onChange={(event) => onPortfolioStateChange({ ...portfolioState, description: event.currentTarget.value })}
            />
          </label>
          <button className="btn primary" disabled={!canSubmitPortfolio} type="submit">
            링크 등록
          </button>
        </form>
      </div>

      <section aria-labelledby="candidate-document-assets-heading" className="panel">
        <p className="panel-title" id="candidate-document-assets-heading">서류 연결 상태</p>
        <dl className="candidate-feature__summary">
          <div>
            <dt>이력서 파일 ID</dt>
            <dd>{latestResumeFile?.fileId ?? "-"}</dd>
          </div>
          <div>
            <dt>이력서 파일</dt>
            <dd>{latestResumeFile?.storageKey ?? "-"}</dd>
          </div>
          <div>
            <dt>포트폴리오 링크</dt>
            <dd>{portfolioLinks.length}</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}

function toOptionalNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
