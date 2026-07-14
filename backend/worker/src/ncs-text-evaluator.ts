import { ncsEvidenceDimensions, ncsProfile } from "./ncs-text-evaluation.profiles";
import {
  NCS_TEXT_EVALUATION_KIND,
  NCS_TEXT_EVALUATION_PROMPT_VERSION,
  NCS_TEXT_EVALUATION_RUBRIC_VERSION,
  NCS_PROFILE_VERSION,
  NcsBehaviorAssessmentDraft,
  NcsCompetencyAssessmentDraft,
  NcsCompetencyLevel,
  NcsEvaluationConfidence,
  NcsEvidenceDimensionDraft,
  NcsEvidenceDimensionScore,
  NcsGrowthFeedback,
  NcsProfileId,
  NcsProviderMode,
  NcsQuestionMode,
  NcsSharedEvidenceDraft,
  NcsTextEvaluationDraft,
  NcsTextEvaluationInput,
  NcsTextEvaluationOutput
} from "./ncs-text-evaluation.types";
import { NonRetryableAiWorkerFailure } from "./worker-errors";

const QUESTION_MODES: readonly NcsQuestionMode[] = [
  "EXPERIENCE_BEHAVIOR",
  "TECHNICAL_KNOWLEDGE",
  "SITUATIONAL_DESIGN"
];
const PROFILE_IDS: readonly NcsProfileId[] = ["problem-solving", "communication", "digital"];
const CONFIDENCE_VALUES: readonly NcsEvaluationConfidence[] = ["HIGH", "MEDIUM", "LOW"];
const MIN_QUESTION_LENGTH = 6;
const MIN_ANSWER_LENGTH = 20;
const MIN_ALIGNMENT_COVERAGE = 0.6;

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all|any|the|previous).*instructions?/i,
  /system\s*prompt/i,
  /developer\s*message/i,
  /(?:이전|위의|모든)\s*(?:지시|규칙|평가기준).*무시/i,
  /평가\s*(?:기준|규칙).*무시/i,
  /(?:점수|총점).*(?:100점|만점).*출력/i,
  /(?:합격|불합격).*출력/i,
  /you\s+are\s+(?:now|an?)\s+(?:system|judge)/i
];

const FORBIDDEN_OUTPUT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /합격|불합격|탈락|채용\s*(?:적합|부적합)|최종\s*선발|pass\s*\/\s*fail/i, label: "hiring decision" },
  {
    pattern: /(?:candidate|applicant).{0,40}(?:should\s+be\s+)?(?:hired|rejected|accepted|passed|failed)|(?:should\s+be\s+)(?:hired|rejected|accepted)|hiring\s*fit|fit\s+for\s+(?:the\s+)?(?:role|job)|(?:pass|fail)(?:ed)?\s+(?:the\s+)?(?:interview|candidate|applicant)/i,
    label: "hiring decision"
  },
  {
    pattern: /성별|남성|여성|나이|연령|출신\s*학교|학벌|외모|용모|(?:신체|정신|발달)\s*장애|장애(?:인|여부|유무|정도)|건강\s*상태|출신\s*지역/i,
    label: "sensitive attribute"
  },
  {
    pattern: /\b(?:male|female|gender|age|school|university|appearance|disability|disabled|health\s*status|region)\b/i,
    label: "sensitive attribute"
  },
  {
    pattern: /표정|시선|눈\s*맞춤|음성\s*톤|목소리|억양|말투|성격|정직(?:성)?|거짓말|facial\s*expression|eye\s*contact|voice\s*tone|accent|speaking\s*style|personality|dishonest|honesty|lying/i,
    label: "nonverbal or trait inference"
  }
];

const TECHNICAL_MISCONCEPTION_PATTERNS = [
  /redis.{0,30}(?:영구\s*데이터베이스|절대.{0,12}유실되지)/i,
  /캐시.{0,30}(?:항상|절대).{0,20}(?:원본|최신|일관)/i,
  /http.{0,30}(?:항상|기본적으로).{0,20}상태를\s*저장/i
];

interface FinalizeOptions {
  providerMode: NcsProviderMode;
  model?: string;
}

interface EvidenceUsage {
  quote: string;
  usedBy: string;
}

