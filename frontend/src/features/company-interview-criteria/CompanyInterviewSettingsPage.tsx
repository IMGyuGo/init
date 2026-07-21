"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import interviewBanner from "../company-recruiting/assets/interview-banner.png";

import { BackButton, StatusBadge } from "../company-recruiting/CompanyRecruitingChrome";
import {
  confirmQuestionSet,
  createInterviewQuestion,
  deleteInterviewQuestion,
  generateInterviewQuestions,
  getAiJobStatus,
  getInterviewSettings,
  updateEvaluationCriteria,
  updateInterviewQuestion,
  updateInterviewTimePolicy,
  updateQuestionGenerationPolicy,
} from "./api";
import { hasActiveAiJobs, startAiJobPolling } from "./ai-job-polling";
import {
  reconcileSettingsAfterCriteriaSave,
  reconcileSettingsAfterQuestionSetConfirm,
} from "./interview-settings-sync";
import {
  findNewlyDeactivatedQuestionImpacts,
  getConfigurationLockedMessage,
  setNcsCriterionActive,
  validateNcsActiveWeightDrafts,
} from "./ncs-active-profile-settings";
import {
  buildAutoApplyQuestionPlan,
  buildCommonQuestionSetPlan,
  findStaleGeneratedQuestionIds,
} from "./question-set-workflow";
import type {
  AiJobOutput,
  AiJobResult,
  AiProcessStatus,
  GeneratedQuestionCandidate,
  InterviewSettings,
  EvaluationFramework,
  NcsProfileId,
  NcsQuestionImpact,
  QuestionType,
} from "./types";

type CriteriaDraft = {
  draftId: string;
  criterionId?: number;
  tagId: number;
  tagName: string;
  category: string;
  description: string | null;
  weight: string;
  passScore: string;
  sortOrder: string;
};

type QuestionForm = {
  criterionId: string;
  secondaryCriterionId: string;
  questionType: QuestionType;
  content: string;
};

type TimePolicyDraft = {
  preparationTimeSec: string;
  preparationTimeMode: string;
  answerTimeSec: string;
  answerTimeMode: string;
  retryAllowed: boolean;
};

type TimePolicyField = "preparationTimeSec" | "answerTimeSec";

type QuestionGenerationPolicyDraft = {
  jdCriteriaQuestionCount: string;
  resumeQuestionCount: string;
};

type AiJobKind = "questions";

type AiJobNotice = {
  kind: AiJobKind;
  label: string;
  processLogId: number;
  status: AiProcessStatus;
  output?: AiJobOutput;
  failure?: AiJobResult["failure"];
  requestedAt: number;
  lastCheckedAt: number;
};

const QUESTION_TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: "INTRO", label: "도입" },
  { value: "TECHNICAL", label: "기술" },
  { value: "EXPERIENCE", label: "경험" },
  { value: "SITUATION", label: "상황" },
  { value: "FOLLOW_UP", label: "꼬리질문" },
  { value: "CLOSING", label: "마무리" },
];

const initialQuestionForm: QuestionForm = {
  criterionId: "",
  secondaryCriterionId: "",
  questionType: "TECHNICAL",
  content: "",
};

const AI_STATUS_LABELS: Record<AiProcessStatus, string> = {
  PENDING: "대기 중",
  RUNNING: "처리 중",
  COMPLETED: "완료",
  FAILED: "실패",
};

const NCS_PROFILE_ORDER: NcsProfileId[] = ["JOB_TECHNICAL", "COLLABORATION_COMMUNICATION", "PROBLEM_SOLVING"];
const NCS_PROFILE_LABELS: Record<NcsProfileId, string> = {
  JOB_TECHNICAL: "기술·직무",
  COLLABORATION_COMMUNICATION: "협업·의사소통",
  PROBLEM_SOLVING: "문제 해결력",
};
function getSettingsStepStorageKey(postingId: number) {
  return `company-interview-settings-step:${postingId}`;
}

