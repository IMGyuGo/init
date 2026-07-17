"use client";

import { type ReactNode, useEffect, useState } from "react";
import type {
  CandidateActivity,
  CandidateCredential,
  CandidateEducation,
  CandidateProfileSnapshotV1,
} from "./api";
import {
  appendProfileSnapshotItem,
  getAccordionIndicator,
  isSupportedProfileDateInput,
  preserveNullableTextInput,
  profileDateInputBounds,
  type ProfileSection,
} from "./candidate-profile-form";
import type { CandidateApplicationField } from "./candidate-application-error";

type Props = {
  value: CandidateProfileSnapshotV1;
  onChange: (value: CandidateProfileSnapshotV1) => void;
  emailReadOnly?: boolean;
  nameError?: string;
  fieldErrors?: Partial<Record<CandidateApplicationField, string>>;
  focusField?: CandidateApplicationField;
};

type OpenState = Record<ProfileSection | "coverLetter", boolean>;

export function CandidateProfileSnapshotEditor({ value, onChange, emailReadOnly = false, nameError, fieldErrors = {}, focusField }: Props) {
  const [open, setOpen] = useState<OpenState>({
    educations: false,
    careers: false,
    activities: false,
    credentials: false,
    coverLetter: false,
  });
  useEffect(() => {
    const sectionByField: Partial<Record<CandidateApplicationField, keyof OpenState>> = {
      profileEducations: "educations",
      profileCareers: "careers",
      profileActivities: "activities",
      profileCredentials: "credentials",
      profileCoverLetter: "coverLetter",
    };
    const section = focusField ? sectionByField[focusField] : undefined;
    if (section) setOpen((current) => current[section] ? current : { ...current, [section]: true });
  }, [focusField]);
  const patch = (next: Partial<CandidateProfileSnapshotV1>) => onChange({ ...value, ...next });
  const replace = <K extends ProfileSection>(key: K, index: number, next: CandidateProfileSnapshotV1[K][number]) =>
    patch({ [key]: value[key].map((item, itemIndex) => itemIndex === index ? next : item) } as Pick<CandidateProfileSnapshotV1, K>);
  const remove = (key: ProfileSection, index: number) =>
    patch({ [key]: value[key].filter((_, itemIndex) => itemIndex !== index) });
  const toggle = (section: keyof OpenState) => setOpen((current) => ({ ...current, [section]: !current[section] }));
  const add = (section: ProfileSection) => {
    setOpen((current) => ({ ...current, [section]: true }));
    onChange(appendProfileSnapshotItem(value, section));
  };
  const candidateNameError = nameError ?? fieldErrors.candidateName;

  return (
    <div
      data-apply-field="profileSnapshot"
      className={`candidate-profile-snapshot-editor${fieldErrors.profileSnapshot ? " is-error" : ""}`}
    >
      {fieldErrors.profileSnapshot ? <small className="candidate-apply-field-error" role="alert">{fieldErrors.profileSnapshot}</small> : null}
      <fieldset className="candidate-profile-snapshot-basic">
        <legend>기본 정보</legend>
        <div className="candidate-profile-grid">
          <EditorField field="candidateName" label="이름" required error={candidateNameError} errorId="candidate-profile-name-error"><input value={value.name} maxLength={100} aria-invalid={Boolean(candidateNameError)} aria-describedby={candidateNameError ? "candidate-profile-name-error" : undefined} onChange={(event) => patch({ name: event.currentTarget.value })} /></EditorField>
          <EditorField field="email" label="이메일" required error={fieldErrors.email} errorId="candidate-profile-email-error"><input type="email" readOnly={emailReadOnly} value={value.email} maxLength={255} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "candidate-profile-email-error" : undefined} onChange={(event) => patch({ email: event.currentTarget.value })} /></EditorField>
          <EditorField field="phone" label="연락처" required error={fieldErrors.phone} errorId="candidate-profile-phone-error"><input value={value.phone ?? ""} maxLength={50} aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "candidate-profile-phone-error" : undefined} onChange={(event) => patch({ phone: nullable(event.currentTarget.value) })} /></EditorField>
          <EditorField field="githubUrl" label="GitHub URL" error={fieldErrors.githubUrl} errorId="candidate-profile-github-error"><input type="url" value={value.githubUrl ?? ""} maxLength={500} aria-invalid={Boolean(fieldErrors.githubUrl)} aria-describedby={fieldErrors.githubUrl ? "candidate-profile-github-error" : undefined} onChange={(event) => patch({ githubUrl: nullable(event.currentTarget.value) })} /></EditorField>
          <EditorField field="blogUrl" label="블로그 URL" error={fieldErrors.blogUrl} errorId="candidate-profile-blog-error"><input type="url" value={value.blogUrl ?? ""} maxLength={500} aria-invalid={Boolean(fieldErrors.blogUrl)} aria-describedby={fieldErrors.blogUrl ? "candidate-profile-blog-error" : undefined} onChange={(event) => patch({ blogUrl: nullable(event.currentTarget.value) })} /></EditorField>
          <EditorField label="포트폴리오 URL"><input type="url" value={value.portfolioUrl ?? ""} maxLength={500} onChange={(event) => patch({ portfolioUrl: nullable(event.currentTarget.value) })} /></EditorField>
          <EditorField field="profileSummary" label="한 줄 소개" wide error={fieldErrors.profileSummary} errorId="candidate-profile-summary-error"><textarea value={value.summary ?? ""} maxLength={2000} aria-invalid={Boolean(fieldErrors.profileSummary)} aria-describedby={fieldErrors.profileSummary ? "candidate-profile-summary-error" : undefined} onChange={(event) => patch({ summary: preserveNullableTextInput(event.currentTarget.value) })} /></EditorField>
        </div>
      </fieldset>

      <SnapshotSection field="profileEducations" error={fieldErrors.profileEducations} title="학력" section="educations" count={value.educations.length} open={open.educations} onToggle={() => toggle("educations")} onAdd={() => add("educations")}>
        {value.educations.map((item, index) => <SnapshotItem key={`education-${index}`} label={`학력 ${index + 1}`} onRemove={() => remove("educations", index)}>
          <EditorField label="학력구분"><select value={item.educationLevel} onChange={(event) => replace("educations", index, { ...item, educationLevel: event.currentTarget.value as CandidateEducation["educationLevel"] })}><option value="HIGH_SCHOOL">고등학교</option><option value="COLLEGE">전문대학</option><option value="UNIVERSITY">대학교</option><option value="GRADUATE_SCHOOL">대학원</option><option value="OTHER">기타</option></select></EditorField>
          <EditorField label="학교명"><input value={item.schoolName} maxLength={150} onChange={(event) => replace("educations", index, { ...item, schoolName: event.currentTarget.value })} /></EditorField>
          <EditorField label="전공"><input value={item.major ?? ""} maxLength={150} onChange={(event) => replace("educations", index, { ...item, major: nullable(event.currentTarget.value) })} /></EditorField>
          <EditorField label="학위·대학구분"><select value={item.degreeType} onChange={(event) => replace("educations", index, { ...item, degreeType: event.currentTarget.value as CandidateEducation["degreeType"] })}><option value="HIGH_SCHOOL_DIPLOMA">고등학교 졸업</option><option value="ASSOCIATE">전문학사</option><option value="BACHELOR">학사</option><option value="MASTER">석사</option><option value="DOCTORATE">박사</option><option value="OTHER">기타</option></select></EditorField>
          <EditorField label="재학·졸업 상태"><select value={item.status} onChange={(event) => { const status = event.currentTarget.value as CandidateEducation["status"]; replace("educations", index, { ...item, status, endMonth: status === "ENROLLED" || status === "LEAVE_OF_ABSENCE" ? null : item.endMonth }); }}><option value="ENROLLED">재학</option><option value="LEAVE_OF_ABSENCE">휴학</option><option value="GRADUATED">졸업</option><option value="EXPECTED_GRADUATION">졸업예정</option><option value="COMPLETED">수료</option><option value="WITHDRAWN">중퇴</option></select></EditorField>
          <EditorField label="입학년월"><ProfileDateInput type="month" value={item.startMonth} onChange={(startMonth) => replace("educations", index, { ...item, startMonth })} /></EditorField>
          <EditorField label="졸업·예정년월"><ProfileDateInput type="month" disabled={item.status === "ENROLLED" || item.status === "LEAVE_OF_ABSENCE"} value={item.endMonth ?? ""} onChange={(endMonth) => replace("educations", index, { ...item, endMonth: nullable(endMonth) })} /></EditorField>
        </SnapshotItem>)}
      </SnapshotSection>

      <SnapshotSection field="profileCareers" error={fieldErrors.profileCareers} title="경력" section="careers" count={value.careers.length} open={open.careers} onToggle={() => toggle("careers")} onAdd={() => add("careers")}>
        {value.careers.map((item, index) => <SnapshotItem key={`career-${index}`} label={`경력 ${index + 1}`} onRemove={() => remove("careers", index)}>
          <EditorField label="회사명"><input value={item.companyName} maxLength={150} onChange={(event) => replace("careers", index, { ...item, companyName: event.currentTarget.value })} /></EditorField>
          <EditorField label="직무"><input value={item.jobRole} maxLength={100} onChange={(event) => replace("careers", index, { ...item, jobRole: event.currentTarget.value })} /></EditorField>
          <EditorField label="입사년월"><ProfileDateInput type="month" value={item.startMonth} onChange={(startMonth) => replace("careers", index, { ...item, startMonth })} /></EditorField>
          <EditorField label="퇴사년월"><ProfileDateInput type="month" disabled={item.isCurrent} value={item.endMonth ?? ""} onChange={(endMonth) => replace("careers", index, { ...item, endMonth: nullable(endMonth) })} /></EditorField>
          <label className="candidate-profile-check"><input type="checkbox" checked={item.isCurrent} onChange={(event) => replace("careers", index, { ...item, isCurrent: event.currentTarget.checked, endMonth: event.currentTarget.checked ? null : item.endMonth })} /> 재직 중</label>
          <EditorField label="근무부서"><input value={item.department ?? ""} maxLength={100} onChange={(event) => replace("careers", index, { ...item, department: nullable(event.currentTarget.value) })} /></EditorField>
          <EditorField label="직급·직책"><input value={item.position ?? ""} maxLength={100} onChange={(event) => replace("careers", index, { ...item, position: nullable(event.currentTarget.value) })} /></EditorField>
          <EditorField label="담당업무" wide><textarea value={item.responsibilities} maxLength={1000} onChange={(event) => replace("careers", index, { ...item, responsibilities: event.currentTarget.value })} /></EditorField>
        </SnapshotItem>)}
      </SnapshotSection>

      <SnapshotSection field="profileActivities" error={fieldErrors.profileActivities} title="프로젝트·경험·활동·교육" section="activities" count={value.activities.length} open={open.activities} onToggle={() => toggle("activities")} onAdd={() => add("activities")}>
        {value.activities.map((item, index) => <SnapshotItem key={`activity-${index}`} label={`활동 ${index + 1}`} onRemove={() => remove("activities", index)}>
          <EditorField label="활동구분"><select value={item.activityType} onChange={(event) => replace("activities", index, { ...item, activityType: event.currentTarget.value as CandidateActivity["activityType"] })}><option value="SCHOOL_ACTIVITY">교내활동</option><option value="INTERNSHIP">인턴</option><option value="CLUB">동아리</option><option value="PROJECT_TASK">수행과제</option><option value="OVERSEAS_TRAINING">해외연수</option><option value="EDUCATION">교육이수내역</option></select></EditorField>
          <EditorField label="기관·회사명"><input value={item.organizationName} maxLength={150} onChange={(event) => replace("activities", index, { ...item, organizationName: event.currentTarget.value })} /></EditorField>
          <EditorField label="시작일"><ProfileDateInput type="date" value={item.startDate} onChange={(startDate) => replace("activities", index, { ...item, startDate })} /></EditorField>
          <EditorField label="종료일"><ProfileDateInput type="date" disabled={item.isOngoing} value={item.endDate ?? ""} onChange={(endDate) => replace("activities", index, { ...item, endDate: nullable(endDate) })} /></EditorField>
          <label className="candidate-profile-check"><input type="checkbox" checked={item.isOngoing} onChange={(event) => replace("activities", index, { ...item, isOngoing: event.currentTarget.checked, endDate: event.currentTarget.checked ? null : item.endDate })} /> 진행 중</label>
          <EditorField label="활동 내용" wide><textarea value={item.description} maxLength={1000} onChange={(event) => replace("activities", index, { ...item, description: event.currentTarget.value })} /></EditorField>
        </SnapshotItem>)}
      </SnapshotSection>

      <SnapshotSection field="profileCredentials" error={fieldErrors.profileCredentials} title="자격·어학·수상" section="credentials" count={value.credentials.length} open={open.credentials} onToggle={() => toggle("credentials")} onAdd={() => add("credentials")}>
        {value.credentials.map((item, index) => <SnapshotItem key={`credential-${index}`} label={`자격·어학·수상 ${index + 1}`} onRemove={() => remove("credentials", index)}>
          <EditorField label="구분"><select value={item.credentialType} onChange={(event) => replace("credentials", index, { ...item, credentialType: event.currentTarget.value as CandidateCredential["credentialType"] })}><option value="CERTIFICATE">자격증</option><option value="LANGUAGE_TEST">어학시험</option><option value="AWARD">수상·공모전</option></select></EditorField>
          <EditorField label="명칭"><input value={item.name} maxLength={150} onChange={(event) => replace("credentials", index, { ...item, name: event.currentTarget.value })} /></EditorField>
          <EditorField label="발행·주최기관"><input value={item.issuer} maxLength={150} onChange={(event) => replace("credentials", index, { ...item, issuer: event.currentTarget.value })} /></EditorField>
          <EditorField label="취득년월"><ProfileDateInput type="month" value={item.acquiredMonth} onChange={(acquiredMonth) => replace("credentials", index, { ...item, acquiredMonth })} /></EditorField>
          <EditorField label="점수·등급·수상 결과"><input value={item.result ?? ""} maxLength={200} onChange={(event) => replace("credentials", index, { ...item, result: nullable(event.currentTarget.value) })} /></EditorField>
        </SnapshotItem>)}
      </SnapshotSection>

      <SnapshotTextSection field="profileCoverLetter" error={fieldErrors.profileCoverLetter} title="자기소개서" open={open.coverLetter} filled={Boolean(value.coverLetter?.trim())} onToggle={() => toggle("coverLetter")}>
        <EditorField label="자기소개서" wide><textarea value={value.coverLetter ?? ""} maxLength={5000} rows={10} aria-invalid={Boolean(fieldErrors.profileCoverLetter)} onChange={(event) => patch({ coverLetter: preserveNullableTextInput(event.currentTarget.value) })} /></EditorField>
      </SnapshotTextSection>
    </div>
  );
}

