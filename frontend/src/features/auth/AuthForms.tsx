"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthTokenResponse, UserType, apiFetch, getDefaultEntryPath } from "../../api/client";
import { useAuth } from "./AuthProvider";
import signupCompanyIcon from "./assets/signup-company.png";
import signupCandidateIcon from "./assets/signup-candidate.png";
import { getOAuthLoginMessageState } from "./oauth-login-message";
import { buildSignupPayload } from "./signup-payload";

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m2 2 20 20"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M9.9 4.2A10.4 10.4 0 0 1 12 4.1c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.1 4.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M6.6 6.7C3.6 8.7 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.2-.9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="password-control">
        <input
          className="input password-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          className="pw-toggle"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
          aria-pressed={visible}
          title={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function StatusMessage({ message, ok }: { message: string; ok?: boolean }) {
  return message ? <p className={`message ${ok ? "success" : ""}`}>{message}</p> : null;
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function CompanySignupIcon() {
  return <Image src={signupCompanyIcon} alt="" width={26} height={26} aria-hidden="true" />;
}

function CandidateSignupIcon() {
  return <Image src={signupCandidateIcon} alt="" width={26} height={26} aria-hidden="true" />;
}

const termsContent = {
  COMPANY: {
    title: "기업 회원 이용약관",
    items: [
      "기업 회원은 채용 공고, 지원자 초대, 평가 리포트 조회 기능을 채용 목적 범위 안에서 사용합니다.",
      "지원자 개인정보와 평가 결과는 채용 검토 및 관련 법령 준수 목적 외로 사용할 수 없습니다.",
      "계정 담당자는 회사 정보, 채용 공고, 초대 메일 내용이 정확하도록 관리해야 합니다.",
      "서비스 안정성, 부정 사용 방지, 보안 사고 대응을 위해 필요한 접속 기록과 처리 이력이 보관될 수 있습니다.",
    ],
  },
  CANDIDATE: {
    title: "지원자 회원 이용약관",
    items: [
      "지원자 회원은 AI 모의면접, 채용 공고 조회, 지원서 제출, 면접 응시 기능을 본인 계정으로 사용합니다.",
      "제출한 이력서, 포트폴리오, 면접 답변은 지원 및 평가 진행을 위해 처리될 수 있습니다.",
      "지원자는 본인의 입력 정보가 정확하도록 관리하며, 타인의 정보를 무단으로 사용할 수 없습니다.",
      "서비스 품질 개선, 보안, 분쟁 대응을 위해 필요한 이용 기록과 처리 상태가 보관될 수 있습니다.",
    ],
  },
} as const;

function TermsModal({ userType, onClose }: { userType: UserType; onClose: () => void }) {
  const terms = termsContent[userType];
  const titleId = `terms-title-${userType.toLowerCase()}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="terms-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3 id={titleId}>{terms.title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="약관 닫기">
            ×
          </button>
        </div>
        <div className="terms-body">
          {terms.items.map((item, index) => (
            <p key={`${userType}-${index}-${item}`}>{item}</p>
          ))}
        </div>
        <button type="button" className="btn primary full lg" onClick={onClose}>
          확인
        </button>
      </section>
    </div>
  );
}

export function LoginForm({ fixedUserType }: { fixedUserType?: UserType } = {}) {
  const router = useRouter();
  const { completeLogin } = useAuth();
  const [userType, setUserType] = useState<UserType>(fixedUserType ?? "CANDIDATE");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const state = getOAuthLoginMessageState(window.location.href);
    if (!state.message) return;

    setMessage(state.message);
    window.history.replaceState(null, "", state.cleanPath);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await apiFetch<AuthTokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ userType, email, password }),
      });
      completeLogin(result);
      router.replace(getDefaultEntryPath(result.user.userType));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    }
  }

  async function googleLogin() {
    setMessage("");
    try {
      const result = await apiFetch<{ authorizationUrl: string }>(`/auth/google?userType=${userType}`);
      window.location.href = result.authorizationUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google 로그인을 시작할 수 없습니다.");
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      {userType === "CANDIDATE" ? <span className="eyebrow">WELCOME BACK</span> : null}
      <h2>{userType === "COMPANY" ? "기업 회원 로그인" : "지원자 로그인"}</h2>
      <p className="lead">
        {userType === "COMPANY"
          ? "채용 공고와 지원자 평가를 한곳에서 관리하세요."
          : "채용공고 확인과 AI 면접을 계속 진행하세요."}
      </p>

      {!fixedUserType ? (
        <div className="field">
          <span className="label">로그인 사용자 유형</span>
          <div className="segment" aria-label="로그인 사용자 유형">
            <button type="button" className={userType === "COMPANY" ? "active" : ""} onClick={() => setUserType("COMPANY")}>
              기업
            </button>
            <button type="button" className={userType === "CANDIDATE" ? "active" : ""} onClick={() => setUserType("CANDIDATE")}>
              지원자
            </button>
          </div>
        </div>
      ) : null}

      <label className="field">
        <span className="label">이메일</span>
        <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
      </label>
      <PasswordField label="비밀번호" value={password} onChange={setPassword} autoComplete="current-password" />

      <div className="link-row">
        <button type="button" onClick={() => router.push("/password/reset")}>
          비밀번호 재설정
        </button>
        <span className="link-separator" aria-hidden="true">
          |
        </span>
        <button type="button" onClick={() => router.push(userType === "COMPANY" ? "/signup/company" : "/signup/candidate")}>
          회원가입
        </button>
      </div>

      <StatusMessage message={message} />
      <button className="btn primary full lg" type="submit">
        로그인
      </button>

      {userType === "CANDIDATE" ? (
        <>
          <div className="divider">또는</div>
          <button className="btn full lg" type="button" onClick={googleLogin}>
            <GoogleIcon /> Google로 로그인
          </button>
        </>
      ) : null}
    </form>
  );
}

export function SignupChoice() {
  const router = useRouter();
  const [selected, setSelected] = useState<UserType>("COMPANY");

  return (
    <section className="form-card wide">
      <span className="eyebrow">JOIN INIT</span>
      <h2>회원가입</h2>
      <p className="lead">어떤 유형으로 가입하시나요?</p>

      <div className="choice-grid" aria-label="회원가입 유형 선택">
        <button type="button" className={`choice ${selected === "COMPANY" ? "sel" : ""}`} onClick={() => setSelected("COMPANY")}>
          <span className="ck">✓</span>
          <span className="ico" aria-hidden="true">
            <CompanySignupIcon />
          </span>
          <h4>기업 회원가입</h4>
          <p>채용 프로젝트 운영, 지원자 초대 및 평가 리포트 확인</p>
        </button>
        <button type="button" className={`choice ${selected === "CANDIDATE" ? "sel" : ""}`} onClick={() => setSelected("CANDIDATE")}>
          <span className="ck">✓</span>
          <span className="ico" aria-hidden="true">
            <CandidateSignupIcon />
          </span>
          <h4>지원자 회원가입</h4>
          <p>AI 모의면접 연습, 채용 AI 면접 응시</p>
        </button>
      </div>

      <button className="btn primary full lg" type="button" onClick={() => router.push(selected === "COMPANY" ? "/signup/company" : "/signup/candidate")}>
        다음
      </button>
    </section>
  );
}

export function SignupForm({ userType }: { userType: UserType }) {
  const router = useRouter();
  const isCompany = userType === "COMPANY";
  const [form, setForm] = useState({
    name: "",
    companyName: "",
    email: "",
    code: "",
    password: "",
    passwordConfirm: "",
    termsAgreed: false,
  });
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const canResendCode = Boolean(sentEmail) && sentEmail === form.email && !emailVerified;
  const canVerifyCode = Boolean(sentEmail) && sentEmail === form.email && form.code.length === 6 && !emailVerified;

  function update(name: string, value: string | boolean) {
    if (name === "email" && typeof value === "string") {
      const emailChangedAfterSend = Boolean(sentEmail) && value !== sentEmail;
      setForm((prev) => ({ ...prev, email: value, code: emailChangedAfterSend ? "" : prev.code }));
      if (emailChangedAfterSend) {
        setSentEmail("");
        setEmailVerified(false);
        setOk(false);
        setMessage("");
      }
      return;
    }

    if (name === "code" && typeof value === "string") {
      setForm((prev) => ({ ...prev, code: value.replace(/\D/g, "").slice(0, 6) }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function sendCode() {
    setMessage("");
    setIsSendingCode(true);
    try {
      await apiFetch("/auth/email/send-code", { method: "POST", body: JSON.stringify({ email: form.email }) });
      setSentEmail(form.email);
      setEmailVerified(false);
      setForm((prev) => ({ ...prev, code: "" }));
      setOk(true);
      setMessage("인증 코드를 발송했습니다.");
    } catch (error) {
      setOk(false);
      setMessage(error instanceof Error ? error.message : "인증 코드 발송에 실패했습니다.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function verifyCode() {
    setMessage("");
    setIsVerifyingCode(true);
    try {
      await apiFetch("/auth/email/verify-code", { method: "POST", body: JSON.stringify({ email: form.email, code: form.code }) });
      setEmailVerified(true);
      setOk(true);
      setMessage("이메일 인증이 완료되었습니다.");
    } catch (error) {
      setOk(false);
      setMessage(error instanceof Error ? error.message : "인증 확인에 실패했습니다.");
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await apiFetch(isCompany ? "/auth/signup/company" : "/auth/signup/candidate", {
        method: "POST",
        body: JSON.stringify(buildSignupPayload(userType, form)),
      });
      router.push(isCompany ? "/company/login" : "/login");
    } catch (error) {
      setOk(false);
      setMessage(error instanceof Error ? error.message : "가입에 실패했습니다.");
    }
  }

  return (
    <form className="form-card wide" onSubmit={submit}>
      <span className="eyebrow">{isCompany ? "COMPANY" : "CANDIDATE"}</span>
      <h2>{isCompany ? "기업 회원가입" : "지원자 회원가입"}</h2>
      <p className="lead">{isCompany ? "담당자 정보와 회사명을 입력하세요." : "이메일 인증 후 비밀번호를 설정하세요."}</p>

      <div className={isCompany ? "grid-2" : undefined}>
        <label className="field">
          <span className="label">{isCompany ? "담당자 이름" : "이름"}</span>
          <input
            className="input"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            autoComplete="name"
            placeholder={isCompany ? "담당자 이름 입력" : "이름 입력"}
            required
          />
        </label>
        {isCompany ? (
          <label className="field">
            <span className="label">회사명</span>
            <input className="input" value={form.companyName} onChange={(event) => update("companyName", event.target.value)} placeholder="회사명 입력" required />
          </label>
        ) : null}
      </div>

      <div className="field">
        <span className="label">이메일</span>
        <div className="inline">
          <input
            className="input"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            type="email"
            autoComplete="email"
            placeholder={isCompany ? "company@example.com" : "email@example.com"}
            required
          />
          <button type="button" className="btn" onClick={sendCode} disabled={isSendingCode || emailVerified}>
            {canResendCode ? "인증 메일 재발송" : "인증 메일 발송"}
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">인증 코드</span>
        <div className="inline">
          <input
            className={`input ${emailVerified ? "input-readonly" : ""}`}
            value={form.code}
            onChange={(event) => update("code", event.target.value)}
            placeholder="인증 코드 입력"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            readOnly={emailVerified}
            required
          />
          <button type="button" className="btn" onClick={verifyCode} disabled={!canVerifyCode || isVerifyingCode}>
            {emailVerified ? "인증 완료" : "인증 확인"}
          </button>
        </div>
      </div>

      <PasswordField label="비밀번호" value={form.password} onChange={(value) => update("password", value)} autoComplete="new-password" />
      <PasswordField
        label="비밀번호 확인"
        value={form.passwordConfirm}
        onChange={(value) => update("passwordConfirm", value)}
        autoComplete="new-password"
      />

      <div className="field terms-field">
        <label className="tag">
          <input type="checkbox" checked={form.termsAgreed} onChange={(event) => update("termsAgreed", event.target.checked)} required />
          <span>필수 약관에 모두 동의합니다</span>
          <span className="tag-divider" aria-hidden="true">
            |
          </span>
          <button
            type="button"
            className="terms-detail"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setTermsOpen(true);
            }}
          >
            자세히 보기
          </button>
        </label>
      </div>

      {termsOpen ? <TermsModal userType={userType} onClose={() => setTermsOpen(false)} /> : null}

      <StatusMessage message={message} ok={ok} />
      <button className="btn primary full lg" type="submit">
        가입하기
      </button>
    </form>
  );
}

export function PasswordResetForm() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", code: "", password: "", passwordConfirm: "" });
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [codeVerified, setCodeVerified] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const canResendCode = Boolean(sentEmail) && sentEmail === form.email && !codeVerified;
  const canVerifyCode = Boolean(sentEmail) && sentEmail === form.email && form.code.length === 6 && !codeVerified;

  function update(name: string, value: string) {
    if (name === "email") {
      const emailChangedAfterSend = Boolean(sentEmail) && value !== sentEmail;
      setForm((prev) => ({ ...prev, email: value, code: emailChangedAfterSend ? "" : prev.code }));
      if (emailChangedAfterSend) {
        setSentEmail("");
        setCodeVerified(false);
        setOk(false);
        setMessage("");
      }
      return;
    }

    if (name === "code") {
      setForm((prev) => ({ ...prev, code: value.replace(/\D/g, "").slice(0, 6) }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function sendCode() {
    setMessage("");
    setIsSendingCode(true);
    try {
      await apiFetch("/auth/password/send-code", { method: "POST", body: JSON.stringify({ email: form.email }) });
      setSentEmail(form.email);
      setCodeVerified(false);
      setForm((prev) => ({ ...prev, code: "" }));
      setOk(true);
      setMessage("인증 코드를 발송했습니다.");
    } catch (error) {
      setOk(false);
      setMessage(error instanceof Error ? error.message : "인증 코드 발송에 실패했습니다.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function verifyCode() {
    setMessage("");
    setIsVerifyingCode(true);
    try {
      await apiFetch("/auth/password/verify-code", { method: "POST", body: JSON.stringify({ email: form.email, code: form.code }) });
      setCodeVerified(true);
      setOk(true);
      setMessage("인증이 완료되었습니다.");
    } catch (error) {
      setOk(false);
      setMessage(error instanceof Error ? error.message : "인증 확인에 실패했습니다.");
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await apiFetch("/auth/password/reset", { method: "POST", body: JSON.stringify(form) });
      router.push("/login");
    } catch (error) {
      setOk(false);
      setMessage(error instanceof Error ? error.message : "비밀번호 재설정에 실패했습니다.");
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <span className="eyebrow">RESET PASSWORD</span>
      <h2>비밀번호 재설정</h2>
      <p className="lead">가입 이메일로 인증 후 새 비밀번호를 설정합니다.</p>

      <div className="field">
        <span className="label">가입 이메일</span>
        <div className="inline">
          <input className="input" value={form.email} onChange={(event) => update("email", event.target.value)} type="email" autoComplete="email" placeholder="email@example.com" required />
          <button type="button" className="btn" onClick={sendCode} disabled={isSendingCode || codeVerified}>
            {canResendCode ? "코드 재발송" : "코드 발송"}
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">인증 코드</span>
        <div className="inline">
          <input
            className={`input ${codeVerified ? "input-readonly" : ""}`}
            value={form.code}
            onChange={(event) => update("code", event.target.value)}
            placeholder="인증 코드 입력"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            readOnly={codeVerified}
            required
          />
          <button type="button" className="btn" onClick={verifyCode} disabled={!canVerifyCode || isVerifyingCode}>
            {codeVerified ? "인증 완료" : "인증 확인"}
          </button>
        </div>
      </div>

      <PasswordField label="새 비밀번호" value={form.password} onChange={(value) => update("password", value)} autoComplete="new-password" />
      <PasswordField
        label="새 비밀번호 확인"
        value={form.passwordConfirm}
        onChange={(value) => update("passwordConfirm", value)}
        autoComplete="new-password"
      />

      <StatusMessage message={message} ok={ok} />
      <button className="btn primary full lg reset-submit" type="submit">
        비밀번호 재설정
      </button>
    </form>
  );
}
