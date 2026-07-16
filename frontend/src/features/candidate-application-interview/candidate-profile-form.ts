import type {
  CandidateActivity,
  CandidateCareer,
  CandidateCredential,
  CandidateEducation,
  CandidateProfileSnapshotV1,
  CandidateProfileView,
  UpdateCandidateProfileRequest,
} from "./api";

type WithKey<T> = Omit<T, "major" | "endMonth" | "department" | "position" | "endDate" | "result"> & {
  key: string;
  major?: string;
  endMonth?: string;
  department?: string;
  position?: string;
  endDate?: string;
  result?: string;
};

export type ProfileSection = "educations" | "careers" | "activities" | "credentials";
export type EducationFormItem = WithKey<CandidateEducation>;
export type CareerFormItem = WithKey<CandidateCareer>;
export type ActivityFormItem = WithKey<CandidateActivity>;
export type CredentialFormItem = WithKey<CandidateCredential>;

export interface CandidateProfileFormState {
  name: string;
  email: string;
  phone: string;
  githubUrl: string;
  blogUrl: string;
  portfolioUrl: string;
  summary: string;
  coverLetter: string;
  educations: EducationFormItem[];
  careers: CareerFormItem[];
  activities: ActivityFormItem[];
  credentials: CredentialFormItem[];
}

export interface ProfileFormError {
  section: "basic" | ProfileSection;
  field: string;
  message: string;
}

let nextKey = 0;
const keyOf = (prefix: string) => `${prefix}-${++nextKey}`;
const text = (value: string | null | undefined) => value ?? "";
const nullable = (value: string) => value.trim() || null;

export const profileDateInputBounds = {
  month: { min: "1900-01", max: "9999-12" },
  date: { min: "1900-01-01", max: "9999-12-31" },
} as const;

export function isSupportedProfileDateInput(value: string, type: keyof typeof profileDateInputBounds): boolean {
  if (!value) return true;
  const pattern = type === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  return pattern.test(value) && value >= profileDateInputBounds[type].min && value <= profileDateInputBounds[type].max;
}

export function getAccordionIndicator(open: boolean): "▲" | "▼" {
  return open ? "▲" : "▼";
}

export function createProfileFormState(profile: CandidateProfileView): CandidateProfileFormState {
  return {
    name: profile.name ?? "",
    email: profile.email,
    phone: text(profile.phone),
    githubUrl: text(profile.githubUrl),
    blogUrl: text(profile.blogUrl),
    portfolioUrl: text(profile.portfolioUrl),
    summary: text(profile.summary),
    coverLetter: text(profile.coverLetter),
    educations: profile.educations.map((item) => ({ ...item, key: keyOf("education"), major: text(item.major), endMonth: text(item.endMonth) })),
    careers: profile.careers.map((item) => ({ ...item, key: keyOf("career"), endMonth: text(item.endMonth), department: text(item.department), position: text(item.position) })),
    activities: profile.activities.map((item) => ({ ...item, key: keyOf("activity"), endDate: text(item.endDate) })),
    credentials: profile.credentials.map((item) => ({ ...item, key: keyOf("credential"), result: text(item.result) })),
  };
}

export function createEmptyProfileForm(): CandidateProfileFormState {
  return createProfileFormState({
    name: "", email: "", phone: null, githubUrl: null, blogUrl: null, portfolioUrl: null, summary: null, coverLetter: null,
    educations: [], careers: [], activities: [], credentials: [],
  });
}

export const newEducation = (): EducationFormItem => ({
  key: keyOf("education"), educationLevel: "UNIVERSITY", schoolName: "", major: "", degreeType: "BACHELOR",
  status: "GRADUATED", startMonth: "", endMonth: "",
});
export const newCareer = (): CareerFormItem => ({
  key: keyOf("career"), companyName: "", startMonth: "", endMonth: "", isCurrent: false, jobRole: "",
  department: "", position: "", responsibilities: "",
});
export const newActivity = (): ActivityFormItem => ({
  key: keyOf("activity"), activityType: "PROJECT_TASK", organizationName: "", startDate: "", endDate: "",
  isOngoing: false, description: "",
});
export const newCredential = (): CredentialFormItem => ({
  key: keyOf("credential"), credentialType: "CERTIFICATE", name: "", issuer: "", acquiredMonth: "", result: "",
});

export function appendProfileSnapshotItem(
  snapshot: CandidateProfileSnapshotV1,
  section: ProfileSection,
): CandidateProfileSnapshotV1 {
  if (snapshot[section].length >= 10) return snapshot;
  if (section === "educations") {
    return {
      ...snapshot,
      educations: [...snapshot.educations, {
        educationLevel: "UNIVERSITY",
        schoolName: "",
        major: null,
        degreeType: "BACHELOR",
        status: "GRADUATED",
        startMonth: "",
        endMonth: "",
      }],
    };
  }
  if (section === "careers") {
    return {
      ...snapshot,
      careers: [...snapshot.careers, {
        companyName: "",
        startMonth: "",
        endMonth: "",
        isCurrent: false,
        jobRole: "",
        department: null,
        position: null,
        responsibilities: "",
      }],
    };
  }
  if (section === "activities") {
    return {
      ...snapshot,
      activities: [...snapshot.activities, {
        activityType: "PROJECT_TASK",
        organizationName: "",
        startDate: "",
        endDate: "",
        isOngoing: false,
        description: "",
      }],
    };
  }
  return {
    ...snapshot,
    credentials: [...snapshot.credentials, {
      credentialType: "CERTIFICATE",
      name: "",
      issuer: "",
      acquiredMonth: "",
      result: null,
    }],
  };
}

