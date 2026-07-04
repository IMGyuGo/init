"use client";

import Image from "next/image";
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
}: StructuredJobDescriptionViewProps) {
  const parsed = extractStructuredJobDescription(jobDescription);

  if (!parsed.structured) {
    return (
      <section className="candidate-posting-frame">
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
            />
            <section className="wanted-section">
              <JobDescriptionViewer value={parsed.fallbackHtml} emptyMessage="등록된 공고 상세가 없습니다." />
            </section>
            <PostingDeadline endsOn={endsOn} />
          </article>
          <aside className="candidate-apply-rail">{rightRail ?? <DefaultApplyRail />}</aside>
        </div>
      </section>
    );
  }

  return (
    <section className="candidate-posting-frame">
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
          />
          <PostingSections structured={parsed.structured} />
          <PostingTags tags={parsed.structured.tags} />
          <PostingDeadline endsOn={endsOn} />
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
        <Image className="candidate-site-logo-img" src="/logo-init-v2.png" alt="init" width={1150} height={470} priority />
      </div>
    </header>
  );
}

function PostingGallery({ gallery }: { gallery: StructuredJobDescription["gallery"] }) {
  if (gallery.length === 0) {
    return null;
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
  return null;
}

function PostingHeading({
  companyName,
  title,
  jobRole,
  careerRequirement,
  workLocation,
  employmentType,
}: Omit<StructuredJobDescriptionViewProps, "jobDescription" | "endsOn">) {
  const meta = [companyName, workLocation, careerRequirement, employmentType].filter(Boolean);
  return (
    <header className="wanted-posting-head">
      <p className="wanted-posting-meta">{meta.join(" · ")}</p>
      <h2>{title}</h2>
      {jobRole ? <p className="wanted-posting-role">{jobRole}</p> : null}
    </header>
  );
}

function PostingDeadline({ endsOn }: { endsOn?: string | null }) {
  return (
    <section className="wanted-section">
      <h3>마감일</h3>
      <p className="wanted-deadline">{endsOn ? endsOn : "상시 채용"}</p>
    </section>
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
      <p className="wanted-location">{location}</p>
    </section>
  );
}
