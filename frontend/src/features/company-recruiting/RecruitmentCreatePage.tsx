"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useRef, useState } from "react";

import { createRecruitment, uploadJobDescriptionImage } from "./api";
import { Breadcrumb } from "./CompanyRecruitingChrome";
import { MiniRichTextEditor } from "./MiniRichTextEditor";
import { JOB_DESCRIPTION_IMAGE_ACCEPT, validateJobDescriptionImageFile } from "./job-description-image-upload";
import {
  composeJobDescriptionWithExtraInfo,
  createEmptyPostingExtraInfo,
  postingExtraInfoToApiFields,
  type PostingExtraInfoKey,
  type PostingExtraInfo,
} from "./posting-extra-info";
import { buildInterviewSettingsHref } from "./routes";
import { StructuredJobDescriptionView } from "./StructuredJobDescriptionView";
import {
  buildStructuredPreviewJobDescription,
  composeStructuredJobDescription,
  createEmptyStructuredJobDescription,
  structuredJobSectionDefinitions,
  suggestedPostingTags,
  type StructuredJobDescription,
  type StructuredJobImage,
  type StructuredJobSectionKey,
} from "./structured-job-description";

type FormState = {
  title: string;
  jobRole: string;
  startsOn: string;
  endsOn: string;
  extraInfo: PostingExtraInfo;
  structuredJobDescription: StructuredJobDescription;
};

function createInitialForm(): FormState {
  return {
    title: "",
    jobRole: "",
    startsOn: "",
    endsOn: "",
    extraInfo: createEmptyPostingExtraInfo(),
    structuredJobDescription: createEmptyStructuredJobDescription(),
  };
}