export function serializeProfileForm(form: CandidateProfileFormState): UpdateCandidateProfileRequest {
  return {
    name: form.name.trim(),
    phone: nullable(form.phone),
    githubUrl: nullable(form.githubUrl),
    blogUrl: nullable(form.blogUrl),
    portfolioUrl: nullable(form.portfolioUrl),
    summary: nullable(form.summary),
    coverLetter: nullable(form.coverLetter),
    educations: form.educations.map((entry) => { const { key, ...item } = entry; void key; return { ...item, schoolName: item.schoolName.trim(), major: nullable(item.major ?? ""), endMonth: nullable(item.endMonth ?? "") }; }),
    careers: form.careers.map((entry) => { const { key, ...item } = entry; void key; return { ...item, companyName: item.companyName.trim(), jobRole: item.jobRole.trim(), department: nullable(item.department ?? ""), position: nullable(item.position ?? ""), responsibilities: item.responsibilities.trim(), endMonth: item.isCurrent ? null : nullable(item.endMonth ?? "") }; }),
    activities: form.activities.map((entry) => { const { key, ...item } = entry; void key; return { ...item, organizationName: item.organizationName.trim(), description: item.description.trim(), endDate: item.isOngoing ? null : nullable(item.endDate ?? "") }; }),
    credentials: form.credentials.map((entry) => { const { key, ...item } = entry; void key; return { ...item, name: item.name.trim(), issuer: item.issuer.trim(), result: nullable(item.result ?? "") }; }),
  };
}

export function validateProfileForm(form: CandidateProfileFormState): ProfileFormError[] {
  const errors: ProfileFormError[] = [];
  if (!form.name.trim()) errors.push({ section: "basic", field: "name", message: "이름을 입력해 주세요." });
  form.educations.forEach((item, index) => {
    required(errors, "educations", `educations.${index}.schoolName`, item.schoolName, "학교명을 입력해 주세요.");
    required(errors, "educations", `educations.${index}.startMonth`, item.startMonth, "입학년월을 입력해 주세요.");
    const ongoing = item.status === "ENROLLED" || item.status === "LEAVE_OF_ABSENCE";
    if (!ongoing) required(errors, "educations", `educations.${index}.endMonth`, item.endMonth ?? "", "졸업 또는 예정년월을 입력해 주세요.");
    period(errors, "educations", `educations.${index}.endMonth`, item.startMonth, ongoing ? "" : (item.endMonth ?? ""));
    const degreeMap: Record<string, string[]> = { HIGH_SCHOOL: ["HIGH_SCHOOL_DIPLOMA", "OTHER"], COLLEGE: ["ASSOCIATE", "OTHER"], UNIVERSITY: ["BACHELOR", "OTHER"], GRADUATE_SCHOOL: ["MASTER", "DOCTORATE", "OTHER"], OTHER: ["OTHER"] };
    if (!degreeMap[item.educationLevel]?.includes(item.degreeType)) errors.push({ section: "educations", field: `educations.${index}.degreeType`, message: "학력구분에 맞는 학위·대학구분을 선택해 주세요." });
  });
  form.careers.forEach((item, index) => {
    required(errors, "careers", `careers.${index}.companyName`, item.companyName, "회사명을 입력해 주세요.");
    required(errors, "careers", `careers.${index}.startMonth`, item.startMonth, "입사년월을 입력해 주세요.");
    required(errors, "careers", `careers.${index}.jobRole`, item.jobRole, "직무를 입력해 주세요.");
    required(errors, "careers", `careers.${index}.responsibilities`, item.responsibilities, "담당업무를 입력해 주세요.");
    if (!item.isCurrent) required(errors, "careers", `careers.${index}.endMonth`, item.endMonth ?? "", "퇴사년월을 입력해 주세요.");
    period(errors, "careers", `careers.${index}.endMonth`, item.startMonth, item.isCurrent ? "" : (item.endMonth ?? ""));
  });
  form.activities.forEach((item, index) => {
    required(errors, "activities", `activities.${index}.organizationName`, item.organizationName, "기관·회사명을 입력해 주세요.");
    required(errors, "activities", `activities.${index}.startDate`, item.startDate, "시작일을 입력해 주세요.");
    required(errors, "activities", `activities.${index}.description`, item.description, "활동 내용을 입력해 주세요.");
    if (!item.isOngoing) required(errors, "activities", `activities.${index}.endDate`, item.endDate ?? "", "종료일을 입력해 주세요.");
    period(errors, "activities", `activities.${index}.endDate`, item.startDate, item.isOngoing ? "" : (item.endDate ?? ""));
  });
  form.credentials.forEach((item, index) => {
    required(errors, "credentials", `credentials.${index}.name`, item.name, "명칭을 입력해 주세요.");
    required(errors, "credentials", `credentials.${index}.issuer`, item.issuer, "발행·주최기관을 입력해 주세요.");
    required(errors, "credentials", `credentials.${index}.acquiredMonth`, item.acquiredMonth, "취득년월을 입력해 주세요.");
  });
  return errors;
}

function required(errors: ProfileFormError[], section: ProfileSection, field: string, value: string, message: string) {
  if (!value.trim()) errors.push({ section, field, message });
}

function period(errors: ProfileFormError[], section: ProfileSection, field: string, start: string, end: string) {
  if (start && end && start > end) errors.push({ section, field, message: "종료일은 시작일보다 빠를 수 없습니다." });
}
