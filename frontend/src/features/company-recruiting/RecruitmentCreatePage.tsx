"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { createRecruitment, generatePostingDraft, getAiJobStatus, uploadJobDescriptionImage } from "./api";
import {
  POSTING_CAREER_MAX_YEARS as CAREER_MAX_YEARS,
  POSTING_EMPLOYMENT_TYPE_CODE_OPTIONS as EMPLOYMENT_TYPE_CODE_OPTIONS,
  POSTING_JOB_ROLE_CODE_OPTIONS as JOB_ROLE_CODE_OPTIONS,
  POSTING_RECRUITMENT_TYPE_OPTIONS as RECRUITMENT_TYPE_OPTIONS,
  POSTING_REGION_CODE_OPTIONS as REGION_CODE_OPTIONS,
  formatCareerRangeLabel,
} from "./posting-filter-taxonomy";
import { MiniRichTextEditor } from "./MiniRichTextEditor";
import { JOB_DESCRIPTION_IMAGE_ACCEPT, validateJobDescriptionImageFile } from "./job-description-image-upload";
import {
  composeJobDescriptionWithExtraInfo,
  createEmptyPostingExtraInfo,
  postingExtraInfoToApiFields,
  type PostingExtraInfoKey,
  type PostingExtraInfo,
} from "./posting-extra-info";
import { geocodeAddress } from "../../lib/kakao-maps";
import { BackButton } from "./CompanyRecruitingChrome";
import { buildInterviewSettingsHref } from "./routes";
import { extractPostingDraftFromJob, type PostingDraftResult } from "./posting-ai-draft";
import {
  AI_DRAFT_KEYWORD_MAX_COUNT,
  AI_DRAFT_KEYWORD_MAX_LENGTH,
  aiKeywordSuggestionsFor,
  normalizeDraftKeywords,
  splitDraftKeywords,
  toggleDraftKeyword,
} from "./posting-draft-keywords";
import {
  AI_DRAFT_SUMMARY_MAX_LENGTH,
  getPostingDraftSummaryLength,
  getPostingDraftSummaryValidation,
  getPostingDraftSummaryUiState,
} from "./posting-draft-summary";
import { applyPostingDraftToFormState } from "./posting-ai-draft-form";
import {
  buildRecruitmentCreateSearch,
  getBasicRecruitmentInfoFromForm,
  getBasicRecruitmentInfoValidation,
  isRecruitmentEndDateBeforeStart,
  normalizeRecruitmentCreateRoute,
  RECRUITMENT_CREATE_DRAFT_STORAGE_KEY,
  type RecruitmentCreatePhase,
  type RecruitmentCreateRouteState,
} from "./recruitment-create-wizard";
import {
  composeStructuredJobDescription,
  createEmptyStructuredJobDescription,
  normalizeStructuredJobImageName,
  structuredJobSectionDefinitions,
  type StructuredJobDescription,
  type StructuredJobImage,
  type StructuredJobSectionKey,
} from "./structured-job-description";
import { CandidateJobDetailView } from "../candidate-application-interview/views";
import type { CandidateJobDetail } from "../candidate-application-interview/api";
import { getCompanyProfile } from "../company-profile/api";
import { getCompanyDisplayName, getCompanyLogoUrl } from "../company-profile/company-profile-display";
import type { CompanyProfile } from "../company-profile/types";
import createBanner from "./assets/create-banner.png";
import choiceManual from "./assets/choice-manual.png";
import choiceAi from "./assets/choice-ai.png";

const MAX_GALLERY_IMAGES = 5;
const AI_DRAFT_MAX_POLL_ATTEMPTS = 20;
const AI_DRAFT_POLL_INTERVAL_MS = 1000;

// 다음(카카오) 우편번호 서비스 — API 키 불필요, 클라이언트 팝업. (#270 회사 위치 주소 검색)
const DAUM_POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

interface DaumPostcodeData {
  roadAddress: string;
  jibunAddress: string;
  zonecode: string;
}
interface DaumPostcodeInstance {
  open: () => void;
}
interface DaumPostcodeConstructor {
  new (options: { oncomplete: (data: DaumPostcodeData) => void }): DaumPostcodeInstance;
}
declare global {
  interface Window {
    daum?: { Postcode: DaumPostcodeConstructor };
  }
}

