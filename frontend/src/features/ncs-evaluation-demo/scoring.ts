export type NcsDomain = "JOB" | "BASIC";
export type NcsCriterionId =
  | "PROBLEM_SOLVING"
  | "DATA_FLOW"
  | "QUALITY"
  | "COMMUNICATION"
  | "LEARNING";
export type RubricStage = 1 | 2 | 3 | 4 | 5;
export type EvaluationConfidence = "낮음" | "보통" | "높음" | "평가 불충분";

export type NcsCriterion = {
  id: NcsCriterionId;
  title: string;
  domain: NcsDomain;
  description: string;
  behaviorPoints: string[];
  questionIds: string[];
};

export type FixedQuestion = {
  id: string;
  title: string;
  prompt: string;
  criterionIds: NcsCriterionId[];
};

export type AnswerAssessment = {
  questionId: string;
  status: "EVALUATED" | "INSUFFICIENT";
  stage?: RubricStage;
  points?: number;
  evidence?: string;
  missing: string[];
};

export type CriterionAssessment = {
  criterionId: NcsCriterionId;
  title: string;
  domain: NcsDomain;
  score?: number;
  stage?: RubricStage;
  confidence: EvaluationConfidence;
  evidence: Array<AnswerAssessment & { questionTitle: string }>;
  missing: string[];
};

export type QuestionAssessment = {
  questionId: string;
  score?: number;
  stage?: RubricStage;
  status: "EVALUATED" | "INSUFFICIENT";
};

export type NcsEvaluationResult = {
  totalScore?: number;
  jobScore?: number;
  basicScore?: number;
  criterionAssessments: CriterionAssessment[];
  questionAssessments: QuestionAssessment[];
  strengths: string[];
  improvements: string[];
};

export const DOMAIN_WEIGHTS: Record<NcsDomain, number> = {
  JOB: 0.7,
  BASIC: 0.3,
};

export const RUBRIC_POINTS: Record<RubricStage, number> = {
  1: 25,
  2: 50,
  3: 70,
  4: 85,
  5: 100,
};

export const STAGE_LABELS: Record<RubricStage, string> = {
  1: "수행 곤란",
  2: "제한적 수행",
  3: "기본 수행",
  4: "안정적 수행",
  5: "주도적 개선",
};

export const CRITERIA: NcsCriterion[] = [
  {
    id: "PROBLEM_SOLVING",
    title: "문제 분석·해결",
    domain: "JOB",
    description: "문제를 관찰 가능한 단위로 나누고 근거를 바탕으로 원인과 해결책을 결정합니다.",
    behaviorPoints: ["원인 가설 수립", "단계별 검증", "대안 비교와 판단"],
    questionIds: ["q1", "q4", "q6"],
  },
  {
    id: "DATA_FLOW",
    title: "데이터 흐름 설계",
    domain: "JOB",
    description: "시스템 경계와 데이터 전달 관계를 이해하고 일관된 흐름으로 설명합니다.",
    behaviorPoints: ["컴포넌트 경계 이해", "식별자·상태 추적", "실패 지점 설명"],
    questionIds: ["q2", "q3"],
  },
  {
    id: "QUALITY",
    title: "품질·재발 방지",
    domain: "JOB",
    description: "해결에 그치지 않고 테스트, 관찰 가능성, 복구 전략으로 재발 가능성을 줄입니다.",
    behaviorPoints: ["테스트 추가", "실패 복구", "모니터링과 재검증"],
    questionIds: ["q1", "q3"],
  },
  {
    id: "COMMUNICATION",
    title: "의사소통",
    domain: "BASIC",
    description: "상황과 판단 근거를 이해하기 쉬운 순서로 전달하고 협업 기준을 맞춥니다.",
    behaviorPoints: ["상황-행동-결과 구조", "근거 중심 설명", "공유와 합의"],
    questionIds: ["q2", "q4", "q5"],
  },
  {
    id: "LEARNING",
    title: "학습·적용",
    domain: "BASIC",
    description: "새 지식을 작은 실험으로 검증하고 실제 문제 해결에 전이합니다.",
    behaviorPoints: ["학습 방법", "작은 검증", "다른 문제로 확장"],
    questionIds: ["q5", "q6"],
  },
];

