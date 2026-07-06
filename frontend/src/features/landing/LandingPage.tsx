import Image from "next/image";
import Link from "next/link";

const steps = [
  {
    no: "01",
    title: "공고를 만듭니다",
    description: "직접 입력하거나 AI 초안으로 공고를 빠르게 작성하고, 공개 지원 링크를 공유합니다.",
  },
  {
    no: "02",
    title: "지원자가 AI 인터뷰를 봅니다",
    description: "지원자는 링크로 접속해 대화형 AI 인터뷰에 답합니다. 면접관 일정 조율이 필요 없습니다.",
  },
  {
    no: "03",
    title: "리포트로 결정합니다",
    description: "답변과 서류 근거가 담긴 AI 평가 리포트를 확인하고 합격·보류·불합격을 정합니다.",
  },
];

const featureCards = [
  {
    title: "더 많은 기회",
    description: "면접 자원의 한계 없이 더 많은 지원자에게 공정한 면접 기회를 제공합니다.",
    icon: (
      <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    title: "1차 검증 자동화",
    description: "서류와 AI 인터뷰를 기반으로 1차 검증을 자동화해 채용 운영 시간을 줄입니다.",
    icon: (
      <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="M22 4 12 14.01l-3-3" />
      </svg>
    ),
  },
  {
    title: "근거 기반 리포트",
    description: "점수마다 답변과 서류 근거를 함께 제시하는 AI 평가 리포트를 제공합니다.",
    icon: (
      <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 15l2 2 4-4" />
      </svg>
    ),
  },
];

const reportBars = [
  { label: "문제 해결", score: "92%", width: "92%" },
  { label: "기술 깊이", score: "84%", width: "84%" },
  { label: "커뮤니케이션", score: "76%", width: "76%" },
  { label: "협업 태도", score: "88%", width: "88%" },
];

export function LandingPage() {
  return (
    <main className="landing notion">
      <header className="gnb landing-gnb">
        <div className="gnb-inner">
          <Link className="brand" href="/" aria-label="init 홈">
            <Image src="/logo-init-v3.png" alt="init" width={1900} height={580} priority />
          </Link>
          <div className="gnb-right">
            <Link className="btn secondary" href="/login">
              로그인
            </Link>
            <Link className="btn primary" href="/signup">
              시작하기
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <span className="landing-pill">AI 인터뷰로 채용의 1차 검증을 자동화</span>
        <h1>
          면접을 잇다.
          <br />
          더 많은 지원자에게 <span>공정한 기회</span>를.
        </h1>
        <p className="landing-sub">
          init은 지원자를 대화형 AI 인터뷰로 만나고, 답변·서류 근거가 담긴 리포트로 채용 결정을 돕습니다.
        </p>
        <div className="landing-cta">
          <Link className="btn primary lg" href="/signup">
            시작하기
          </Link>
        </div>
      </section>

      <section className="landing-steps">
        <div className="landing-head">
          <h2>3단계로 끝나는 채용</h2>
          <p>복잡한 준비 없이, 링크 하나로 인터뷰부터 평가까지 이어집니다.</p>
        </div>
        <ol className="landing-step-grid">
          {steps.map((step) => (
            <li className="landing-step" key={step.no}>
              <span className="landing-step-no">{step.no}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-how">
        <div className="landing-head">
          <h2>지원자는 대화하고, 기업은 리포트로 확인합니다</h2>
          <p>실제 화면 흐름을 그대로 옮겼습니다.</p>
        </div>
        <div className="landing-preview-grid">
          <article className="landing-preview">
            <p className="landing-preview-caption">AI INTERVIEW</p>
            <div className="landing-preview-inner">
              <div className="landing-bubble landing-bubble-ai">최근 프로젝트에서 가장 어려웠던 기술적 문제는 무엇이었나요?</div>
              <div className="landing-bubble landing-bubble-user">Redis Queue로 비동기 리포트 파이프라인을 설계했고…</div>
              <p className="landing-recording">
                <span />
                답변 녹화 중 · 01:24
              </p>
            </div>
          </article>

          <article className="landing-preview">
            <p className="landing-preview-caption">AI REPORT</p>
            <div className="landing-preview-inner landing-report">
              {reportBars.map((bar) => (
                <div className="landing-bar-row" key={bar.label}>
                  <span className="landing-bar-name">{bar.label}</span>
                  <span className="landing-bar-track">
                    <span style={{ width: bar.width }} />
                  </span>
                  <strong>{bar.score}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-head">
          <h2>채용 경험을 더 선명하게</h2>
          <p>지원자에게는 기회를, 기업에게는 근거를.</p>
        </div>
        <div className="landing-feature-grid">
          {featureCards.map((feature) => (
            <article className="landing-feature" key={feature.title}>
              <div className="landing-feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-closing">
        <h2>지금 init에서 첫 면접을 시작하세요</h2>
        <p>기업 회원가입 후 바로 공고를 만들고 AI 인터뷰를 운영할 수 있어요.</p>
        <div className="landing-cta">
          <Link className="btn primary lg" href="/signup">
            시작하기
          </Link>
          <Link className="btn secondary lg" href="/login">
            로그인
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} init()</span>
        <div className="landing-footer-links">
          <Link href="/login">로그인</Link>
          <Link href="/signup">회원가입</Link>
        </div>
      </footer>
    </main>
  );
}