function loadDaumPostcode(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("window unavailable"));
      return;
    }
    if (window.daum?.Postcode) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DAUM_POSTCODE_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("postcode load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = DAUM_POSTCODE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("postcode load failed"));
    document.body.appendChild(script);
  });
}

type FormState = {
  title: string;
  jobRole: string;
  startsOn: string;
  endsOn: string;
  // 지원자 필터용 구조화 선택 값(한글 코드).
  jobRoleCode: string;
  regionCode: string;
  careerMinYears: number;
  careerMaxYears: number;
  employmentTypeCode: string;
  recruitmentType: string;
  // 회사 위치 도로명 주소(우편번호 검색으로 채움) + 위경도(지도 SDK geocoder 로 변환).
  workplaceAddress: string;
  workplaceLat: number | null;
  workplaceLng: number | null;
  extraInfo: PostingExtraInfo;
  structuredJobDescription: StructuredJobDescription;
};

type RecruitmentCreateDraft = {
  form: FormState;
  aiKeywords: string;
  aiSummary: string;
  aiFilled: boolean;
  entryMode: "manual" | "ai";
};

function createInitialForm(): FormState {
  return {
    title: "",
    jobRole: "",
    startsOn: "",
    endsOn: "",
    jobRoleCode: "",
    regionCode: "",
    careerMinYears: 0,
    careerMaxYears: CAREER_MAX_YEARS,
    employmentTypeCode: "",
    recruitmentType: "",
    workplaceAddress: "",
    workplaceLat: null,
    workplaceLng: null,
    // 경력 기본값(신입~상한)은 "경력무관" 라벨로 채워 기본 정보 검증을 통과시킨다.
    extraInfo: {
      ...createEmptyPostingExtraInfo(),
      career: { enabled: true, value: formatCareerRangeLabel(0, CAREER_MAX_YEARS) },
    },
    structuredJobDescription: createEmptyStructuredJobDescription(),
  };
}

// 생성 폼 데이터를 지원자 공고 상세 뷰(CandidateJobDetailView)가 그대로 렌더할 수 있는
// 형태로 변환한다. jobDescription 은 실제 생성 시와 동일한 방식으로 조립해 화면을 일치시킨다.
function buildRecruitmentPreviewJob(form: FormState, companyName: string, companyLogoUrl: string | null): CandidateJobDetail {
  const structuredJobDescription = {
    ...form.structuredJobDescription,
    locationNote: form.extraInfo.location.value.trim(),
  };
  const structuredHtml = composeStructuredJobDescription("", structuredJobDescription);
  const jobDescription = composeJobDescriptionWithExtraInfo(structuredHtml, form.extraInfo);
  const tags = form.structuredJobDescription.tags;

  return {
    jobId: 0,
    companyName,
    companyLogoUrl,
    title: form.title || "(제목 미입력)",
    jobGroup: "",
    jobRole: form.jobRole,
    location: form.extraInfo.location.value,
    careerLevel: form.extraInfo.career.value,
    employmentType: form.extraInfo.employmentType.value,
    tags,
    postingStatus: "OPEN",
    startsOn: form.startsOn,
    endsOn: form.endsOn,
    canApply: false,
    alreadyApplied: false,
    companyId: 0,
    isPublic: false,
    companyIndustry: "",
    companyProfile: "",
    jobDescription,
    techStacks: tags,
    createdAt: new Date().toISOString(),
    jobRoleCode: form.jobRoleCode || null,
    workplaceAddress: form.workplaceAddress || null,
    workplaceLat: form.workplaceLat,
    workplaceLng: form.workplaceLng,
  };
}

function mergeStoredForm(stored: Partial<FormState>): FormState {
  const initial = createInitialForm();
  const structured = stored.structuredJobDescription ?? initial.structuredJobDescription;

  return {
    ...initial,
    ...stored,
    extraInfo: {
      ...initial.extraInfo,
      ...(stored.extraInfo ?? {}),
    },
    structuredJobDescription: {
      ...initial.structuredJobDescription,
      ...structured,
      sections: {
        ...initial.structuredJobDescription.sections,
        ...(structured.sections ?? {}),
      },
      gallery: Array.isArray(structured.gallery) ? structured.gallery : [],
      tags: Array.isArray(structured.tags) ? structured.tags : [],
    },
  };
}

