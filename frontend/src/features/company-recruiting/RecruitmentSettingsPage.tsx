"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import settingsBanner from "./assets/settings-banner.png";

import { changeRecruitmentStatus, deleteRecruitment, getRecruitment, updateRecruitment, uploadJobDescriptionImage } from "./api";
import {
  POSTING_CAREER_MAX_YEARS,
  POSTING_CAREER_YEAR_OPTIONS,
  POSTING_EMPLOYMENT_TYPE_CODE_OPTIONS,
  POSTING_JOB_ROLE_CODE_OPTIONS,
  POSTING_RECRUITMENT_TYPE_OPTIONS,
  POSTING_REGION_CODE_OPTIONS,
  formatCareerRangeLabel,
} from "./posting-filter-taxonomy";
import { Breadcrumb } from "./CompanyRecruitingChrome";
import { MiniRichTextEditor } from "./MiniRichTextEditor";
import { JOB_DESCRIPTION_IMAGE_ACCEPT, validateJobDescriptionImageFile } from "./job-description-image-upload";
import {
  composeJobDescriptionWithExtraInfo,
  createEmptyPostingExtraInfo,
  extractPostingExtraInfo,
  postingExtraInfoFromApiFields,
  postingExtraInfoToApiFields,
  type PostingExtraInfoKey,
  type PostingExtraInfo,
} from "./posting-extra-info";
import {
  composeStructuredJobDescription,
  createEmptyStructuredJobDescription,
  createStructuredJobDescriptionFromHtml,
  extractStructuredJobDescription,
  normalizeStructuredJobImageName,
  structuredJobSectionDefinitions,
  type StructuredJobDescription,
  type StructuredJobImage,
  type StructuredJobSectionKey,
} from "./structured-job-description";
import type { Recruitment } from "./types";

const MAX_GALLERY_IMAGES = 5;

type FormState = {
  title: string;
  jobRole: string;
  startsOn: string;
  endsOn: string;
  status: "DRAFT" | "OPEN";
  jobRoleCode: string;
  regionCode: string;
  careerMinYears: number;
  careerMaxYears: number;
  employmentTypeCode: string;
  recruitmentType: string;
  extraInfo: PostingExtraInfo;
  structuredJobDescription: StructuredJobDescription;
  fallbackJobDescription: string;
};

function createInitialForm(): FormState {
  return {
    title: "",
    jobRole: "",
    startsOn: "",
    endsOn: "",
    status: "OPEN",
    jobRoleCode: "",
    regionCode: "",
    careerMinYears: 0,
    careerMaxYears: POSTING_CAREER_MAX_YEARS,
    employmentTypeCode: "",
    recruitmentType: "",
    extraInfo: createEmptyPostingExtraInfo(),
    structuredJobDescription: createEmptyStructuredJobDescription(),
    fallbackJobDescription: "",
  };
}

