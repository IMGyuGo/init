"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import type { CandidateRecruitingReportView } from "./api";
import styles from "./CandidateScreeningResult.module.css";
import {
  getCandidatePassRevealStorageKey,
  getCandidateScreeningResultPresentation,
  shouldShowCandidatePassReveal,
} from "./view-model";

type PassRevealState = "checking" | "visible" | "dismissed";

const resultToneClasses = {
  undecided: "",
  pass: styles.resultPass,
  hold: styles.resultHold,
  fail: styles.resultFail,
  retry: styles.resultRetry,
} as const;

export function CandidateScreeningResult({
  report,
  formatDateTime,
  statusView,
}: {
  report: CandidateRecruitingReportView;
  formatDateTime: (value?: string) => string;
  statusView: ReactNode;
}) {
  const presentation = getCandidateScreeningResultPresentation(report);
  const reportStatus = report.status;
  const screeningDecision = report.screeningDecision;
  const storageKey = getCandidatePassRevealStorageKey(report.applicationId);
  const [passRevealState, setPassRevealState] = useState<PassRevealState>(
    reportStatus === "COMPLETED" && screeningDecision === "PASS" ? "checking" : "dismissed",
  );

  useEffect(() => {
    if (reportStatus !== "COMPLETED" || screeningDecision !== "PASS") {
      setPassRevealState("dismissed");
      return;
    }

    try {
      setPassRevealState(
        shouldShowCandidatePassReveal(
          { status: reportStatus, screeningDecision },
          window.localStorage.getItem(storageKey),
        ) ? "visible" : "dismissed",
      );
    } catch {
      setPassRevealState("visible");
    }
  }, [reportStatus, screeningDecision, storageKey]);

  const revealPassResult = () => {
    try {
      window.localStorage.setItem(storageKey, "true");
    } catch {
      // 브라우저 저장소를 사용할 수 없어도 현재 방문에서는 결과를 확인할 수 있어야 한다.
    }
    setPassRevealState("dismissed");
  };

  if (passRevealState === "checking") {
    return (
      <div className={`${styles.reveal} ${styles.revealChecking}`} aria-busy="true">
        <span className={styles.screenReaderOnly}>합격 결과 확인 화면을 준비하고 있습니다.</span>
      </div>
    );
  }

  if (passRevealState === "visible") {
    return (
      <section className={styles.reveal} aria-labelledby="candidate-pass-reveal-title" aria-live="polite">
        <p className={styles.revealEyebrow}>전형 결과가 도착했어요</p>
        <span className={styles.revealIcon} aria-hidden="true">
          <Image src="/candidate-stat-completed-v2.png" alt="" width={60} height={60} />
        </span>
        <h3 id="candidate-pass-reveal-title">축하합니다!</h3>
        <p><strong>{report.companyName}</strong>의 <strong>{report.jobTitle}</strong> 전형 결과를 확인해보세요.</p>
        <button className="btn primary" type="button" onClick={revealPassResult}>결과 확인하기</button>
      </section>
    );
  }

  return (
    <article className={`${styles.result} ${resultToneClasses[presentation.tone]}`} aria-labelledby="candidate-screening-result-title">
      <header className={styles.header}>
        <span className={styles.badge}>{presentation.badge}</span>
        <h3 id="candidate-screening-result-title">{presentation.title}</h3>
        <p>{presentation.description}</p>
      </header>

      <dl className={styles.meta}>
        <div>
          <dt>회사</dt>
          <dd>{report.companyName}</dd>
        </div>
        <div>
          <dt>공고</dt>
          <dd>{report.jobTitle}</dd>
        </div>
        <div>
          <dt>AI 분석 상태</dt>
          <dd>{statusView}</dd>
        </div>
        {presentation.showGeneratedAt && report.generatedAt ? (
          <div>
            <dt>결과 생성일</dt>
            <dd>{formatDateTime(report.generatedAt)}</dd>
          </div>
        ) : null}
      </dl>

      <section className={styles.next} aria-labelledby="candidate-screening-next-title">
        <span>이후 안내</span>
        <strong id="candidate-screening-next-title">{presentation.nextStepTitle}</strong>
        <p>{presentation.nextStepDescription}</p>
      </section>

      <div className={styles.actions}>
        <Link className="btn primary" href={presentation.actionHref}>{presentation.actionLabel}</Link>
      </div>
    </article>
  );
}
