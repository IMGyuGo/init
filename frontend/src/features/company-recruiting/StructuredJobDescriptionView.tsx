"use client";

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
}: StructuredJobDescriptionViewProps) {
  const parsed = extractStructuredJobDescription(jobDescription);

  if (!parsed.structured) {
    return (
      <section className="wanted-public-posting">
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
      </section>
    );
  }

  return (
    <section className="wanted-public-posting">
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
    </section>
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
