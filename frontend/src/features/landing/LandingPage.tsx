import Image from "next/image";
import Link from "next/link";

const steps = [
  {
    no: "01",
    title: "채용공고를 찾습니다",
    description: "관심 있는 직무와 기업의 공고를 확인하고 나에게 맞는 기회를 찾아보세요.",
  },
  {
    no: "02",
    title: "AI 면접을 준비합니다",
    description: "실전처럼 연습하고 답변을 점검하며 내 속도에 맞춰 면접 감각을 높일 수 있어요.",
  },
  {
    no: "03",
    title: "지원 현황을 이어봅니다",
    description: "지원부터 면접, 결과까지 흩어지지 않게 한곳에서 확인하고 다음 단계를 준비하세요.",
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
            <Image src="/logo-init-v4.png" alt="init" width={1900} height={580} priority />
          </Link>
          <div className="gnb-right">
            <Link className="btn secondary" href="/login">
              로그인
            </Link>
            <Link className="btn primary" href="/company/login">
              기업 서비스
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <span className="landing-pill">지원부터 면접까지 이어지는 커리어 여정</span>
        <h1>
          가능성을 발견하고,
          <br />
          더 나은 기회와 <span>이어지세요.</span>
        </h1>
        <p className="landing-sub">
          init은 나에게 맞는 채용공고를 찾고, AI 면접을 준비하고, 지원 과정을 관리하는 지원자 서비스입니다.
        </p>
        <div className="landing-cta">
          <Link className="btn primary lg" href="/candidate/jobs">
            채용공고 보기
          </Link>
          <Link className="btn secondary lg" href="/candidate/mock-interview/start">
            AI 모의면접
          </Link>
        </div>
      </section>

      <section className="landing-steps">
        <div className="landing-head">
          <h2>지원자의 다음 단계를 한곳에서</h2>
          <p>기회를 찾는 순간부터 면접을 마칠 때까지 자연스럽게 이어집니다.</p>
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
          <h2>연습할수록 선명해지는 나의 답변</h2>
          <p>AI 면접과 리포트로 강점과 개선점을 직접 확인하세요.</p>
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
          <h2>내 커리어에 필요한 준비를 더 가깝게</h2>
          <p>공고 탐색, 면접 연습, 지원 관리가 하나의 경험으로 이어집니다.</p>
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
        <h2>지금 init에서 다음 기회를 준비하세요</h2>
        <p>지원자 회원가입 후 채용공고와 AI 모의면접을 바로 이용할 수 있어요.</p>
        <div className="landing-cta">
          <Link className="btn primary lg" href="/signup/candidate">
            지원자 회원가입
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
          <Link href="/signup/candidate">지원자 회원가입</Link>
          <Link href="/company/login">기업 서비스</Link>
        </div>
      </footer>
    </main>
  );
}