export const FIXED_QUESTIONS: FixedQuestion[] = [
  {
    id: "q1",
    title: "기술 문제 해결",
    prompt: "프로젝트에서 가장 어려웠던 기술 문제와 원인을 어떻게 찾고 해결했는지 설명해 주세요.",
    criterionIds: ["PROBLEM_SOLVING", "QUALITY"],
  },
  {
    id: "q2",
    title: "데이터 흐름 설명",
    prompt: "프론트엔드 요청부터 API, DB, 큐, 워커까지 데이터가 처리되는 흐름을 본인의 경험으로 설명해 주세요.",
    criterionIds: ["DATA_FLOW", "COMMUNICATION"],
  },
  {
    id: "q3",
    title: "실패 복구와 품질",
    prompt: "비동기 처리 실패나 데이터 불일치를 발견하고 복구하거나 재발을 막았던 경험을 설명해 주세요.",
    criterionIds: ["DATA_FLOW", "QUALITY"],
  },
  {
    id: "q4",
    title: "협업과 공유",
    prompt: "문제 해결 과정과 변경 사항을 팀원에게 공유하고 합의를 만든 방법을 설명해 주세요.",
    criterionIds: ["COMMUNICATION", "PROBLEM_SOLVING"],
  },
  {
    id: "q5",
    title: "빠른 학습과 적용",
    prompt: "새로운 기술을 빠르게 학습해 실제 기능이나 문제 해결에 적용한 경험을 설명해 주세요.",
    criterionIds: ["LEARNING", "COMMUNICATION"],
  },
  {
    id: "q6",
    title: "대안 비교와 판단",
    prompt: "여러 해결 방법 중 하나를 선택했던 사례와 선택 기준, 제약 조건, 결과를 설명해 주세요.",
    criterionIds: ["PROBLEM_SOLVING", "LEARNING"],
  },
];

export const EXAMPLE_ANSWERS: Record<string, string> = {
  q1: "면접 답변 저장 뒤 STT가 완료되지 않는 문제가 있었습니다. 미디어 업로드, DB 저장, 큐 전달, 워커 처리 단계로 나누고 answerId와 storageKey를 로그에서 비교해 워커 payload의 파일 참조 누락을 원인으로 확인했습니다. 참조값을 수정한 뒤 같은 흐름을 자동 테스트로 추가해 재발을 막았습니다.",
  q2: "브라우저가 녹음 파일을 API로 보내면 API는 객체 저장소 업로드 결과를 file_assets에 기록하고 answerId와 fileId를 큐 메시지로 전달합니다. 워커는 해당 키로 파일을 읽어 STT를 수행하고 transcript를 답변 row에 갱신합니다. 각 경계에서 같은 식별자를 남겨 실패 지점을 추적할 수 있게 했습니다.",
  q3: "큐 작업이 중복 소비돼 결과 상태가 흔들리는 상황이 있었습니다. processLogId별 상태 전이와 outputRef를 비교해 동일 작업의 재처리가 원인임을 확인했고, 완료 작업은 다시 저장하지 않는 멱등 조건과 실패 재시도 테스트를 추가했습니다. 이후 중복 메시지에서도 최종 결과가 한 번만 반영되는 것을 검증했습니다.",
  q4: "문제 현상, 확인한 로그, 원인, 수정 범위, 재현 절차를 한 문서에 정리해 팀에 공유했습니다. 프론트와 워커 담당자가 각 경계에서 확인할 id와 상태를 검증 기준으로 합의했고, 리뷰에서 나온 예외 케이스를 테스트 목록에 반영했습니다. 그 결과 팀 전체가 같은 절차로 문제를 재현하고 수정 결과를 확인할 수 있었습니다.",
  q5: "SQS와 워커 기반 비동기 처리를 처음 적용할 때 공식 문서로 메시지 수명주기와 재시도 방식을 익혔습니다. 새 기술을 바로 전체 기능에 넣으면 실패 범위를 찾기 어렵다고 판단해 작은 테스트 payload로 큐 수신과 DB 저장을 먼저 검증했습니다. 그 결과 검증된 패턴을 STT, 꼬리질문, 리포트 작업에 안정적으로 확장했고 상태 전이 표도 팀에 공유했습니다.",
  q6: "STT 완료를 기다리는 동기 방식과 새로 학습한 비동기 상태 조회 방식을 비교했습니다. 처리 시간이 길고 일시 실패가 있을 수 있다는 제약 때문에 사용자 요청을 막지 않는 비동기 방식을 선택했고, 작은 테스트 뒤 processLogId로 진행 상태를 조회하도록 설계했습니다. 대기 화면과 실패 재시도를 함께 적용한 결과 응답 지연과 사용자 혼란을 줄였습니다.",
};