export function parseNcsTextEvaluationInput(payload: Record<string, unknown>): NcsTextEvaluationInput {
  if (
    payload.rubricVersion !== undefined &&
    payload.rubricVersion !== NCS_TEXT_EVALUATION_RUBRIC_VERSION
  ) {
    throw new NonRetryableAiWorkerFailure("rubricVersion is not supported");
  }
  if (payload.profileVersion !== undefined && payload.profileVersion !== NCS_PROFILE_VERSION) {
    throw new NonRetryableAiWorkerFailure("profileVersion is not supported");
  }
  if (!QUESTION_MODES.includes(payload.questionMode as NcsQuestionMode)) {
    throw new NonRetryableAiWorkerFailure("questionMode is invalid");
  }
  if (!Array.isArray(payload.profileIds) || payload.profileIds.length < 1 || payload.profileIds.length > 2) {
    throw new NonRetryableAiWorkerFailure("profileIds must contain 1 or 2 profile ids");
  }

  const profileIds = payload.profileIds.map((value) => {
    if (!PROFILE_IDS.includes(value as NcsProfileId)) {
      throw new NonRetryableAiWorkerFailure(`unsupported NCS profile id: ${String(value)}`);
    }
    return value as NcsProfileId;
  });
  if (new Set(profileIds).size !== profileIds.length) {
    throw new NonRetryableAiWorkerFailure("profileIds must not contain duplicates");
  }

  const question = typeof payload.question === "string" ? payload.question : "";
  const answerText =
    typeof payload.answerText === "string"
      ? payload.answerText
      : typeof payload.answer === "string"
        ? payload.answer
        : "";
  if (question.length > 1_000) {
    throw new NonRetryableAiWorkerFailure("question must be at most 1000 characters");
  }
  if (answerText.length > 8_000) {
    throw new NonRetryableAiWorkerFailure("answerText must be at most 8000 characters");
  }

  return {
    questionMode: payload.questionMode as NcsQuestionMode,
    question,
    answerText,
    profileIds
  };
}

export function evaluateNcsTextDeterministically(input: NcsTextEvaluationInput): NcsTextEvaluationOutput {
  const preflight = preflightNcsTextEvaluation(input, { providerMode: "mock" });
  if (preflight) {
    return preflight;
  }

  return finalizeNcsTextEvaluation(input, buildDeterministicDraft(input), { providerMode: "mock" });
}

export function preflightNcsTextEvaluation(
  input: NcsTextEvaluationInput,
  options: FinalizeOptions
): NcsTextEvaluationOutput | null {
  const trustedQuestion = trustedInputText(input.question);
  const trustedAnswer = trustedInputText(input.answerText);
  const coverage = questionProfileCoverage(trustedQuestion, input.profileIds, input.questionMode);
  const promptInjectionDetected = hasInputPromptInjection(input);

  if (
    normalizeSpace(trustedQuestion).length < MIN_QUESTION_LENGTH ||
    normalizeSpace(trustedAnswer).length < MIN_ANSWER_LENGTH
  ) {
    return emptyOutput(input, options, {
      scoreStatus: "INSUFFICIENT_INPUT",
      coverage,
      promptInjectionDetected,
      reasons: ["질문 또는 신뢰할 수 있는 답변 근거가 평가에 충분하지 않습니다."]
    });
  }

  if (coverage < MIN_ALIGNMENT_COVERAGE) {
    return emptyOutput(input, options, {
      scoreStatus: "LOW_ALIGNMENT",
      coverage,
      promptInjectionDetected,
      reasons: ["질문과 선택한 NCS 프로필의 정렬 범위가 0.6 미만입니다."]
    });
  }

  return null;
}

