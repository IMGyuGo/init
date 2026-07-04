"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, KeyboardEvent, useRef, useState } from "react";

import { createRecruitment, uploadJobDescriptionImage } from "./api";
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
import { generateMockPostingDraft } from "./posting-ai-draft";
import {
  composeStructuredJobDescription,
  createEmptyStructuredJobDescription,
  normalizeStructuredJobImageName,
  structuredJobSectionDefinitions,
  type StructuredJobDescription,
  type StructuredJobImage,
  type StructuredJobSectionKey,
} from "./structured-job-description";
import createBanner from "./assets/create-banner.png";
import choiceManual from "./assets/choice-manual.png";
import choiceAi from "./assets/choice-ai.png";

const MAX_GALLERY_IMAGES = 5;

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
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [aiKeywords, setAiKeywords] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [aiFilled, setAiFilled] = useState(false);
  const [phase, setPhase] = useState<"intro" | "choice" | "ai" | "form">("intro");
  const [entryMode, setEntryMode] = useState<"manual" | "ai">("manual");

  function startForm() {
    setDir(1);
    setStep(1);
    setMessage("");
    setPhase("form");
  }

  function handleGenerateDraft() {
    const draft = generateMockPostingDraft({
      title: form.title,
      jobRole: form.jobRole,
      keywords: aiKeywords,
      summary: aiSummary,
    });
    setForm((current) => ({
      ...current,
      structuredJobDescription: {
        ...current.structuredJobDescription,
        sections: { ...current.structuredJobDescription.sections, ...draft.sections },
        tags: Array.from(new Set([...current.structuredJobDescription.tags, ...draft.tags])),
      },
    }));
    setAiFilled(true);
  }

  async function handleCreate() {
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

  const basicStep = {
    key: "basic",
    title: "기본 정보",
    guide: "공고 제목과 직무명은 필수예요. 채용 기간·근무지까지 채우면 지원자에게 더 정확하게 노출됩니다.",
    body: (
      <div className="grid-2">
        <label>
          공고 제목
          <input required value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="2026 신입 백엔드 채용" />
        </label>
        <label>
          직무명
          <input required value={form.jobRole} onChange={(event) => updateField("jobRole", event.target.value)} placeholder="Backend Developer" />
        </label>
        <label>
          요구 경력
          <input value={form.extraInfo.career.value} onChange={(event) => updateExtraInfo("career", event.target.value)} placeholder="신입 이상 / 1~2년차 / 5년 이상" />
        </label>
        <label>
          근무형태
          <input value={form.extraInfo.employmentType.value} onChange={(event) => updateExtraInfo("employmentType", event.target.value)} placeholder="정규직 / 계약직 / 인턴" />
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
          <input value={form.extraInfo.location.value} onChange={(event) => updateExtraInfo("location", event.target.value)} placeholder="서울 강남구 테헤란로 123" />
        </label>
      </div>
    ),
  };

  const imagesStep = {
    key: "images",
    title: "공고 이미지",
    guide: "상단 갤러리에 노출할 이미지를 최대 5장 등록하세요. 첫 번째 이미지가 공고 목록 카드의 대표 이미지로 쓰여요.",
    body: (
      <>
        <div className="wizard-inline-action">
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
      </>
    ),
  };

  const sectionSteps = structuredJobSectionDefinitions.map((section) => ({
    key: section.key,
    title: section.title,
    guide: section.placeholder,
    body: (
      <MiniRichTextEditor
        value={form.structuredJobDescription.sections[section.key]}
        placeholder={section.placeholder}
        disabled={loading}
        onChange={(value) => updateStructuredSection(section.key, value)}
      />
    ),
  }));

  const tagsStep = {
    key: "tags",
    title: "태그",
    guide: "직무·기술 스택을 태그로 추가하면 지원자가 공고를 한눈에 이해할 수 있어요. 여러 개는 쉼표로 구분해 추가하세요.",
    body: (
      <>
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
      </>
    ),
  };

  const formSteps = [basicStep, imagesStep, ...sectionSteps, tagsStep];
  const totalForm = formSteps.length;
  const currentFormIndex = step - 1;
  const currentStep = formSteps[currentFormIndex];
  const isLast = step === totalForm;

  function goTo(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
    setMessage("");
  }

  function handleNext() {
    if (currentStep?.key === "basic" && (!form.title.trim() || !form.jobRole.trim())) {
      setMessage("공고 제목과 직무명을 입력해주세요.");
      return;
    }
    goTo(step + 1);
  }

  return (
    <section className="app-page glass-page posting-create-page posting-wizard notion">
      {phase === "intro" ? (
        <div className="wizard-intro">
          <div className="wizard-intro-copy">
            <p className="page-eyebrow">채용 관리</p>
            <h1>공고 생성</h1>
            <p className="page-sub">
              구직자가 보는 공고 그대로, 한 단계씩 채워 나가는 방식이에요. 아래 순서대로 진행한 뒤 마지막에 면접 설정까지 이어집니다.
            </p>
            <ol className="wizard-intro-steps">
              <li>
                <span className="wizard-intro-num">1</span>
                <span>
                  <strong>기본 정보</strong> 공고 제목·직무·채용 기간
                </span>
              </li>
              <li>
                <span className="wizard-intro-num">2</span>
                <span>
                  <strong>공고 이미지</strong> 대표 이미지 최대 5장
                </span>
              </li>
              <li>
                <span className="wizard-intro-num">3</span>
                <span>
                  <strong>공고 상세</strong> 포지션 상세·주요 업무·자격 요건 등
                </span>
              </li>
              <li>
                <span className="wizard-intro-num">4</span>
                <span>
                  <strong>태그</strong> 직무·기술 스택 키워드
                </span>
              </li>
              <li>
                <span className="wizard-intro-num">5</span>
                <span>
                  <strong>면접 설정</strong> 생성 후 이어서 면접을 구성해요
                </span>
              </li>
            </ol>

            <div className="wizard-intro-actions">
              <button className="btn primary" type="button" onClick={() => setPhase("choice")}>
                공고 생성하러 가기
              </button>
              <Link className="btn secondary" href="/company/recruitments">
                공고 목록
              </Link>
            </div>
          </div>
          <Image className="wizard-intro-art" src={createBanner} alt="" width={320} height={320} aria-hidden="true" priority />
        </div>
      ) : phase === "choice" ? (
        <div className="wizard-choice">
          <div className="wizard-choice-head">
            <h1>어떻게 작성할까요?</h1>
            <p className="page-sub">빈 양식에 직접 입력하거나, AI가 만든 초안에서 시작할 수 있어요. 어느 쪽이든 이후 각 단계에서 자유롭게 수정할 수 있어요.</p>
          </div>
          <div className="wizard-choice-cards">
            <button
              className="wizard-choice-card"
              type="button"
              onClick={() => {
                setEntryMode("manual");
                startForm();
              }}
            >
              <Image className="wizard-choice-art" src={choiceManual} alt="" width={200} height={200} aria-hidden="true" />
              <strong>직접 입력</strong>
              <span>빈 양식에 처음부터 직접 작성합니다.</span>
            </button>
            <button
              className="wizard-choice-card is-ai"
              type="button"
              onClick={() => {
                setEntryMode("ai");
                setPhase("ai");
              }}
            >
              <span className="wizard-choice-badge">데모용 목업</span>
              <Image className="wizard-choice-art" src={choiceAi} alt="" width={200} height={200} aria-hidden="true" />
              <strong>AI로 초안 만들기</strong>
              <span>제목·키워드를 넣으면 공고 상세 초안을 채워줍니다.</span>
            </button>
          </div>
          <div className="wizard-intro-actions">
            <button className="btn secondary" type="button" onClick={() => setPhase("intro")}>
              이전
            </button>
          </div>
        </div>
      ) : phase === "ai" ? (
        <div className="wizard-ai-phase">
          <div className="page-banner">
            <div className="page-banner-copy">
              <p className="page-eyebrow">AI 초안</p>
              <h1>AI로 초안 만들기</h1>
              <p className="page-sub">
                제목·직무와 키워드, 핵심 내용을 넣고 초안을 채운 뒤 시작하세요.
                <span className="wizard-ai-badge">데모용 목업 · 실제 AI 아님</span>
              </p>
            </div>
            <Image className="page-banner-art" src={choiceAi} alt="" width={300} height={300} aria-hidden="true" priority />
          </div>
          <div className="wizard-ai">
            <div className="grid-2">
              <label>
                공고 제목
                <input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="2026 신입 백엔드 채용" />
              </label>
              <label>
                직무명
                <input value={form.jobRole} onChange={(event) => updateField("jobRole", event.target.value)} placeholder="Backend Developer" />
              </label>
            </div>
            <label>
              키워드 (쉼표로 구분)
              <input value={aiKeywords} onChange={(event) => setAiKeywords(event.target.value)} placeholder="Node.js, MSA, 대용량 트래픽, 협업" />
            </label>
            <label>
              핵심 내용 / 한 줄 소개
              <textarea value={aiSummary} onChange={(event) => setAiSummary(event.target.value)} placeholder="어떤 팀에서 어떤 문제를 푸는 포지션인지 간단히 적어주세요." />
            </label>
            <div className="wizard-ai-actions">
              <button className="btn secondary" type="button" onClick={handleGenerateDraft}>
                ✨ AI로 초안 채우기
              </button>
              {aiFilled ? <span className="wizard-ai-done">초안이 채워졌어요. 다음에서 각 단계를 확인·수정하세요.</span> : null}
            </div>
          </div>
          <div className="wizard-nav">
            <button className="btn secondary" type="button" onClick={() => setPhase("choice")}>
              이전
            </button>
            <button className="btn primary" type="button" onClick={startForm}>
              {aiFilled ? "작성 이어가기" : "초안 없이 시작"}
            </button>
          </div>
        </div>
      ) : (
        <div className="wizard">
          <div className="page-banner">
            <div className="page-banner-copy">
              <p className="page-eyebrow">공고 작성</p>
              <h1>{entryMode === "ai" ? "AI 초안으로 작성" : "직접 입력"}</h1>
              <p className="page-sub">
                {entryMode === "ai"
                  ? "AI가 채운 초안에서 시작해, 각 단계를 확인하고 자유롭게 수정하세요."
                  : "빈 양식에 각 단계를 직접 채워 공고를 완성해요."}
              </p>
            </div>
            <Image
              className="page-banner-art"
              src={entryMode === "ai" ? choiceAi : choiceManual}
              alt=""
              width={300}
              height={300}
              aria-hidden="true"
              priority
            />
          </div>
          <div className="wizard-progress">
            <div className="wizard-progress-meta">
              <span className="wizard-progress-step">
                단계 {step} / {totalForm}
              </span>
              <span className="wizard-progress-title">{currentStep?.title}</span>
            </div>
            <div className="wizard-progress-bar" role="presentation">
              <span style={{ width: `${(step / totalForm) * 100}%` }} />
            </div>
          </div>

          <div className="wizard-stage">
            <div className={`wizard-slide ${dir > 0 ? "from-right" : "from-left"}`} key={step}>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>{currentStep?.title}</h2>
                  </div>
                </div>
                <p className="wizard-guide">
                  <span className="wizard-guide-icon" aria-hidden="true">💡</span>
                  {currentStep?.guide}
                </p>
                {currentStep?.body}
              </section>
            </div>
          </div>

          {message ? <p className="notice danger">{message}</p> : null}

          <div className="wizard-nav">
            <button className="btn secondary" type="button" onClick={() => (step > 1 ? goTo(step - 1) : setPhase("choice"))} disabled={loading}>
              이전
            </button>
            {isLast ? (
              <button className="btn primary" type="button" onClick={() => void handleCreate()} disabled={loading}>
                {loading ? "생성 중" : "생성하기"}
              </button>
            ) : (
              <button className="btn primary" type="button" onClick={handleNext} disabled={loading}>
                다음
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
