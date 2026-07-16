"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { JobDescriptionViewer } from "./JobDescriptionViewer";
import { extractPostingExtraInfo, postingExtraInfoFromApiFields } from "./posting-extra-info";
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
  salaryInfo?: string | null;
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
  salaryInfo,
  workLocation,
  employmentType,
  endsOn,
  rightRail,
}: StructuredJobDescriptionViewProps) {
  const parsedExtraInfo = extractPostingExtraInfo(jobDescription);
  const postingExtraInfo = postingExtraInfoFromApiFields(
    {
      careerRequirement,
      salaryInfo,
      workLocation,
      employmentType,
    },
    parsedExtraInfo.extraInfo,
  );
  const displayInfo = {
    careerRequirement: postingExtraInfo.career.value.trim() || careerRequirement || "",
    salaryInfo: postingExtraInfo.salary.value.trim() || salaryInfo || "",
    workLocation: postingExtraInfo.location.value.trim() || workLocation || "",
    employmentType: postingExtraInfo.employmentType.value.trim() || employmentType || "",
  };
  const parsed = extractStructuredJobDescription(parsedExtraInfo.jobDescription);

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
              careerRequirement={displayInfo.careerRequirement}
              salaryInfo={displayInfo.salaryInfo}
              employmentType={displayInfo.employmentType}
            />
            <PostingSummary
              careerRequirement={displayInfo.careerRequirement}
              workLocation={displayInfo.workLocation}
              employmentType={displayInfo.employmentType}
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
    <section className="candidate-posting-frame">
      <CandidatePostingNav />
      <div className="candidate-posting-body">
        <article className="candidate-posting-main">
          <PostingGallery gallery={parsed.structured.gallery} />
          <PostingHeading
            companyName={companyName}
            title={title}
            jobRole={jobRole}
            careerRequirement={displayInfo.careerRequirement}
            salaryInfo={displayInfo.salaryInfo}
            employmentType={displayInfo.employmentType}
          />
          <PostingSummary
            careerRequirement={displayInfo.careerRequirement}
            workLocation={displayInfo.workLocation}
            employmentType={displayInfo.employmentType}
            endsOn={endsOn}
          />
          <PostingSections structured={parsed.structured} />
          <PostingTags tags={parsed.structured.tags} />
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
        <Image className="candidate-site-logo-img" src="/logo-init-v5.png" alt="init" width={2030} height={775} priority />
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
        <figure className={getGalleryImageClassName(image.name, index)} key={`${image.url}-${index}`}>
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
  salaryInfo,
  employmentType,
}: Omit<StructuredJobDescriptionViewProps, "jobDescription" | "endsOn" | "workLocation" | "rightRail">) {
  const secondaryMeta = [salaryInfo, careerRequirement, employmentType].filter(Boolean);
  const meta = [companyName, ...(secondaryMeta.length > 0 ? secondaryMeta : [jobRole].filter(Boolean))].filter(Boolean);

  return (
    <header className="wanted-posting-head">
      <p className="wanted-posting-meta">{meta.join(" · ")}</p>
      <h2>{title}</h2>
    </header>
  );
}

function PostingSummary({
  careerRequirement,
  workLocation,
  employmentType,
  endsOn,
}: {
  careerRequirement?: string | null;
  workLocation?: string | null;
  employmentType?: string | null;
  endsOn?: string | null;
}) {
  const items = [
    { label: "경력", value: careerRequirement || "협의" },
    { label: "근무지역", value: workLocation || "협의" },
    { label: "근무형태", value: employmentType || "협의" },
    { label: "마감일", value: formatDeadlineLabel(endsOn) },
  ];

  return (
    <dl className="wanted-summary-grid" aria-label="공고 요약 정보">
      {items.map((item) => (
        <div className="wanted-summary-item" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
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

function formatDeadlineLabel(endsOn?: string | null) {
  if (!endsOn) {
    return "상시 채용";
  }

  const deadline = new Date(`${endsOn}T23:59:59`);
  if (Number.isNaN(deadline.getTime())) {
    return endsOn;
  }

  const now = new Date();
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `D-${diffDays}`;
  }

  if (diffDays === 0) {
    return "오늘 마감";
  }

  return "마감";
}

function getGalleryImageClassName(name: string | undefined, index: number) {
  return [index === 0 ? "is-primary" : "", name && /logo|로고/i.test(name) ? "is-logo" : ""].filter(Boolean).join(" ");
}