export function finalizeNcsTextEvaluation(
  input: NcsTextEvaluationInput,
  draft: NcsTextEvaluationDraft,
  options: FinalizeOptions
): NcsTextEvaluationOutput {
  const preflight = preflightNcsTextEvaluation(input, options);
  if (preflight) {
    return preflight;
  }

  const coverage = questionProfileCoverage(trustedInputText(input.question), input.profileIds, input.questionMode);
  const validation = validateDraft(input, draft);
  if (validation.reasons.length > 0) {
    return {
      ...baseOutput(input, options),
      scoreStatus: "BLOCKED",
      scores: { competency: null, evidence: null, total: null },
      coverage,
      confidence: "LOW",
      competencies: [],
      evidenceMaturity: { dimensions: [], sharedEvidence: [] },
      growth: blockedGrowth(),
      guardrail: {
        result: "BLOCKED",
        reasons: validation.reasons,
        exactQuotesValid: validation.exactQuotesValid,
        sharedEvidenceValid: validation.sharedEvidenceValid,
        confidenceValid: validation.confidenceValid,
        forbiddenWordingDetected: validation.forbiddenWordingDetected,
        promptInjectionDetected: hasInputPromptInjection(input)
      }
    };
  }

  const competencies = draft.competencies.map((competency) => {
    const profile = ncsProfile(competency.profileId);
    return {
      profileId: competency.profileId,
      profileVersion: NCS_PROFILE_VERSION,
      label: profile.label,
      level: competency.level,
      score: competency.level * 20,
      confidence: competency.confidence,
      rationale: normalizeSpace(competency.rationale),
      behaviors: competency.behaviors.map((behavior) => ({
        ...behavior,
        rationale: normalizeSpace(behavior.rationale),
        label: profile.behaviors.find((item) => item.id === behavior.behaviorId)!.label
      }))
    };
  });
  const dimensionProfiles = ncsEvidenceDimensions(input.questionMode);
  const dimensions = draft.evidenceDimensions.map((dimension) => ({
    ...dimension,
    rationale: normalizeSpace(dimension.rationale),
    label: dimensionProfiles.find((item) => item.id === dimension.dimensionId)!.label
  }));
  const competencyScore = Math.round(
    competencies.reduce((sum, competency) => sum + competency.score, 0) / competencies.length
  );
  const evidenceScore = Math.round(
    (dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / (dimensions.length * 2)) * 100
  );
  const totalScore = Math.round(0.7 * competencyScore + 0.3 * evidenceScore);
  const confidence = overallConfidence(
    [
      ...competencies.map((competency) => competency.confidence),
      ...dimensions.map((dimension) => dimension.confidence)
    ],
    coverage
  );

  return {
    ...baseOutput(input, options),
    scoreStatus: "SCORED",
    scores: {
      competency: competencyScore,
      evidence: evidenceScore,
      total: totalScore
    },
    coverage,
    confidence,
    competencies,
    evidenceMaturity: {
      dimensions,
      sharedEvidence: draft.sharedEvidence.map((item) => ({
        quote: item.quote,
        usedBy: [...item.usedBy],
        reason: normalizeSpace(item.reason)
      }))
    },
    growth: {
      strengths: draft.growth.strengths.map(normalizeSpace),
      gaps: draft.growth.gaps.map(normalizeSpace),
      nextAction: normalizeSpace(draft.growth.nextAction),
      followUpQuestion: normalizeSpace(draft.growth.followUpQuestion)
    },
    guardrail: {
      result: "PASS",
      reasons: hasInputPromptInjection(input)
        ? ["질문 또는 답변 안의 지시문은 신뢰하지 않고 평가 근거에서 제외했습니다."]
        : [],
      exactQuotesValid: true,
      sharedEvidenceValid: true,
      confidenceValid: true,
      forbiddenWordingDetected: false,
      promptInjectionDetected: hasInputPromptInjection(input)
    }
  };
}

export function competencyLevelScore(level: NcsCompetencyLevel): number {
  return level * 20;
}

export function questionProfileCoverage(
  question: string,
  profileIds: NcsProfileId[],
  questionMode?: NcsQuestionMode
): number {
  const original = normalizeSpace(question);
  const normalized = original.toLowerCase();
  if (!normalized) {
    return 0;
  }

  const coverageByProfile = profileIds.map((profileId) => {
    const profile = ncsProfile(profileId);
    const profileAligned = includesAny(normalized, profile.alignmentKeywords);
    const behaviorMatches = profile.behaviors.filter((behavior) =>
      includesAny(normalized, behavior.questionKeywords)
    ).length;
    const modeBonus = questionModeProfileBonus(original, profileId, questionMode);
    return Math.min(1, (profileAligned ? 0.4 : 0) + behaviorMatches * 0.2 + modeBonus);
  });

  return roundTo(
    coverageByProfile.reduce((sum, value) => sum + value, 0) / Math.max(coverageByProfile.length, 1),
    3
  );
}