const criterionKeywords: Record<NcsCriterionId, string[]> = {
  PROBLEM_SOLVING: ["문제", "원인", "해결", "분석", "로그", "단계", "대안", "판단", "가설", "비교", "선택", "제약"],
  DATA_FLOW: ["API", "DB", "데이터", "큐", "SQS", "워커", "worker", "흐름", "전달", "상태", "식별자"],
  QUALITY: ["테스트", "재발", "검증", "모니터링", "멱등", "실패", "복구", "품질", "재시도"],
  COMMUNICATION: ["팀", "공유", "설명", "문서", "협업", "소통", "리뷰", "합의", "전달"],
  LEARNING: ["학습", "익혔", "적용", "실험", "공식 문서", "새로운", "새로", "확장", "재사용", "패턴"],
};

const featureKeywords = {
  experience: ["프로젝트", "경험", "당시", "처음", "실제로", "제가", "저는", "상황"],
  action: ["확인", "수정", "추적", "나누", "추가", "적용", "비교", "검증", "설계", "공유", "기록"],
  reason: ["때문", "원인", "기준", "판단", "이유", "따라서", "그 결과", "제약"],
  result: ["결과", "완료", "줄였", "개선", "성공", "재발", "안정", "확인", "해결"],
  improvement: ["테스트", "모니터링", "문서", "재검증", "방지", "재시도", "멱등", "공유"],
};

const includesAny = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.toLocaleLowerCase("ko").includes(keyword.toLocaleLowerCase("ko")));

const hasSpecificity = (text: string) =>
  /\d|api|db|s3|sqs|worker|file_assets|processlogid|answerid|storagekey|테스트|로그/i.test(text);

const extractEvidence = (text: string) => {
  const sentence = text
    .split(/(?<=[.!?。])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0];
  if (!sentence) return undefined;
  return sentence.length > 170 ? `${sentence.slice(0, 167)}...` : sentence;
};

const scoreAnswerForCriterion = (
  questionId: string,
  answer: string,
  criterion: NcsCriterion,
): AnswerAssessment => {
  const normalized = answer.trim();
  if (normalized.length < 20) {
    return {
      questionId,
      status: "INSUFFICIENT",
      missing: ["평가 가능한 구체적 답변"],
    };
  }

  const relevant = includesAny(normalized, criterionKeywords[criterion.id]);
  const experience = includesAny(normalized, featureKeywords.experience);
  const action = includesAny(normalized, featureKeywords.action);
  const reason = includesAny(normalized, featureKeywords.reason);
  const result = includesAny(normalized, featureKeywords.result);
  const improvement = includesAny(normalized, featureKeywords.improvement);
  const specificity = hasSpecificity(normalized);

  let stage: RubricStage = 1;
  if (!relevant) {
    stage = 1;
  } else if (!experience && !action) {
    stage = 2;
  } else if (action && reason && result && improvement && specificity) {
    stage = 5;
  } else if (action && result && (reason || specificity)) {
    stage = 4;
  } else if (action || experience) {
    stage = 3;
  } else {
    stage = 2;
  }

  const missing: string[] = [];
  if (!experience) missing.push("본인이 수행한 실제 상황");
  if (!action) missing.push("직접 취한 행동");
  if (!reason) missing.push("판단 근거");
  if (!result) missing.push("행동 이후의 결과");
  if (!improvement) missing.push("재발 방지 또는 확장 활동");
  if (!specificity) missing.push("도구·수치·로그 등 구체적 근거");

  return {
    questionId,
    status: "EVALUATED",
    stage,
    points: RUBRIC_POINTS[stage],
    evidence: extractEvidence(normalized),
    missing,
  };
};

