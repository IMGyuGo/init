"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  getPublicRecruitment,
  requestPublicApplicationAccessLink,
  submitPublicApplication,
  type PublicApplicationInput,
  type PublicRecruitment,
} from "./public-application-api";
import { StructuredJobDescriptionView } from "./StructuredJobDescriptionView";

type AsyncState<T> = {
  data?: T;
  loading: boolean;
  error?: string;
};

function createInitialForm(): PublicApplicationInput {
  return {
    name: "",
    email: "",
    phone: "",
    githubBlogUrl: "",
    portfolioMode: "URL",
    portfolioUrl: "",
    portfolioFile: null,
    resumeFile: null,
    motivation: "",
    additionalInfo: "",
    consentAgreed: false,
  };
}

export function PublicRecruitmentApplyPage({ recruitmentId }: { recruitmentId: number }) {
  const applicationFormId = "public-application-form";
  const [state, setState] = useState<AsyncState<PublicRecruitment>>({ loading: true });
  const [form, setForm] = useState<PublicApplicationInput>(() => createInitialForm());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<"SENT" | "FAILED" | "NOT_SENT_TEMPORARY" | "">("");

  const loadRecruitment = useCallback(async () => {
    setState({ loading: true });
    try {
      const result = await getPublicRecruitment(recruitmentId);
      setState({ data: result.data, loading: false });
    } catch (error) {
      setState({ loading: false, error: toErrorMessage(error) });
    }
  }, [recruitmentId]);

  useEffect(() => {
    void loadRecruitment();
  }, [loadRecruitment]);

  const canSubmit = useMemo(() => {
    return Boolean(
      form.name.trim() &&
        form.email.trim() &&
        form.phone.trim() &&
        form.resumeFile &&
        form.consentAgreed &&
        !busy &&
        state.data,
    );
  }, [busy, form.consentAgreed, form.email, form.name, form.phone, form.resumeFile, state.data]);

  function updateField<K extends keyof PublicApplicationInput>(field: K, value: PublicApplicationInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.data) return;

    setBusy(true);
    setMessage("");
    try {
      const result = await submitPublicApplication(recruitmentId, {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        githubBlogUrl: emptyToUndefined(form.githubBlogUrl),
        portfolioUrl: emptyToUndefined(form.portfolioUrl),
        motivation: emptyToUndefined(form.motivation),
        additionalInfo: emptyToUndefined(form.additionalInfo),
      });
      setSubmittedEmail(result.data.email);
      setDeliveryStatus(result.data.magicLinkDeliveryStatus);
      setMessage(buildDeliveryMessage(result.data.magicLinkDeliveryStatus));
      setForm(createInitialForm());
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleResendAccessLink() {
    if (!submittedEmail) return;
    setResending(true);
    setMessage("");
    try {
      const result = await requestPublicApplicationAccessLink(recruitmentId, submittedEmail);
      setDeliveryStatus(result.data.magicLinkDeliveryStatus);
      setMessage(buildDeliveryMessage(result.data.magicLinkDeliveryStatus));
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setResending(false);
    }
  }

  function resetSubmittedState() {
    setSubmittedEmail("");
    setDeliveryStatus("");
    setMessage("");
  }

  return (
    <main className="candidate-public-page notion">
      {state.loading ? <p className="candidate-page-notice">공고 정보를 불러오는 중입니다.</p> : null}
      {state.error ? <p className="candidate-page-notice is-danger">{state.error}</p> : null}

      {state.data ? (
        <StructuredJobDescriptionView
          companyName={state.data.companyName}
          title={state.data.title}
          jobRole={state.data.jobRole}
          jobDescription={state.data.jobDescription}
          careerRequirement={state.data.careerRequirement}
          workLocation={state.data.workLocation}
          employmentType={state.data.employmentType}
          endsOn={state.data.endsOn}
          rightRail={
            <div className="candidate-apply-stack">
              {submittedEmail ? (
                <section className="candidate-application-card" id={applicationFormId}>
                  <div className="candidate-card-head">
                    <h2>지원서 접수 완료</h2>
                    <p>입력한 이메일로 지원 현황과 면접 안내를 다시 확인할 수 있습니다.</p>
                  </div>
                  <div className="creation-flow">
                    <p className="notice">{message || "지원서가 접수되었습니다. 이메일 안내를 확인해주세요."}</p>
                    <dl className="detail-list">
                      <DetailItem label="지원 이메일" value={submittedEmail} />
                      <DetailItem label="메일 발송 상태" value={formatDeliveryStatus(deliveryStatus)} />
                      <DetailItem label="다음 단계" value="이메일 매직링크 확인" />
                      <DetailItem label="면접 안내" value="면접 세션이 준비되면 지원 현황 화면에서 확인" />
                    </dl>
                    <div className="empty">
                      지원 현황은 이메일로 받은 매직링크에서만 확인할 수 있습니다. 링크가 만료되었거나 메일을 받지 못했다면
                      아래 버튼으로 다시 요청해주세요.
                    </div>
                    <div className="form-actions">
                      <button className="btn secondary" type="button" onClick={resetSubmittedState}>
                        다른 이메일로 지원
                      </button>
                      <button className="btn primary" disabled={resending} type="button" onClick={handleResendAccessLink}>
                        {resending ? "발송 중" : "매직링크 다시 보내기"}
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <form id={applicationFormId} aria-label="공개 지원 폼" className="candidate-application-card" onSubmit={handleSubmit}>
                  <div className="candidate-card-head">
                    <h2>지원 정보</h2>
                    <p>필수 정보를 입력하고 이력서 PDF를 첨부하면 접수 후 이메일 안내가 이어집니다.</p>
                  </div>
                  <div className="creation-flow">
                    {message ? <p className="notice danger">{message}</p> : null}
                  <div className="grid-2">
                    <label>
                      이름 *
                      <input
                        required
                        value={form.name}
                        placeholder="이름을 입력해주세요"
                        onChange={(event) => updateField("name", event.currentTarget.value)}
                      />
                    </label>
                    <label>
                      이메일 *
                      <input
                        required
                        type="email"
                        value={form.email}
                        placeholder="init@example.com"
                        onChange={(event) => updateField("email", event.currentTarget.value)}
                      />
                    </label>
                    <label>
                      연락처 *
                      <input
                        required
                        value={form.phone}
                        placeholder="010-0000-0000"
                        onChange={(event) => updateField("phone", event.currentTarget.value)}
                      />
                    </label>
                    <label>
                      GitHub / 블로그 URL
                      <input
                        type="url"
                        value={form.githubBlogUrl ?? ""}
                        placeholder="https://github.com/init"
                        onChange={(event) => updateField("githubBlogUrl", event.currentTarget.value)}
                      />
                    </label>
                  </div>

                  <FilePickerField
                    id="public-application-resume-file"
                    label="이력서 PDF"
                    required
                    file={form.resumeFile ?? null}
                    onChange={(file) => updateField("resumeFile", file)}
                  />

                  <fieldset className="choice-fieldset">
                    <legend>포트폴리오</legend>
                    <div className="segmented-control">
                      <label>
                        <input
                          checked={form.portfolioMode === "URL"}
                          type="radio"
                          name="portfolioMode"
                          onChange={() => updateField("portfolioMode", "URL")}
                        />
                        <span>URL 입력</span>
                      </label>
                      <label>
                        <input
                          checked={form.portfolioMode === "FILE"}
                          type="radio"
                          name="portfolioMode"
                          onChange={() => updateField("portfolioMode", "FILE")}
                        />
                        <span>PDF 업로드</span>
                      </label>
                    </div>
                  </fieldset>

                  {form.portfolioMode === "URL" ? (
                    <label key="portfolio-url">
                      포트폴리오 URL
                      <input
                        type="url"
                        value={form.portfolioUrl ?? ""}
                        placeholder="https://portfolio.example.com"
                        onChange={(event) => updateField("portfolioUrl", event.currentTarget.value)}
                      />
                    </label>
                  ) : (
                    <FilePickerField
                      key="portfolio-file"
                      id="public-application-portfolio-file"
                      label="포트폴리오 PDF"
                      file={form.portfolioFile ?? null}
                      onChange={(file) => updateField("portfolioFile", file)}
                    />
                  )}

                  <label>
                    지원동기
                    <textarea
                      value={form.motivation ?? ""}
                      placeholder="지원 동기와 관심 있는 업무를 입력해주세요."
                      onChange={(event) => updateField("motivation", event.currentTarget.value)}
                    />
                  </label>
                  <label>
                    추가 설명
                    <textarea
                      value={form.additionalInfo ?? ""}
                      placeholder="지원 직무와 관련된 경험, 프로젝트, 강조하고 싶은 내용을 입력해주세요."
                      onChange={(event) => updateField("additionalInfo", event.currentTarget.value)}
                    />
                  </label>
                  <label>
                    <span className="inline-check">
                      <input
                        checked={form.consentAgreed}
                        type="checkbox"
                        onChange={(event) => updateField("consentAgreed", event.currentTarget.checked)}
                      />
                      개인정보 수집 및 채용 절차 이용에 동의합니다.
                    </span>
                  </label>
                  <div className="form-actions">
                    <button className="btn primary" disabled={!canSubmit} type="submit">
                      {busy ? "제출 중" : "지원서 제출"}
                    </button>
                  </div>
                  </div>
                </form>
              )}
            </div>
          }
        />
      ) : null}
    </main>
  );
}

function FilePickerField({
  id,
  label,
  required = false,
  file,
  onChange,
}: {
  id: string;
  label: string;
  required?: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="file-picker-field">
      <span className="file-picker-label">
        {label}
        {required ? " *" : ""}
      </span>
      <label className={`file-picker ${file ? "has-file" : ""}`} htmlFor={id}>
        <span className="file-picker-icon" aria-hidden="true">
          PDF
        </span>
        <span className="file-picker-copy">
          <strong>{file ? file.name : "PDF 파일 선택"}</strong>
          <small>{file ? formatFileSize(file.size) : "이력서와 포트폴리오는 PDF 파일로 첨부해주세요."}</small>
        </span>
        <span className="file-picker-action">파일 선택</span>
      </label>
      <input
        id={id}
        className="file-picker-input"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
      />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </>
  );
}

function emptyToUndefined(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildDeliveryMessage(status: "SENT" | "FAILED" | "NOT_SENT_TEMPORARY") {
  if (status === "SENT") {
    return "지원서가 접수되었습니다. 이메일로 보낸 매직링크에서 지원 현황과 면접 안내를 확인할 수 있습니다.";
  }
  if (status === "FAILED") {
    return "지원서가 접수되었지만 메일 발송에 실패했습니다. 매직링크 다시 보내기를 눌러 재요청해주세요.";
  }
  return "지원서가 접수되었습니다. 이메일 인증과 매직링크 발송은 현재 임시 처리 상태입니다.";
}

function formatDeliveryStatus(status: "SENT" | "FAILED" | "NOT_SENT_TEMPORARY" | "") {
  if (status === "SENT") return "발송 완료";
  if (status === "FAILED") return "발송 실패";
  if (status === "NOT_SENT_TEMPORARY") return "임시 미발송";
  return "-";
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
}
