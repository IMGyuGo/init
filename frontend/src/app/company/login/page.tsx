import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/features/auth/AuthForms";

const companyBenefits = [
  {
    label: "채용 운영",
    value: "공고부터 평가까지",
    description: "지원자 초대와 전형 상태를 하나의 흐름으로 관리합니다.",
  },
  {
    label: "AI 인터뷰",
    value: "일정 조율 없이",
    description: "지원자가 원하는 시간에 응시하고 기업은 결과를 확인합니다.",
  },
  {
    label: "평가 리포트",
    value: "근거까지 선명하게",
    description: "답변과 서류 근거가 연결된 리포트로 판단을 돕습니다.",
  },
] as const;

export default function CompanyLoginPage() {
  return (
    <main className="company-auth-page">
      <section className="company-auth-main">
        <Link className="company-auth-logo" href="/" aria-label="init 지원자 서비스 홈">
          <Image src="/logo-init-v5.png" alt="init" width={2030} height={775} priority />
        </Link>

        <div className="company-auth-form">
          <LoginForm fixedUserType="COMPANY" />
          <Link className="company-auth-back" href="/">
            지원자 서비스로 돌아가기
          </Link>
        </div>
      </section>

      <aside className="company-auth-visual" aria-label="init 기업 서비스 소개">
        <Image
          className="company-auth-visual-image"
          src="/company-auth-visual.png"
          alt=""
          fill
          sizes="(max-width: 900px) 100vw, 54vw"
          priority
        />
        <div className="company-auth-visual-content">
          <h1>채용의 처음부터 결정까지, 한곳에서 이어가세요.</h1>
          <p>반복되는 운영은 줄이고, 지원자를 판단할 근거는 더 또렷하게 만듭니다.</p>

          <div className="company-benefit-track">
            {companyBenefits.map((benefit) => (
              <article className="company-benefit-card" key={benefit.label}>
                <span>{benefit.label}</span>
                <strong>{benefit.value}</strong>
                <p>{benefit.description}</p>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}
