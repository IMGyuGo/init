"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import styles from "./NcsEvaluationDemoPage.module.css";
import {
  CRITERIA,
  DOMAIN_WEIGHTS,
  EXAMPLE_ANSWERS,
  FIXED_QUESTIONS,
  STAGE_LABELS,
  evaluateNcsAnswers,
  type NcsEvaluationResult,
} from "./scoring";

const emptyAnswers = () => Object.fromEntries(FIXED_QUESTIONS.map((question) => [question.id, ""]));

const domainLabel = (domain: "JOB" | "BASIC") => (domain === "JOB" ? "직무수행능력" : "직업기초능력");

export function NcsEvaluationDemoPage() {
  const [answers, setAnswers] = useState<Record<string, string>>(emptyAnswers);
  const [result, setResult] = useState<NcsEvaluationResult>();
  const answeredCount = useMemo(
    () => FIXED_QUESTIONS.filter((question) => (answers[question.id] ?? "").trim().length >= 20).length,
    [answers],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(evaluateNcsAnswers(answers));
    window.setTimeout(() => document.querySelector("#evaluation-result")?.scrollIntoView({ behavior: "smooth" }), 0);
  };

  const fillExamples = () => {
    setAnswers({ ...EXAMPLE_ANSWERS });
    setResult(undefined);
  };

  const reset = () => {
    setAnswers(emptyAnswers());
    setResult(undefined);
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topbar} aria-label="페이지 이동">
          <Link href="/candidate/mock-interview/start" className={styles.backLink}>
            ← 모의면접으로 돌아가기
          </Link>
          <span className={styles.prototypeBadge}>규칙 기반 프로토타입</span>
        </nav>

        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>NCS 평가 시뮬레이터</p>
            <h1>백엔드 문제 해결·안정화 역량 평가</h1>
            <p className={styles.lead}>
              고정 질문에 답변하면 공통 5단계 수행수준과 행동 근거에 따라 점수를 계산합니다.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={fillExamples}>
              예시 답변 채우기
            </button>
            <button type="button" className={styles.ghostButton} onClick={reset}>
              초기화
            </button>
          </div>
        </header>

        <p className={styles.disclosure}>
          이 페이지는 팀 비교용 시연입니다. AI가 아닌 설명 가능한 규칙으로 계산하며, 공식 NCS 능력단위 코드 매핑과 채용 판단에는 사용하지 않습니다.
        </p>

        <section className={styles.section} aria-labelledby="profile-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionNumber}>01</p>
              <h2 id="profile-heading">평가 프로필</h2>
            </div>
            <p>각 기준은 서로 다른 질문에서 최소 두 번 확인합니다.</p>
          </div>

          <div className={styles.weightGrid}>
            <div>
              <div className={styles.weightHeading}>
                <strong>영역 가중치</strong>
                <span>직무 70% · 기초 30%</span>
              </div>
              <div className={styles.weightBar} aria-label="직무수행능력 70%, 직업기초능력 30%">
                <span className={styles.jobWeight} style={{ width: `${DOMAIN_WEIGHTS.JOB * 100}%` }} />
                <span className={styles.basicWeight} style={{ width: `${DOMAIN_WEIGHTS.BASIC * 100}%` }} />
              </div>
            </div>
            <div className={styles.rubricNote}>
              <strong>공통 5단계</strong>
              <span>수행 곤란 → 제한적 수행 → 기본 수행 → 안정적 수행 → 주도적 개선</span>
            </div>
          </div>

          <div className={styles.criteriaList}>
            {CRITERIA.map((criterion) => (
              <article className={styles.criterionRow} key={criterion.id}>
                <div className={styles.criterionTitle}>
                  <span className={`${styles.domainBadge} ${criterion.domain === "JOB" ? styles.job : styles.basic}`}>
                    {domainLabel(criterion.domain)}
                  </span>
                  <h3>{criterion.title}</h3>
                </div>
                <p>{criterion.description}</p>
                <ul className={styles.behaviorList}>
                  {criterion.behaviorPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <form className={styles.section} onSubmit={handleSubmit}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionNumber}>02</p>
              <h2>고정 질문 답변</h2>
            </div>
            <p className={styles.progressText}>평가 가능 답변 {answeredCount} / {FIXED_QUESTIONS.length}</p>
          </div>

          <div className={styles.questions}>
            {FIXED_QUESTIONS.map((question, index) => {
              const questionResult = result?.questionAssessments.find((item) => item.questionId === question.id);
              return (
                <article className={styles.questionItem} key={question.id}>
                  <div className={styles.questionMeta}>
                    <span>질문 {index + 1}</span>
                    <div className={styles.questionTags}>
                      {question.criterionIds.map((criterionId) => (
                        <span key={criterionId}>{CRITERIA.find((item) => item.id === criterionId)?.title}</span>
                      ))}
                    </div>
                  </div>
                  <label htmlFor={`answer-${question.id}`}>
                    <strong>{question.title}</strong>
                    <span>{question.prompt}</span>
                  </label>
                  <textarea
                    id={`answer-${question.id}`}
                    className={styles.textarea}
                    value={answers[question.id] ?? ""}
                    maxLength={1200}
                    placeholder="본인이 수행한 상황, 행동, 판단 근거, 결과를 중심으로 작성해 주세요."
                    onChange={(event) => {
                      setAnswers((current) => ({ ...current, [question.id]: event.target.value }));
                      setResult(undefined);
                    }}
                  />
                  <div className={styles.questionFooter}>
                    <span>{(answers[question.id] ?? "").length} / 1,200자</span>
                    {questionResult ? (
                      questionResult.status === "EVALUATED" && questionResult.stage && questionResult.score !== undefined ? (
                        <strong>{questionResult.score}점 · {STAGE_LABELS[questionResult.stage]}</strong>
                      ) : (
                        <strong className={styles.insufficient}>평가 불충분</strong>
                      )
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <div className={styles.submitBar}>
            <p>20자 미만 답변은 근거 부족으로 점수 계산에서 제외됩니다.</p>
            <button type="submit" className={styles.primaryButton}>답변 평가하기</button>
          </div>
        </form>

        {result ? <EvaluationResult result={result} /> : null}
      </div>
    </main>
  );
}

function EvaluationResult({ result }: { result: NcsEvaluationResult }) {
  return (
    <section id="evaluation-result" className={`${styles.section} ${styles.results}`} aria-labelledby="result-heading">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionNumber}>03</p>
          <h2 id="result-heading">평가 결과</h2>
        </div>
        <p aria-live="polite">{result.totalScore === undefined ? "평가 근거가 부족합니다." : `종합 ${result.totalScore}점입니다.`}</p>
      </div>

      <div className={styles.scoreSummary}>
        <div className={styles.totalScore}>
          <span>종합 점수</span>
          {result.totalScore === undefined ? <strong>평가 불충분</strong> : <strong>{result.totalScore}<small> / 100</small></strong>}
          <p>직무수행능력 70%와 직업기초능력 30%를 합산했습니다.</p>
        </div>
        <div className={styles.domainScoreGrid}>
          <div>
            <span>직무수행능력</span>
            <strong>{result.jobScore ?? "-"}<small>점</small></strong>
          </div>
          <div>
            <span>직업기초능력</span>
            <strong>{result.basicScore ?? "-"}<small>점</small></strong>
          </div>
        </div>
      </div>

      <div className={styles.insightGrid}>
        <div>
          <h3>확인된 강점</h3>
          {result.strengths.length > 0 ? (
            <ul>{result.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : <p>강점을 판단할 답변 근거가 부족합니다.</p>}
        </div>
        <div>
          <h3>보완할 부분</h3>
          {result.improvements.length > 0 ? (
            <ul>{result.improvements.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : <p>보완점을 판단할 답변 근거가 부족합니다.</p>}
        </div>
      </div>

      <div className={styles.criterionResults}>
        {result.criterionAssessments.map((assessment) => (
          <article className={styles.criterionResult} key={assessment.criterionId}>
            <div className={styles.criterionResultHeading}>
              <div>
                <span className={`${styles.domainBadge} ${assessment.domain === "JOB" ? styles.job : styles.basic}`}>
                  {domainLabel(assessment.domain)}
                </span>
                <h3>{assessment.title}</h3>
              </div>
              <div className={styles.criterionScore}>
                {assessment.score === undefined ? (
                  <strong>평가 불충분</strong>
                ) : (
                  <><strong>{assessment.score}점</strong><span>{STAGE_LABELS[assessment.stage ?? 1]} · 신뢰도 {assessment.confidence}</span></>
                )}
              </div>
            </div>
            {assessment.evidence.length > 0 ? (
              <div className={styles.evidenceList}>
                <h4>판단 근거</h4>
                {assessment.evidence.map((evidence) => (
                  <blockquote key={`${assessment.criterionId}-${evidence.questionId}`}>
                    <strong>{evidence.questionTitle}</strong>
                    <p>{evidence.evidence}</p>
                  </blockquote>
                ))}
              </div>
            ) : <p className={styles.emptyEvidence}>해당 기준을 판단할 답변이 없습니다.</p>}
            {assessment.missing.length > 0 ? (
              <p className={styles.missingText}><strong>다음 답변에 추가:</strong> {assessment.missing.join(", ")}</p>
            ) : null}
          </article>
        ))}
      </div>

      <p className={styles.methodNote}>
        점수는 키워드 일치만으로 결정하지 않고 실제 상황, 직접 행동, 판단 근거, 결과, 재발 방지, 구체적 근거의 조합으로 산정합니다. 현재 버전은 팀 논의를 위한 결정론적 프로토타입입니다.
      </p>
    </section>
  );
}
