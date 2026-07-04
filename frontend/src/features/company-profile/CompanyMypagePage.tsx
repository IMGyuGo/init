"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { getCompanyProfile, updateCompanyProfile, uploadCompanyLogo } from "./api";
import { COMPANY_LOGO_ACCEPT, validateCompanyLogoFile } from "./company-profile-logo-upload";
import type { CompanyProfile, UpdateCompanyProfileInput } from "./types";

type CompanyProfileDraft = {
  name: string;
  industry: string;
  profile: string;
  talentProfile: string;
  evaluationPolicy: string;
};

const emptyDraft: CompanyProfileDraft = {
  name: "",
  industry: "",
  profile: "",
  talentProfile: "",
  evaluationPolicy: "",
};

const VERIFICATION_LABELS: Record<string, string> = {
  PENDING: "검수 대기",
  VERIFIED: "인증 완료",
  REJECTED: "인증 반려",
};

export function CompanyMypagePage() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [draft, setDraft] = useState<CompanyProfileDraft>(emptyDraft);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [selectedLogoPreviewUrl, setSelectedLogoPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await getCompanyProfile();
      setProfile(data);
      setDraft(toDraft(data));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "회사 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!selectedLogoFile) {
      setSelectedLogoPreviewUrl(null);
      return undefined;
    }

    const previewUrl = URL.createObjectURL(selectedLogoFile);
    setSelectedLogoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedLogoFile]);

  const hasProfileChanges = useMemo(() => {
    if (!profile) return false;
    return JSON.stringify(draft) !== JSON.stringify(toDraft(profile));
  }, [draft, profile]);

  const logoPreviewUrl = selectedLogoPreviewUrl ?? profile?.logoUrl ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    const input = toUpdateInput(draft);
    if (!input.name) {
      setMessage("회사명을 입력해주세요.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const updated = await updateCompanyProfile(input);
      setProfile(updated);
      setDraft(toDraft(updated));
      setMessage("회사 정보가 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "회사 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleLogoSelect(file: File | undefined) {
    if (!file) return;
    const validation = validateCompanyLogoFile(file);
    if (!validation.ok) {
      setMessage(validation.message);
      setSelectedLogoFile(null);
      return;
    }
    setMessage("");
    setSelectedLogoFile(file);
  }

  async function handleLogoUpload() {
    if (!selectedLogoFile) {
      setMessage("업로드할 로고 파일을 선택해주세요.");
      return;
    }

    setUploadingLogo(true);
    setMessage("");
    try {
      const updated = await uploadCompanyLogo(selectedLogoFile);
      setProfile(updated);
      setDraft(toDraft(updated));
      setSelectedLogoFile(null);
      setMessage("회사 로고가 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "회사 로고를 저장하지 못했습니다.");
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <section className="app-page company-mypage-page">
      <div className="page-head">
        <div>
          <h1>계정</h1>
          <p className="page-sub">회사 정보와 채용 운영 기본값을 관리합니다.</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => void loadProfile()} disabled={loading || saving || uploadingLogo}>
          새로고침
        </button>
      </div>

      {message ? <p className="notice">{message}</p> : null}

      <div className="company-mypage-layout">
        <aside className="panel company-profile-card">
          <div className="company-logo-preview" role="img" aria-label={`${profile?.name ?? "회사"} 로고`}>
            {logoPreviewUrl ? <span style={{ backgroundImage: `url(${logoPreviewUrl})` }} /> : <strong>{companyInitial(draft.name)}</strong>}
          </div>
          <div className="company-profile-card-info">
            <h2>{draft.name || "회사명"}</h2>
            <StatusPill value={profile?.verificationStatus ?? "PENDING"} />
          </div>
          <div className="company-meta-list">
            <div>
              <span>회사 ID</span>
              <strong>{profile?.companyId ?? "-"}</strong>
            </div>
            <div>
              <span>사업자등록번호</span>
              <strong>{profile?.businessRegistrationNumber ?? "-"}</strong>
            </div>
            <div>
              <span>최근 수정</span>
              <strong>{profile ? formatDateTime(profile.updatedAt) : "-"}</strong>
            </div>
          </div>
        </aside>

        <div className="company-mypage-main">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>회사 정보</h2>
                <p>공고와 지원자 화면에 함께 노출되는 기본 정보입니다.</p>
              </div>
            </div>

            <form className="company-profile-form" onSubmit={handleSubmit}>
              <div className="grid-2">
                <label>
                  회사명
                  <input
                    value={draft.name}
                    maxLength={150}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    disabled={loading || saving}
                    required
                  />
                </label>
                <label>
                  산업군
                  <input
                    value={draft.industry}
                    maxLength={100}
                    onChange={(event) => setDraft((current) => ({ ...current, industry: event.target.value }))}
                    disabled={loading || saving}
                    placeholder="예: AI SaaS"
                  />
                </label>
                <label className="wide">
                  회사 소개
                  <textarea
                    value={draft.profile}
                    maxLength={1000}
                    onChange={(event) => setDraft((current) => ({ ...current, profile: event.target.value }))}
                    disabled={loading || saving}
                  />
                </label>
                <label className="wide">
                  인재상
                  <textarea
                    value={draft.talentProfile}
                    maxLength={1000}
                    onChange={(event) => setDraft((current) => ({ ...current, talentProfile: event.target.value }))}
                    disabled={loading || saving}
                  />
                </label>
                <label className="wide">
                  평가 정책
                  <textarea
                    value={draft.evaluationPolicy}
                    maxLength={1000}
                    onChange={(event) => setDraft((current) => ({ ...current, evaluationPolicy: event.target.value }))}
                    disabled={loading || saving}
                  />
                </label>
              </div>
              <div className="form-actions">
                <button className="btn secondary" type="button" onClick={() => profile && setDraft(toDraft(profile))} disabled={!hasProfileChanges || saving}>
                  되돌리기
                </button>
                <button className="btn primary" type="submit" disabled={!hasProfileChanges || saving || loading}>
                  {saving ? "저장 중" : "저장"}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>회사 로고</h2>
                <p>PNG, JPG, WebP 파일을 업로드할 수 있습니다.</p>
              </div>
            </div>
            <div className="company-logo-upload">
              <label className={`company-logo-drop ${selectedLogoFile ? "has-file" : ""}`}>
                <input
                  type="file"
                  accept={COMPANY_LOGO_ACCEPT}
                  onChange={(event) => handleLogoSelect(event.target.files?.[0])}
                  disabled={uploadingLogo || loading}
                />
                <span className="company-logo-file-icon" aria-hidden="true">
                  IMG
                </span>
                <span className="company-logo-file-copy">
                  <strong>{selectedLogoFile ? selectedLogoFile.name : "로고 파일 선택"}</strong>
                  <small>{selectedLogoFile ? formatFileSize(selectedLogoFile.size) : "PNG, JPG, WebP · 최대 2MB"}</small>
                </span>
                <span className="company-logo-file-action">파일 선택</span>
              </label>
              <div className="form-actions">
                <button className="btn secondary" type="button" onClick={() => setSelectedLogoFile(null)} disabled={!selectedLogoFile || uploadingLogo}>
                  선택 취소
                </button>
                <button className="btn primary" type="button" onClick={() => void handleLogoUpload()} disabled={!selectedLogoFile || uploadingLogo}>
                  {uploadingLogo ? "업로드 중" : "업로드"}
                </button>
              </div>
            </div>
          </section>

          <section className="panel company-notification-panel">
            <div className="panel-head">
              <div>
                <h2>알림 설정</h2>
                <p>MVP 이후 제공 예정입니다.</p>
              </div>
              <span className="badge neutral">준비 중</span>
            </div>
            <div className="company-notification-grid" aria-disabled="true">
              <label>
                <input type="checkbox" checked disabled readOnly />
                지원자 등록
              </label>
              <label>
                <input type="checkbox" checked disabled readOnly />
                면접 완료
              </label>
              <label>
                <input type="checkbox" checked disabled readOnly />
                리포트 생성
              </label>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function toDraft(profile: CompanyProfile): CompanyProfileDraft {
  return {
    name: profile.name,
    industry: profile.industry ?? "",
    profile: profile.profile ?? "",
    talentProfile: profile.talentProfile ?? "",
    evaluationPolicy: profile.evaluationPolicy ?? "",
  };
}

function toUpdateInput(draft: CompanyProfileDraft): UpdateCompanyProfileInput {
  return {
    name: draft.name.trim(),
    industry: nullableTrim(draft.industry),
    profile: nullableTrim(draft.profile),
    talentProfile: nullableTrim(draft.talentProfile),
    evaluationPolicy: nullableTrim(draft.evaluationPolicy),
  };
}

function nullableTrim(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function companyInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(1)}MB`;
}

function StatusPill({ value }: { value: string }) {
  const tone = value === "VERIFIED" ? "success" : value === "REJECTED" ? "danger" : "warning";
  return <span className={`badge ${tone}`}>{VERIFICATION_LABELS[value] ?? value}</span>;
}