export function RecruitmentSettingsPage({ recruitmentId }: { recruitmentId: number }) {
  const router = useRouter();
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [recruitment, setRecruitment] = useState<Recruitment | null>(null);
  const [form, setForm] = useState<FormState>(() => createInitialForm());
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [loading, setLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryMessage, setGalleryMessage] = useState("");
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const result = await getRecruitment(recruitmentId);
        const parsedJobDescription = extractPostingExtraInfo(result.data.jobDescription);
        const extraInfo = postingExtraInfoFromApiFields(result.data, parsedJobDescription.extraInfo);
        const structuredParsed = extractStructuredJobDescription(parsedJobDescription.jobDescription);
        const structuredJobDescription = createStructuredJobDescriptionFromHtml(parsedJobDescription.jobDescription);
        const structuredLocation = structuredJobDescription.locationNote.trim();
        if (!extraInfo.location.value.trim() && structuredLocation) {
          extraInfo.location = { enabled: true, value: structuredLocation };
        }
        setRecruitment(result.data);
        setForm({
          title: result.data.title,
          jobRole: result.data.jobRole,
          startsOn: result.data.startsOn ?? "",
          endsOn: result.data.endsOn ?? "",
          status: result.data.status === "DRAFT" ? "DRAFT" : "OPEN",
          jobRoleCode: result.data.jobRoleCode ?? "",
          regionCode: result.data.regionCode ?? "",
          careerMinYears: result.data.careerMinYears ?? 0,
          careerMaxYears: result.data.careerMaxYears ?? POSTING_CAREER_MAX_YEARS,
          employmentTypeCode: result.data.employmentTypeCode ?? "",
          recruitmentType: result.data.recruitmentType ?? "",
          extraInfo,
          structuredJobDescription: {
            ...structuredJobDescription,
            locationNote: structuredLocation || extraInfo.location.value.trim(),
          },
          fallbackJobDescription: structuredParsed.structured ? structuredParsed.fallbackHtml : "",
        });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "공고 설정을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [recruitmentId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const structuredJobDescription = {
        ...form.structuredJobDescription,
        locationNote: form.extraInfo.location.value.trim(),
      };
      const structuredHtml = composeStructuredJobDescription(form.fallbackJobDescription, structuredJobDescription);
      const jobDescription = composeJobDescriptionWithExtraInfo(structuredHtml, form.extraInfo);
      const extraInfoFields = postingExtraInfoToApiFields(form.extraInfo);
      await updateRecruitment(recruitmentId, {
        title: form.title,
        jobRole: form.jobRole,
        startsOn: form.startsOn || undefined,
        endsOn: form.endsOn || undefined,
        status: form.status,
        jobDescription: jobDescription || undefined,
        ...extraInfoFields,
        jobRoleCode: form.jobRoleCode || undefined,
        regionCode: form.regionCode || undefined,
        careerMinYears: form.careerMinYears,
        careerMaxYears: form.careerMaxYears,
        employmentTypeCode: form.employmentTypeCode || undefined,
        recruitmentType: (form.recruitmentType || undefined) as "상시" | "마감형" | undefined,
      });
      router.push(`/company/recruitments/${recruitmentId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공고 설정 저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!recruitment) {
      return;
    }

    setLoading(true);
    setDeleteError("");
    try {
      if (requiresDraftBeforeDelete(recruitment.status)) {
        await changeRecruitmentStatus(recruitment.recruitmentId, "DRAFT");
      }
      await deleteRecruitment(recruitment.recruitmentId);
      router.push("/company/recruitments");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "공고 삭제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // 직무 select 하나로 표시용 jobRole 과 필터용 jobRoleCode 를 함께 설정한다.
  function updateJobRoleSelection(code: string) {
    setForm((current) => ({ ...current, jobRoleCode: code, jobRole: code }));
  }

  // 지역·근무형태 select 는 필터 코드와 JD 표시용 extraInfo 를 함께 갱신한다.
  function updateStructuredWithExtraInfo(field: "regionCode" | "employmentTypeCode", extraKey: PostingExtraInfoKey, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      extraInfo: { ...current.extraInfo, [extraKey]: { enabled: Boolean(value), value } },
    }));
  }

  // 경력 min/max select 는 필터값과 JD 표시용 경력 라벨을 함께 갱신한다.
  function updateCareerRange(nextMin: number, nextMax: number) {
    const label = formatCareerRangeLabel(nextMin, nextMax);
    setForm((current) => ({
      ...current,
      careerMinYears: nextMin,
      careerMaxYears: nextMax,
      extraInfo: { ...current.extraInfo, career: { enabled: true, value: label } },
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

    // 업로드 전 남은 슬롯을 계산해 초과분은 아예 올리지 않는다.
    const remaining = MAX_GALLERY_IMAGES - form.structuredJobDescription.gallery.length;
    if (remaining <= 0) {
      setGalleryMessage(`공고 이미지는 최대 ${MAX_GALLERY_IMAGES}장까지 등록할 수 있어요. 기존 이미지를 삭제한 뒤 다시 추가해주세요.`);
      return;
    }
    const accepted = files.slice(0, remaining);
    const overflowCount = files.length - accepted.length;

    setGalleryUploading(true);
    setGalleryMessage("");
    try {
      const uploaded: StructuredJobImage[] = [];
      let invalidCount = 0;
      for (const file of accepted) {
        const validation = validateJobDescriptionImageFile(file);
        if (!validation.ok) {
          invalidCount += 1;
          continue;
        }
        const result = await uploadJobDescriptionImage(file);
        uploaded.push({ url: result.data.url, name: normalizeStructuredJobImageName(result.data.originalName) });
      }

      if (uploaded.length > 0) {
        setForm((current) => ({
          ...current,
          structuredJobDescription: {
            ...current.structuredJobDescription,
            gallery: [...current.structuredJobDescription.gallery, ...uploaded].slice(0, MAX_GALLERY_IMAGES),
          },
        }));
      }

      const parts: string[] = [];
      if (uploaded.length > 0) parts.push(`${uploaded.length}장을 추가했어요.`);
      if (overflowCount > 0) parts.push(`최대 ${MAX_GALLERY_IMAGES}장 제한으로 ${overflowCount}장은 제외했어요.`);
      if (invalidCount > 0) parts.push(`${invalidCount}장은 형식/용량이 맞지 않아 제외했어요.`);
      setGalleryMessage(parts.length > 0 ? parts.join(" ") : "추가된 이미지가 없어요.");
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

  function handleTagInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCustomTags();
  }

  return (
    <section className="app-page glass-page posting-create-page notion">
        <div className="page-banner">
          <div className="page-banner-copy">
            <Breadcrumb
              items={[
                { label: "공고 목록", href: "/company/recruitments" },
                { label: recruitment?.title ?? "공고", href: `/company/recruitments/${recruitmentId}` },
                { label: "공고 설정" },
              ]}
            />
            <h1>공고 설정</h1>
            <p className="page-sub">공고 제목·기간·상세 내용·이미지·태그를 수정하고 저장하면 공개 공고에 바로 반영됩니다.</p>
            <div className="banner-actions">
              <Link className="btn secondary" href={`/company/recruitments/${recruitmentId}`}>
                대시보드
              </Link>
              {recruitment && canShowDeleteButton(recruitment.status) ? (
                <button
                  className="btn destructive"
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setMessage("");
                    setDeleteError("");
                    setDeleteOpen(true);
                  }}
                >
                  공고 삭제
                </button>
              ) : null}
            </div>
          </div>
          <Image className="page-banner-art" src={settingsBanner} alt="" width={300} height={300} aria-hidden="true" priority />
        </div>

        {message ? <p className="notice danger">{message}</p> : null}

        <form className="creation-flow posting-create-flow" onSubmit={handleSave}>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>기본 정보</h2>
                <p>공개 공고 상단에 노출되는 핵심 정보입니다. 회사명은 기업 프로필 기준으로 자동 표시됩니다.</p>
              </div>
            </div>

            <div className="grid-2">
              <label className="wide">
                공고 제목
                <input required value={form.title} onChange={(event) => updateField("title", event.target.value)} />
              </label>
              <label>
                직무
                <select required value={form.jobRoleCode} onChange={(event) => updateJobRoleSelection(event.target.value)}>
                  <option value="" disabled>
                    직무를 선택하세요
                  </option>
                  {POSTING_JOB_ROLE_CODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                근무 지역
                <select required value={form.regionCode} onChange={(event) => updateStructuredWithExtraInfo("regionCode", "location", event.target.value)}>
                  <option value="" disabled>
                    지역을 선택하세요
                  </option>
                  {POSTING_REGION_CODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                근무 형태
                <select required value={form.employmentTypeCode} onChange={(event) => updateStructuredWithExtraInfo("employmentTypeCode", "employmentType", event.target.value)}>
                  <option value="" disabled>
                    근무 형태를 선택하세요
                  </option>
                  {POSTING_EMPLOYMENT_TYPE_CODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                채용 형태
                <select required value={form.recruitmentType} onChange={(event) => updateField("recruitmentType", event.target.value)}>
                  <option value="" disabled>
                    채용 형태를 선택하세요
                  </option>
                  {POSTING_RECRUITMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                경력 최소
                <select value={form.careerMinYears} onChange={(event) => updateCareerRange(Number(event.target.value), form.careerMaxYears)}>
                  {POSTING_CAREER_YEAR_OPTIONS.map((year) => (
                    <option key={year} value={year}>
                      {year === 0 ? "신입" : `${year}년`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                경력 최대
                <select value={form.careerMaxYears} onChange={(event) => updateCareerRange(form.careerMinYears, Number(event.target.value))}>
                  {POSTING_CAREER_YEAR_OPTIONS.map((year) => (
                    <option key={year} value={year}>
                      {year >= POSTING_CAREER_MAX_YEARS ? `${POSTING_CAREER_MAX_YEARS}년+` : `${year}년`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                채용 시작일
                <input type="date" value={form.startsOn} onChange={(event) => updateField("startsOn", event.target.value)} />
              </label>
              <label>
                채용 마감일
                <input type="date" value={form.endsOn} onChange={(event) => updateField("endsOn", event.target.value)} />
              </label>
              <label>
                공개 상태
                <select value={form.status} onChange={(event) => updateField("status", event.target.value as FormState["status"])}>
                  <option value="OPEN">OPEN</option>
                  <option value="DRAFT">DRAFT</option>
                </select>
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
                <p>직접 입력한 태그만 공개 공고에 노출됩니다. 여러 개는 쉼표로 구분해 추가할 수 있습니다.</p>
              </div>
            </div>
            {form.structuredJobDescription.tags.length > 0 ? (
              <div className="posting-tag-picker" aria-label="추가된 태그">
                {form.structuredJobDescription.tags.map((tag) => (
                  <button className="is-selected" type="button" key={tag} onClick={() => toggleTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty">추가된 태그가 없습니다.</div>
            )}
            <div className="tag-input-row">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagInputKeyDown}
                placeholder="직접 입력 후 추가, 여러 개는 쉼표로 구분"
              />
              <button className="btn secondary" type="button" onClick={addCustomTags}>
                태그 추가
              </button>
            </div>
          </section>

          <div className="sticky-actions">
            <button className="btn primary" type="submit" disabled={loading}>
              설정 저장
            </button>
          </div>
        </form>

        {deleteOpen && recruitment ? (
          <div className="modal-backdrop" role="presentation">
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-recruitment-title">
              <div className="modal-head">
                <div>
                  <h2 id="delete-recruitment-title">공고 삭제</h2>
                  <p>
                    {requiresDraftBeforeDelete(recruitment.status)
                      ? "이 공고는 공개(OPEN) 상태입니다. 삭제하려면 먼저 임시저장(DRAFT)으로 전환한 뒤 삭제됩니다. 공개 지원 링크는 더 이상 접수되지 않습니다."
                      : "삭제하면 공고 목록에서 숨겨지고 상태가 ARCHIVED로 변경됩니다."}
                  </p>
                </div>
                <button className="btn secondary compact" type="button" disabled={loading} onClick={() => setDeleteOpen(false)}>
                  닫기
                </button>
              </div>
              {deleteError ? <p className="notice danger">{deleteError}</p> : null}
              <div className="confirm-box">
                <strong>{recruitment.title}</strong>
                <span>
                  {recruitment.jobRole} · {formatPeriod(recruitment)}
                </span>
              </div>
              <div className="modal-actions split-actions">
                <button className="btn secondary" type="button" disabled={loading} onClick={() => setDeleteOpen(false)}>
                  취소
                </button>
                <button className="btn primary danger" type="button" disabled={loading} onClick={() => void handleDeleteConfirmed()}>
                  삭제
                </button>
              </div>
            </div>
          </div>
        ) : null}
    </section>
  );
}

function formatPeriod(item: Recruitment) {
  if (!item.startsOn && !item.endsOn) {
    return "기간 미정";
  }
  return `${item.startsOn ?? "시작 미정"} ~ ${item.endsOn ?? "마감 미정"}`;
}

function canShowDeleteButton(status: Recruitment["status"]) {
  return status !== "ARCHIVED";
}

function requiresDraftBeforeDelete(status: Recruitment["status"]) {
  return status === "OPEN" || status === "CLOSING_SOON";
}