function questionModeProfileBonus(
  question: string,
  profileId: NcsProfileId,
  questionMode?: NcsQuestionMode
): number {
  if (!questionMode) return 0;

  if (profileId === "digital" && questionMode === "TECHNICAL_KNOWLEDGE") {
    const hasCodeLikeTerm = /\b(?:[A-Z]{2,10}|[A-Z][a-z]+[A-Z][A-Za-z0-9]*|[A-Za-z]+(?:JS|DB|SQL|API|SDK)|[A-Za-z0-9]+[._+#-][A-Za-z0-9._+#-]+|[A-Za-z]*\d+[A-Za-z0-9]*)\b/.test(question);
    const hasTechnicalContext = /(기술|시스템|서버|데이터|코드|프레임워크|라이브러리|네트워크|데이터베이스|동시성|인증|보안|성능|배포|클라우드|캐시|트랜잭션|인덱스|알고리즘)|\b(?:api|database|cache|server|framework|library|network|concurrency|authentication|security|performance|deployment|cloud|runtime|compiler|query|transaction|index|middleware|protocol|algorithm|system|code)\b/i.test(question);
    const hasTechnicalTerm = hasCodeLikeTerm || hasTechnicalContext;
    // 새 프레임워크/라이브러리 이름은 고정 keyword catalog에 없을 수 있다.
    // 사용자가 TECHNICAL_KNOWLEDGE + digital을 명시한 경우 기술 용어 형태 자체를
    // 최소 평가 가능 기준(0.6)으로 인정하고, 실제 점수는 답변 근거에서 별도로 판정한다.
    return hasTechnicalTerm ? 0.6 : 0;
  }

  if (profileId === "problem-solving" && questionMode === "SITUATIONAL_DESIGN") {
    return /(상황|문제|설계|대응|개선|장애|제약|요구|어떻게)/.test(question) ? 0.2 : 0;
  }

  if (profileId === "communication" && questionMode === "EXPERIENCE_BEHAVIOR") {
    return /(설명|공유|협업|조율|보고|전달|갈등|상대)/.test(question) ? 0.2 : 0;
  }

  return 0;
}

function buildDeterministicDraft(input: NcsTextEvaluationInput): NcsTextEvaluationDraft {
  const trustedAnswer = trustedInputText(input.answerText);
  const sentences = exactSentences(trustedAnswer);
  const evidenceDimensions = buildEvidenceDimensions(input.questionMode, sentences, trustedAnswer);
  const evidenceScore = Math.round(
    (evidenceDimensions.reduce((sum, dimension) => sum + dimension.score, 0) /
      (evidenceDimensions.length * 2)) *
      100
  );
  const competencies = input.profileIds.map((profileId) =>
    buildCompetencyDraft(profileId, sentences, evidenceScore)
  );
  const sharedEvidence = buildSharedEvidence(competencies, evidenceDimensions);
  const growth = buildGrowthFeedback(competencies, evidenceDimensions);

  return { competencies, evidenceDimensions, sharedEvidence, growth };
}

function buildCompetencyDraft(
  profileId: NcsProfileId,
  sentences: string[],
  evidenceScore: number
): NcsCompetencyAssessmentDraft {
  const profile = ncsProfile(profileId);
  const behaviors: NcsBehaviorAssessmentDraft[] = profile.behaviors.map((behavior) => {
    const evidenceQuotes = matchingQuotes(sentences, behavior.evidenceKeywords);
    const observed = evidenceQuotes.length > 0;
    return {
      behaviorId: behavior.id,
      observed,
      confidence: evidenceQuotes.length >= 2 ? "HIGH" : observed ? "MEDIUM" : "LOW",
      rationale: observed
        ? `${behavior.label}에 연결되는 답변 근거가 확인됩니다.`
        : `${behavior.label}을 판단할 직접 근거가 부족합니다.`,
      evidenceQuotes
    };
  });
  const observedCount = behaviors.filter((behavior) => behavior.observed).length;
  const lastBehaviorObserved = behaviors.at(-1)?.observed === true;
  const level = competencyLevel(observedCount, evidenceScore, lastBehaviorObserved);
  const confidence: NcsEvaluationConfidence =
    observedCount === 3 && evidenceScore >= 75 ? "HIGH" : observedCount >= 2 ? "MEDIUM" : "LOW";

  return {
    profileId,
    level,
    confidence,
    rationale: `${profile.label}의 ${observedCount}/${profile.behaviors.length}개 행동 기준을 답변 원문에서 확인했습니다.`,
    behaviors
  };
}

function competencyLevel(
  observedCount: number,
  evidenceScore: number,
  validationBehaviorObserved: boolean
): NcsCompetencyLevel {
  if (observedCount === 0) return 1;
  if (observedCount === 1) return 2;
  if (observedCount === 2) return evidenceScore >= 50 ? 3 : 2;
  if (evidenceScore >= 88 && validationBehaviorObserved) return 5;
  if (evidenceScore >= 63) return 4;
  return 3;
}

function buildEvidenceDimensions(
  questionMode: NcsQuestionMode,
  sentences: string[],
  trustedAnswer: string
): NcsEvidenceDimensionDraft[] {
  return ncsEvidenceDimensions(questionMode).map((dimension) => {
    const evidenceQuotes = matchingQuotes(sentences, dimension.keywords);
    let score = dimensionScore(evidenceQuotes, dimension.keywords);
    if (
      dimension.id === "concept-accuracy" &&
      TECHNICAL_MISCONCEPTION_PATTERNS.some((pattern) => pattern.test(trustedAnswer))
    ) {
      score = Math.min(score, 1) as NcsEvidenceDimensionScore;
    }

    return {
      dimensionId: dimension.id,
      score,
      confidence: evidenceQuotes.length >= 2 ? "HIGH" : evidenceQuotes.length === 1 ? "MEDIUM" : "LOW",
      rationale:
        score === 2
          ? `${dimension.label}이 구체적인 원문 근거로 확인됩니다.`
          : score === 1
            ? `${dimension.label}의 일부 근거만 확인됩니다.`
            : `${dimension.label}의 직접 근거가 확인되지 않습니다.`,
      evidenceQuotes
    };
  });
}

function dimensionScore(
  evidenceQuotes: string[],
  keywords: readonly string[]
): NcsEvidenceDimensionScore {
  if (evidenceQuotes.length === 0) return 0;
  const normalized = evidenceQuotes.join(" ").toLowerCase();
  const matchedKeywords = new Set(
    keywords.filter((keyword) => normalized.includes(keyword.toLowerCase()))
  ).size;
  const hasConcreteDetail = /\d|%|ms|초|분|건|배|때문|따라서|그래서|위해|반면|대신/i.test(normalized);
  return evidenceQuotes.length >= 2 || matchedKeywords >= 2 || hasConcreteDetail ? 2 : 1;
}

function buildSharedEvidence(
  competencies: NcsCompetencyAssessmentDraft[],
  dimensions: NcsEvidenceDimensionDraft[]
): NcsSharedEvidenceDraft[] {
  const usages = collectEvidenceUsages(competencies, dimensions);
  const grouped = groupEvidenceUsages(usages);
  return [...grouped.entries()]
    .filter(([, usedBy]) => usedBy.length > 1)
    .map(([quote, usedBy]) => ({
      quote,
      usedBy,
      reason: "하나의 답변 문장이 서로 다른 행동 기준 또는 근거 성숙도 차원을 동시에 뒷받침합니다."
    }));
}

function buildGrowthFeedback(
  competencies: NcsCompetencyAssessmentDraft[],
  dimensions: NcsEvidenceDimensionDraft[]
): NcsGrowthFeedback {
  const observed = competencies.flatMap((competency) =>
    competency.behaviors.filter((behavior) => behavior.observed)
  );
  const missing = competencies.flatMap((competency) =>
    competency.behaviors.filter((behavior) => !behavior.observed).map((behavior) => behavior.behaviorId)
  );
  const weakDimension = dimensions.find((dimension) => dimension.score < 2);
  const strengths = observed.slice(0, 2).map((behavior) =>
    `${behaviorLabel(behavior.behaviorId)} 근거: "${behavior.evidenceQuotes[0]}"`
  );
  const gaps = [
    ...missing.slice(0, 2).map((behaviorId) => `${behaviorLabel(behaviorId)}을 보여주는 구체 문장을 보강하세요.`),
    ...(weakDimension ? [`${dimensionLabel(weakDimension.dimensionId)} 근거를 한 단계 더 구체화하세요.`] : [])
  ].slice(0, 2);

  return {
    strengths,
    gaps,
    nextAction: weakDimension
      ? `${dimensionLabel(weakDimension.dimensionId)}을 보여주는 본인 행동과 확인 가능한 결과를 한 문장씩 추가하세요.`
      : "같은 구조를 다른 직무 상황에도 적용한 근거를 추가하세요.",
    followUpQuestion: weakDimension
      ? `${dimensionLabel(weakDimension.dimensionId)}을 확인할 수 있도록 당시 판단 기준과 결과를 더 구체적으로 설명해 주세요.`
      : "이 경험의 방식을 다음 유사 상황에 어떻게 재적용했는지 설명해 주세요."
  };
}

function validateDraft(input: NcsTextEvaluationInput, draft: NcsTextEvaluationDraft) {
  const reasons: string[] = [];
  let exactQuotesValid = true;
  let sharedEvidenceValid = true;
  let confidenceValid = true;
  let forbiddenWordingDetected = false;

  if (!Array.isArray(draft.competencies) || !Array.isArray(draft.evidenceDimensions)) {
    return {
      reasons: ["evaluation draft arrays are required"],
      exactQuotesValid: false,
      sharedEvidenceValid: false,
      confidenceValid: false,
      forbiddenWordingDetected: false
    };
  }

  const competencyIds = draft.competencies.map((competency) => competency.profileId);
  if (!sameUniqueValues(competencyIds, input.profileIds)) {
    reasons.push("competencies must match the selected profileIds exactly");
  }

  for (const competency of draft.competencies) {
    if (!input.profileIds.includes(competency.profileId)) continue;
    const profile = ncsProfile(competency.profileId);
    const expectedBehaviorIds = profile.behaviors.map((behavior) => behavior.id);
    const actualBehaviorIds = Array.isArray(competency.behaviors)
      ? competency.behaviors.map((behavior) => behavior.behaviorId)
      : [];
    if (!sameUniqueValues(actualBehaviorIds, expectedBehaviorIds)) {
      reasons.push(`behaviors must match profile ${competency.profileId}`);
    }
    if (!Number.isInteger(competency.level) || competency.level < 1 || competency.level > 5) {
      reasons.push(`competency level is invalid for ${competency.profileId}`);
    }
    if (!isConfidence(competency.confidence)) {
      confidenceValid = false;
      reasons.push(`competency confidence is invalid for ${competency.profileId}`);
    }

    const observedBehaviorCount = (competency.behaviors ?? []).filter((behavior) => behavior.observed).length;
    if (!levelMatchesObservedBehaviors(competency.level, observedBehaviorCount)) {
      reasons.push(`competency level is not supported by observed behaviors for ${competency.profileId}`);
    }

    for (const behavior of competency.behaviors ?? []) {
      if (!isConfidence(behavior.confidence)) {
        confidenceValid = false;
        reasons.push(`behavior confidence is invalid for ${behavior.behaviorId}`);
      }
      if (!Array.isArray(behavior.evidenceQuotes)) {
        exactQuotesValid = false;
        reasons.push(`evidenceQuotes is required for ${behavior.behaviorId}`);
        continue;
      }
      if ((behavior.observed && behavior.evidenceQuotes.length === 0) || (!behavior.observed && behavior.evidenceQuotes.length > 0)) {
        reasons.push(`observed and evidenceQuotes disagree for ${behavior.behaviorId}`);
      }
      for (const quote of behavior.evidenceQuotes) {
        if (!isExactAnswerQuote(input.answerText, quote)) {
          exactQuotesValid = false;
          reasons.push(`evidence quote is not an exact substring of answer for behavior ${behavior.behaviorId}`);
        } else if (isPromptInjectionEvidence(input.answerText, quote)) {
          reasons.push(`prompt injection text cannot be used as evidence for behavior ${behavior.behaviorId}`);
        }
        if (containsSensitiveEvidence(quote)) {
          forbiddenWordingDetected = true;
          reasons.push(`sensitive attribute cannot be used as evidence for behavior ${behavior.behaviorId}`);
        }
      }
    }
  }

  const expectedDimensionIds = ncsEvidenceDimensions(input.questionMode).map((dimension) => dimension.id);
  const actualDimensionIds = draft.evidenceDimensions.map((dimension) => dimension.dimensionId);
  if (!sameUniqueValues(actualDimensionIds, expectedDimensionIds)) {
    reasons.push(`evidence dimensions must match questionMode ${input.questionMode}`);
  }
  for (const dimension of draft.evidenceDimensions) {
    if (!Number.isInteger(dimension.score) || dimension.score < 0 || dimension.score > 2) {
      reasons.push(`evidence dimension score is invalid for ${dimension.dimensionId}`);
    }
    if (!isConfidence(dimension.confidence)) {
      confidenceValid = false;
      reasons.push(`evidence dimension confidence is invalid for ${dimension.dimensionId}`);
    }
    if (!Array.isArray(dimension.evidenceQuotes)) {
      exactQuotesValid = false;
      reasons.push(`evidenceQuotes is required for ${dimension.dimensionId}`);
      continue;
    }
    if ((dimension.score > 0 && dimension.evidenceQuotes.length === 0) || (dimension.score === 0 && dimension.evidenceQuotes.length > 0)) {
      reasons.push(`score and evidenceQuotes disagree for ${dimension.dimensionId}`);
    }
    for (const quote of dimension.evidenceQuotes) {
      if (!isExactAnswerQuote(input.answerText, quote)) {
        exactQuotesValid = false;
        reasons.push(`evidence quote is not an exact substring of answer for dimension ${dimension.dimensionId}`);
      } else if (isPromptInjectionEvidence(input.answerText, quote)) {
        reasons.push(`prompt injection text cannot be used as evidence for dimension ${dimension.dimensionId}`);
      }
      if (containsSensitiveEvidence(quote)) {
        forbiddenWordingDetected = true;
        reasons.push(`sensitive attribute cannot be used as evidence for dimension ${dimension.dimensionId}`);
      }
    }
  }

  const usages = collectEvidenceUsages(draft.competencies, draft.evidenceDimensions);
  const groupedUsages = groupEvidenceUsages(usages);
  const sharedEvidence = Array.isArray(draft.sharedEvidence) ? draft.sharedEvidence : [];
  for (const [quote, usedBy] of groupedUsages) {
    if (usedBy.length < 2) continue;
    const declaration = sharedEvidence.find((item) => item.quote === quote);
    if (!declaration || !normalizeSpace(declaration.reason) || !sameUniqueValues(declaration.usedBy, usedBy)) {
      sharedEvidenceValid = false;
      reasons.push(`shared evidence declaration is required for paths: ${usedBy.join(", ")}`);
    }
  }
  for (const declaration of sharedEvidence) {
    if (!isExactAnswerQuote(input.answerText, declaration.quote)) {
      exactQuotesValid = false;
      reasons.push("shared evidence quote is not an exact substring of answer");
    } else if (isPromptInjectionEvidence(input.answerText, declaration.quote)) {
      reasons.push("prompt injection text cannot be shared evidence");
    }
    if (containsSensitiveEvidence(declaration.quote)) {
      forbiddenWordingDetected = true;
      reasons.push("sensitive attribute cannot be shared evidence");
    }
    const actualUsages = groupedUsages.get(declaration.quote) ?? [];
    if (actualUsages.length < 2 || !sameUniqueValues(declaration.usedBy, actualUsages)) {
      sharedEvidenceValid = false;
      reasons.push("shared evidence usedBy is invalid");
    }
  }

  const generatedText = generatedEvaluationText(draft);
  const forbidden = FORBIDDEN_OUTPUT_PATTERNS.find(({ pattern }) => pattern.test(generatedText));
  if (forbidden) {
    forbiddenWordingDetected = true;
    reasons.push(`forbidden evaluation wording detected: ${forbidden.label}`);
  }

  if (!validGrowth(draft.growth)) {
    reasons.push("growth feedback fields are required");
  } else {
    const groundingQuotes = uniqueStrings(usages.map((usage) => usage.quote));
    for (const [index, strength] of draft.growth.strengths.entries()) {
      if (!groundingQuotes.some((quote) => strength.includes(quote))) {
        reasons.push(`growth strength must cite an exact evidence quote (item ${index + 1})`);
      }
    }
  }

  return {
    reasons: uniqueStrings(reasons),
    exactQuotesValid,
    sharedEvidenceValid,
    confidenceValid,
    forbiddenWordingDetected
  };
}

function collectEvidenceUsages(
  competencies: NcsCompetencyAssessmentDraft[],
  dimensions: NcsEvidenceDimensionDraft[]
): EvidenceUsage[] {
  return [
    ...competencies.flatMap((competency) =>
      (competency.behaviors ?? []).flatMap((behavior) =>
        (behavior.evidenceQuotes ?? []).map((quote) => ({
          quote,
          usedBy: `competency:${competency.profileId}:${behavior.behaviorId}`
        }))
      )
    ),
    ...dimensions.flatMap((dimension) =>
      (dimension.evidenceQuotes ?? []).map((quote) => ({
        quote,
        usedBy: `dimension:${dimension.dimensionId}`
      }))
    )
  ];
}

function groupEvidenceUsages(usages: EvidenceUsage[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const usage of usages) {
    const usedBy = grouped.get(usage.quote) ?? [];
    if (!usedBy.includes(usage.usedBy)) usedBy.push(usage.usedBy);
    grouped.set(usage.quote, usedBy);
  }
  return grouped;
}

function generatedEvaluationText(draft: NcsTextEvaluationDraft): string {
  return [
    ...draft.competencies.flatMap((competency) => [
      competency.rationale,
      ...(competency.behaviors ?? []).map((behavior) => behavior.rationale)
    ]),
    ...draft.evidenceDimensions.map((dimension) => dimension.rationale),
    ...(draft.sharedEvidence ?? []).map((item) => item.reason),
    ...(draft.growth?.strengths ?? []),
    ...(draft.growth?.gaps ?? []),
    draft.growth?.nextAction,
    draft.growth?.followUpQuestion
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

function validGrowth(value: NcsGrowthFeedback | undefined): value is NcsGrowthFeedback {
  return Boolean(
    value &&
      validStringArray(value.strengths) &&
      validStringArray(value.gaps) &&
      normalizeSpace(value.nextAction).length > 0 &&
      normalizeSpace(value.followUpQuestion).length > 0
  );
}

function validStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && normalizeSpace(item).length > 0);
}

function emptyOutput(
  input: NcsTextEvaluationInput,
  options: FinalizeOptions,
  state: {
    scoreStatus: "INSUFFICIENT_INPUT" | "LOW_ALIGNMENT";
    coverage: number;
    promptInjectionDetected: boolean;
    reasons: string[];
  }
): NcsTextEvaluationOutput {
  return {
    ...baseOutput(input, options),
    scoreStatus: state.scoreStatus,
    scores: { competency: null, evidence: null, total: null },
    coverage: state.coverage,
    confidence: "LOW",
    competencies: [],
    evidenceMaturity: { dimensions: [], sharedEvidence: [] },
    growth: {
      strengths: [],
      gaps: state.reasons,
      nextAction: "질문에 맞는 구체적인 상황, 본인 행동, 결과와 확인 근거를 추가하세요.",
      followUpQuestion: "당시 본인이 직접 수행한 행동과 그 결과를 구체적으로 설명해 주세요."
    },
    guardrail: {
      result: "PASS",
      reasons: [
        ...state.reasons,
        ...(state.promptInjectionDetected
          ? ["답변 안의 지시문은 신뢰하지 않고 평가 근거에서 제외했습니다."]
          : [])
      ],
      exactQuotesValid: true,
      sharedEvidenceValid: true,
      confidenceValid: true,
      forbiddenWordingDetected: false,
      promptInjectionDetected: state.promptInjectionDetected
    }
  };
}

function baseOutput(input: NcsTextEvaluationInput, options: FinalizeOptions) {
  return {
    kind: NCS_TEXT_EVALUATION_KIND,
    rubricVersion: NCS_TEXT_EVALUATION_RUBRIC_VERSION,
    promptVersion: NCS_TEXT_EVALUATION_PROMPT_VERSION,
    providerMode: options.providerMode,
    ...(options.model ? { model: options.model } : {}),
    questionMode: input.questionMode
  };
}

function blockedGrowth(): NcsGrowthFeedback {
  return {
    strengths: [],
    gaps: ["평가 출력 검증을 통과하지 못했습니다."],
    nextAction: "원문 근거와 평가 기준을 다시 확인한 뒤 재평가하세요.",
    followUpQuestion: "답변에서 직접 확인할 수 있는 근거를 중심으로 다시 설명해 주세요."
  };
}

function overallConfidence(values: NcsEvaluationConfidence[], coverage: number): NcsEvaluationConfidence {
  if (values.includes("LOW")) return "LOW";
  if (values.every((value) => value === "HIGH") && coverage >= 0.8) return "HIGH";
  return "MEDIUM";
}

function exactSentences(value: string): string[] {
  return (value.match(/[^.!?\n]+(?:[.!?]+|$)/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && value.includes(sentence));
}

function trustedInputText(value: string): string {
  return exactSentences(value)
    .filter((sentence) => !PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(sentence)))
    .join(" ");
}

function hasPromptInjection(value: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function hasInputPromptInjection(input: NcsTextEvaluationInput): boolean {
  return hasPromptInjection(input.question) || hasPromptInjection(input.answerText);
}

function isPromptInjectionEvidence(answer: string, quote: string): boolean {
  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(quote))) {
    return true;
  }
  const containingSentence = exactSentences(answer).find((sentence) => sentence.includes(quote));
  return Boolean(
    containingSentence && PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(containingSentence))
  );
}