export function CompanyInterviewSettingsPage({ postingId }: { postingId?: number }) {
  const [settings, setSettings] = useState<InterviewSettings | null>(null);
  const [settingsStep, setSettingsStep] = useState(1);
  const [criteriaDrafts, setCriteriaDrafts] = useState<CriteriaDraft[]>([]);
  const [overallPassScore, setOverallPassScore] = useState("80");
  const [timePolicyDraft, setTimePolicyDraft] = useState<TimePolicyDraft | null>(null);
  const [evaluationFramework, setEvaluationFramework] = useState<EvaluationFramework>("NCS_3_PROFILE_V1");
  const [questionPolicyDraft, setQuestionPolicyDraft] = useState<QuestionGenerationPolicyDraft | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionForm>(initialQuestionForm);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [questionEditDraft, setQuestionEditDraft] = useState<QuestionForm | null>(null);
  const [openQuestionMenuId, setOpenQuestionMenuId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const [criteriaError, setCriteriaError] = useState("");
  const [pendingQuestionImpact, setPendingQuestionImpact] = useState<NcsQuestionImpact[]>([]);
  const [timePolicySaving, setTimePolicySaving] = useState(false);
  const [timePolicyError, setTimePolicyError] = useState("");
  const [questionPolicySaving, setQuestionPolicySaving] = useState(false);
  const [questionPolicyError, setQuestionPolicyError] = useState("");
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [aiJobSubmitting, setAiJobSubmitting] = useState<AiJobKind | null>(null);
  const [aiJobError, setAiJobError] = useState("");
  const [aiJobNotices, setAiJobNotices] = useState<AiJobNotice[]>([]);
  const [questionSetConfirming, setQuestionSetConfirming] = useState(false);
  const [editingTimePolicyField, setEditingTimePolicyField] = useState<TimePolicyField | null>(null);
  const [autoAppliedQuestionProcessIds, setAutoAppliedQuestionProcessIds] = useState<number[]>([]);
  const [isQuestionDrawerOpen, setIsQuestionDrawerOpen] = useState(false);
  const [settingsStepRestored, setSettingsStepRestored] = useState(false);
  const aiJobNoticesRef = useRef(aiJobNotices);
  const hasActiveAiJobNotices = useMemo(() => hasActiveAiJobs(aiJobNotices), [aiJobNotices]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setCriteriaError("");
    setTimePolicyError("");
    setQuestionError("");
    setAiJobError("");
    try {
      const response = await getInterviewSettings(postingId);
      const fixedNcsCriteria = toFixedNcsCriteriaDrafts(response.data);
      setSettings(response.data);
      setCriteriaDrafts(fixedNcsCriteria ?? []);
      setOverallPassScore(String(response.data.screeningPolicy?.passMinTotalScore ?? 80));
      setTimePolicyDraft(toTimePolicyDraft(response.data));
      setEvaluationFramework(
        response.data.evaluationFramework === "LEGACY" &&
          !response.data.configurationLocked
          ? "NCS_ACTIVE_PROFILE_V2"
          : response.data.evaluationFramework,
      );
      if (!fixedNcsCriteria) {
        setCriteriaError("NCS 3개 평가 기준 binding이 준비되지 않았습니다. seed와 migration 적용 상태를 확인해주세요.");
      }
      setQuestionPolicyDraft(toQuestionGenerationPolicyDraft(response.data));
      setEditingQuestionId(null);
      setQuestionEditDraft(null);
      setOpenQuestionMenuId(null);
      setPendingQuestionImpact([]);
      setIsQuestionDrawerOpen(false);
      setEditingTimePolicyField(null);
      setQuestionForm({
        ...initialQuestionForm,
        criterionId: String(response.data.criteria[0]?.criterionId ?? ""),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "면접 설정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [postingId]);

  const settingsPostingId = settings?.posting.postingId;

  useEffect(() => {
    if (!settingsPostingId) return;

    setSettingsStepRestored(false);
    const storedStep = window.sessionStorage.getItem(getSettingsStepStorageKey(settingsPostingId));
    const parsedStep = Number(storedStep);
    setSettingsStep(parsedStep === 2 || parsedStep === 3 ? parsedStep : 1);
    setSettingsStepRestored(true);
  }, [settingsPostingId]);

  useEffect(() => {
    if (!settingsPostingId || !settingsStepRestored) return;
    window.sessionStorage.setItem(getSettingsStepStorageKey(settingsPostingId), String(settingsStep));
  }, [settingsPostingId, settingsStep, settingsStepRestored]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    aiJobNoticesRef.current = aiJobNotices;
  }, [aiJobNotices]);

  useEffect(() => {
    if (!hasActiveAiJobNotices) return undefined;

    let canceled = false;
    const poll = async (): Promise<void> => {
      const activeJobs = aiJobNoticesRef.current.filter((notice) => !isTerminalAiStatus(notice.status));
      if (activeJobs.length === 0) return;

      const results: Array<{ kind: AiJobKind; data: AiJobResult } | { kind: AiJobKind; error: string }> = await Promise.all(
        activeJobs.map(async (notice) => {
          try {
            const response = await getAiJobStatus(notice.processLogId);
            return { kind: notice.kind, data: response.data };
          } catch (error) {
            return {
              kind: notice.kind,
              error: error instanceof Error ? error.message : "AI 작업 상태를 조회하지 못했습니다.",
            };
          }
        }),
      );

      if (canceled) return;

      setAiJobNotices((current) => {
        let changed = false;
        const next = current.map((notice) => {
          const result = results.find((item) => item.kind === notice.kind);
          if (!result || !("data" in result)) {
            if (!isTerminalAiStatus(notice.status)) {
              changed = true;
              return { ...notice, lastCheckedAt: Date.now() };
            }
            return notice;
          }

          const output = normalizeAiJobOutput(result.data.output);
          if (
            notice.status !== result.data.status ||
            notice.output !== output ||
            notice.failure !== result.data.failure ||
            !isTerminalAiStatus(result.data.status)
          ) {
            changed = true;
          }
          return {
            ...notice,
            status: result.data.status,
            output,
            failure: result.data.failure,
            lastCheckedAt: Date.now(),
          };
        });
        return changed ? next : current;
      });

      const failed = results.find((item) => "error" in item);
      if (failed && "error" in failed) {
        setAiJobError(formatAiRequestError(failed.error ?? "AI 작업 상태를 조회하지 못했습니다."));
      }
    };

    const stopPolling = startAiJobPolling({
      poll,
      hasWork: () => hasActiveAiJobs(aiJobNoticesRef.current),
    });

    return () => {
      canceled = true;
      stopPolling();
    };
  }, [hasActiveAiJobNotices]);

  const criteriaTotalWeight = useMemo(
    () => criteriaDrafts.reduce((sum, criterion) => sum + toNumber(criterion.weight), 0),
    [criteriaDrafts],
  );

  const hasCriteriaChanges = useMemo(() => {
    if (!settings) return false;
    return (
      evaluationFramework !== settings.evaluationFramework ||
      JSON.stringify(criteriaDrafts) !== JSON.stringify(toCriteriaDrafts(settings)) ||
      overallPassScore !== String(settings.screeningPolicy?.passMinTotalScore ?? 80)
    );
  }, [criteriaDrafts, evaluationFramework, overallPassScore, settings]);
  const hasQuestionPolicyChanges = useMemo(() => {
    if (!settings || !questionPolicyDraft) return false;
    return (
      questionPolicyDraft.jdCriteriaQuestionCount !== String(settings.questionGenerationPolicy.jdCriteriaQuestionCount) ||
      questionPolicyDraft.resumeQuestionCount !== String(settings.questionGenerationPolicy.resumeQuestionCount)
    );
  }, [questionPolicyDraft, settings]);

  const visibleQuestions = useMemo(() => {
    if (!settings) return [];
    const visibleCriterionIds = new Set(
      criteriaDrafts
        .map((criterion) => criterion.criterionId)
        .filter((criterionId): criterionId is number => criterionId !== undefined),
    );
    return settings.questions.filter((question) => question.criterionId === null || visibleCriterionIds.has(question.criterionId));
  }, [criteriaDrafts, settings]);

  const activeAiJobKinds = useMemo(
    () => new Set(aiJobNotices.filter((notice) => !isTerminalAiStatus(notice.status)).map((notice) => notice.kind)),
    [aiJobNotices],
  );
  const questionAiNotices = useMemo(() => aiJobNotices.filter((notice) => notice.kind === "questions"), [aiJobNotices]);

  function updateCriteriaDraft(
    draftId: string,
    field: "weight" | "passScore",
    value: string,
  ) {
    setCriteriaError("");
    setCriteriaDrafts((current) =>
      current.map((criterion) =>
        criterion.draftId === draftId
          ? {
              ...criterion,
              [field]: value,
            }
          : criterion,
      ),
    );
  }

  function updateOverallPassScore(value: string) {
    setCriteriaError("");
    setOverallPassScore(value);
  }

  function updateCriterionActive(draftId: string, active: boolean) {
    setCriteriaError("");
    setCriteriaDrafts((current) =>
      setNcsCriterionActive(current, draftId, active),
    );
  }

  function updateTimePolicyDraft<K extends keyof TimePolicyDraft>(field: K, value: TimePolicyDraft[K]) {
    setTimePolicyError("");
    setTimePolicyDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateTimePolicySeconds(field: TimePolicyField, value: string) {
    updateTimePolicyDraft(field, toDigitsOnly(value));
  }

  function resetTimePolicyDraft() {
    if (!settings) return;
    setTimePolicyError("");
    setTimePolicyDraft(toTimePolicyDraft(settings));
  }

  async function saveCriteriaDrafts(confirmQuestionImpact = false): Promise<boolean> {
    if (!settings) return true;
    if (settings.configurationLocked) {
      setCriteriaError(getConfigurationLockedMessage(settings.configurationLockedReason));
      return false;
    }

    const validationMessage = validateCriteriaDrafts(criteriaDrafts, evaluationFramework, overallPassScore);
    if (validationMessage) {
      setCriteriaError(validationMessage);
      return false;
    }

    if (
      evaluationFramework === "NCS_ACTIVE_PROFILE_V2" &&
      !confirmQuestionImpact
    ) {
      const impacts = findNewlyDeactivatedQuestionImpacts(
        settings,
        criteriaDrafts,
      );
      if (impacts.length > 0) {
        setPendingQuestionImpact(impacts);
        return false;
      }
    }

    setCriteriaSaving(true);
    setCriteriaError("");
    try {
      const normalizedCriteria = normalizeCriteriaOrder(criteriaDrafts);
      const response = await updateEvaluationCriteria({
        postingId: settings.posting.postingId,
        evaluationFramework,
        confirmQuestionImpact,
        screeningPolicy: {
          enabled: true,
          passMinTotalScore: toNumber(overallPassScore),
          holdMinTotalScore: 0,
          requireAllCriteriaPass: true,
        },
        criteria: normalizedCriteria.map((criterion) => ({
          criterionId: criterion.criterionId,
          tagId: criterion.tagId,
          description: criterion.description,
          weight: toNumber(criterion.weight),
          passScore: criterion.passScore.trim() === "" ? null : Math.min(toNumber(criterion.passScore), toNumber(criterion.weight)),
          sortOrder: toNumber(criterion.sortOrder),
        })),
      });

      setSettings((current) => {
        if (!current) return current;

        const reconciledSettings = reconcileSettingsAfterCriteriaSave(current, response.data.criteria);
        return {
          ...reconciledSettings,
          evaluationFramework: response.data.evaluationFramework,
          screeningPolicy: response.data.screeningPolicy,
          questionGenerationPolicy: {
            ...current.questionGenerationPolicy,
            criteriaVersion: response.data.criteriaVersion,
          },
        };
      });
      setCriteriaDrafts(
        response.data.criteria.map((criterion) => ({
          draftId: String(criterion.criterionId),
          criterionId: criterion.criterionId,
          tagId: criterion.tagId,
          tagName: criterion.tagName,
          category: criterion.category,
          description: criterion.description,
          weight: String(criterion.weight),
          passScore: criterion.passScore === null ? "" : String(Math.min(criterion.passScore, criterion.weight)),
          sortOrder: String(criterion.sortOrder),
        })),
      );
      setPendingQuestionImpact([]);

      try {
        const latestResponse = await getInterviewSettings(settings.posting.postingId);
        const latestSettings = latestResponse.data;
        const latestCriterionIds = new Set(latestSettings.criteria.map((criterion) => criterion.criterionId));

        setSettings(latestSettings);
        setCriteriaDrafts(toCriteriaDrafts(latestSettings));
        setQuestionForm((current) => ({
          ...current,
          criterionId: latestCriterionIds.has(Number(current.criterionId))
            ? current.criterionId
            : String(latestSettings.criteria[0]?.criterionId ?? ""),
        }));
      } catch {
        setCriteriaError("평가 기준은 저장됐지만 최신 질문 목록을 불러오지 못했습니다. 새로고침 후 다시 진행해주세요.");
        return false;
      }

      return true;
    } catch (error) {
      setCriteriaError(error instanceof Error ? error.message : "평가 기준 저장에 실패했습니다.");
      return false;
    } finally {
      setCriteriaSaving(false);
    }
  }

  async function saveQuestionPolicy(): Promise<boolean> {
    if (!settings || !questionPolicyDraft || !hasQuestionPolicyChanges) return true;
    if (settings.configurationLocked) {
      setQuestionPolicyError(getConfigurationLockedMessage(settings.configurationLockedReason));
      return false;
    }
    const jdCriteriaQuestionCount = toNumber(questionPolicyDraft.jdCriteriaQuestionCount);
    const resumeQuestionCount = toNumber(questionPolicyDraft.resumeQuestionCount);
    const total = jdCriteriaQuestionCount + resumeQuestionCount;
    if (total < 1 || total > 20) {
      setQuestionPolicyError("전체 질문 수는 1개 이상 20개 이하로 설정해주세요.");
      return false;
    }
    if (evaluationFramework === "NCS_3_PROFILE_V1" && total < 3) {
      setQuestionPolicyError("NCS 면접 질문은 세 평가 기준을 포함하도록 3개 이상 설정해주세요.");
      return false;
    }
    if (
      evaluationFramework === "NCS_ACTIVE_PROFILE_V2" &&
      (jdCriteriaQuestionCount < 3 || resumeQuestionCount < 1)
    ) {
      setQuestionPolicyError("동적 NCS 면접은 공통 질문 3개 이상, 개인화 질문 1개 이상으로 설정해주세요.");
      return false;
    }

    setQuestionPolicySaving(true);
    setQuestionPolicyError("");
    try {
      const response = await updateQuestionGenerationPolicy({
        postingId: settings.posting.postingId,
        jdCriteriaQuestionCount,
        resumeQuestionCount,
        expectedPolicyVersion: settings.questionGenerationPolicy.policyVersion,
      });
      setSettings((current) => current ? {
        ...current,
        questionGenerationPolicy: {
          ...response.data,
          resumeQuestionStatus: response.data.resumeQuestionCount === 0 ? "DISABLED" : "WAITING_APPLICATION",
        },
      } : current);
      setQuestionPolicyDraft({
        jdCriteriaQuestionCount: String(response.data.jdCriteriaQuestionCount),
        resumeQuestionCount: String(response.data.resumeQuestionCount),
      });
      return true;
    } catch (error) {
      setQuestionPolicyError(error instanceof Error ? error.message : "질문 생성 개수 저장에 실패했습니다.");
      return false;
    } finally {
      setQuestionPolicySaving(false);
    }
  }

  async function handleCriteriaSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCriteriaDrafts();
  }

  async function saveTimePolicy(): Promise<boolean> {
    if (!settings || !timePolicyDraft) return true;

    const validationMessage = validateTimePolicyDraft(timePolicyDraft);
    if (validationMessage) {
      setTimePolicyError(validationMessage);
      return false;
    }

    setTimePolicySaving(true);
    setTimePolicyError("");
    try {
      const response = await updateInterviewTimePolicy({
        postingId: settings.posting.postingId,
        preparationTimeSec: toNumber(timePolicyDraft.preparationTimeSec),
        answerTimeSec: toNumber(timePolicyDraft.answerTimeSec),
        retryAllowed: timePolicyDraft.retryAllowed,
      });

      setSettings((current) =>
        current
          ? {
              ...current,
              timePolicy: response.data.timePolicy,
            }
          : current,
      );
      setTimePolicyDraft(toTimePolicyDraft({ ...settings, timePolicy: response.data.timePolicy }));
      setEditingTimePolicyField(null);
      return true;
    } catch (error) {
      setTimePolicyError(error instanceof Error ? error.message : "면접 시간 정책 저장에 실패했습니다.");
      return false;
    } finally {
      setTimePolicySaving(false);
    }
  }

  function updateQuestionForm<K extends keyof QuestionForm>(field: K, value: QuestionForm[K]) {
    setQuestionError("");
    setQuestionForm((current) => ({ ...current, [field]: value }));
  }

  function updateQuestionEditDraft<K extends keyof QuestionForm>(field: K, value: QuestionForm[K]) {
    setQuestionError("");
    setQuestionEditDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function resetQuestionEditor() {
    setEditingQuestionId(null);
    setQuestionEditDraft(null);
  }

  function closeQuestionDrawer() {
    setIsQuestionDrawerOpen(false);
    resetQuestionEditor();
  }

  function openQuestionCreateDrawer() {
    resetQuestionEditor();
    setQuestionError("");
    setIsQuestionDrawerOpen(true);
  }

  function resetQuestionForm(nextCriterionId = questionForm.criterionId) {
    setQuestionForm({
      ...initialQuestionForm,
      criterionId: nextCriterionId,
    });
  }

  function startQuestionEdit(question: InterviewSettings["questions"][number]) {
    if (question.criterionId === null) {
      setQuestionError("평가 기준이 연결된 질문만 수정할 수 있습니다.");
      return;
    }
    setEditingQuestionId(question.questionId);
    setQuestionError("");
    setQuestionEditDraft({
      criterionId: String(question.criterionId),
      secondaryCriterionId: String(question.ncsBindings[1]?.criterionId ?? ""),
      questionType: question.questionType,
      content: question.content,
    });
    setIsQuestionDrawerOpen(true);
  }

  async function handleCreateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;

    const criterionId = Number(questionForm.criterionId);
    const criterionIds = [criterionId, Number(questionForm.secondaryCriterionId)].filter(
      (value) => Number.isInteger(value) && value > 0,
    );
    const content = questionForm.content.trim();
    const validationMessage = validateQuestionForm(settings, criterionId, content, null, criterionIds);
    if (validationMessage) {
      setQuestionError(validationMessage);
      return;
    }

    setQuestionSaving(true);
    setQuestionError("");
    try {
      const response = await createInterviewQuestion({
        postingId: settings.posting.postingId,
        criterionId,
        criterionIds,
        questionType: questionForm.questionType,
        content,
      });

      setSettings((current) =>
        current
          ? {
              ...current,
              questions: [...current.questions, response.data.question],
            }
          : current,
      );
      resetQuestionForm(String(criterionId));
      setIsQuestionDrawerOpen(false);
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "질문 저장에 실패했습니다.");
    } finally {
      setQuestionSaving(false);
    }
  }

  async function handleUpdateQuestion(questionId: number) {
    if (!settings || !questionEditDraft) return;

    const criterionId = Number(questionEditDraft.criterionId);
    const criterionIds = [criterionId, Number(questionEditDraft.secondaryCriterionId)].filter(
      (value) => Number.isInteger(value) && value > 0,
    );
    const content = questionEditDraft.content.trim();
    const validationMessage = validateQuestionForm(settings, criterionId, content, questionId, criterionIds);
    if (validationMessage) {
      setQuestionError(validationMessage);
      return;
    }

    setQuestionSaving(true);
    setQuestionError("");
    try {
      const response = await updateInterviewQuestion(questionId, {
        criterionId,
        criterionIds,
        questionType: questionEditDraft.questionType,
        content,
      });

      setSettings((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((question) =>
                question.questionId === response.data.question.questionId ? response.data.question : question,
              ),
            }
          : current,
      );
      closeQuestionDrawer();
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "질문 수정에 실패했습니다.");
    } finally {
      setQuestionSaving(false);
    }
  }

  async function handleDeleteQuestion(questionId: number) {
    if (!window.confirm("이 질문을 삭제하시겠습니까? 삭제된 질문은 면접 질문 구성 목록에서 제외됩니다.")) {
      return;
    }

    setQuestionSaving(true);
    setQuestionError("");
    try {
      await deleteInterviewQuestion(questionId);
      setSettings((current) =>
        current
          ? {
              ...current,
              questions: current.questions.filter((question) => question.questionId !== questionId),
            }
          : current,
      );
      if (editingQuestionId === questionId) {
        resetQuestionEditor();
      }
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "질문 삭제에 실패했습니다.");
    } finally {
      setQuestionSaving(false);
    }
  }

  async function handleGenerateQuestions() {
    if (!settings) return;
    if (
      settings.questionGenerationPolicy.policyVersion > 0 &&
      settings.questionGenerationPolicy.jdCriteriaQuestionCount === 0
    ) {
      setAiJobError("공통 질문 개수가 0개입니다. 질문 생성 개수를 먼저 변경해주세요.");
      return;
    }
    if (isAiRequestBlocked("questions", aiJobSubmitting, activeAiJobKinds)) return;
    if (hasCriteriaChanges) {
      setAiJobError("공통 질문을 추천받으려면 먼저 평가 기준 변경사항을 저장해주세요.");
      return;
    }
    if (settings.criteria.length === 0) {
      setAiJobError("공통 질문을 추천받으려면 먼저 NCS 평가 기준을 저장해주세요.");
      return;
    }

    setAiJobSubmitting("questions");
    setAiJobError("");
    try {
      const response = await generateInterviewQuestions({
        postingId: settings.posting.postingId,
        jdCriteriaQuestionCount:
          settings.questionGenerationPolicy.jdCriteriaQuestionCount > 0
            ? settings.questionGenerationPolicy.jdCriteriaQuestionCount
            : Math.max(3, settings.criteria.length || 3),
        expectedPolicyVersion:
          settings.questionGenerationPolicy.policyVersion > 0
            ? settings.questionGenerationPolicy.policyVersion
            : undefined,
      });
      rememberAiJob("questions", "AI 질문 추천", response.data);
    } catch (error) {
      setAiJobError(formatAiRequestError(error instanceof Error ? error.message : "AI 질문 추천 요청에 실패했습니다."));
    } finally {
      setAiJobSubmitting(null);
    }
  }

  function rememberAiJob(kind: AiJobKind, label: string, result: AiJobResult) {
    setAiJobNotices((current) => [
      {
        kind,
        label,
        processLogId: result.processLogId,
        status: result.status,
        output: normalizeAiJobOutput(result.output),
        failure: result.failure,
        requestedAt: Date.now(),
        lastCheckedAt: Date.now(),
      },
      ...current.filter((item) => item.kind !== kind),
    ]);
  }

  async function applyQuestionCandidate(
    candidate: GeneratedQuestionCandidate,
    selectedCriterionId?: number,
    source: "manual" | "ai" = "manual",
    sourceProcessLogId?: number,
  ) {
    if (!settings) return null;

    if (source === "ai" && settings.evaluationFramework !== "LEGACY" && candidate.alignmentStatus !== "ALIGNED") {
      setQuestionError("NCS 평가 기준 정렬을 통과한 질문만 저장할 수 있습니다.");
      return null;
    }

    const criterionId = selectedCriterionId ?? findCandidateCriterionId(settings, candidate);
    if (!criterionId) {
      setQuestionError("연결할 평가 기준 선택 필요");
      return null;
    }

    const content = candidate.content.trim();
    const validationMessage = validateQuestionForm(settings, criterionId, content, null);
    if (validationMessage) {
      setQuestionError(validationMessage);
      return null;
    }

    setQuestionSaving(true);
    setQuestionError("");
    try {
      const response = await createInterviewQuestion({
        postingId: settings.posting.postingId,
        criterionId,
        questionType: normalizeQuestionType(candidate.questionType),
        content,
        origin: source === "ai" ? "AI_GENERATED" : "MANUAL",
        sourceProcessLogId: source === "ai" ? sourceProcessLogId : undefined,
      });

      setSettings((current) =>
        current
          ? {
              ...current,
              questions: [...current.questions, response.data.question],
            }
          : current,
      );
      return response.data.question.questionId;
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "질문 후보 저장에 실패했습니다.");
      return null;
    } finally {
      setQuestionSaving(false);
    }
  }

  async function applyQuestionCandidatesToList(
    candidates: GeneratedQuestionCandidate[],
    sourceProcessLogId: number,
  ) {
    if (!settings) return { savedCount: 0, alreadySavedCount: 0, rejectedCount: candidates.length, removedCount: 0 };

    const plan = buildAutoApplyQuestionPlan(settings, candidates);
    let savedCount = 0;
    let rejectedCount = plan.rejectedCount;
    for (const item of plan.applicable) {
      const questionId = await applyQuestionCandidate(
        item.candidate,
        item.criterionId,
        "ai",
        sourceProcessLogId,
      );
      if (questionId) savedCount += 1;
      else rejectedCount += 1;
    }

    let removedCount = 0;
    if (
      candidates.length > 0 &&
      rejectedCount === 0 &&
      savedCount + plan.alreadySavedCount === candidates.length
    ) {
      const staleQuestionIds = findStaleGeneratedQuestionIds(settings, candidates, sourceProcessLogId);
      if (staleQuestionIds.length > 0) {
        setQuestionSaving(true);
        try {
          for (const questionId of staleQuestionIds) {
            await deleteInterviewQuestion(questionId);
            removedCount += 1;
          }
        } finally {
          setQuestionSaving(false);
        }
      }
    }

    return {
      savedCount,
      alreadySavedCount: plan.alreadySavedCount,
      rejectedCount,
      removedCount,
    };
  }

  useEffect(() => {
    if (!settings || settings.evaluationFramework === "LEGACY") return;

    const completedNotices = questionAiNotices.filter(
      (notice) => notice.status === "COMPLETED" && !autoAppliedQuestionProcessIds.includes(notice.processLogId),
    );
    if (completedNotices.length === 0) return;

    const processLogIds = completedNotices.map((notice) => notice.processLogId);
    setAutoAppliedQuestionProcessIds((current) => [
      ...current,
      ...processLogIds.filter((processLogId) => !current.includes(processLogId)),
    ]);

    void (async () => {
      let savedCount = 0;
      let alreadySavedCount = 0;
      let rejectedCount = 0;
      let removedCount = 0;

      for (const notice of completedNotices) {
        const result = await applyQuestionCandidatesToList(
          getQuestionCandidates(notice.output),
          notice.processLogId,
        );
        savedCount += result.savedCount;
        alreadySavedCount += result.alreadySavedCount;
        rejectedCount += result.rejectedCount;
        removedCount += result.removedCount;
      }

      if (savedCount > 0 || removedCount > 0) {
        await loadSettings();
        setMessage(
          removedCount > 0
            ? `AI 추천 질문 ${savedCount}개를 반영하고 이전 추천 질문 ${removedCount}개를 정리했습니다.`
            : `AI 추천 질문 ${savedCount}개를 공통 질문 목록에 추가했습니다.`,
        );
      } else if (alreadySavedCount > 0 && rejectedCount === 0) {
        setMessage("AI 추천 질문이 이미 공통 질문 목록에 반영되어 있습니다.");
      }
      if (rejectedCount > 0) {
        setQuestionError(`정렬 미통과 또는 평가 기준 연결 실패로 ${rejectedCount}개 질문을 반영하지 못했습니다.`);
      }
    })().catch((error) => {
      setQuestionError(error instanceof Error ? error.message : "AI 추천 질문을 공통 질문 목록에 반영하지 못했습니다.");
    });
    // AI 결과는 processLogId당 한 번만 적용하므로 handler identity로 effect를 재실행하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAppliedQuestionProcessIds, questionAiNotices, settings]);

  async function saveAndConfirmQuestionSettings() {
    if (!settings || !questionPolicyDraft) return;
    if (hasActiveAiJobs(questionAiNotices) || questionSaving) {
      setQuestionError("AI 질문 추천 또는 질문 저장이 끝난 뒤 다음 단계로 이동해주세요.");
      return;
    }

    const policySaved = await saveQuestionPolicy();
    if (!policySaved) return;
    if (evaluationFramework === "LEGACY") {
      setSettingsStep(3);
      return;
    }

    const expectedQuestionCount = toNumber(questionPolicyDraft.jdCriteriaQuestionCount);
    const plan = buildCommonQuestionSetPlan(settings, expectedQuestionCount);
    if (plan.error) {
      setQuestionError(plan.error);
      return;
    }

    setQuestionSetConfirming(true);
    setQuestionError("");
    try {
      await confirmQuestionSet({
        postingId: settings.posting.postingId,
        title: `${settings.posting.title} 공통 질문 세트`,
        sourceProcessLogId: plan.sourceProcessLogId,
        items: plan.items,
      });
      setSettings((current) =>
        current ? reconcileSettingsAfterQuestionSetConfirm(current) : current,
      );
      setMessage(`공통 질문 ${plan.items.length}개를 저장하고 면접에 적용했습니다.`);
      setSettingsStep(3);
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "공통 질문을 면접에 적용하지 못했습니다.");
    } finally {
      setQuestionSetConfirming(false);
    }
  }

  function retryAiJob(kind: AiJobKind) {
    if (isAiRequestBlocked(kind, aiJobSubmitting, activeAiJobKinds)) return;
    void handleGenerateQuestions();
  }

  return (
    <section className="app-page glass-page notion">
        <div className="page-banner">
          <div className="page-banner-copy">
            <div className="page-head-lead">
              <BackButton fallbackHref={postingId ? `/company/recruitments/${postingId}` : "/company/recruitments"} />
            </div>
            <h1>면접 설정</h1>
            <p className="page-sub">공고별 평가 기준, 면접 질문, 면접 시간을 확인합니다.</p>
            <button className="btn secondary banner-cta" type="button" disabled={loading} onClick={() => void loadSettings()}>
              새로고침
            </button>
          </div>
          <Image className="page-banner-art" src={interviewBanner} alt="" width={300} height={300} aria-hidden="true" priority />
        </div>

        {message ? <p className="notice">{message}</p> : null}

        {!settings ? (
          <section className="panel">
            <div className="empty">{loading ? "불러오는 중입니다." : "표시할 면접 설정이 없습니다."}</div>
          </section>
        ) : (
          <>
            <div className="settings-steps" aria-label="면접 설정 단계">
              <div className="settings-steps-meta">
                <span className="settings-steps-step">단계 {settingsStep} / 3</span>
                <span className="settings-steps-title">
                  {settingsStep === 1 ? "평가 기준 설정" : settingsStep === 2 ? "면접 질문 구성" : "면접 시간 설정"}
                </span>
              </div>
              <div className="settings-steps-bar" role="presentation">
                <span style={{ width: `${(settingsStep / 3) * 100}%` }} />
              </div>
            </div>
            {settings.configurationLocked ? (
              <p className="notice warning" role="status">
                {getConfigurationLockedMessage(settings.configurationLockedReason)}
              </p>
            ) : null}
            {settings.questionSetRequiresReconfirmation ? (
              <p className="notice warning" role="status">
                활성 평가 기준 또는 질문 정책이 변경되었습니다. 공통 질문 구성을 다시 확인하고 적용해주세요.
              </p>
            ) : null}

            {settingsStep === 3 ? (
              <>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>{settings.posting.title}</h2>
                </div>
                <StatusBadge value={settings.posting.status} />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: "12px",
                  marginTop: "12px",
                }}
              >
                <Metric compact label="평가 기준" value={settings.criteria.length} />
                <Metric compact label="질문" value={visibleQuestions.length} />
                {timePolicyDraft ? (
                  <>
                    <TimePolicyMetric
                      label="준비 시간"
                      maxLength={3}
                      saving={timePolicySaving}
                      value={timePolicyDraft.preparationTimeSec}
                      isEditing={editingTimePolicyField === "preparationTimeSec"}
                      onCancel={() => {
                        resetTimePolicyDraft();
                        setEditingTimePolicyField(null);
                      }}
                      onEdit={() => setEditingTimePolicyField("preparationTimeSec")}
                      onSave={() => void saveTimePolicy()}
                      onValueChange={(value) => updateTimePolicySeconds("preparationTimeSec", value)}
                    />
                    <TimePolicyMetric
                      label="답변 시간"
                      maxLength={4}
                      saving={timePolicySaving}
                      value={timePolicyDraft.answerTimeSec}
                      isEditing={editingTimePolicyField === "answerTimeSec"}
                      onCancel={() => {
                        resetTimePolicyDraft();
                        setEditingTimePolicyField(null);
                      }}
                      onEdit={() => setEditingTimePolicyField("answerTimeSec")}
                      onSave={() => void saveTimePolicy()}
                      onValueChange={(value) => updateTimePolicySeconds("answerTimeSec", value)}
                    />
                  </>
                ) : null}
              </div>
              {timePolicyError ? <p className="notice danger">{timePolicyError}</p> : null}
            </section>

            <div className="settings-step-nav">
              <button className="btn secondary" type="button" onClick={() => setSettingsStep(2)}>
                ← 이전
              </button>
              <button
                className="btn primary settings-next-large"
                type="button"
                disabled={timePolicySaving}
                onClick={async () => {
                  const ok = await saveTimePolicy();
                  if (ok) {
                    window.location.href = "/company/recruitments";
                  }
                }}
              >
                {timePolicySaving ? "저장 중…" : "면접 설정 완료"}
              </button>
            </div>
              </>
            ) : null}

            {settingsStep === 1 ? (
              <>
            <form className="panel" onSubmit={handleCriteriaSave}>
              <div className="panel-head">
                <div>
                  <h2>평가 기준</h2>
                  <p>사용할 NCS 역량을 선택하고 활성 배점 합계를 100으로 맞춥니다.</p>
                </div>
                <div className="toolbar">
                  <span className="badge info">NCS canonical 3개 기준</span>
                </div>
              </div>
              {criteriaError ? <p className="notice danger">{criteriaError}</p> : null}
              {aiJobError ? <p className="notice danger">{aiJobError}</p> : null}
              <div className="criteria-table-summary">
                <span className={`badge ${criteriaTotalWeight === 100 ? "info" : "danger"}`}>
                  배점 합계 {criteriaTotalWeight} / 100
                </span>
              </div>
              <div className="table-wrap">
                <table className="data-table criteria-table">
                  <thead>
                    <tr>
                      <th className="criteria-col-order">순서</th>
                      <th className="criteria-col-score">사용</th>
                      <th>태그</th>
                      <th>분류</th>
                      <th className="criteria-col-score">배점</th>
                      <th className="criteria-col-score">합격점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteriaDrafts.map((criterion) => (
                      <tr key={criterion.draftId}>
                        <td className="criteria-cell-order">
                          <span>{criterion.sortOrder}</span>
                        </td>
                        <td className="criteria-cell-score">
                          <input
                            aria-label={`${criterion.tagName} 사용`}
                            checked={toNumber(criterion.weight) > 0}
                            disabled={settings.configurationLocked}
                            type="checkbox"
                            onChange={(event) =>
                              updateCriterionActive(
                                criterion.draftId,
                                event.target.checked,
                              )
                            }
                          />
                        </td>
                        <td className="criteria-cell-tag">
                          <strong>{criterion.tagName}</strong>
                        </td>
                        <td className="criteria-cell-category">
                          {criterion.category || "-"}
                        </td>
                        <td className="criteria-cell-score">
                          <input
                            aria-label={`${criterion.tagName} 배점`}
                            inputMode="numeric"
                            min={0}
                            max={100}
                            type="number"
                            value={criterion.weight}
                            disabled={
                              settings.configurationLocked ||
                              toNumber(criterion.weight) === 0
                            }
                            onChange={(event) => updateCriteriaDraft(criterion.draftId, "weight", event.target.value)}
                          />
                        </td>
                        <td className="criteria-cell-score">
                          <input
                            aria-label={`${criterion.tagName} 합격점`}
                            inputMode="numeric"
                            min={0}
                            max={Math.max(0, toNumber(criterion.weight))}
                            placeholder="-"
                            type="number"
                            value={criterion.passScore}
                            disabled={settings.configurationLocked || toNumber(criterion.weight) === 0}
                            onChange={(event) => updateCriteriaDraft(criterion.draftId, "passScore", event.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </form>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>총합 점수 커트라인</h2>
                  <p>모든 역량 기준을 충족한 뒤, 최종 합격에 필요한 총점을 설정합니다.</p>
                </div>
              </div>
              <label className="form-field">
                <span>합격 총점</span>
                <input
                  aria-label="총합 점수 커트라인"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  type="number"
                  value={overallPassScore}
                  disabled={settings.configurationLocked}
                  onChange={(event) => updateOverallPassScore(event.target.value)}
                />
              </label>
              <p className="notice">역량별 합격점을 모두 넘기고, 총점이 이 기준 이상이면 합격입니다. 총점만 부족하면 보류로 표시됩니다.</p>
            </section>

            <div className="settings-step-nav">
              <span />
              <button
                className="btn primary settings-next-large"
                type="button"
                disabled={criteriaSaving}
                onClick={async () => {
                  if (hasCriteriaChanges) {
                    const ok = await saveCriteriaDrafts();
                    if (!ok) return;
                  }
                  setSettingsStep(2);
                }}
              >
                {criteriaSaving ? "저장 중…" : "다음: 면접 질문 구성 →"}
              </button>
            </div>
              </>
            ) : null}

            {settingsStep === 2 ? (
              <>
            <form
              className="panel question-policy-panel"
              onSubmit={(event) => {
                event.preventDefault();
                void saveQuestionPolicy();
              }}
            >
              <div className="panel-head">
                <div>
                  <h2>질문 생성 개수</h2>
                  <p>공통 질문은 지금 생성하고, 개인화 질문은 지원자가 이력서를 제출한 뒤 생성합니다.</p>
                </div>
                <button className="btn secondary compact" type="submit" disabled={!hasQuestionPolicyChanges || questionPolicySaving || settings.configurationLocked}>
                  {questionPolicySaving ? "저장 중…" : "개수 저장"}
                </button>
              </div>
              {questionPolicyError ? <p className="notice danger">{questionPolicyError}</p> : null}
              <div className="question-policy-fields">
                <label>
                  <span>공통 질문</span>
                  <small>평가 기준 + 채용 공고</small>
                  <input
                    aria-label="공통 질문 개수"
                    inputMode="numeric"
                    min={0}
                    max={20}
                    type="number"
                    disabled={settings.configurationLocked}
                    value={questionPolicyDraft?.jdCriteriaQuestionCount ?? "0"}
                    onChange={(event) => setQuestionPolicyDraft((current) => current ? {
                      ...current,
                      jdCriteriaQuestionCount: toDigitsOnly(event.target.value),
                    } : current)}
                  />
                </label>
                <label>
                  <span>개인화 질문</span>
                  <small>평가 기준 + 채용 공고 + 이력서</small>
                  <input
                    aria-label="개인화 질문 개수"
                    inputMode="numeric"
                    min={0}
                    max={20}
                    type="number"
                    disabled={settings.configurationLocked}
                    value={questionPolicyDraft?.resumeQuestionCount ?? "0"}
                    onChange={(event) => setQuestionPolicyDraft((current) => current ? {
                      ...current,
                      resumeQuestionCount: toDigitsOnly(event.target.value),
                    } : current)}
                  />
                </label>
                <div className="question-policy-status">
                  <span>개인화 질문 상태</span>
                  <strong>{settings.questionGenerationPolicy.resumeQuestionCount > 0 ? "지원 완료 후 생성" : "사용 안 함"}</strong>
                </div>
              </div>
              {settings.questionGenerationPolicy.allocations.length > 0 ? (
                <div className="question-allocation-preview" aria-label="평가 기준별 질문 배분">
                  {settings.questionGenerationPolicy.allocations.map((allocation) => (
                    <span className="badge neutral" key={`${allocation.source}-${allocation.ncsProfileId}-${allocation.ncsQuestionMode}`}>
                      {allocation.source === "JD_CRITERIA" ? "공통" : "개인화"} · {NCS_PROFILE_LABELS[allocation.ncsProfileId]} {allocation.count}
                    </span>
                  ))}
                </div>
              ) : null}
            </form>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>면접 질문 구성</h2>
                  <p>평가 기준에 연결할 공통 면접 질문을 직접 작성하거나 AI 추천으로 추가합니다.</p>
                </div>
                <div className="toolbar">
                  <button
                    className="btn secondary compact"
                    type="button"
                    disabled={
                      isAiRequestBlocked("questions", aiJobSubmitting, activeAiJobKinds) ||
                      settings.configurationLocked ||
                      (settings.questionGenerationPolicy.policyVersion > 0 &&
                        settings.questionGenerationPolicy.jdCriteriaQuestionCount === 0)
                    }
                    onClick={() => void handleGenerateQuestions()}
                  >
                    {getAiRequestButtonLabel("questions", "AI 질문 추천받기", aiJobSubmitting, activeAiJobKinds)}
                  </button>
                  <button
                    className="btn secondary compact"
                    type="button"
                    disabled={questionSaving || settings.criteria.length === 0 || hasCriteriaChanges || settings.configurationLocked}
                    onClick={openQuestionCreateDrawer}
                  >
                    직접 질문 추가
                  </button>
                </div>
              </div>
              {aiJobError ? <p className="notice danger">{aiJobError}</p> : null}
              {questionError ? <p className="notice danger">{questionError}</p> : null}
              {questionAiNotices.some((notice) => notice.status !== "COMPLETED") ? (
                <div className="question-workflow-block" aria-live="polite">
                  <div className="question-section-head">
                    <h3>AI 질문 추천 상태</h3>
                    <p>정렬 검증을 통과한 질문은 완료 즉시 아래 공통 질문 목록에 반영됩니다.</p>
                  </div>
                  <div className="posting-list ai-job-list">
                    {questionAiNotices.filter((notice) => notice.status !== "COMPLETED").map((notice) => (
                      <article className="posting ai-job-card" key={notice.kind}>
                        <div className="ai-job-card-body">
                          <div className="ai-job-card-head">
                            <h3>{notice.label}</h3>
                            {notice.status === "FAILED" ? (
                              <button
                                className="btn secondary compact"
                                type="button"
                                disabled={isAiRequestBlocked(notice.kind, aiJobSubmitting, activeAiJobKinds)}
                                onClick={() => retryAiJob(notice.kind)}
                              >
                                다시 요청
                              </button>
                            ) : null}
                            <AiStatusBadge status={notice.status} />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="question-workflow-block">
                <div className="question-section-head">
                  <h3>공통 질문 목록</h3>
                  <p>AI 추천 질문을 확인하고 필요한 경우 수정합니다. 다음 단계로 이동하면 이 목록이 면접에 적용됩니다.</p>
                </div>
              <div className="posting-list question-list">
                {visibleQuestions.map((question) => {
                  const isAiQuestion = question.origin === "AI_GENERATED";
                  return (
                    <article className="posting question-bank-item" key={question.questionId}>
                      <div className="question-bank-main">
                        <h3>{question.content}</h3>
                        <p>{getCriterionLabel(settings, question.criterionId)} · {getQuestionTypeLabel(question.questionType)}</p>
                      </div>
                      <div className="question-bank-meta">
                        <span className={`badge ${isAiQuestion ? "info" : "neutral"}`}>
                          {question.isAiEdited ? "AI 기반 수정" : isAiQuestion ? "AI 추천" : "직접 작성"}
                        </span>
                      </div>
                      <div className="posting-actions question-bank-actions">
                        <button
                          aria-label="질문 수정"
                          className="question-action-icon-button"
                          title="질문 수정"
                          type="button"
                          disabled={questionSaving}
                          onClick={() => startQuestionEdit(question)}
                        >
                          <PencilIcon />
                        </button>
                        <div className="question-action-menu">
                          <button
                            aria-expanded={openQuestionMenuId === question.questionId}
                            aria-label="질문 작업 더보기"
                            className="question-action-icon-button"
                            title="질문 작업 더보기"
                            type="button"
                            onClick={() => setOpenQuestionMenuId((current) => current === question.questionId ? null : question.questionId)}
                          >
                            <MoreVerticalIcon />
                          </button>
                          {openQuestionMenuId === question.questionId ? (
                            <div className="question-action-menu-popover">
                            <button
                              className="question-action-menu-item is-danger"
                              type="button"
                              disabled={questionSaving}
                              onClick={() => {
                                setOpenQuestionMenuId(null);
                                void handleDeleteQuestion(question.questionId);
                              }}
                            >
                              <TrashIcon />
                              삭제
                            </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {visibleQuestions.length === 0 ? (
                  <div className="empty">등록된 질문이 없습니다.</div>
                ) : null}
              </div>
              </div>
            </section>

            <div className="settings-step-nav">
              <button className="btn secondary" type="button" onClick={() => setSettingsStep(1)}>
                ← 이전
              </button>
              <button
                className="btn primary settings-next-large"
                type="button"
                disabled={questionPolicySaving || questionSetConfirming || questionSaving || hasActiveAiJobs(questionAiNotices)}
                onClick={() => void saveAndConfirmQuestionSettings()}
              >
                {questionSetConfirming ? "공통 질문 적용 중…" : "다음: 면접 시간 설정 →"}
              </button>
            </div>
              </>
            ) : null}
          </>
        )}
        {pendingQuestionImpact.length > 0 ? (
          <div className="modal-backdrop" role="presentation">
            <div
              className="modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="criteria-impact-title"
            >
              <h2 id="criteria-impact-title">연결 질문 영향을 확인해주세요</h2>
              <p>
                기준을 해제하면 단일 연결 질문은 비활성화되고, 여러 기준에 연결된 질문은 검토 필요 상태로 전환됩니다.
              </p>
              <ul>
                {pendingQuestionImpact.map((impact) => (
                  <li key={impact.ncsProfileId}>
                    {NCS_PROFILE_LABELS[impact.ncsProfileId]}: 단일 연결 {impact.exclusivelyBoundActiveQuestionCount}개, 다중 연결 {impact.multiBoundActiveQuestionCount}개
                  </li>
                ))}
              </ul>
              <div className="modal-actions">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={criteriaSaving}
                  onClick={() => setPendingQuestionImpact([])}
                >
                  취소
                </button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={criteriaSaving}
                  onClick={() => void saveCriteriaDrafts(true)}
                >
                  {criteriaSaving ? "반영 중…" : "영향을 확인하고 저장"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {isQuestionDrawerOpen && settings ? (
          <div className="drawer-backdrop" role="presentation" onMouseDown={closeQuestionDrawer}>
            <aside
              className="question-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="question-drawer-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="drawer-head">
                <div>
                  <h2 id="question-drawer-title">{editingQuestionId === null ? "직접 질문 추가" : "질문 수정"}</h2>
                  <p>{editingQuestionId === null ? "AI 추천으로 부족한 질문만 직접 보강합니다." : "평가 기준, 유형, 질문 내용을 수정합니다."}</p>
                </div>
                <button className="btn secondary compact" type="button" onClick={closeQuestionDrawer}>
                  닫기
                </button>
              </div>
              <form
                className="question-drawer-form"
                onSubmit={editingQuestionId === null
                  ? handleCreateQuestion
                  : (event) => {
                      event.preventDefault();
                      void handleUpdateQuestion(editingQuestionId);
                    }}
              >
                <label>
                  평가 기준 1
                  <select
                    required
                    disabled={settings.criteria.length === 0 || questionSaving}
                    value={editingQuestionId === null ? questionForm.criterionId : (questionEditDraft?.criterionId ?? "")}
                    onChange={(event) => editingQuestionId === null
                      ? updateQuestionForm("criterionId", event.target.value)
                      : updateQuestionEditDraft("criterionId", event.target.value)}
                  >
                    <option value="" disabled>
                      {settings.criteria.length === 0 ? "먼저 평가 기준을 저장해주세요" : "평가 기준 선택"}
                    </option>
                    {settings.criteria
                      .filter((criterion) => settings.evaluationFramework !== "NCS_ACTIVE_PROFILE_V2" || criterion.isActive)
                      .map((criterion) => (
                      <option key={criterion.criterionId} value={criterion.criterionId}>
                        {criterion.tagName} · {criterion.category}
                      </option>
                    ))}
                  </select>
                </label>
                {settings.evaluationFramework !== "LEGACY" ? (
                  <label>
                    평가 기준 2 (선택)
                    <select
                      disabled={settings.criteria.length < 2 || questionSaving}
                      value={editingQuestionId === null ? questionForm.secondaryCriterionId : (questionEditDraft?.secondaryCriterionId ?? "")}
                      onChange={(event) => editingQuestionId === null
                        ? updateQuestionForm("secondaryCriterionId", event.target.value)
                        : updateQuestionEditDraft("secondaryCriterionId", event.target.value)}
                    >
                      <option value="">추가 연결 없음</option>
                      {settings.criteria
                        .filter((criterion) => settings.evaluationFramework !== "NCS_ACTIVE_PROFILE_V2" || criterion.isActive)
                        .map((criterion) => (
                        <option key={criterion.criterionId} value={criterion.criterionId}>
                          {criterion.tagName} · {criterion.category}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  질문 유형
                  <select
                    disabled={questionSaving}
                    value={editingQuestionId === null ? questionForm.questionType : (questionEditDraft?.questionType ?? "TECHNICAL")}
                    onChange={(event) => editingQuestionId === null
                      ? updateQuestionForm("questionType", event.target.value as QuestionType)
                      : updateQuestionEditDraft("questionType", event.target.value as QuestionType)}
                  >
                    {QUESTION_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  질문 내용
                  <textarea
                    required
                    maxLength={500}
                    placeholder="예: 최근 프로젝트에서 기술적 의사결정을 내렸던 경험을 설명해주세요."
                    value={editingQuestionId === null ? questionForm.content : (questionEditDraft?.content ?? "")}
                    onChange={(event) => editingQuestionId === null
                      ? updateQuestionForm("content", event.target.value)
                      : updateQuestionEditDraft("content", event.target.value)}
                  />
                  <span className="field-hint">
                    {(editingQuestionId === null ? questionForm.content : (questionEditDraft?.content ?? "")).trim().length}/500자
                  </span>
                </label>
                {questionError ? <p className="notice danger">{questionError}</p> : null}
                {settings.criteria.length === 0 ? <p className="notice">질문을 등록하려면 먼저 평가 기준을 추가하고 저장해주세요.</p> : null}
                {hasCriteriaChanges ? <p className="notice">평가 기준 변경사항을 저장하면 질문 등록 대상에 반영됩니다.</p> : null}
                <div className="drawer-actions">
                  <button className="btn secondary" type="button" disabled={questionSaving} onClick={closeQuestionDrawer}>
                    취소
                  </button>
                  <button className="btn primary" type="submit" disabled={questionSaving || settings.criteria.length === 0 || hasCriteriaChanges || settings.configurationLocked}>
                    {questionSaving ? "저장 중" : editingQuestionId === null ? "질문 추가" : "변경사항 저장"}
                  </button>
                </div>
              </form>
            </aside>
          </div>
        ) : null}
    </section>
  );
}

function validateQuestionForm(
  settings: InterviewSettings,
  criterionId: number,
  content: string,
  editingQuestionId: number | null,
  criterionIds: number[] = [criterionId],
) {
  if (!Number.isInteger(criterionId)) {
    return "질문을 연결할 평가 기준을 선택해주세요.";
  }
  if (!settings.criteria.some((criterion) => criterion.criterionId === criterionId)) {
    return "공고에 연결된 평가 기준을 선택해주세요.";
  }
  if (settings.evaluationFramework !== "LEGACY") {
    if (criterionIds.length < 1 || criterionIds.length > 2 || new Set(criterionIds).size !== criterionIds.length) {
      return "NCS 질문에는 서로 다른 평가 기준을 1개 또는 2개 연결해주세요.";
    }
    if (criterionIds.some((id) => !settings.criteria.some((criterion) => criterion.criterionId === id))) {
      return "공고에 연결된 NCS 평가 기준만 선택할 수 있습니다.";
    }
    if (
      settings.evaluationFramework === "NCS_ACTIVE_PROFILE_V2" &&
      criterionIds.some((id) =>
        settings.criteria.some(
          (criterion) => criterion.criterionId === id && !criterion.isActive,
        ),
      )
    ) {
      return "활성화된 NCS 평가 기준만 질문에 연결할 수 있습니다.";
    }
  }
  if (content.length < 10) {
    return "질문 내용은 10자 이상 입력해주세요.";
  }
  if (
    settings.questions.some(
      (question) =>
        question.questionId !== editingQuestionId &&
        normalizeText(question.content) === normalizeText(content),
    )
  ) {
    return "이미 등록된 질문입니다.";
  }
  return "";
}

function getCriterionLabel(settings: InterviewSettings, criterionId: number | null) {
  const criterion = settings.criteria.find((item) => item.criterionId === criterionId);
  return criterion ? `${criterion.tagName} · ${criterion.category}` : "평가 기준 미연결";
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function Metric({ label, value, compact = false }: { label: string; value: number | string; compact?: boolean }) {
  return (
    <div
      className="metric"
      style={
        compact
          ? {
              minWidth: 0,
              padding: "10px 12px",
              textAlign: "center",
              background: "transparent",
              border: "1px solid var(--line-soft)",
              borderRadius: "12px",
            }
          : undefined
      }
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TimePolicyMetric({
  label,
  maxLength,
  saving,
  value,
  isEditing,
  onCancel,
  onEdit,
  onSave,
  onValueChange,
}: {
  label: string;
  maxLength: number;
  saving: boolean;
  value: string;
  isEditing: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className={`metric time-policy-metric ${isEditing ? "is-editing" : ""}`}>
      <span>{label}</span>
      {isEditing ? (
        <div className="time-policy-inline-editor">
          <label className="time-policy-inline-input">
            <input
              aria-label={`${label} 초`}
              inputMode="numeric"
              maxLength={maxLength}
              type="text"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
            />
          </label>
          <span className="time-policy-inline-unit" aria-hidden="true">초</span>
          <div className="time-policy-actions">
            <button
              aria-label={`${label} 저장`}
              className="time-policy-icon-button is-save"
              title={`${label} 저장`}
              type="button"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? <SpinnerIcon /> : <CheckIcon />}
            </button>
            <button
              aria-label={`${label} 편집 취소`}
              className="time-policy-icon-button"
              title={`${label} 편집 취소`}
              type="button"
              disabled={saving}
              onClick={onCancel}
            >
              <XIcon />
            </button>
          </div>
        </div>
      ) : (
        <>
          <strong>{value}초</strong>
          <button
            aria-label={`${label} 수정`}
            className="time-policy-icon-button time-policy-edit-button"
            title={`${label} 수정`}
            type="button"
            disabled={saving}
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
        </>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="m4 20 4.6-1.1L19.3 8.2a2.1 2.1 0 0 0 0-3L18.8 4.7a2.1 2.1 0 0 0-3 0L5.1 15.4 4 20Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="m14.5 6 3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function MoreVerticalIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="m5 12.5 4.3 4.3L19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg aria-hidden="true" className="time-policy-spinner" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M12 3a9 9 0 1 1-8.2 5.3" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function AiStatusBadge({ status }: { status: AiProcessStatus }) {
  const tone = status === "COMPLETED" ? "success" : status === "FAILED" ? "danger" : status === "RUNNING" ? "info" : "warning";
  return <span className={`badge ${tone}`}>{AI_STATUS_LABELS[status]}</span>;
}

function isTerminalAiStatus(status: AiProcessStatus) {
  return status === "COMPLETED" || status === "FAILED";
}

function isAiRequestBlocked(kind: AiJobKind, submitting: AiJobKind | null, activeKinds: Set<AiJobKind>) {
  return submitting !== null || activeKinds.has(kind);
}

function getAiRequestButtonLabel(
  kind: AiJobKind,
  defaultLabel: string,
  submitting: AiJobKind | null,
  activeKinds: Set<AiJobKind>,
) {
  if (submitting === kind) return "요청 중";
  if (activeKinds.has(kind)) return "처리 대기 중";
  return defaultLabel;
}

function normalizeAiJobOutput(output: unknown): AiJobOutput | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }
  return output as AiJobOutput;
}

function getQuestionCandidates(output?: AiJobOutput): GeneratedQuestionCandidate[] {
  if (Array.isArray(output?.questionCandidates)) {
    return output.questionCandidates;
  }

  return (output?.items ?? []).map((item) => ({
    content: item,
    category: "AI_GENERATED",
    difficulty: "MEDIUM",
    criterionTitle: "",
    expectedKeywords: [],
    suggestionReason: "AI 생성 결과 검토가 필요합니다.",
    questionType: "TECHNICAL",
  }));
}

function findCandidateCriterionId(settings: InterviewSettings, candidate: GeneratedQuestionCandidate) {
  if (candidate.criterionId && settings.criteria.some((criterion) => criterion.criterionId === candidate.criterionId)) {
    return candidate.criterionId;
  }

  const normalizedTitle = normalizeText(candidate.criterionTitle ?? "");
  if (!normalizedTitle) {
    return undefined;
  }

  return (
    settings.criteria.find((criterion) => normalizeText(criterion.tagName) === normalizedTitle)?.criterionId ??
    settings.criteria.find((criterion) => normalizedTitle.includes(normalizeText(criterion.tagName)))?.criterionId ??
    settings.criteria.find((criterion) => normalizeText(criterion.category) === normalizedTitle)?.criterionId
  );
}

function getQuestionTypeLabel(type: QuestionType) {
  return QUESTION_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function formatAiRequestError(message: string) {
  const normalized = message.toLowerCase();
  if (message.includes("AI queue publish failed")) {
    return "AI 요청을 대기열에 등록하지 못했습니다. LocalStack queue와 worker 실행 상태를 확인해주세요.";
  }
  if (normalized.includes("dev auth headers are required") || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return "인증 정보가 만료되었거나 요청 권한이 없습니다. 다시 로그인한 뒤 요청해주세요.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("timeout")) {
    return "AI 요청 중 네트워크 문제가 발생했습니다. API 서버와 worker 실행 상태를 확인해주세요.";
  }
  if (normalized.includes("already") || normalized.includes("pending")) {
    return "이미 처리 중인 AI 요청이 있습니다. 현재 요청이 끝난 뒤 다시 시도해주세요.";
  }
  return message.startsWith("AI ") || message.startsWith("JD ") || message.startsWith("질문 ")
    ? message
    : "AI 요청을 처리하지 못했습니다. 실행 환경을 확인한 뒤 다시 시도해주세요.";
}

function normalizeQuestionType(value: string | undefined): QuestionType {
  return QUESTION_TYPE_OPTIONS.some((option) => option.value === value) ? (value as QuestionType) : "TECHNICAL";
}

function toFixedNcsCriteriaDrafts(settings: InterviewSettings): CriteriaDraft[] | null {
  const tags = NCS_PROFILE_ORDER.map((profileId) =>
    settings.availableTags.find((tag) => tag.ncsProfileId === profileId),
  );
  if (tags.some((tag) => !tag)) return null;

  const defaultWeights = [30, 30, 40];
  return tags.map((tag, index) => {
    const resolvedTag = tag!;
    const existing = settings.criteria.find((criterion) => criterion.tagId === resolvedTag.tagId);
    return {
      draftId: existing ? String(existing.criterionId) : `ncs-${resolvedTag.tagId}`,
      criterionId: existing?.criterionId,
      tagId: resolvedTag.tagId,
      tagName: resolvedTag.tagName,
      category: resolvedTag.category,
      description: existing?.description ?? resolvedTag.description,
      weight: String(existing?.weight ?? defaultWeights[index]),
      passScore: existing?.passScore === null || existing?.passScore === undefined ? "" : String(Math.min(existing.passScore, existing.weight)),
      sortOrder: String(index + 1),
    };
  });
}

function toCriteriaDrafts(settings: InterviewSettings): CriteriaDraft[] {
  return settings.criteria.map((criterion) => ({
    draftId: String(criterion.criterionId),
    criterionId: criterion.criterionId,
    tagId: criterion.tagId,
    tagName: criterion.tagName,
    category: criterion.category,
    description: criterion.description,
    weight: String(criterion.weight),
    passScore: criterion.passScore === null ? "" : String(Math.min(criterion.passScore, criterion.weight)),
    sortOrder: String(criterion.sortOrder),
  }));
}

function normalizeCriteriaOrder(criteria: CriteriaDraft[]): CriteriaDraft[] {
  return [...criteria]
    .sort((left, right) => toNumber(left.sortOrder) - toNumber(right.sortOrder))
    .map((criterion, index) => ({
      ...criterion,
      sortOrder: String(index + 1),
    }));
}

function toTimePolicyDraft(settings: InterviewSettings): TimePolicyDraft {
  return {
    preparationTimeSec: String(settings.timePolicy.preparationTimeSec),
    preparationTimeMode: String(settings.timePolicy.preparationTimeSec),
    answerTimeSec: String(settings.timePolicy.answerTimeSec),
    answerTimeMode: String(settings.timePolicy.answerTimeSec),
    retryAllowed: settings.timePolicy.retryAllowed,
  };
}

function toQuestionGenerationPolicyDraft(
  settings: InterviewSettings,
): QuestionGenerationPolicyDraft {
  return {
    jdCriteriaQuestionCount: String(
      settings.questionGenerationPolicy.jdCriteriaQuestionCount,
    ),
    resumeQuestionCount: String(
      settings.questionGenerationPolicy.resumeQuestionCount,
    ),
  };
}

function toDigitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function validateCriteriaDrafts(criteria: CriteriaDraft[], framework: EvaluationFramework = "LEGACY", overallPassScore = "80") {
  const totalCutoff = toNumber(overallPassScore);
  if (!Number.isInteger(totalCutoff) || totalCutoff < 1 || totalCutoff > 100) {
    return "총합 점수 커트라인은 1부터 100 사이의 정수로 입력해주세요.";
  }
  if (criteria.length === 0) {
    return framework !== "LEGACY" ? "NCS 평가 기준 3개를 모두 설정해주세요." : "";
  }
  if (framework !== "LEGACY" && criteria.length !== 3) {
    return "NCS 평가 기준은 기술·직무, 협업·의사소통, 문제 해결력 3개여야 합니다.";
  }

  const sortOrders = new Set<number>();
  const tagIds = new Set<number>();
  let totalWeight = 0;

  for (const criterion of criteria) {
    const sortOrder = toNumber(criterion.sortOrder);
    const weight = toNumber(criterion.weight);
    const passScore = criterion.passScore.trim() === "" ? null : toNumber(criterion.passScore);

    if (!Number.isInteger(sortOrder) || sortOrder < 1) {
      return "평가 기준 순서는 1 이상의 정수로 입력해주세요.";
    }
    if (sortOrder > criteria.length) {
      return "평가 기준 순서는 현재 평가 기준 개수를 넘을 수 없습니다.";
    }
    if (sortOrders.has(sortOrder)) {
      return "평가 기준 순서가 중복되었습니다.";
    }
    sortOrders.add(sortOrder);
    if (tagIds.has(criterion.tagId)) {
      return "평가 태그가 중복되었습니다.";
    } else {
      tagIds.add(criterion.tagId);
    }

    const minimumWeight = framework !== "LEGACY" ? 0 : 1;
    if (!Number.isInteger(weight) || weight < minimumWeight || weight > 100) {
      return framework !== "LEGACY"
        ? "NCS 배점은 0부터 100 사이의 정수로 입력해주세요."
        : "배점은 1부터 100 사이의 정수로 입력해주세요.";
    }
    if (framework !== "LEGACY" && weight > 0 && passScore === null) {
      return "사용 중인 역량마다 합격점을 입력해주세요.";
    }
    if (passScore !== null && (!Number.isInteger(passScore) || passScore < 0 || passScore > weight)) {
      return "역량별 합격점은 배점 이하의 정수로 입력해주세요.";
    }

    totalWeight += weight;
  }

  if (framework === "NCS_ACTIVE_PROFILE_V2") {
    const v2Message = validateNcsActiveWeightDrafts(criteria);
    if (v2Message) return v2Message;
  }
  if (framework === "NCS_3_PROFILE_V1" && totalWeight !== 100) {
    return "NCS 배점 합계는 정확히 100이어야 합니다.";
  }
  if (framework === "LEGACY" && (totalWeight <= 0 || totalWeight > 100)) {
    return "배점 합계는 1부터 100 사이여야 합니다.";
  }

  return "";
}

function validateTimePolicyDraft(draft: TimePolicyDraft) {
  if (draft.preparationTimeSec.trim() === "") {
    return "준비 시간을 입력해주세요.";
  }
  if (draft.answerTimeSec.trim() === "") {
    return "답변 시간을 입력해주세요.";
  }

  const preparationTimeSec = toNumber(draft.preparationTimeSec);
  const answerTimeSec = toNumber(draft.answerTimeSec);

  if (!Number.isInteger(preparationTimeSec) || preparationTimeSec < 0 || preparationTimeSec > 600) {
    return "준비 시간은 0부터 600 사이의 정수로 입력해주세요.";
  }
  if (!Number.isInteger(answerTimeSec) || answerTimeSec < 30 || answerTimeSec > 1800) {
    return "답변 시간은 30부터 1800 사이의 정수로 입력해주세요.";
  }
  if (answerTimeSec <= preparationTimeSec) {
    return "답변 시간은 준비 시간보다 길어야 합니다.";
  }

  return "";
}

function toNumber(value: string) {
  return Number(value.trim());
}
