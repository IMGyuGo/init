"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getRecruitment, publishRecruitment } from "./api";
import { Breadcrumb, StatusBadge } from "./CompanyRecruitingChrome";
import { JobDescriptionViewer } from "./JobDescriptionViewer";
import type { Recruitment } from "./types";

const setupItems = [
  {
    title: "평가 기준",
    description: "JD 기반 역량과 평가 항목은 C 담당 화면에서 저장합니다.",
  },
  {
    title: "질문 뱅크",
    description: "직무 질문 생성과 질문 세트 구성은 C 담당 화면에서 연결합니다.",
  },
  {
    title: "면접 시간",
    description: "준비 시간, 답변 시간, 재응시 정책은 C 담당 화면에서 설정합니다.",
  },
];

export function RecruitmentInterviewSettingsBridgePage({ recruitmentId }: { recruitmentId: number }) {
  const router = useRouter();
  const [recruitment, setRecruitment] = useState<Recruitment | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const result = await getRecruitment(recruitmentId);
        setRecruitment(result.data);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "면접 설정 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [recruitmentId]);

  async function handlePublish() {
    setLoading(true);
    setMessage("");
    try {
      const result = await publishRecruitment(recruitmentId);
      router.push(`/company/recruitments/${result.data.recruitmentId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공고 등록에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const isOpen = recruitment?.status === "OPEN";

  return (
    <section className="app-page glass-page">
        <div className="page-head">
          <div>
            <Breadcrumb
              items={[
                { label: "공고 목록", href: "/company/recruitments" },
                { label: recruitment?.title ?? "공고", href: `/company/recruitments/${recruitmentId}` },
                { label: "면접 설정" },
              ]}
            />
            <h1>면접 설정</h1>
          </div>
          <div className="page-actions">
            <Link className="btn secondary" href={`/company/recruitments/${recruitmentId}/settings`}>
              공고 설정
            </Link>
            <Link className="btn secondary" href={`/company/recruitments/${recruitmentId}`}>
              대시보드
            </Link>
          </div>
        </div>

        {message ? <p className="notice danger">{message}</p> : null}

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{recruitment?.title ?? "공고 확인 중"}</h2>
              <p>{recruitment ? `${recruitment.jobRole} · ${formatPeriod(recruitment)}` : "면접 설정을 연결할 공고를 불러옵니다."}</p>
            </div>
            {recruitment ? <StatusBadge value={recruitment.status} /> : null}
          </div>
          <div className="description-box">
            <JobDescriptionViewer
              value={recruitment?.jobDescription}
              emptyMessage="등록된 JD가 없습니다. 공고 설정에서 JD를 보완할 수 있습니다."
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>면접 설정 연결</h2>
              <p>B 임시 브릿지입니다. 평가 기준·질문 뱅크·면접 시간 저장은 C 담당 화면이 연결될 때까지 대기하며, 이 화면이 C 구현을 대체하지 않습니다.</p>
            </div>
          </div>
          <div className="setup-card-grid">
            {setupItems.map((item) => (
              <article className="setup-card" key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <span>임시 연결 대기</span>
              </article>
            ))}
          </div>
        </section>

        <div className="sticky-actions">
          {isOpen ? (
            <Link className="btn primary" href={`/company/recruitments/${recruitmentId}`}>
              대시보드로 이동
            </Link>
          ) : (
            <button className="btn primary" type="button" disabled={loading || !recruitment} onClick={() => void handlePublish()}>
              공고 등록하기
            </button>
          )}
        </div>
    </section>
  );
}

function formatPeriod(item: Recruitment) {
  if (!item.startsOn && !item.endsOn) {
    return "기간 미정";
  }
  return `${item.startsOn ?? "시작 미정"} ~ ${item.endsOn ?? "마감 미정"}`;
}
