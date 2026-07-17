import type {
  InterviewSettings,
  NcsProfileId,
  NcsQuestionImpact,
} from "./types";

export type NcsCriterionToggleDraft = {
  draftId: string;
  tagId: number;
  weight: string;
};

export function setNcsCriterionActive<T extends NcsCriterionToggleDraft>(
  criteria: T[],
  draftId: string,
  active: boolean,
): T[] {
  return criteria.map((criterion) => {
    if (criterion.draftId !== draftId) return criterion;
    return {
      ...criterion,
      weight: active
        ? String(Math.max(1, Number(criterion.weight) || 0))
        : "0",
    };
  });
}

export function validateNcsActiveWeightDrafts(
  criteria: NcsCriterionToggleDraft[],
): string {
  const weights = criteria.map((criterion) => Number(criterion.weight));
  if (weights.some((weight) => !Number.isInteger(weight) || weight < 0 || weight > 100)) {
    return "NCS 배점은 0부터 100 사이의 정수로 입력해주세요.";
  }
  if (weights.every((weight) => weight === 0)) {
    return "NCS 평가 기준을 최소 1개 이상 활성화해주세요.";
  }
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 100) {
    return "NCS 배점 합계는 정확히 100이어야 합니다.";
  }
  return "";
}

export function findNewlyDeactivatedQuestionImpacts(
  settings: InterviewSettings,
  criteria: NcsCriterionToggleDraft[],
): NcsQuestionImpact[] {
  const profileByTagId = new Map(
    settings.availableTags
      .filter((tag): tag is typeof tag & { ncsProfileId: NcsProfileId } =>
        tag.ncsProfileId !== null,
      )
      .map((tag) => [tag.tagId, tag.ncsProfileId]),
  );
  const currentActiveProfiles = new Set(
    settings.criteria
      .filter((criterion) => criterion.weight > 0 && criterion.ncsProfileId)
      .map((criterion) => criterion.ncsProfileId as NcsProfileId),
  );
  const nextActiveProfiles = new Set(
    criteria
      .filter((criterion) => Number(criterion.weight) > 0)
      .map((criterion) => profileByTagId.get(criterion.tagId))
      .filter((profileId): profileId is NcsProfileId => profileId !== undefined),
  );

  return settings.questionImpactByProfile.filter(
    (impact) =>
      currentActiveProfiles.has(impact.ncsProfileId) &&
      !nextActiveProfiles.has(impact.ncsProfileId) &&
      impact.exclusivelyBoundActiveQuestionCount + impact.multiBoundActiveQuestionCount > 0,
  );
}

export function getConfigurationLockedMessage(
  reason: InterviewSettings["configurationLockedReason"],
): string {
  return reason === "SUBMITTED_APPLICATION_EXISTS"
    ? "제출된 지원 이력이 있어 평가 기준과 질문 구성을 변경할 수 없습니다. 기존 면접 기록은 그대로 유지됩니다."
    : "현재 면접 설정을 변경할 수 없습니다.";
}