const average = (values: number[]) =>
  values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : undefined;

const scoreToStage = (score: number): RubricStage => {
  if (score >= 93) return 5;
  if (score >= 78) return 4;
  if (score >= 60) return 3;
  if (score >= 38) return 2;
  return 1;
};

export const evaluateNcsAnswers = (answers: Record<string, string>): NcsEvaluationResult => {
  const criterionAssessments = CRITERIA.map((criterion): CriterionAssessment => {
    const evidence = criterion.questionIds
      .map((questionId) => {
        const question = FIXED_QUESTIONS.find((item) => item.id === questionId);
        const assessment = scoreAnswerForCriterion(questionId, answers[questionId] ?? "", criterion);
        return {
          ...assessment,
          questionTitle: question?.title ?? questionId,
        };
      })
      .filter((item) => item.status === "EVALUATED");
    const scores = evidence.flatMap((item) => (item.points === undefined ? [] : [item.points]));
    const score = average(scores);
    const highEvidenceCount = scores.filter((value) => value >= 85).length;
    const confidence: EvaluationConfidence =
      evidence.length === 0
        ? "평가 불충분"
        : evidence.length >= 2 && highEvidenceCount >= 2
          ? "높음"
          : evidence.length >= 2
            ? "보통"
            : "낮음";
    const missing = Array.from(new Set(evidence.flatMap((item) => item.missing))).slice(0, 3);

    return {
      criterionId: criterion.id,
      title: criterion.title,
      domain: criterion.domain,
      score,
      stage: score === undefined ? undefined : scoreToStage(score),
      confidence,
      evidence,
      missing,
    };
  });

  const domainScore = (domain: NcsDomain) =>
    average(
      criterionAssessments
        .filter((assessment) => assessment.domain === domain)
        .flatMap((assessment) => (assessment.score === undefined ? [] : [assessment.score])),
    );
  const jobScore = domainScore("JOB");
  const basicScore = domainScore("BASIC");
  const totalScore =
    jobScore === undefined || basicScore === undefined
      ? undefined
      : Math.round(jobScore * DOMAIN_WEIGHTS.JOB + basicScore * DOMAIN_WEIGHTS.BASIC);

  const questionAssessments = FIXED_QUESTIONS.map((question): QuestionAssessment => {
    const scores = question.criterionIds.flatMap((criterionId) => {
      const criterion = CRITERIA.find((item) => item.id === criterionId);
      if (!criterion) return [];
      const assessment = scoreAnswerForCriterion(question.id, answers[question.id] ?? "", criterion);
      return assessment.points === undefined ? [] : [assessment.points];
    });
    const score = average(scores);
    return {
      questionId: question.id,
      score,
      stage: score === undefined ? undefined : scoreToStage(score),
      status: score === undefined ? "INSUFFICIENT" : "EVALUATED",
    };
  });

  const evaluatedCriteria = criterionAssessments.filter(
    (assessment): assessment is CriterionAssessment & { score: number } => assessment.score !== undefined,
  );
  const strengths = [...evaluatedCriteria]
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((assessment) => `${assessment.title}: ${STAGE_LABELS[assessment.stage ?? 1]} 수준의 근거가 확인되었습니다.`);
  const improvements = [...evaluatedCriteria]
    .sort((left, right) => left.score - right.score)
    .slice(0, 2)
    .map((assessment) => {
      const missing = assessment.missing[0] ?? "구체적인 행동과 결과";
      return `${assessment.title}: 다음 답변에서는 '${missing}' 항목을 더 분명히 제시해 주세요.`;
    });

  return {
    totalScore,
    jobScore,
    basicScore,
    criterionAssessments,
    questionAssessments,
    strengths,
    improvements,
  };
};
