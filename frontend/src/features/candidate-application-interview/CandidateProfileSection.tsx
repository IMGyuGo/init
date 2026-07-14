"use client";

import { cloneElement, FormEvent, isValidElement, ReactNode, useCallback, useEffect, useState } from "react";
import { getApiBaseUrl } from "../../api/api-base-url";
import { getAccessToken } from "../../api/client";
import { CandidateApiError, createCandidateApiClient } from "./api";
import {
  createEmptyProfileForm,
  createProfileFormState,
  getAccordionIndicator,
  newActivity,
  newCareer,
  newCredential,
  newEducation,
  serializeProfileForm,
  validateProfileForm,
  type CandidateProfileFormState,
  type ProfileFormError,
  type ProfileSection,
} from "./candidate-profile-form";
import styles from "./CandidateProfileSection.module.css";

const sectionLabels: Record<ProfileSection, string> = {
  educations: "학력",
  careers: "경력",
  activities: "프로젝트·경험·활동·교육",
  credentials: "자격·어학·수상",
};

const api = () => createCandidateApiClient({
  baseUrl: getApiBaseUrl(),
  headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : undefined,
});

export function CandidateProfileSection() {
  const [form, setForm] = useState<CandidateProfileFormState>(createEmptyProfileForm);
  const [open, setOpen] = useState<Record<ProfileSection | "coverLetter", boolean>>({ educations: false, careers: false, activities: false, credentials: false, coverLetter: false });
  const [errors, setErrors] = useState<ProfileFormError[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api().getProfile();
      setForm(createProfileFormState(response.data));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateProfileForm(form);
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      const first = nextErrors[0]!;
      if (first.section !== "basic") setOpen((value) => ({ ...value, [first.section]: true }));
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-profile-field="${first.field}"]`)?.focus());
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await api().updateProfile(serializeProfileForm(form));
      setForm(createProfileFormState(response.data));
      setErrors([]);
      setMessage("프로필이 저장되었습니다.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function add(section: ProfileSection) {
    if (form[section].length >= 10) {
      setMessage(`${sectionLabels[section]}은 최대 10개까지 등록할 수 있습니다.`);
      return;
    }
    setOpen((value) => ({ ...value, [section]: true }));
    setForm((value) => ({
      ...value,
      [section]: [...value[section], section === "educations" ? newEducation() : section === "careers" ? newCareer() : section === "activities" ? newActivity() : newCredential()],
    }) as CandidateProfileFormState);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`#profile-${section} [data-profile-item]:last-child input, #profile-${section} [data-profile-item]:last-child select`)?.focus());
  }

  const fieldError = (field: string) => errors.find((error) => error.field === field);

  return (
    <section className={styles.card} aria-label="지원자 프로필">
      <header className={styles.header}>
        <h2>내 프로필</h2>
        <p>저장한 경험은 지원서 자동 입력과 맞춤형 면접 질문 생성에 사용됩니다.</p>
        <p className={styles.privacy}>이름·이메일·연락처는 AI에 전달하지 않습니다. 자유 입력란에는 생년월일, 주소, 장애·건강, 연봉 등 민감정보를 적지 마세요.</p>
      </header>
      <form className={styles.form} onSubmit={handleSave} noValidate>
        <fieldset className={styles.basic} aria-busy={loading}>
          <legend>기본 정보</legend>
          <Field label="이름" error={fieldError("name")}>
            <input data-profile-field="name" value={form.name} maxLength={100} aria-invalid={Boolean(fieldError("name"))} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
          </Field>
          <Field label="이메일">
            <input value={form.email} readOnly aria-readonly="true" />
          </Field>
          <Field label="연락처">
            <input value={form.phone} maxLength={50} placeholder="010-0000-0000" onChange={(event) => setForm({ ...form, phone: event.currentTarget.value })} />
          </Field>
          <Field label="GitHub URL"><input type="url" value={form.githubUrl} maxLength={500} onChange={(event) => setForm({ ...form, githubUrl: event.currentTarget.value })} /></Field>
          <Field label="블로그 URL"><input type="url" value={form.blogUrl} maxLength={500} onChange={(event) => setForm({ ...form, blogUrl: event.currentTarget.value })} /></Field>
          <Field label="포트폴리오 URL"><input type="url" value={form.portfolioUrl} maxLength={500} onChange={(event) => setForm({ ...form, portfolioUrl: event.currentTarget.value })} /></Field>
          <Field label="한 줄 소개" wide><textarea value={form.summary} maxLength={2000} onChange={(event) => setForm({ ...form, summary: event.currentTarget.value })} /></Field>
        </fieldset>

        <Accordion section="educations" count={form.educations.length} open={open.educations} onToggle={() => setOpen({ ...open, educations: !open.educations })} onAdd={() => add("educations")}>
          {form.educations.map((item, index) => (
            <fieldset className={styles.item} data-profile-item key={item.key}>
              <legend>학력 {index + 1}</legend>
              <button type="button" className={styles.remove} aria-label={`학력 ${index + 1} 삭제`} onClick={() => setForm({ ...form, educations: form.educations.filter((_, itemIndex) => itemIndex !== index) })}>삭제</button>
              <Field label="학력구분"><select value={item.educationLevel} onChange={(event) => updateEducation(index, { educationLevel: event.currentTarget.value as typeof item.educationLevel })}><option value="HIGH_SCHOOL">고등학교</option><option value="COLLEGE">전문대학</option><option value="UNIVERSITY">대학교</option><option value="GRADUATE_SCHOOL">대학원</option><option value="OTHER">기타</option></select></Field>
              <Field label="학교명" error={fieldError(`educations.${index}.schoolName`)}><input data-profile-field={`educations.${index}.schoolName`} value={item.schoolName} maxLength={150} onChange={(event) => updateEducation(index, { schoolName: event.currentTarget.value })} /></Field>
              <Field label="전공"><input value={item.major ?? ""} maxLength={150} onChange={(event) => updateEducation(index, { major: event.currentTarget.value })} /></Field>
              <Field label="학위·대학구분" error={fieldError(`educations.${index}.degreeType`)}><select data-profile-field={`educations.${index}.degreeType`} value={item.degreeType} onChange={(event) => updateEducation(index, { degreeType: event.currentTarget.value as typeof item.degreeType })}><option value="HIGH_SCHOOL_DIPLOMA">고등학교 졸업</option><option value="ASSOCIATE">전문학사</option><option value="BACHELOR">학사</option><option value="MASTER">석사</option><option value="DOCTORATE">박사</option><option value="OTHER">기타</option></select></Field>
              <Field label="재학·졸업 상태"><select value={item.status} onChange={(event) => { const status = event.currentTarget.value as typeof item.status; updateEducation(index, { status, endMonth: status === "ENROLLED" || status === "LEAVE_OF_ABSENCE" ? "" : item.endMonth }); }}><option value="ENROLLED">재학</option><option value="LEAVE_OF_ABSENCE">휴학</option><option value="GRADUATED">졸업</option><option value="EXPECTED_GRADUATION">졸업예정</option><option value="COMPLETED">수료</option><option value="WITHDRAWN">중퇴</option></select></Field>
              <Field label="입학년월" error={fieldError(`educations.${index}.startMonth`)}><input data-profile-field={`educations.${index}.startMonth`} type="month" value={item.startMonth} onChange={(event) => updateEducation(index, { startMonth: event.currentTarget.value })} /></Field>
              <Field label="졸업·예정년월" error={fieldError(`educations.${index}.endMonth`)}><input data-profile-field={`educations.${index}.endMonth`} type="month" disabled={item.status === "ENROLLED" || item.status === "LEAVE_OF_ABSENCE"} value={item.endMonth ?? ""} onChange={(event) => updateEducation(index, { endMonth: event.currentTarget.value })} /></Field>
            </fieldset>
          ))}
        </Accordion>

        <Accordion section="careers" count={form.careers.length} open={open.careers} onToggle={() => setOpen({ ...open, careers: !open.careers })} onAdd={() => add("careers")}>
          {form.careers.map((item, index) => (
            <fieldset className={styles.item} data-profile-item key={item.key}>
              <legend>경력 {index + 1}</legend><button type="button" className={styles.remove} aria-label={`경력 ${index + 1} 삭제`} onClick={() => setForm({ ...form, careers: form.careers.filter((_, i) => i !== index) })}>삭제</button>
              <Field label="회사명" error={fieldError(`careers.${index}.companyName`)}><input data-profile-field={`careers.${index}.companyName`} value={item.companyName} maxLength={150} onChange={(e) => updateCareer(index, { companyName: e.currentTarget.value })} /></Field>
              <Field label="직무" error={fieldError(`careers.${index}.jobRole`)}><input data-profile-field={`careers.${index}.jobRole`} value={item.jobRole} maxLength={100} onChange={(e) => updateCareer(index, { jobRole: e.currentTarget.value })} /></Field>
              <Field label="입사년월" error={fieldError(`careers.${index}.startMonth`)}><input data-profile-field={`careers.${index}.startMonth`} type="month" value={item.startMonth} onChange={(e) => updateCareer(index, { startMonth: e.currentTarget.value })} /></Field>
              <Field label="퇴사년월" error={fieldError(`careers.${index}.endMonth`)}><input data-profile-field={`careers.${index}.endMonth`} type="month" disabled={item.isCurrent} value={item.endMonth ?? ""} onChange={(e) => updateCareer(index, { endMonth: e.currentTarget.value })} /></Field>
              <label className={styles.check}><input type="checkbox" checked={item.isCurrent} onChange={(e) => updateCareer(index, { isCurrent: e.currentTarget.checked, endMonth: e.currentTarget.checked ? "" : item.endMonth })} /> 재직 중</label>
              <Field label="근무부서"><input value={item.department ?? ""} maxLength={100} onChange={(e) => updateCareer(index, { department: e.currentTarget.value })} /></Field>
              <Field label="직급·직책"><input value={item.position ?? ""} maxLength={100} onChange={(e) => updateCareer(index, { position: e.currentTarget.value })} /></Field>
              <Field label="담당업무" wide error={fieldError(`careers.${index}.responsibilities`)}><textarea data-profile-field={`careers.${index}.responsibilities`} value={item.responsibilities} maxLength={1000} onChange={(e) => updateCareer(index, { responsibilities: e.currentTarget.value })} /></Field>
            </fieldset>
          ))}
        </Accordion>

        <Accordion section="activities" count={form.activities.length} open={open.activities} onToggle={() => setOpen({ ...open, activities: !open.activities })} onAdd={() => add("activities")}>
          {form.activities.map((item, index) => (
            <fieldset className={styles.item} data-profile-item key={item.key}>
              <legend>활동 {index + 1}</legend><button type="button" className={styles.remove} aria-label={`활동 ${index + 1} 삭제`} onClick={() => setForm({ ...form, activities: form.activities.filter((_, i) => i !== index) })}>삭제</button>
              <Field label="활동구분"><select value={item.activityType} onChange={(e) => updateActivity(index, { activityType: e.currentTarget.value as typeof item.activityType })}><option value="SCHOOL_ACTIVITY">교내활동</option><option value="INTERNSHIP">인턴</option><option value="CLUB">동아리</option><option value="PROJECT_TASK">수행과제</option><option value="OVERSEAS_TRAINING">해외연수</option><option value="EDUCATION">교육이수내역</option></select></Field>
              <Field label="기관·회사명" error={fieldError(`activities.${index}.organizationName`)}><input data-profile-field={`activities.${index}.organizationName`} value={item.organizationName} maxLength={150} onChange={(e) => updateActivity(index, { organizationName: e.currentTarget.value })} /></Field>
              <Field label="시작일" error={fieldError(`activities.${index}.startDate`)}><input data-profile-field={`activities.${index}.startDate`} type="date" value={item.startDate} onChange={(e) => updateActivity(index, { startDate: e.currentTarget.value })} /></Field>
              <Field label="종료일" error={fieldError(`activities.${index}.endDate`)}><input data-profile-field={`activities.${index}.endDate`} type="date" disabled={item.isOngoing} value={item.endDate ?? ""} onChange={(e) => updateActivity(index, { endDate: e.currentTarget.value })} /></Field>
              <label className={styles.check}><input type="checkbox" checked={item.isOngoing} onChange={(e) => updateActivity(index, { isOngoing: e.currentTarget.checked, endDate: e.currentTarget.checked ? "" : item.endDate })} /> 진행 중</label>
              <Field label="활동 내용" wide error={fieldError(`activities.${index}.description`)}><textarea data-profile-field={`activities.${index}.description`} value={item.description} maxLength={1000} onChange={(e) => updateActivity(index, { description: e.currentTarget.value })} /></Field>
            </fieldset>
          ))}
        </Accordion>

        <Accordion section="credentials" count={form.credentials.length} open={open.credentials} onToggle={() => setOpen({ ...open, credentials: !open.credentials })} onAdd={() => add("credentials")}>
          {form.credentials.map((item, index) => (
            <fieldset className={styles.item} data-profile-item key={item.key}>
              <legend>자격·어학·수상 {index + 1}</legend><button type="button" className={styles.remove} aria-label={`자격·어학·수상 ${index + 1} 삭제`} onClick={() => setForm({ ...form, credentials: form.credentials.filter((_, i) => i !== index) })}>삭제</button>
              <Field label="구분"><select value={item.credentialType} onChange={(e) => updateCredential(index, { credentialType: e.currentTarget.value as typeof item.credentialType })}><option value="CERTIFICATE">자격증</option><option value="LANGUAGE_TEST">어학시험</option><option value="AWARD">수상·공모전</option></select></Field>
              <Field label="명칭" error={fieldError(`credentials.${index}.name`)}><input data-profile-field={`credentials.${index}.name`} value={item.name} maxLength={150} onChange={(e) => updateCredential(index, { name: e.currentTarget.value })} /></Field>
              <Field label="발행·주최기관" error={fieldError(`credentials.${index}.issuer`)}><input data-profile-field={`credentials.${index}.issuer`} value={item.issuer} maxLength={150} onChange={(e) => updateCredential(index, { issuer: e.currentTarget.value })} /></Field>
              <Field label="취득년월" error={fieldError(`credentials.${index}.acquiredMonth`)}><input data-profile-field={`credentials.${index}.acquiredMonth`} type="month" value={item.acquiredMonth} onChange={(e) => updateCredential(index, { acquiredMonth: e.currentTarget.value })} /></Field>
              <Field label="점수·등급·수상 결과"><input value={item.result ?? ""} maxLength={200} onChange={(e) => updateCredential(index, { result: e.currentTarget.value })} /></Field>
            </fieldset>
          ))}
        </Accordion>

        <TextAccordion
          section="coverLetter"
          title="자기소개서"
          filled={Boolean(form.coverLetter.trim())}
          open={open.coverLetter}
          onToggle={() => setOpen({ ...open, coverLetter: !open.coverLetter })}
        >
          <Field label="자기소개서" wide>
            <textarea
              value={form.coverLetter}
              maxLength={5000}
              rows={10}
              placeholder="지원자의 경험, 강점, 문제 해결 사례를 작성해 주세요. 저장한 내용은 맞춤형 모의면접 질문 생성에 활용됩니다."
              onChange={(event) => setForm({ ...form, coverLetter: event.currentTarget.value })}
            />
          </Field>
        </TextAccordion>

        <div className={styles.actions} aria-live="polite"><span>{message}</span><button className="btn primary" type="submit" disabled={busy || loading}>{busy ? "저장 중…" : "프로필 저장"}</button></div>
      </form>
    </section>
  );

  function updateEducation(index: number, patch: Partial<CandidateProfileFormState["educations"][number]>) { setForm((value) => ({ ...value, educations: value.educations.map((item, i) => i === index ? { ...item, ...patch } : item) })); }
  function updateCareer(index: number, patch: Partial<CandidateProfileFormState["careers"][number]>) { setForm((value) => ({ ...value, careers: value.careers.map((item, i) => i === index ? { ...item, ...patch } : item) })); }
  function updateActivity(index: number, patch: Partial<CandidateProfileFormState["activities"][number]>) { setForm((value) => ({ ...value, activities: value.activities.map((item, i) => i === index ? { ...item, ...patch } : item) })); }
  function updateCredential(index: number, patch: Partial<CandidateProfileFormState["credentials"][number]>) { setForm((value) => ({ ...value, credentials: value.credentials.map((item, i) => i === index ? { ...item, ...patch } : item) })); }
}

