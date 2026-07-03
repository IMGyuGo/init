"use client";

import type { ReactNode } from "react";

import { JobDescriptionViewer } from "./JobDescriptionViewer";
import {
  extractStructuredJobDescription,
  structuredJobSectionDefinitions,
  type StructuredJobDescription,
} from "./structured-job-description";

type StructuredJobDescriptionViewProps = {
  companyName: string;
  title: string;
  jobRole: string;
  jobDescription: string | null | undefined;
  careerRequirement?: string | null;
  workLocation?: string | null;
  employmentType?: string | null;
  endsOn?: string | null;
  rightRail?: ReactNode;
  preview?: boolean;
};

export function StructuredJobDescriptionView({
  companyName,
  title,
  jobRole,
  jobDescription,
  careerRequirement,
  workLocation,
  employmentType,
  endsOn,
  rightRail,
  preview = false,
}: StructuredJobDescriptionViewProps) {
  const parsed = extractStructuredJobDescription(jobDescription);
  const frameClassName = `candidate-posting-frame ${preview ? "is-preview" : ""}`;

  if (!parsed.structured) {
    return (
      <section className={frameClassName}>
        <CandidatePostingNav />
        <div className="candidate-posting-body">
          <article className="candidate-posting-main">
            <PostingHeading
              companyName={companyName}
              title={title}
              jobRole={jobRole}
              careerRequirement={careerRequirement}
              workLocation={workLocation}
              employmentType={employmentType}
              endsOn={endsOn}
            />
            <section className="wanted-section">
              <JobDescriptionViewer value={parsed.fallbackHtml} emptyMessage="등록된 공고 상세가 없습니다." />
            </section>
          </article>
          <aside className="candidate-apply-rail">{rightRail ?? <DefaultApplyRail />}</aside>
        </div>
      </section>
    );
  }

  return (
    <section className={frameClassName}>
      <CandidatePostingNav />
      <div className="candidate-posting-body">
        <article className="candidate-posting-main">
          <PostingGallery gallery={parsed.structured.gallery} />
          <PostingHeading
            companyName={companyName}
            title={title}
            jobRole={jobRole}
            careerRequirement={careerRequirement}
            workLocation={workLocation}
            employmentType={employmentType}
            endsOn={endsOn}
          />
          <PostingSections structured={parsed.structured} />
          <PostingTags tags={parsed.structured.tags} />
          <PostingLocation location={parsed.structured.locationNote || workLocation} />
        </article>
        <aside className="candidate-apply-rail">{rightRail ?? <DefaultApplyRail />}</aside>
      </div>
    </section>
  );
}

function CandidatePostingNav() {
  return (
    <header className="candidate-site-nav" aria-label="지원자 공고 상단 네비게이션">
      <div className="candidate-site-nav-inner">
        <strong className="candidate-site-logo">INIT</strong>
        <nav>
          <span>채용</span>
          <span>이력서</span>
          <span>커리어</span>
          <span>콘텐츠</span>
        </nav>
        <div className="candidate-site-actions">
          <span>검색</span>
          <span>알림</span>
          <button type="button">기업 서비스</button>
        </div>
      </div>
    </header>
  );
}

function PostingGallery({ gallery }: { gallery: StructuredJobDescription["gallery"] }) {
  if (gallery.length === 0) {
    return (
      <div className="wanted-gallery is-empty">
        <div>
          <strong>INIT</strong>
          <span>채용 공고 이미지</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`wanted-gallery wanted-gallery-${Math.min(gallery.length, 3)}`}>
      {gallery.slice(0, 3).map((image, index) => (
        <figure className={index === 0 ? "is-primary" : ""} key={`${image.url}-${index}`}>
          <span
            role="img"
            aria-label={image.name || "공고 이미지"}
            style={{ backgroundImage: `url(${image.url})` }}
          />
        </figure>
      ))}
    </div>
  );
}

function DefaultApplyRail() {
  return (
    <div className="candidate-apply-stack">
      <div className="candidate-apply-sticky">
        <button className="candidate-apply-button" type="button">
          지원하기
        </button>
        <div className="candidate-resume-card">
          <span className="candidate-resume-asset" aria-hidden="true">
            AI
          </span>
          <div>
            <p>이력서 정보가 충분하지 않아요</p>
            <strong>이력서 작성 시 서류 합격률을 확인할 수 있어요</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostingHeading({
  companyName,
  title,
  jobRole,
  careerRequirement,
  workLocation,
  employmentType,
  endsOn,
}: Omit<StructuredJobDescriptionViewProps, "jobDescription">) {
  const meta = [companyName, workLocation, careerRequirement, employmentType].filter(Boolean);
  return (
    <header className="wanted-posting-head">
      <p>{meta.join(" · ")}</p>
      <h2>{title}</h2>
      <dl>
        <div>
          <dt>직무</dt>
          <dd>{jobRole}</dd>
        </div>
        <div>
          <dt>마감일</dt>
          <dd>{endsOn ?? "상시 채용"}</dd>
        </div>
      </dl>
    </header>
  );
}

function PostingSections({ structured }: { structured: StructuredJobDescription }) {
  const sections = structuredJobSectionDefinitions.filter((section) => structured.sections[section.key]?.trim());

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="wanted-section-list">
      {sections.map((section) => (
        <section className="wanted-section" key={section.key}>
          <h3>{section.title}</h3>
          <div className="wanted-rich-content" dangerouslySetInnerHTML={{ __html: structured.sections[section.key] }} />
        </section>
      ))}
    </div>
  );
}

function PostingTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <section className="wanted-section">
      <h3>태그</h3>
      <div className="wanted-tag-list">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </section>
  );
}

function PostingLocation({ location }: { location?: string | null }) {
  if (!location) {
    return null;
  }

  return (
    <section className="wanted-section">
      <h3>근무지역</h3>
      <div className="wanted-map-card">
        <strong>{location}</strong>
        <span>지도 영역</span>
      </div>
    </section>
  );
}