function SnapshotSection({ field, error, title, section, count, open, onToggle, onAdd, children }: { field: CandidateApplicationField; error?: string; title: string; section: ProfileSection; count: number; open: boolean; onToggle: () => void; onAdd: () => void; children: ReactNode }) {
  const id = `snapshot-${section}`;
  const errorId = `${id}-error`;
  return <section data-apply-field={field} className={`candidate-profile-snapshot-section${error ? " is-error" : ""}`}><div className="candidate-profile-snapshot-header"><button type="button" aria-expanded={open} aria-controls={id} aria-describedby={error ? errorId : undefined} onClick={onToggle}><span>{title}</span><span className="candidate-profile-badge">{count}</span><span aria-hidden="true">{getAccordionIndicator(open)}</span></button><button type="button" className="candidate-profile-add" disabled={count >= 10} onClick={onAdd}>항목 추가</button></div>{error ? <small id={errorId} className="candidate-apply-field-error" role="alert">{error}</small> : null}{open ? <div className="candidate-profile-snapshot-items" id={id}>{count ? children : <p className="candidate-profile-empty">등록된 항목이 없습니다.</p>}</div> : null}</section>;
}

function SnapshotTextSection({ field, error, title, open, filled, onToggle, children }: { field: CandidateApplicationField; error?: string; title: string; open: boolean; filled: boolean; onToggle: () => void; children: ReactNode }) {
  const id = "snapshot-cover-letter";
  const errorId = `${id}-error`;
  return <section data-apply-field={field} className={`candidate-profile-snapshot-section${error ? " is-error" : ""}`}><div className="candidate-profile-snapshot-header"><button type="button" aria-expanded={open} aria-controls={id} aria-describedby={error ? errorId : undefined} onClick={onToggle}><span>{title}</span><span className="candidate-profile-badge candidate-profile-badge--text">{filled ? "작성됨" : "미작성"}</span><span aria-hidden="true">{getAccordionIndicator(open)}</span></button></div>{error ? <small id={errorId} className="candidate-apply-field-error" role="alert">{error}</small> : null}{open ? <div className="candidate-profile-snapshot-items" id={id}>{children}</div> : null}</section>;
}

function SnapshotItem({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return <fieldset className="candidate-profile-snapshot-item"><legend>{label}</legend><button type="button" className="candidate-profile-remove" aria-label={`${label} 삭제`} onClick={onRemove}>삭제</button><div className="candidate-profile-grid">{children}</div></fieldset>;
}

function EditorField({ field, label, required = false, wide = false, error, errorId, children }: { field?: string; label: string; required?: boolean; wide?: boolean; error?: string; errorId?: string; children: ReactNode }) {
  return <label data-apply-field={field} className={`${wide ? "candidate-profile-field candidate-profile-field--wide" : "candidate-profile-field"}${error ? " is-error" : ""}`}><span>{label}{required ? <span className="req-mark"> *</span> : null}</span>{children}{error ? <small id={errorId} role="alert">{error}</small> : null}</label>;
}

function ProfileDateInput({ type, value, disabled = false, onChange }: { type: "date" | "month"; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const bounds = profileDateInputBounds[type];
  return <input type={type} min={bounds.min} max={bounds.max} disabled={disabled} value={value} onChange={(event) => {
    const nextValue = event.currentTarget.value;
    if (isSupportedProfileDateInput(nextValue, type)) onChange(nextValue);
  }} />;
}

const nullable = (value: string) => value || null;
