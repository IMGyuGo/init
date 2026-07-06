import type { PostingExtraInfo } from "./posting-extra-info";

export type RecruitmentCreatePhase = "intro" | "choice" | "ai" | "form" | "done";

export type RecruitmentCreateRouteState = {
  phase: RecruitmentCreatePhase;
  step: number;
};

export type BasicRecruitmentInfo = {
  title: string;
  jobRole: string;
  career: string;
  employmentType: string;
  startsOn: string;
  endsOn: string;
  location: string;
};

export const RECRUITMENT_CREATE_DRAFT_STORAGE_KEY = "init:company-recruiting:create-draft:v1";

export function normalizeRecruitmentCreateRoute(
  params: { phase?: string | null; step?: string | null },
  totalFormSteps: number,
): RecruitmentCreateRouteState {
  const phase = params.phase;
  const hasStep = Boolean(params.step);
  if (phase === "choice") {
    return { phase: "choice", step: 0 };
  }
  if (phase === "ai") {
    return { phase: "ai", step: 0 };
  }
  if (phase === "done") {
    return { phase: "done", step: 0 };
  }
  if (phase === "form" || (!phase && hasStep)) {
    return { phase: "form", step: clampStep(Number(params.step), totalFormSteps) };
  }
  return { phase: "intro", step: 0 };
}

export function buildRecruitmentCreateSearch(route: RecruitmentCreateRouteState) {
  if (route.phase === "intro") {
    return "";
  }

  const params = new URLSearchParams({ phase: route.phase });
  if (route.phase === "form") {
    params.set("step", String(clampStep(route.step, Number.MAX_SAFE_INTEGER)));
  }
  return `?${params.toString()}`;
}

export function getBasicRecruitmentInfoValidation(info: BasicRecruitmentInfo) {
  const requiredValues = [
    info.title,
    info.jobRole,
    info.career,
    info.employmentType,
    info.startsOn,
    info.endsOn,
    info.location,
  ];

  if (requiredValues.some((value) => !value.trim())) {
    return "기본 정보를 모두 입력해주세요.";
  }
  if (isRecruitmentEndDateBeforeStart(info.startsOn, info.endsOn)) {
    return "채용 마감일은 채용 시작일보다 빠를 수 없습니다.";
  }
  return null;
}

export function getBasicRecruitmentInfoFromForm(form: {
  title: string;
  jobRole: string;
  startsOn: string;
  endsOn: string;
  extraInfo: PostingExtraInfo;
}): BasicRecruitmentInfo {
  return {
    title: form.title,
    jobRole: form.jobRole,
    career: form.extraInfo.career.value,
    employmentType: form.extraInfo.employmentType.value,
    startsOn: form.startsOn,
    endsOn: form.endsOn,
    location: form.extraInfo.location.value,
  };
}

export function isRecruitmentEndDateBeforeStart(startsOn: string, endsOn: string) {
  const start = parseDateInput(startsOn);
  const end = parseDateInput(endsOn);
  return start !== null && end !== null && end < start;
}

function clampStep(value: number, totalFormSteps: number) {
  const max = Math.max(1, totalFormSteps);
  if (!Number.isInteger(value)) {
    return 1;
  }
  return Math.min(Math.max(value, 1), max);
}

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? null : time;
}