// 요구 경력 듀얼 핸들 range 슬라이더. 최소/최대 select 2개를 대체한다. (#290)
function CareerRangeSlider({
  minYears,
  maxYears,
  onChange,
}: {
  minYears: number;
  maxYears: number;
  onChange: (nextMin: number, nextMax: number) => void;
}) {
  const percent = (value: number) => (value / CAREER_MAX_YEARS) * 100;
  // 두 핸들이 상한에 겹치면 min 핸들을 위로 올려 아래로 끌 수 있게 한다.
  const minOnTop = minYears === maxYears && minYears === CAREER_MAX_YEARS;
  return (
    <div className="pcs">
      <div className="pcs-value" aria-live="polite">
        {formatCareerRangeLabel(minYears, maxYears)}
      </div>
      <div className="pcs-track-wrap">
        <div className="pcs-track" aria-hidden="true" />
        <div
          className="pcs-fill"
          aria-hidden="true"
          style={{ left: `${percent(minYears)}%`, width: `${percent(maxYears) - percent(minYears)}%` }}
        />
        <input
          type="range"
          className={`pcs-input${minOnTop ? " is-top" : ""}`}
          min={0}
          max={CAREER_MAX_YEARS}
          step={1}
          value={minYears}
          aria-label="최소 경력"
          aria-valuetext={minYears === 0 ? "신입" : `${minYears}년`}
          onChange={(event) => {
            const next = Math.min(Number(event.target.value), maxYears);
            onChange(next, maxYears);
          }}
        />
        <input
          type="range"
          className="pcs-input is-max"
          min={0}
          max={CAREER_MAX_YEARS}
          step={1}
          value={maxYears}
          aria-label="최대 경력"
          aria-valuetext={maxYears >= CAREER_MAX_YEARS ? `${CAREER_MAX_YEARS}년 이상` : `${maxYears}년`}
          onChange={(event) => {
            const next = Math.max(Number(event.target.value), minYears);
            onChange(minYears, next);
          }}
        />
      </div>
      <div className="pcs-scale" aria-hidden="true">
        <span>신입</span>
        <span>{CAREER_MAX_YEARS}년</span>
      </div>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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
  const stepRef = useRef(0);
  const [draftReady, setDraftReady] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [aiKeywords, setAiKeywords] = useState("");
  const selectedDraftKeywords = splitDraftKeywords(aiKeywords);
  // 직접 입력 초과분은 요청 직전 정규화로 잘리므로, 조용히 사라지지 않게 입력 단계에서 경고를 노출한다. (#290 리뷰)
  const draftKeywordCountOver = selectedDraftKeywords.length > AI_DRAFT_KEYWORD_MAX_COUNT;
  const draftKeywordTooLong = selectedDraftKeywords.some((keyword) => keyword.length > AI_DRAFT_KEYWORD_MAX_LENGTH);
  const draftKeywordWarning = draftKeywordCountOver
    ? `키워드는 최대 ${AI_DRAFT_KEYWORD_MAX_COUNT}개까지만 저장돼요. 초과한 ${selectedDraftKeywords.length - AI_DRAFT_KEYWORD_MAX_COUNT}개는 생성 시 제외됩니다.`
    : draftKeywordTooLong
      ? `${AI_DRAFT_KEYWORD_MAX_LENGTH}자를 넘는 키워드는 생성 시 ${AI_DRAFT_KEYWORD_MAX_LENGTH}자까지만 저장돼요.`
      : "";
  const [aiSummary, setAiSummary] = useState("");
  const aiSummaryLength = getPostingDraftSummaryLength(aiSummary);
  const aiSummaryValidation = getPostingDraftSummaryValidation(aiSummary);
  const [aiFilled, setAiFilled] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraftMessage, setAiDraftMessage] = useState("");
  const [pendingPostingDraft, setPendingPostingDraft] = useState<PostingDraftResult | null>(null);
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false);
  const [postingPreviewOpen, setPostingPreviewOpen] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [phase, setPhase] = useState<RecruitmentCreatePhase>("intro");
  const [entryMode, setEntryMode] = useState<"manual" | "ai">("manual");
  const [createdRecruitmentId, setCreatedRecruitmentId] = useState<number | null>(null);
  const aiSummaryUiState = getPostingDraftSummaryUiState(
    aiSummaryValidation,
    aiDraftMessage,
    aiGenerating,
  );

  // 미리보기 모달에 실제 회사명·로고를 표시하기 위해 회사 프로필을 로드한다.
  useEffect(() => {
    let active = true;
    getCompanyProfile()
      .then((profile) => { if (active) setCompanyProfile(profile); })
      .catch(() => { if (active) setCompanyProfile(null); });
    return () => { active = false; };
  }, []);

  function startForm() {
    navigateWizard({ phase: "form", step: 1 });
  }

  async function handleGenerateDraft() {
    if (!form.title.trim() || !form.jobRole.trim()) {
      setAiDraftMessage("공고 제목과 직무명을 먼저 입력해주세요.");
      return;
    }
    if (aiSummaryValidation) {
      return;
    }

    setAiGenerating(true);
    setPendingPostingDraft(null);
    setDraftPreviewOpen(false);
    setAiDraftMessage("AI 초안 생성을 요청하고 있어요.");
    try {
      const requested = await generatePostingDraft({
        title: form.title,
        jobRole: form.jobRole,
        keywords: normalizeDraftKeywords(aiKeywords),
        summary: aiSummary || undefined,
        careerRequirement: form.extraInfo.career.value || undefined,
        employmentType: form.extraInfo.employmentType.value || undefined,
        workLocation: form.extraInfo.location.value || undefined,
      });
      const completed = await waitForPostingDraft(requested.data.processLogId);
      const draft = extractPostingDraftFromJob(completed);
      if (!draft) {
        throw new Error("AI 초안 결과를 읽을 수 없습니다.");
      }
      setPendingPostingDraft(draft);
      setDraftPreviewOpen(true);
      setAiDraftMessage("초안이 준비됐어요. 모달에서 확인한 뒤 적용하세요.");
    } catch (error) {
      setDraftPreviewOpen(false);
      setAiDraftMessage(error instanceof Error ? error.message : "AI 초안 생성에 실패했습니다.");
    } finally {
      setAiGenerating(false);
    }
  }

  async function waitForPostingDraft(processLogId: number) {
    for (let attempt = 0; attempt < AI_DRAFT_MAX_POLL_ATTEMPTS; attempt += 1) {
      const result = await getAiJobStatus(processLogId);
      if (result.data.status === "COMPLETED") {
        return result.data;
      }
      if (result.data.status === "FAILED") {
        const reason = result.data.failure?.reason || "AI 초안 생성에 실패했습니다.";
        throw new Error(reason);
      }
      await delay(AI_DRAFT_POLL_INTERVAL_MS);
    }
    throw new Error("AI 초안 생성 시간이 길어지고 있습니다. 잠시 후 다시 시도해주세요.");
  }

  function applyPendingDraft() {
    if (!pendingPostingDraft) return;
    setForm((current) => applyPostingDraftToFormState(current, pendingPostingDraft));
    setDraftPreviewOpen(false);
    setPendingPostingDraft(null);
    setAiDraftMessage("초안이 적용됐어요. 기본 정보부터 확인하세요.");
    setAiFilled(true);
    setEntryMode("ai");
    navigateWizard({ phase: "form", step: 1 });
  }

  function closeDraftPreview() {
    setDraftPreviewOpen(false);
  }

  async function handleCreate() {
    const basicValidation = getBasicRecruitmentInfoValidation(getBasicRecruitmentInfoFromForm(form));
    if (basicValidation) {
      navigateWizard({ phase: "form", step: 1 });
      setMessage(basicValidation);
      return;
    }

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
      // 좌표 변환이 아직 끝나지 않았으면(주소만 있고 좌표 없음) 제출 시점에 동기로 변환해 누락을 막는다.
      let workplaceLat = form.workplaceLat;
      let workplaceLng = form.workplaceLng;
      if (form.workplaceAddress && (workplaceLat === null || workplaceLng === null)) {
        const coords = await geocodeAddress(form.workplaceAddress);
        if (coords) {
          workplaceLat = coords.lat;
          workplaceLng = coords.lng;
        }
      }
      const result = await createRecruitment({
        title: form.title,
        jobRole: form.jobRole,
        startsOn: form.startsOn || undefined,
        endsOn: form.endsOn || undefined,
        status: "DRAFT",
        jobDescription: jobDescription || undefined,
        ...extraInfoFields,
        jobRoleCode: form.jobRoleCode || undefined,
        regionCode: form.regionCode || undefined,
        careerMinYears: form.careerMinYears,
        careerMaxYears: form.careerMaxYears,
        employmentTypeCode: form.employmentTypeCode || undefined,
        recruitmentType: (form.recruitmentType || undefined) as "상시" | "마감형" | undefined,
        workplaceAddress: form.workplaceAddress || undefined,
        workplaceLat: workplaceLat ?? undefined,
        workplaceLng: workplaceLng ?? undefined,
      });
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(RECRUITMENT_CREATE_DRAFT_STORAGE_KEY);
      }
      setCreatedRecruitmentId(result.data.recruitmentId);
      navigateWizard({ phase: "done", step: 0 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공고 생성에 실패했습니다.");
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

  // AI 초안 선택 입력: 추천 키워드 칩 토글. aiKeywords 문자열(CSV)이 단일 소스다. (#290)
  function toggleAiKeyword(keyword: string) {
    setAiKeywords((current) => toggleDraftKeyword(current, keyword));
  }

  // 다음 우편번호 팝업으로 회사 위치(도로명 주소)를 검색해 채운다.
  async function handleWorkplaceAddressSearch() {
    try {
      await loadDaumPostcode();
      if (!window.daum?.Postcode) {
        throw new Error("postcode unavailable");
      }
      new window.daum.Postcode({
        oncomplete: (data) => {
          const address = data.roadAddress || data.jibunAddress;
          // 주소를 먼저 채우고, 지도 SDK(키가 있으면)로 좌표를 변환해 채운다. 키 없으면 좌표는 null 유지.
          setForm((current) => ({ ...current, workplaceAddress: address, workplaceLat: null, workplaceLng: null }));
          void geocodeAddress(address).then((coords) => {
            if (coords) {
              setForm((current) =>
                current.workplaceAddress === address
                  ? { ...current, workplaceLat: coords.lat, workplaceLng: coords.lng }
                  : current,
              );
            }
          });
        },
      }).open();
    } catch {
      setMessage("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
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

  function updateStartsOn(value: string) {
    setForm((current) => ({
      ...current,
      startsOn: value,
      endsOn: current.endsOn && isRecruitmentEndDateBeforeStart(value, current.endsOn) ? "" : current.endsOn,
    }));
  }

  function updateEndsOn(value: string) {
    if (isRecruitmentEndDateBeforeStart(form.startsOn, value)) {
      setMessage("채용 마감일은 채용 시작일보다 빠를 수 없습니다.");
      updateField("endsOn", "");
      return;
    }
    setMessage("");
    updateField("endsOn", value);
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
    guide: "공고 제목, 직무, 경력, 근무형태, 지역, 채용 기간을 선택하면 지원자 검색 필터에도 그대로 반영됩니다.",
    body: (
      <div className="grid-2">
        <label className="wide">
          공고 제목
          <input required value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="2026 신입 백엔드 채용" />
        </label>
        <label>
          직무
          <select required value={form.jobRoleCode} onChange={(event) => updateJobRoleSelection(event.target.value)}>
            <option value="" disabled>
              직무를 선택하세요
            </option>
            {JOB_ROLE_CODE_OPTIONS.map((option) => (
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
            {REGION_CODE_OPTIONS.map((option) => (
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
            {EMPLOYMENT_TYPE_CODE_OPTIONS.map((option) => (
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
            {RECRUITMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="wide pcs-field">
          <span className="pcs-label">요구 경력</span>
          <CareerRangeSlider
            minYears={form.careerMinYears}
            maxYears={form.careerMaxYears}
            onChange={updateCareerRange}
          />
        </div>
        <label>
          채용 시작일
          <input required type="date" value={form.startsOn} onChange={(event) => updateStartsOn(event.target.value)} />
        </label>
        <label>
          채용 마감일
          <input required type="date" min={form.startsOn || undefined} value={form.endsOn} onChange={(event) => updateEndsOn(event.target.value)} />
        </label>
        <label className="wide">
          회사 위치
          <div className="address-search-row">
            <input
              readOnly
              value={form.workplaceAddress}
              placeholder="주소 검색 버튼을 눌러 도로명 주소를 선택하세요"
              onClick={() => void handleWorkplaceAddressSearch()}
            />
            <button className="btn secondary" type="button" onClick={() => void handleWorkplaceAddressSearch()}>
              주소 검색
            </button>
          </div>
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
                {index === 0 ? <span className="gallery-cover-badge">대표 이미지</span> : null}
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
  const pendingDraftSections = pendingPostingDraft
    ? structuredJobSectionDefinitions.filter((section) => pendingPostingDraft.sections[section.key]?.trim())
    : [];
  const visibleAiDraftMessage = aiSummaryUiState.visibleDraftMessage ?? "";
  const isAiDraftMessageError =
    visibleAiDraftMessage.includes("입력") ||
    visibleAiDraftMessage.includes("최대") ||
    visibleAiDraftMessage.includes("실패") ||
    visibleAiDraftMessage.includes("없습니다") ||
    visibleAiDraftMessage.includes("길어지고");

  const writeWizardHistory = useCallback((route: RecruitmentCreateRouteState) => {
    if (typeof window === "undefined") {
      return;
    }

    const nextHref = `${window.location.pathname}${buildRecruitmentCreateSearch(route)}`;
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (nextHref !== currentHref) {
      window.history.pushState({ initRecruitmentCreateWizard: route }, "", nextHref);
    }
  }, []);

  const applyWizardRoute = useCallback((route: RecruitmentCreateRouteState, options: { writeHistory?: boolean } = {}) => {
    const nextStep = route.phase === "form" ? route.step : 0;
    setDir(nextStep >= stepRef.current ? 1 : -1);
    setStep(nextStep);
    stepRef.current = nextStep;
    setPhase(route.phase);
    setMessage("");

    if (options.writeHistory) {
      writeWizardHistory(route);
    }
  }, [writeWizardHistory]);

  const navigateWizard = useCallback((route: RecruitmentCreateRouteState) => {
    applyWizardRoute(route, { writeHistory: true });
  }, [applyWizardRoute]);

  function goTo(next: number) {
    navigateWizard({ phase: "form", step: next });
  }

  function handleNext() {
    if (currentStep?.key === "basic") {
      const basicValidation = getBasicRecruitmentInfoValidation(getBasicRecruitmentInfoFromForm(form));
      if (basicValidation) {
        setMessage(basicValidation);
        return;
      }
    }
    goTo(step + 1);
  }

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.sessionStorage.getItem(RECRUITMENT_CREATE_DRAFT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<RecruitmentCreateDraft>;
        if (parsed.form) {
          setForm(mergeStoredForm(parsed.form));
        }
        if (typeof parsed.aiKeywords === "string") setAiKeywords(parsed.aiKeywords);
        if (typeof parsed.aiSummary === "string") setAiSummary(parsed.aiSummary);
        if (typeof parsed.aiFilled === "boolean") setAiFilled(parsed.aiFilled);
        if (parsed.entryMode === "manual" || parsed.entryMode === "ai") setEntryMode(parsed.entryMode);
      } catch {
        window.sessionStorage.removeItem(RECRUITMENT_CREATE_DRAFT_STORAGE_KEY);
      }
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !draftReady) {
      return;
    }

    const draft: RecruitmentCreateDraft = {
      form,
      aiKeywords,
      aiSummary,
      aiFilled,
      entryMode,
    };
    window.sessionStorage.setItem(RECRUITMENT_CREATE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [aiFilled, aiKeywords, aiSummary, draftReady, entryMode, form]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      applyWizardRoute(
        normalizeRecruitmentCreateRoute(
          {
            phase: params.get("phase"),
            step: params.get("step"),
          },
          totalForm,
        ),
      );
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [applyWizardRoute, totalForm]);

  return (
    <section className="app-page glass-page posting-create-page posting-wizard notion">
      {phase === "intro" ? (
        <div className="wizard-intro">
          <div className="wizard-intro-copy">
            <div className="page-head-lead">
              <BackButton fallbackHref="/company/recruitments" />
            </div>
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
              <button className="btn primary" type="button" onClick={() => navigateWizard({ phase: "choice", step: 0 })}>
                공고 생성하러 가기
              </button>
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
                navigateWizard({ phase: "ai", step: 0 });
              }}
            >
              <span className="wizard-choice-badge">AI 초안</span>
              <Image className="wizard-choice-art" src={choiceAi} alt="" width={200} height={200} aria-hidden="true" />
              <strong><span className="ai-grad-text">AI</span>로 초안 만들기</strong>
              <span>제목·키워드를 넣으면 공고 상세 초안을 채워줍니다.</span>
            </button>
          </div>
          <div className="wizard-intro-actions">
            <button className="btn secondary" type="button" onClick={() => navigateWizard({ phase: "intro", step: 0 })}>
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
                <span className="wizard-ai-badge">검토 후 적용</span>
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
                직무
                <select value={form.jobRoleCode} onChange={(event) => updateJobRoleSelection(event.target.value)}>
                  <option value="" disabled>
                    직무를 선택하세요
                  </option>
                  {JOB_ROLE_CODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="wizard-ai-field">
              <span className="wizard-ai-field-label">요구 경력</span>
              <CareerRangeSlider
                minYears={form.careerMinYears}
                maxYears={form.careerMaxYears}
                onChange={updateCareerRange}
              />
            </div>
            <div className="wizard-ai-selects">
              <label>
                근무 형태
                <select
                  value={form.employmentTypeCode}
                  onChange={(event) => updateStructuredWithExtraInfo("employmentTypeCode", "employmentType", event.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {EMPLOYMENT_TYPE_CODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                근무 지역
                <select
                  value={form.regionCode}
                  onChange={(event) => updateStructuredWithExtraInfo("regionCode", "location", event.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {REGION_CODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="wizard-ai-field">
              <span className="wizard-ai-field-label">
                추천 키워드
                <em className={draftKeywordCountOver ? "is-error" : undefined}>
                  {form.jobRoleCode
                    ? `${selectedDraftKeywords.length}/${AI_DRAFT_KEYWORD_MAX_COUNT}개 선택`
                    : "직무를 선택하면 직무별 추천이 나와요"}
                </em>
              </span>
              <div className="wizard-ai-chips">
                {aiKeywordSuggestionsFor(form.jobRoleCode).map((keyword) => {
                  const selected = selectedDraftKeywords.includes(keyword);
                  const atCap = selectedDraftKeywords.length >= AI_DRAFT_KEYWORD_MAX_COUNT;
                  return (
                    <button
                      key={keyword}
                      type="button"
                      className={`wizard-ai-chip${selected ? " is-selected" : ""}`}
                      aria-pressed={selected}
                      disabled={!selected && atCap}
                      onClick={() => toggleAiKeyword(keyword)}
                    >
                      {keyword}
                    </button>
                  );
                })}
              </div>
            </div>
            <label>
              키워드 직접 추가 (쉼표로 구분)
              <input value={aiKeywords} onChange={(event) => setAiKeywords(event.target.value)} placeholder="선택한 키워드에 원하는 키워드를 더할 수 있어요" />
              {draftKeywordWarning ? (
                <span className="wizard-ai-hint is-error" aria-live="polite">{draftKeywordWarning}</span>
              ) : (
                <span className="wizard-ai-hint">최대 {AI_DRAFT_KEYWORD_MAX_COUNT}개 · 키워드당 {AI_DRAFT_KEYWORD_MAX_LENGTH}자까지 입력할 수 있어요</span>
              )}
            </label>
            <label>
              핵심 내용 / 한 줄 소개
              <textarea
                value={aiSummary}
                onChange={(event) => setAiSummary(event.target.value)}
                placeholder="어떤 팀에서 어떤 문제를 푸는 포지션인지 간단히 적어주세요."
                aria-invalid={Boolean(aiSummaryValidation)}
                aria-describedby="ai-draft-summary-limit"
              />
              <span
                id="ai-draft-summary-limit"
                className={`wizard-ai-hint${aiSummaryValidation ? " is-error" : ""}`}
                aria-live="polite"
              >
                {aiSummaryValidation ?? `최대 ${AI_DRAFT_SUMMARY_MAX_LENGTH.toLocaleString("ko-KR")}자 · 현재 ${aiSummaryLength.toLocaleString("ko-KR")}자`}
              </span>
            </label>
            <div className="wizard-ai-actions">
              {visibleAiDraftMessage ? (
                <span className={`wizard-ai-status${isAiDraftMessageError ? " is-error" : ""}`} aria-live="polite">
                  {visibleAiDraftMessage}
                </span>
              ) : null}
            </div>
          </div>
          <div className="wizard-nav">
            <button className="btn secondary" type="button" onClick={() => navigateWizard({ phase: "choice", step: 0 })}>
              이전
            </button>
            <div className="wizard-nav-actions">
              {pendingPostingDraft ? (
                <button className="btn secondary" type="button" onClick={() => setDraftPreviewOpen(true)}>
                  미리보기 다시 열기
                </button>
              ) : null}
              <button
                className={`btn primary${aiGenerating ? " is-loading" : ""}`}
                type="button"
                onClick={() => void handleGenerateDraft()}
                disabled={aiSummaryUiState.generateDisabled}
                aria-busy={aiGenerating}
              >
                {aiGenerating ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    초안 생성 중
                  </>
                ) : (
                  "AI로 초안 만들기"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : phase === "done" ? (
        <div className="wizard-done">
          <div className="wizard-done-icon" aria-hidden="true">✓</div>
          <h1>공고가 생성되었어요</h1>
          <p className="page-sub">
            이제 이 공고의 <strong>면접을 설정</strong>할 차례예요. 평가 기준·질문·면접 시간을 정하면
            지원자가 AI 인터뷰를 볼 수 있어요.
          </p>
          <div className="wizard-done-actions">
            <button
              className="btn primary lg"
              type="button"
              onClick={() => {
                if (createdRecruitmentId !== null) {
                  router.push(buildInterviewSettingsHref(createdRecruitmentId));
                }
              }}
              disabled={createdRecruitmentId === null}
            >
              면접 설정하기
            </button>
            <Link className="btn secondary lg" href="/company/recruitments">
              나중에 하기
            </Link>
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
            <button className="btn secondary" type="button" onClick={() => (step > 1 ? goTo(step - 1) : navigateWizard({ phase: "choice", step: 0 }))} disabled={loading}>
              이전
            </button>
            {isLast ? (
              <div className="wizard-nav-final">
                <button className="btn secondary" type="button" onClick={() => setPostingPreviewOpen(true)} disabled={loading}>
                  미리보기
                </button>
                <button className="btn primary" type="button" onClick={() => void handleCreate()} disabled={loading}>
                  {loading ? "생성 중" : "생성하기"}
                </button>
              </div>
            ) : (
              <button className="btn primary" type="button" onClick={handleNext} disabled={loading}>
                다음
              </button>
            )}
          </div>
        </div>
      )}
      {draftPreviewOpen && pendingPostingDraft ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal wide-modal posting-draft-modal" role="dialog" aria-modal="true" aria-labelledby="posting-draft-preview-title">
            <div className="modal-head">
              <div>
                <p className="page-eyebrow">AI 초안 미리보기</p>
                <h2 id="posting-draft-preview-title">생성된 공고 초안</h2>
                <p>전체 내용을 확인한 뒤 적용하면 기본 정보 단계부터 이어서 작성합니다.</p>
              </div>
              <button className="modal-close" type="button" onClick={closeDraftPreview} aria-label="초안 미리보기 닫기">
                ×
              </button>
            </div>
            <div className="posting-draft-summary">
              <div>
                <span>공고 제목</span>
                <strong>{pendingPostingDraft.title}</strong>
              </div>
              <div>
                <span>직무명</span>
                <strong>{pendingPostingDraft.jobRole}</strong>
              </div>
              {pendingPostingDraft.tags.length > 0 ? (
                <div className="posting-draft-tags">
                  <span>태그</span>
                  <div>
                    {pendingPostingDraft.tags.map((tag) => (
                      <em key={tag}>{tag}</em>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {pendingDraftSections.length > 0 ? (
              <div className="posting-draft-section-list">
                {pendingDraftSections.map((section) => (
                  <section className="posting-draft-section" key={section.key}>
                    <h3>{section.title}</h3>
                    <div className="wanted-rich-content" dangerouslySetInnerHTML={{ __html: pendingPostingDraft.sections[section.key] ?? "" }} />
                  </section>
                ))}
              </div>
            ) : (
              <div className="empty">생성된 상세 섹션이 없습니다.</div>
            )}
            <div className="modal-actions">
              <button className="btn secondary" type="button" onClick={closeDraftPreview}>
                다시 수정
              </button>
              <button className="btn primary" type="button" onClick={applyPendingDraft}>
                적용하기
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {postingPreviewOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setPostingPreviewOpen(false); }}>
          <div className="modal wide-modal posting-preview-modal" role="dialog" aria-modal="true" aria-labelledby="posting-preview-title">
            <div className="modal-head">
              <div>
                <p className="page-eyebrow">미리보기</p>
                <h2 id="posting-preview-title">지원자에게 보이는 공고</h2>
                <p>지원자 화면과 동일하게 표시됩니다. 지원 버튼은 미리보기에서 동작하지 않아요.</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setPostingPreviewOpen(false)} aria-label="미리보기 닫기">
                ×
              </button>
            </div>
            <div className="posting-preview-body">
              <CandidateJobDetailView job={buildRecruitmentPreviewJob(form, getCompanyDisplayName(companyProfile) || "우리 회사", getCompanyLogoUrl(companyProfile))} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