export function RecruitmentCreatePage() {
  const router = useRouter();
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<FormState>(() => createInitialForm());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryMessage, setGalleryMessage] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewJobDescription = buildStructuredPreviewJobDescription(
    form.structuredJobDescription,
    form.extraInfo.location.value,
  );
  const previewTitle = form.title.trim() || "공고 제목 미리보기";
  const previewJobRole = form.jobRole.trim() || "직무명";
  const previewCompanyName = "회사명";
  const previewCareer = form.extraInfo.career.value.trim() || "경력 정보";
  const previewLocation = form.extraInfo.location.value.trim() || "근무지역";
  const previewEmploymentType = form.extraInfo.employmentType.value.trim() || "근무형태";

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const structuredJobDescription = {
        ...form.structuredJobDescription,
        locationNote: form.extraInfo.location.value.trim(),
      };
      const structuredHtml = composeStructuredJobDescription("", structuredJobDescription);
      const jobDescription = composeJobDescriptionWithExtraInfo(structuredHtml, form.extraInfo);
      const extraInfoFields = postingExtraInfoToApiFields(form.extraInfo);
      const result = await createRecruitment({
        title: form.title,
        jobRole: form.jobRole,
        startsOn: form.startsOn || undefined,
        endsOn: form.endsOn || undefined,
        status: "DRAFT",
        jobDescription: jobDescription || undefined,
        ...extraInfoFields,
      });
      router.push(buildInterviewSettingsHref(result.data.recruitmentId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공고 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateExtraInfo(key: PostingExtraInfoKey, value: string) {
    setForm((current) => ({
      ...current,
      extraInfo: {
        ...current.extraInfo,
        [key]: {
          enabled: Boolean(value.trim()),
          value,
        },
      },
    }));
  }

  function updateStructuredSection(key: StructuredJobSectionKey, value: string) {
    setForm((current) => ({
      ...current,
      structuredJobDescription: {
        ...current.structuredJobDescription,
        sections: {
          ...current.structuredJobDescription.sections,
          [key]: value,
        },
      },
    }));
  }

  function removeGalleryImage(index: number) {
    setForm((current) => ({
      ...current,
      structuredJobDescription: {
        ...current.structuredJobDescription,
        gallery: current.structuredJobDescription.gallery.filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  }

  async function handleGalleryFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (files.length === 0) return;

    setGalleryUploading(true);
    setGalleryMessage("");
    try {
      const uploaded: StructuredJobImage[] = [];
      for (const file of files) {
        const validation = validateJobDescriptionImageFile(file);
        if (!validation.ok) {
          setGalleryMessage(validation.message);
          continue;
        }
        const result = await uploadJobDescriptionImage(file);
        uploaded.push({ url: result.data.url, name: result.data.originalName });
      }

      if (uploaded.length > 0) {
        setForm((current) => ({
          ...current,
          structuredJobDescription: {
            ...current.structuredJobDescription,
            gallery: [...current.structuredJobDescription.gallery, ...uploaded].slice(0, 5),
          },
        }));
        setGalleryMessage(`${uploaded.length}장의 이미지를 추가했습니다.`);
      }
    } catch (error) {
      setGalleryMessage(error instanceof Error ? error.message : "공고 이미지 업로드에 실패했습니다.");
    } finally {
      setGalleryUploading(false);
    }
  }

  function toggleTag(tag: string) {
    setForm((current) => {
      const exists = current.structuredJobDescription.tags.includes(tag);
      return {
        ...current,
        structuredJobDescription: {
          ...current.structuredJobDescription,
          tags: exists
            ? current.structuredJobDescription.tags.filter((item) => item !== tag)
            : [...current.structuredJobDescription.tags, tag],
        },
      };
    });
  }

  function addCustomTags() {
    const tags = tagInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length === 0) return;

    setForm((current) => ({
      ...current,
      structuredJobDescription: {
        ...current.structuredJobDescription,
        tags: Array.from(new Set([...current.structuredJobDescription.tags, ...tags])),
      },
    }));
    setTagInput("");
  }

  return (
    <section className="app-page glass-page posting-create-page">
        <div className="page-head">
          <div>
            <Breadcrumb
              items={[
                { label: "공고 목록", href: "/company/recruitments" },
                { label: "공고 생성" },
              ]}
            />
            <h1>공고 생성</h1>
          </div>
          <Link className="btn secondary" href="/company/recruitments">
            공고 목록
          </Link>
        </div>

        {message ? <p className="notice danger">{message}</p> : null}

        <div className="posting-builder-shell">
          <form className="creation-flow posting-builder-form" onSubmit={handleCreate}>
            <section className="panel structured-create-hero">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">JOB POSTING BUILDER</p>
                  <h2>구직자가 보는 공고 그대로 입력하세요</h2>
                  <p>왼쪽에서 입력하면 오른쪽 지원자 미리보기에 즉시 반영됩니다.</p>
                </div>
              </div>
            </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>기본 정보</h2>
                <p>공개 공고 상단에 노출되는 핵심 정보입니다. 회사명은 기업 프로필 기준으로 자동 표시됩니다.</p>
              </div>
            </div>

            <div className="grid-2">
              <label>
                공고 제목
                <input
                  required
                  value={form.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  placeholder="2026 신입 백엔드 채용"
                />
              </label>
              <label>
                직무명
                <input
                  required
                  value={form.jobRole}
                  onChange={(event) => updateField("jobRole", event.target.value)}
                  placeholder="Backend Developer"
                />
              </label>
              <label>
                요구 경력
                <input
                  value={form.extraInfo.career.value}
                  onChange={(event) => updateExtraInfo("career", event.target.value)}
                  placeholder="신입 이상 / 1~2년차 / 5년 이상"
                />
              </label>
              <label>
                근무형태
                <input
                  value={form.extraInfo.employmentType.value}
                  onChange={(event) => updateExtraInfo("employmentType", event.target.value)}
                  placeholder="정규직 / 계약직 / 인턴"
                />
              </label>
              <label>
                채용 시작일
                <input type="date" value={form.startsOn} onChange={(event) => updateField("startsOn", event.target.value)} />
              </label>
              <label>
                채용 마감일
                <input type="date" value={form.endsOn} onChange={(event) => updateField("endsOn", event.target.value)} />
              </label>
              <label className="wide">
                회사 위치 / 근무지역
                <input
                  value={form.extraInfo.location.value}
                  onChange={(event) => updateExtraInfo("location", event.target.value)}
                  placeholder="서울 강남구 테헤란로 123"
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>공고 이미지</h2>
                <p>공개 공고 상단 갤러리에 노출할 이미지를 최대 5장까지 등록합니다.</p>
              </div>
              <button className="btn secondary" type="button" disabled={galleryUploading} onClick={() => galleryInputRef.current?.click()}>
                {galleryUploading ? "업로드 중" : "이미지 추가"}
              </button>
            </div>
            <input
              ref={galleryInputRef}
              className="jd-file-input"
              type="file"
              multiple
              accept={JOB_DESCRIPTION_IMAGE_ACCEPT}
              disabled={galleryUploading}
              onChange={handleGalleryFiles}
            />
            {galleryMessage ? <p className="notice">{galleryMessage}</p> : null}
            {form.structuredJobDescription.gallery.length === 0 ? (
              <div className="empty">아직 등록된 공고 이미지가 없습니다.</div>
            ) : (
              <div className="posting-gallery-editor">
                {form.structuredJobDescription.gallery.map((image, index) => (
                  <figure key={`${image.url}-${index}`}>
                    <span style={{ backgroundImage: `url(${image.url})` }} aria-hidden="true" />
                    <figcaption>{image.name}</figcaption>
                    <button type="button" onClick={() => removeGalleryImage(index)}>
                      삭제
                    </button>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>공고 상세</h2>
                <p>각 섹션 안에서는 굵게, 목록, 번호 목록, 링크 서식을 사용할 수 있습니다.</p>
              </div>
            </div>

            <div className="structured-section-grid">
              {structuredJobSectionDefinitions.map((section) => (
                <div className="structured-section-card" key={section.key}>
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.placeholder}</p>
                  </div>
                  <MiniRichTextEditor
                    value={form.structuredJobDescription.sections[section.key]}
                    placeholder={section.placeholder}
                    disabled={loading}
                    onChange={(value) => updateStructuredSection(section.key, value)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>태그</h2>
                <p>복지, 조직문화, 성장 신호를 태그로 선택합니다. 검색/필터링 용도는 이번 범위에서 제외합니다.</p>
              </div>
            </div>
            <div className="posting-tag-picker">
              {suggestedPostingTags.map((tag) => (
                <button
                  className={form.structuredJobDescription.tags.includes(tag) ? "is-selected" : ""}
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="tag-input-row">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="직접 입력 후 추가, 여러 개는 쉼표로 구분"
              />
              <button className="btn secondary" type="button" onClick={addCustomTags}>
                태그 추가
              </button>
            </div>
          </section>

            <div className="form-actions">
              <button className="btn primary" type="submit" disabled={loading}>
                다음
              </button>
            </div>
          </form>

          <aside className="posting-live-preview" aria-label="지원자 화면 미리보기">
            <div className="posting-live-preview-head">
              <div>
                <p className="eyebrow">LIVE PREVIEW</p>
                <h2>지원자 화면</h2>
              </div>
              <button className="btn secondary" type="button" onClick={() => setPreviewOpen(true)}>
                크게 보기
              </button>
            </div>
            <div className="posting-preview-viewport">
              <StructuredJobDescriptionView
                preview
                companyName={previewCompanyName}
                title={previewTitle}
                jobRole={previewJobRole}
                jobDescription={previewJobDescription}
                careerRequirement={previewCareer}
                workLocation={previewLocation}
                employmentType={previewEmploymentType}
                endsOn={form.endsOn || null}
              />
            </div>
          </aside>
        </div>

        {previewOpen ? (
          <div className="posting-preview-modal" role="dialog" aria-modal="true" aria-label="지원자 화면 크게 보기">
            <div className="posting-preview-modal-head">
              <strong>지원자 화면 미리보기</strong>
              <button className="btn secondary" type="button" onClick={() => setPreviewOpen(false)}>
                닫기
              </button>
            </div>
            <div className="posting-preview-modal-body">
              <StructuredJobDescriptionView
                preview
                companyName={previewCompanyName}
                title={previewTitle}
                jobRole={previewJobRole}
                jobDescription={previewJobDescription}
                careerRequirement={previewCareer}
                workLocation={previewLocation}
                employmentType={previewEmploymentType}
                endsOn={form.endsOn || null}
              />
            </div>
          </div>
        ) : null}
    </section>
  );
}