function containsSensitiveEvidence(quote: string): boolean {
  return /(?:저는|나는|지원자|응답자).{0,16}(?:남성|여성|나이|연령|학벌|외모|장애인|건강\s*상태|출신\s*지역)|(?:남성|여성|나이|연령|학벌|외모|장애인|건강\s*상태|출신\s*지역).{0,16}(?:지원자|응답자)/i.test(quote) ||
    /\b(?:i\s+am|candidate\s+is|applicant\s+is).{0,24}(?:male|female|young|old|disabled|healthy|unhealthy)\b/i.test(quote);
}

function matchingQuotes(sentences: string[], keywords: readonly string[]): string[] {
  return sentences
    .filter((sentence) => includesAny(sentence.toLowerCase(), keywords))
    .slice(0, 2);
}

function isExactAnswerQuote(answer: string, quote: unknown): quote is string {
  return typeof quote === "string" && normalizeSpace(quote).length > 0 && answer.includes(quote);
}

function isConfidence(value: unknown): value is NcsEvaluationConfidence {
  return CONFIDENCE_VALUES.includes(value as NcsEvaluationConfidence);
}

function levelMatchesObservedBehaviors(level: number, observedCount: number): boolean {
  if (level === 1) return observedCount === 0;
  if (level === 2) return observedCount >= 1 && observedCount <= 2;
  if (level === 3) return observedCount >= 2;
  return observedCount === 3;
}

function sameUniqueValues(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function behaviorLabel(behaviorId: string): string {
  for (const profileId of PROFILE_IDS) {
    const behavior = ncsProfile(profileId).behaviors.find((item) => item.id === behaviorId);
    if (behavior) return behavior.label;
  }
  return behaviorId;
}

function dimensionLabel(dimensionId: string): string {
  for (const mode of QUESTION_MODES) {
    const dimension = ncsEvidenceDimensions(mode).find((item) => item.id === dimensionId);
    if (dimension) return dimension.label;
  }
  return dimensionId;
}

function includesAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase()));
}

function normalizeSpace(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function roundTo(value: number, places: number): number {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