function Field({ label, children, error, wide = false }: { label: string; children: ReactNode; error?: ProfileFormError; wide?: boolean }) {
  const errorId = error ? `profile-error-${error.field.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;
  const control = error && isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { "aria-invalid": true, "aria-describedby": errorId })
    : children;

  return <label className={wide ? styles.wide : styles.field}><span>{label}</span>{control}{error ? <small id={errorId} role="alert">{error.message}</small> : null}</label>;
}

function Accordion({ section, count, open, onToggle, onAdd, children }: { section: ProfileSection; count: number; open: boolean; onToggle: () => void; onAdd: () => void; children: ReactNode }) {
  const id = `profile-${section}`;
  return <section className={styles.accordion}><div className={styles.accordionHeader}><button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}><span>{sectionLabels[section]}</span><span className={styles.badge}>{count}</span><span aria-hidden="true">{getAccordionIndicator(open)}</span></button><button type="button" className={styles.add} onClick={onAdd}>항목 추가</button></div>{open ? <div id={id} className={styles.items}>{count ? children : <p className={styles.empty}>등록된 항목이 없습니다.</p>}</div> : null}</section>;
}

function TextAccordion({ section, title, filled, open, onToggle, children }: { section: "coverLetter"; title: string; filled: boolean; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = `profile-${section}`;
  return <section className={styles.accordion}><div className={styles.accordionHeader}><button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}><span>{title}</span><span className={`${styles.badge} ${styles.textBadge}`}>{filled ? "작성됨" : "미작성"}</span><span aria-hidden="true">{getAccordionIndicator(open)}</span></button></div>{open ? <div id={id} className={`${styles.items} ${styles.textItems}`}>{children}</div> : null}</section>;
}

function errorMessage(error: unknown): string {
  if (error instanceof CandidateApiError) return error.body?.error.message ?? error.message;
  return error instanceof Error ? error.message : "프로필을 불러오지 못했습니다.";
}
