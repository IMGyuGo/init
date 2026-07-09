"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";

import interviewBanner from "../company-recruiting/assets/interview-banner.png";

import { StatusBadge } from "../company-recruiting/CompanyRecruitingChrome";
import {
  confirmQuestionSet,
  createCriterionTag,
  createInterviewQuestion,
  deleteInterviewQuestion,
  generateInterviewQuestions,
  generateQuestionSet,
  getAiJobStatus,
  getInterviewSettings,
  suggestEvaluationCriteria,
  updateEvaluationCriteria,
  updateInterviewQuestion,
  updateInterviewTimePolicy,
} from "./api";
import type {
  AiJobOutput,
  AiJobResult,
  AiProcessStatus,
  CriteriaSuggestionCandidate,
  GeneratedQuestionCandidate,
  GeneratedQuestionSetCandidate,
  InterviewSettings,
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
  isCustomTag?: boolean;
};

type QuestionForm = {
  criterionId: string;
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

type AiJobKind = "criteria" | "questions" | "questionSet";

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

type QuestionSetPreviewItem = {
  criterionId: number;
  criterionLabel: string;
  questionId: number | null;
  questionType: QuestionType | null;
  content: string;
};

type QuestionSetConfirmSummary = {
  confirmableCount: number;
  missingCriteriaCount: number;
  totalCriteriaCount: number;
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
  questionType: "TECHNICAL",
  content: "",
};

const AI_STATUS_LABELS: Record<AiProcessStatus, string> = {
  PENDING: "대기 중",
  RUNNING: "처리 중",
  COMPLETED: "완료",
  FAILED: "실패",
};
const AI_JOB_SLOW_THRESHOLD_MS = 30_000;

export function CompanyInterviewSettingsPage({ postingId }: { postingId?: number }) {
  const [settings, setSettings] = useState<InterviewSettings | null>(null);
  const [settingsStep, setSettingsStep] = useState(1);
  const [criteriaDrafts, setCriteriaDrafts] = useState<CriteriaDraft[]>([]);
  const [isCriteriaEditing, setIsCriteriaEditing] = useState(false);
  const [timePolicyDraft, setTimePolicyDraft] = useState<TimePolicyDraft | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionForm>(initialQuestionForm);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const [criteriaError, setCriteriaError] = useState("");
  const [timePolicySaving, setTimePolicySaving] = useState(false);
  const [timePolicyError, setTimePolicyError] = useState("");
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [aiJobSubmitting, setAiJobSubmitting] = useState<AiJobKind | null>(null);
  const [aiJobError, setAiJobError] = useState("");
  const [aiJobNotices, setAiJobNotices] = useState<AiJobNotice[]>([]);
  const [questionSetConfirming, setQuestionSetConfirming] = useState(false);
  const [showQuestionSetPreview, setShowQuestionSetPreview] = useState(false);
  const [editingTimePolicyField, setEditingTimePolicyField] = useState<TimePolicyField | null>(null);
  const [draggedCriteriaId, setDraggedCriteriaId] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setCriteriaError("");
    setTimePolicyError("");
    setQuestionError("");
    setAiJobError("");
    try {
      const response = await getInterviewSettings(postingId);
      setSettings(response.data);
      setCriteriaDrafts(toCriteriaDrafts(response.data));
      setIsCriteriaEditing(false);
      setTimePolicyDraft(toTimePolicyDraft(response.data));
      setEditingQuestionId(null);
      setEditingTimePolicyField(null);
      setShowQuestionSetPreview(false);
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

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const activeJobs = aiJobNotices.filter((notice) => !isTerminalAiStatus(notice.status));
    if (activeJobs.length === 0) return undefined;

    let canceled = false;
    const poll = async () => {
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

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);

    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [aiJobNotices]);

  const criteriaTotalWeight = useMemo(
    () => criteriaDrafts.reduce((sum, criterion) => sum + toNumber(criterion.weight), 0),
    [criteriaDrafts],
  );

  const hasCriteriaChanges = useMemo(() => {
    if (!settings) return false;
    return JSON.stringify(criteriaDrafts) !== JSON.stringify(toCriteriaDrafts(settings));
  }, [criteriaDrafts, settings]);

  const visibleQuestions = useMemo(() => {
    if (!settings) return [];
    const visibleCriterionIds = new Set(
      criteriaDrafts
        .map((criterion) => criterion.criterionId)
        .filter((criterionId): criterionId is number => criterionId !== undefined),
    );
    return settings.questions.filter((question) => question.criterionId === null || visibleCriterionIds.has(question.criterionId));
  }, [criteriaDrafts, settings]);

  const questionSetPreview = useMemo(() => buildQuestionSetPreview(settings), [settings]);
  const questionSetPreviewSummary = useMemo(() => buildQuestionSetPreviewSummary(questionSetPreview), [questionSetPreview]);
  const activeAiJobKinds = useMemo(
    () => new Set(aiJobNotices.filter((notice) => !isTerminalAiStatus(notice.status)).map((notice) => notice.kind)),
    [aiJobNotices],
  );
  const criteriaAiNotices = useMemo(() => aiJobNotices.filter((notice) => notice.kind === "criteria"), [aiJobNotices]);
  const questionAiNotices = useMemo(() => aiJobNotices.filter((notice) => notice.kind === "questions"), [aiJobNotices]);

  function addCustomCriteriaDraft() {
    setCriteriaError("");
    setCriteriaDrafts((current) => {
      const normalizedCriteria = normalizeCriteriaOrder(current);
      const draftId = `custom-${Date.now()}`;
      return [
        ...normalizedCriteria,
        {
          draftId,
          tagId: -Date.now(),
          tagName: "",
          category: "",
          description: null,
          weight: "10",
          passScore: "",
          sortOrder: String(normalizedCriteria.length + 1),
          isCustomTag: true,
        },
      ];
    });
    setIsCriteriaEditing(true);
  }

  function removeCriteriaDraft(draftId: string) {
    if (!settings) return;
    const criterion = criteriaDrafts.find((item) => item.draftId === draftId);
    const linkedQuestionCount =
      criterion?.criterionId === undefined
        ? 0
        : settings.questions.filter((question) => question.criterionId === criterion.criterionId).length;
    if (
      linkedQuestionCount > 0 &&
      !window.confirm(
        `이 평가 기준에 연결된 질문 ${linkedQuestionCount}개가 있습니다. 계속 진행하면 저장 시 연결된 질문이 비활성화됩니다. 계속하시겠습니까?`,
      )
    ) {
      return;
    }

    setCriteriaError("");
    const nextCriteriaDrafts = normalizeCriteriaOrder(criteriaDrafts.filter((criterion) => criterion.draftId !== draftId));
    setCriteriaDrafts(nextCriteriaDrafts);
    if (criterion?.criterionId !== undefined && questionForm.criterionId === String(criterion.criterionId)) {
      resetQuestionEditor(String(nextCriteriaDrafts.find((item) => item.criterionId !== undefined)?.criterionId ?? ""));
    }
  }

  function reorderCriteriaDrafts(sourceDraftId: string, targetDraftId: string) {
    if (sourceDraftId === targetDraftId || criteriaSaving) return;
    setCriteriaError("");
    setCriteriaDrafts((current) => {
      const sourceIndex = current.findIndex((criterion) => criterion.draftId === sourceDraftId);
      const targetIndex = current.findIndex((criterion) => criterion.draftId === targetDraftId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return current;
      next.splice(targetIndex, 0, moved);
      return next.map((criterion, index) => ({
        ...criterion,
        sortOrder: String(index + 1),
      }));
    });
  }

  function handleCriteriaDragStart(event: DragEvent<HTMLElement>, draftId: string) {
    if (criteriaSaving) return;
    setDraggedCriteriaId(draftId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draftId);
  }

  function handleCriteriaDragOver(event: DragEvent<HTMLTableRowElement>) {
    if (!draggedCriteriaId || criteriaSaving) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleCriteriaDrop(event: DragEvent<HTMLTableRowElement>, targetDraftId: string) {
    event.preventDefault();
    const sourceDraftId = event.dataTransfer.getData("text/plain") || draggedCriteriaId;
    if (sourceDraftId) {
      reorderCriteriaDrafts(sourceDraftId, targetDraftId);
    }
    setDraggedCriteriaId(null);
  }

  function updateCriteriaDraft(draftId: string, field: "tagName" | "category" | "weight" | "passScore" | "sortOrder", value: string) {
    setCriteriaError("");
    setCriteriaDrafts((current) =>
      current.map((criterion) => (criterion.draftId === draftId ? { ...criterion, [field]: value } : criterion)),
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

  async function saveCriteriaDrafts(): Promise<boolean> {
    if (!settings) return true;

    const validationMessage = validateCriteriaDrafts(criteriaDrafts);
    if (validationMessage) {
      setCriteriaError(validationMessage);
      return false;
    }

    setCriteriaSaving(true);
    setCriteriaError("");
    try {
      const normalizedCriteria = normalizeCriteriaOrder(criteriaDrafts);
      const resolvedCriteria: CriteriaDraft[] = [];
      const createdTags: InterviewSettings["availableTags"] = [];
      for (const criterion of normalizedCriteria) {
        if (criterion.isCustomTag || criterion.tagId < 0) {
          const response = await createCriterionTag({
            postingId: settings.posting.postingId,
            tagName: criterion.tagName.trim(),
            category: criterion.category.trim(),
            description: criterion.description,
          });
          createdTags.push(response.data.tag);
          resolvedCriteria.push({
            ...criterion,
            tagId: response.data.tag.tagId,
            tagName: response.data.tag.tagName,
            category: response.data.tag.category,
            description: response.data.tag.description,
            isCustomTag: false,
          });
        } else {
          resolvedCriteria.push(criterion);
        }
      }

      const response = await updateEvaluationCriteria({
          postingId: settings.posting.postingId,
        criteria: resolvedCriteria.map((criterion) => ({
          criterionId: criterion.criterionId,
          tagId: criterion.tagId,
          weight: toNumber(criterion.weight),
          passScore: criterion.passScore.trim() === "" ? null : toNumber(criterion.passScore),
          sortOrder: toNumber(criterion.sortOrder),
        })),
      });

      setSettings((current) =>
        current
          ? {
              ...current,
              availableTags:
                createdTags.length === 0
                  ? current.availableTags
                  : [
                      ...current.availableTags,
                      ...createdTags.filter((createdTag) => !current.availableTags.some((tag) => tag.tagId === createdTag.tagId)),
                    ],
              criteria: response.data.criteria,
            }
          : current,
      );
      setCriteriaDrafts(
        response.data.criteria.map((criterion) => ({
          draftId: String(criterion.criterionId),
          criterionId: criterion.criterionId,
          tagId: criterion.tagId,
          tagName: criterion.tagName,
          category: criterion.category,
          description: criterion.description,
          weight: String(criterion.weight),
          passScore: criterion.passScore === null ? "" : String(criterion.passScore),
          sortOrder: String(criterion.sortOrder),
        })),
      );
      setIsCriteriaEditing(false);
      return true;
    } catch (error) {
      setCriteriaError(error instanceof Error ? error.message : "평가 기준 저장에 실패했습니다.");
      return false;
    } finally {
      setCriteriaSaving(false);
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

  function resetQuestionEditor(nextCriterionId = questionForm.criterionId) {
    setEditingQuestionId(null);
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
    setQuestionForm({
      criterionId: String(question.criterionId),
      questionType: question.questionType,
      content: question.content,
    });
  }

  async function handleCreateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;

    const criterionId = Number(questionForm.criterionId);
    const content = questionForm.content.trim();
    const validationMessage = validateQuestionForm(settings, criterionId, content, editingQuestionId);
    if (validationMessage) {
      setQuestionError(validationMessage);
      return;
    }

    setQuestionSaving(true);
    setQuestionError("");
    try {
      const response =
        editingQuestionId === null
          ? await createInterviewQuestion({
              postingId: settings.posting.postingId,
              criterionId,
              questionType: questionForm.questionType,
              content,
            })
          : await updateInterviewQuestion(editingQuestionId, {
              criterionId,
              questionType: questionForm.questionType,
              content,
            });

      setSettings((current) =>
        current
          ? {
              ...current,
              questions:
                editingQuestionId === null
                  ? [...current.questions, response.data.question]
                  : current.questions.map((question) =>
                      question.questionId === response.data.question.questionId ? response.data.question : question,
                    ),
            }
          : current,
      );
      resetQuestionEditor(String(criterionId));
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "질문 저장에 실패했습니다.");
    } finally {
      setQuestionSaving(false);
    }
  }

  async function handleDeleteQuestion(questionId: number) {
    if (!window.confirm("이 질문을 삭제하시겠습니까? 삭제된 질문은 질문 뱅크 목록에서 제외됩니다.")) {
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

  async function handleSuggestCriteria() {
    if (!settings) return;
    if (isAiRequestBlocked("criteria", aiJobSubmitting, activeAiJobKinds)) return;

    setAiJobSubmitting("criteria");
    setAiJobError("");
    try {
      const jobDescription = buildJobDescription(settings);
      const response = await suggestEvaluationCriteria({
        postingId: settings.posting.postingId,
        jobDescription,
        talentProfile: "문제 해결력과 협업 태도를 갖춘 지원자",
        evaluationPolicy: "평가 기준과 질문 뱅크를 기반으로 근거 중심 평가 항목을 추천합니다.",
      });
      rememberAiJob("criteria", "AI 평가 기준 추천", response.data);
    } catch (error) {
      setAiJobError(formatAiRequestError(error instanceof Error ? error.message : "AI 평가 기준 추천 요청에 실패했습니다."));
    } finally {
      setAiJobSubmitting(null);
    }
  }

  async function handleGenerateQuestions() {
    if (!settings) return;
    if (isAiRequestBlocked("questions", aiJobSubmitting, activeAiJobKinds)) return;
    if (hasCriteriaChanges) {
      setAiJobError("공통 질문을 추천받으려면 먼저 평가 기준 변경사항을 저장해주세요.");
      return;
    }
    if (settings.criteria.length === 0) {
      setAiJobError("공통 질문을 추천받으려면 먼저 JD 기반 평가 기준을 생성하고 저장해주세요.");
      return;
    }

    if (hasCriteriaChanges) {
      setAiJobError("공통 질문을 추천받으려면 먼저 평가 기준 변경사항을 저장해주세요.");
      return;
    }

    if (settings.criteria.length === 0) {
      setAiJobError("공통 질문을 추천받으려면 먼저 JD 기반 평가 기준을 생성하고 저장해주세요.");
      return;
    }

    setAiJobSubmitting("questions");
    setAiJobError("");
    try {
      const response = await generateInterviewQuestions({
        postingId: settings.posting.postingId,
        jobDescription: buildJobDescription(settings),
        questionCount: Math.max(3, settings.criteria.length || 3),
        criteria: settings.criteria.map((criterion) => ({
          criterionId: criterion.criterionId,
          name: criterion.tagName,
          category: criterion.category,
          weight: criterion.weight,
        })),
      });
      rememberAiJob("questions", "공통 질문 추천", response.data);
    } catch (error) {
      setAiJobError(formatAiRequestError(error instanceof Error ? error.message : "공통 질문 추천 요청에 실패했습니다."));
    } finally {
      setAiJobSubmitting(null);
    }
  }

  async function handleGenerateQuestionSet() {
    if (!settings) return;
    if (isAiRequestBlocked("questionSet", aiJobSubmitting, activeAiJobKinds)) return;

    setShowQuestionSetPreview(true);

    if (settings.criteria.length === 0 || settings.questions.length === 0) {
      setAiJobError("질문 세트를 구성하려면 평가 기준과 질문 뱅크가 필요합니다.");
      return;
    }

    setAiJobSubmitting("questionSet");
    setAiJobError("");
    try {
      const questionTypes = uniqueQuestionTypes(settings.questions);
      const response = await generateQuestionSet({
        postingId: settings.posting.postingId,
        questionCount: Math.max(1, questionSetPreview.filter((item) => item.questionId !== null).length),
        criteria: settings.criteria.map((criterion) => ({
          criterionId: criterion.criterionId,
          name: criterion.tagName,
          weight: criterion.weight,
        })),
        questionTypes: questionTypes.length > 0 ? questionTypes : ["TECHNICAL"],
      });
      rememberAiJob("questionSet", "면접 질문 세트 구성", response.data);
    } catch (error) {
      setAiJobError(formatAiRequestError(error instanceof Error ? error.message : "질문 세트 구성 요청에 실패했습니다."));
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

  async function applyCriteriaSuggestion(candidate: CriteriaSuggestionCandidate, selectedTagId?: number) {
    if (!settings) return;

    let matchedTag = findSuggestionTag(settings, criteriaDrafts, candidate, selectedTagId);
    const projectedTotalWeight = criteriaTotalWeight + normalizeCriteriaSuggestionWeight(candidate.weight);
    if (projectedTotalWeight > 100) {
      setCriteriaError("추천 기준을 적용하면 배점 합계가 100을 초과합니다. 기존 기준의 배점을 먼저 조정해주세요.");
      return;
    }

    if (!matchedTag) {
      try {
        const response = await createCriterionTag({
          postingId: settings.posting.postingId,
          tagName: candidate.title.trim(),
          category: candidate.category?.trim() || "JD 기반 평가",
          description: candidate.description?.trim() || candidate.suggestionReason?.trim() || null,
        });
        matchedTag = response.data.tag;
        setSettings((current) =>
          current
            ? {
                ...current,
                availableTags: current.availableTags.some((tag) => tag.tagId === response.data.tag.tagId)
                  ? current.availableTags
                  : [...current.availableTags, response.data.tag],
              }
            : current,
        );
      } catch (error) {
        setCriteriaError(error instanceof Error ? error.message : "JD 기반 평가 태그 생성에 실패했습니다.");
        return;
      }
    }

    setCriteriaError("");
    setCriteriaDrafts((current) => {
      if (current.some((criterion) => criterion.tagId === matchedTag.tagId)) {
        return current;
      }
      const normalizedCriteria = normalizeCriteriaOrder(current);
      return [
        ...normalizedCriteria,
        {
          draftId: `ai-${matchedTag.tagId}-${Date.now()}`,
          tagId: matchedTag.tagId,
          tagName: matchedTag.tagName,
          category: matchedTag.category,
          description: matchedTag.description ?? candidate.description,
          weight: String(normalizeCriteriaSuggestionWeight(candidate.weight)),
          passScore: "",
          sortOrder: String(normalizedCriteria.length + 1),
        },
      ];
    });
  }

  async function applyQuestionCandidate(candidate: GeneratedQuestionCandidate, selectedCriterionId?: number) {
    if (!settings) return;

    const criterionId = selectedCriterionId ?? findCandidateCriterionId(settings, candidate);
    if (!criterionId) {
      setQuestionError("연결할 평가 기준 선택 필요");
      return;
    }

    const content = candidate.content.trim();
    const validationMessage = validateQuestionForm(settings, criterionId, content, null);
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
        questionType: normalizeQuestionType(candidate.questionType),
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
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "질문 후보 저장에 실패했습니다.");
    } finally {
      setQuestionSaving(false);
    }
  }

  function retryAiJob(kind: AiJobKind) {
    if (isAiRequestBlocked(kind, aiJobSubmitting, activeAiJobKinds)) return;

    if (kind === "criteria") {
      void handleSuggestCriteria();
      return;
    }
    if (kind === "questions") {
      void handleGenerateQuestions();
      return;
    }
    void handleGenerateQuestionSet();
  }

  async function confirmAiQuestionSet(notice: AiJobNotice, groups: GeneratedQuestionSetCandidate[]) {
    if (!settings) return;

    const items = buildQuestionSetConfirmItems(settings, groups);
    if (items.length === 0) {
      setAiJobError("확정할 수 있는 질문이 없습니다. 질문 뱅크에 저장된 질문만 질문 세트로 확정할 수 있습니다.");
      return;
    }

    setQuestionSetConfirming(true);
    setAiJobError("");
    try {
      await confirmQuestionSet({
        postingId: settings.posting.postingId,
        title: `${settings.posting.title} 면접 질문 세트`,
        sourceProcessLogId: notice.processLogId,
        items,
      });
      setMessage(`면접 질문 세트가 확정되었습니다. 저장된 질문 ${items.length}개`);
    } catch (error) {
      setAiJobError(error instanceof Error ? error.message : "질문 세트 확정에 실패했습니다.");
    } finally {
      setQuestionSetConfirming(false);
    }
  }

  return (
    <section className="app-page glass-page notion">
        <div className="page-banner">
          <div className="page-banner-copy">
            <p className="page-eyebrow">면접 설정</p>
            <h1>면접 관리</h1>
            <p className="page-sub">공고별 평가 기준, 질문 뱅크, 면접 시간을 확인합니다.</p>
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
                  {settingsStep === 1 ? "면접 시간 설정" : settingsStep === 2 ? "평가 기준 추천" : "질문 뱅크"}
                </span>
              </div>
              <div className="settings-steps-bar" role="presentation">
                <span style={{ width: `${(settingsStep / 3) * 100}%` }} />
              </div>
            </div>

            {settingsStep === 1 ? (
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
              <span />
              <button
                className="btn primary"
                type="button"
                disabled={timePolicySaving}
                onClick={async () => {
                  const ok = await saveTimePolicy();
                  if (ok) setSettingsStep(2);
                }}
              >
                {timePolicySaving ? "저장 중…" : "다음: 평가 기준 설정 →"}
              </button>
            </div>
              </>
            ) : null}

            {settingsStep === 2 ? (
              <>
            <section className="panel criteria-ai-legacy-panel" hidden>
              <div className="panel-head">
                <div>
                  <h2>AI로 자동 구성</h2>
                  <p>공고 내용을 바탕으로 평가 기준·질문·질문 세트를 AI가 초안으로 만들어줘요. 필요 없으면 건너뛰고 직접 입력해도 돼요.</p>
                </div>
                <div className="toolbar">
                  <button
                    className="btn secondary compact"
                    type="button"
                    disabled={isAiRequestBlocked("questions", aiJobSubmitting, activeAiJobKinds)}
                    onClick={() => void handleGenerateQuestions()}
                  >
                    {getAiRequestButtonLabel("questions", "공통 질문 추천", aiJobSubmitting, activeAiJobKinds)}
                  </button>
                  <button
                    className="btn primary compact"
                    type="button"
                    disabled={isAiRequestBlocked("questionSet", aiJobSubmitting, activeAiJobKinds)}
                    onClick={() => void handleGenerateQuestionSet()}
                  >
                    {getAiRequestButtonLabel("questionSet", "질문 세트 만들기", aiJobSubmitting, activeAiJobKinds)}
                  </button>
                </div>
              </div>
              {aiJobError ? <p className="notice danger">{aiJobError}</p> : null}
              {aiJobNotices.length > 0 ? (
                <div className="posting-list ai-job-list">
                  {aiJobNotices.map((notice) => (
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
                        {notice.status === "COMPLETED" ? (
                          <AiJobPreview
                            notice={notice}
                            settings={settings}
                            criteriaDrafts={criteriaDrafts}
                            questionSaving={questionSaving}
                            questionSetConfirming={questionSetConfirming}
                            onApplyCriteria={(candidate, selectedTagId) => void applyCriteriaSuggestion(candidate, selectedTagId)}
                            onApplyQuestion={(candidate, selectedCriterionId) => void applyQuestionCandidate(candidate, selectedCriterionId)}
                            onConfirmQuestionSet={(groups) => void confirmAiQuestionSet(notice, groups)}
                          />
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty">등록된 AI 요청이 없습니다.</div>
              )}
            </section>

            <form className="panel" onSubmit={handleCriteriaSave}>
              <div className="panel-head">
                <div>
                  <h2>평가 기준</h2>
                  <p>배점, 합격점, 표시 순서를 공고 기준으로 조정합니다.</p>
                </div>
                <div className="toolbar">
                  <button
                    className="btn secondary compact"
                    type="button"
                    disabled={isAiRequestBlocked("criteria", aiJobSubmitting, activeAiJobKinds)}
                    onClick={() => void handleSuggestCriteria()}
                  >
                    {getAiRequestButtonLabel("criteria", "평가 기준 추천받기", aiJobSubmitting, activeAiJobKinds)}
                  </button>
                  <button className="btn primary compact" type="submit" disabled={!hasCriteriaChanges || criteriaSaving}>
                    {criteriaSaving ? "저장 중" : "평가 기준 저장"}
                  </button>
                </div>
              </div>
              {criteriaError ? <p className="notice danger">{criteriaError}</p> : null}
              {aiJobError ? <p className="notice danger">{aiJobError}</p> : null}
              {criteriaAiNotices.length > 0 ? (
                <div className="posting-list ai-job-list criteria-ai-results">
                  {criteriaAiNotices.map((notice) => (
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
                        {notice.status === "COMPLETED" ? (
                          <AiJobPreview
                            notice={notice}
                            settings={settings}
                            criteriaDrafts={criteriaDrafts}
                            questionSaving={questionSaving}
                            questionSetConfirming={questionSetConfirming}
                            onApplyCriteria={(candidate, selectedTagId) => void applyCriteriaSuggestion(candidate, selectedTagId)}
                            onApplyQuestion={(candidate, selectedCriterionId) => void applyQuestionCandidate(candidate, selectedCriterionId)}
                            onConfirmQuestionSet={(groups) => void confirmAiQuestionSet(notice, groups)}
                          />
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              <div className="criteria-table-summary">
                <span className={`badge ${criteriaTotalWeight > 0 && criteriaTotalWeight <= 100 ? "info" : "danger"}`}>
                  배점 합계 {criteriaTotalWeight}
                </span>
                <button className="btn secondary compact" type="button" disabled={criteriaSaving} onClick={() => setIsCriteriaEditing(true)}>
                  수정
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table criteria-table">
                  <thead>
                    <tr>
                      <th className="criteria-col-order">순서</th>
                      <th>태그</th>
                      <th>분류</th>
                      <th className="criteria-col-score">배점</th>
                      <th className="criteria-col-score">합격점</th>
                      <th className="criteria-col-actions" aria-label="평가 기준 관리" />
                    </tr>
                  </thead>
                  <tbody>
                    {criteriaDrafts.map((criterion) => (
                      <tr
                        className={draggedCriteriaId === criterion.draftId ? "is-dragging" : undefined}
                        key={criterion.draftId}
                        onDragEnd={() => setDraggedCriteriaId(null)}
                        onDragOver={handleCriteriaDragOver}
                        onDrop={(event) => handleCriteriaDrop(event, criterion.draftId)}
                      >
                        <td className="criteria-cell-order">
                          <button
                            className="criteria-drag-handle"
                            draggable={!criteriaSaving}
                            onDragStart={(event) => handleCriteriaDragStart(event, criterion.draftId)}
                            type="button"
                            aria-label={`${criterion.tagName} 순서 변경`}
                          >
                            ⋮⋮
                          </button>
                          <span>{criterion.sortOrder}</span>
                        </td>
                        <td className="criteria-cell-tag">
                          {criterion.isCustomTag ? (
                            <input
                              aria-label="커스텀 평가 태그"
                              placeholder="태그 입력"
                              value={criterion.tagName}
                              onChange={(event) => updateCriteriaDraft(criterion.draftId, "tagName", event.target.value)}
                            />
                          ) : (
                            criterion.tagName
                          )}
                        </td>
                        <td className="criteria-cell-category">
                          {criterion.isCustomTag ? (
                            <input
                              aria-label="커스텀 평가 분류"
                              placeholder="분류 입력"
                              value={criterion.category}
                              onChange={(event) => updateCriteriaDraft(criterion.draftId, "category", event.target.value)}
                            />
                          ) : (
                            criterion.category
                          )}
                        </td>
                        <td className="criteria-cell-score">
                          <input
                            aria-label={`${criterion.tagName} 배점`}
                            inputMode="numeric"
                            min={1}
                            max={100}
                            type="number"
                            value={criterion.weight}
                            onChange={(event) => updateCriteriaDraft(criterion.draftId, "weight", event.target.value)}
                          />
                        </td>
                        <td className="criteria-cell-score">
                          <input
                            aria-label={`${criterion.tagName} 합격점`}
                            inputMode="numeric"
                            min={0}
                            max={100}
                            placeholder="-"
                            type="number"
                            value={criterion.passScore}
                            onChange={(event) => updateCriteriaDraft(criterion.draftId, "passScore", event.target.value)}
                          />
                        </td>
                        <td className="criteria-cell-actions">
                          {isCriteriaEditing ? (
                            <button className="btn secondary compact" type="button" disabled={criteriaSaving} onClick={() => removeCriteriaDraft(criterion.draftId)}>
                              삭제
                            </button>
                          ) : (
                            <span className="criteria-action-placeholder" aria-hidden="true" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  className="criteria-add-row-button"
                  type="button"
                  disabled={criteriaSaving}
                  onClick={addCustomCriteriaDraft}
                  aria-label="평가 기준 행 추가"
                >
                  +
                </button>
              </div>
            </form>

            <div className="settings-step-nav">
              <button className="btn secondary" type="button" onClick={() => setSettingsStep(1)}>
                ← 이전
              </button>
              <button
                className="btn primary settings-next-large"
                type="button"
                disabled={criteriaSaving}
                onClick={async () => {
                  if (hasCriteriaChanges) {
                    const ok = await saveCriteriaDrafts();
                    if (!ok) return;
                  }
                  setSettingsStep(3);
                }}
              >
                {criteriaSaving ? "저장 중…" : "다음: 질문 뱅크 →"}
              </button>
            </div>
              </>
            ) : null}

            {settingsStep === 3 ? (
              <>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>질문 뱅크</h2>
                  <p>평가 기준에 연결할 면접 질문을 직접 등록합니다.</p>
                </div>
                <div className="toolbar">
                  <button
                    className="btn secondary compact"
                    type="button"
                    disabled={isAiRequestBlocked("questions", aiJobSubmitting, activeAiJobKinds)}
                    onClick={() => void handleGenerateQuestions()}
                  >
                    {getAiRequestButtonLabel("questions", "공통 생성 질문", aiJobSubmitting, activeAiJobKinds)}
                  </button>
                </div>
              </div>
              {aiJobError ? <p className="notice danger">{aiJobError}</p> : null}
              {questionAiNotices.length > 0 ? (
                <div className="posting-list ai-job-list question-ai-results">
                  {questionAiNotices.map((notice) => (
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
                        {notice.status === "COMPLETED" ? (
                          <AiJobPreview
                            notice={notice}
                            settings={settings}
                            criteriaDrafts={criteriaDrafts}
                            questionSaving={questionSaving}
                            questionSetConfirming={questionSetConfirming}
                            onApplyCriteria={(candidate, selectedTagId) => void applyCriteriaSuggestion(candidate, selectedTagId)}
                            onApplyQuestion={(candidate, selectedCriterionId) => void applyQuestionCandidate(candidate, selectedCriterionId)}
                            onConfirmQuestionSet={(groups) => void confirmAiQuestionSet(notice, groups)}
                          />
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              <form className="creation-flow" onSubmit={handleCreateQuestion}>
                <div className="grid-2">
                  <label>
                    평가 기준
                    <select
                      required
                      disabled={settings.criteria.length === 0 || questionSaving}
                      value={questionForm.criterionId}
                      onChange={(event) => updateQuestionForm("criterionId", event.target.value)}
                    >
                      <option value="" disabled>
                        {settings.criteria.length === 0 ? "먼저 평가 기준을 저장해주세요" : "평가 기준 선택"}
                      </option>
                      {settings.criteria.map((criterion) => (
                        <option key={criterion.criterionId} value={criterion.criterionId}>
                          {criterion.tagName} · {criterion.category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    질문 유형
                    <select
                      disabled={questionSaving}
                      value={questionForm.questionType}
                      onChange={(event) => updateQuestionForm("questionType", event.target.value as QuestionType)}
                    >
                      {QUESTION_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid-full">
                    질문 내용
                    <textarea
                      required
                      maxLength={500}
                      placeholder="예: 최근 프로젝트에서 기술적 의사결정을 내렸던 경험을 설명해주세요."
                      value={questionForm.content}
                      onChange={(event) => updateQuestionForm("content", event.target.value)}
                    />
                    <span className="field-hint">{questionForm.content.trim().length}/500자</span>
                  </label>
                </div>
                {questionError ? <p className="notice danger">{questionError}</p> : null}
                {settings.criteria.length === 0 ? <p className="notice">질문을 등록하려면 먼저 평가 기준을 추가하고 저장해주세요.</p> : null}
                {hasCriteriaChanges ? <p className="notice">평가 기준 변경사항을 저장하면 질문 등록 대상에 반영됩니다.</p> : null}
                <div className="toolbar">
                  <button className="btn primary" type="submit" disabled={questionSaving || settings.criteria.length === 0 || hasCriteriaChanges}>
                    {questionSaving ? "저장 중" : editingQuestionId === null ? "질문 저장" : "질문 수정"}
                  </button>
                  {editingQuestionId !== null ? (
                    <button className="btn secondary" type="button" disabled={questionSaving} onClick={() => resetQuestionEditor()}>
                      수정 취소
                    </button>
                  ) : null}
                </div>
              </form>
              <div className="posting-list question-list">
                {visibleQuestions.map((question) => (
                  <article className="posting" key={question.questionId}>
                    <div className="logo-chip">{question.questionType}</div>
                    <div>
                      <h3>{question.content}</h3>
                      <p>{getCriterionLabel(settings, question.criterionId)}</p>
                    </div>
                    <StatusBadge value={question.isActive ? "ACTIVE" : "INACTIVE"} />
                    <div className="posting-actions">
                      <button className="btn secondary compact" type="button" disabled={questionSaving} onClick={() => startQuestionEdit(question)}>
                        수정
                      </button>
                      <button className="btn destructive compact" type="button" disabled={questionSaving} onClick={() => void handleDeleteQuestion(question.questionId)}>
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
                {visibleQuestions.length === 0 ? (
                  <div className="empty">등록된 질문이 없습니다.</div>
                ) : null}
              </div>
              {showQuestionSetPreview ? (
                <>
                  <div className="panel-head">
                    <div>
                      <h2>면접 질문 세트 미리보기</h2>
                      <p>평가 기준별 첫 번째 활성 질문을 기준으로 구성합니다. 연결된 질문이 없는 기준은 확정 대상에서 제외됩니다.</p>
                      {questionSetPreview.length > 0 ? (
                        <p>
                          확정 가능 질문 {questionSetPreviewSummary.confirmableCount}개
                          {questionSetPreviewSummary.missingCriteriaCount > 0
                            ? ` · 누락 기준 ${questionSetPreviewSummary.missingCriteriaCount}개`
                            : " · 모든 기준 연결 완료"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="posting-list question-list">
                    {questionSetPreview.map((item) => (
                      <article className="posting" key={item.criterionId}>
                        <div className="logo-chip">
                          {item.questionType ? getQuestionTypeLabel(item.questionType) : "미연결"}
                        </div>
                        <div>
                          <h3>{item.content}</h3>
                          <p>{item.criterionLabel}</p>
                          {item.questionId === null ? (
                            <p>질문 뱅크에 활성 질문을 추가하면 질문 세트에 포함할 수 있습니다.</p>
                          ) : null}
                        </div>
                        <span className={`badge ${item.questionId === null ? "warning" : "success"}`}>
                          {item.questionId === null ? "질문 없음" : "확정 가능"}
                        </span>
                      </article>
                    ))}
                    {questionSetPreview.length === 0 ? (
                      <div className="empty">미리보기할 평가 기준이 없습니다.</div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </section>

            <div className="settings-step-nav">
              <button className="btn secondary" type="button" onClick={() => setSettingsStep(2)}>
                ← 이전
              </button>
              <Link className="btn primary" href="/company/recruitments">
                면접 설정 완료
              </Link>
            </div>
              </>
            ) : null}
          </>
        )}
    </section>
  );
}

function buildJobDescription(settings: InterviewSettings) {
  const criteriaText =
    settings.criteria.length > 0
      ? settings.criteria.map((criterion) => `${criterion.tagName}(${criterion.category})`).join(", ")
      : "등록된 평가 기준 없음";
  const questionText =
    settings.questions.length > 0
      ? settings.questions
          .slice(0, 5)
          .map((question) => question.content)
          .join(" / ")
      : "등록된 질문 없음";

  return `공고명: ${settings.posting.title}\n평가 기준: ${criteriaText}\n질문 뱅크: ${questionText}`;
}

function uniqueQuestionTypes(questions: InterviewSettings["questions"]) {
  return Array.from(new Set(questions.map((question) => question.questionType)));
}

function buildQuestionSetPreview(settings: InterviewSettings | null): QuestionSetPreviewItem[] {
  if (!settings) return [];

  return [...settings.criteria]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((criterion) => {
      const question = settings.questions.find((item) => item.criterionId === criterion.criterionId && item.isActive);

      return {
        criterionId: criterion.criterionId,
        criterionLabel: `${criterion.tagName} · ${criterion.category}`,
        questionId: question?.questionId ?? null,
        questionType: question?.questionType ?? null,
        content: question?.content ?? "연결된 활성 질문이 없습니다.",
      };
    });
}

function buildQuestionSetPreviewSummary(items: QuestionSetPreviewItem[]) {
  const confirmableCount = items.filter((item) => item.questionId !== null).length;

  return {
    confirmableCount,
    missingCriteriaCount: Math.max(items.length - confirmableCount, 0),
  };
}

function validateQuestionForm(
  settings: InterviewSettings,
  criterionId: number,
  content: string,
  editingQuestionId: number | null,
) {
  if (!Number.isInteger(criterionId)) {
    return "질문을 연결할 평가 기준을 선택해주세요.";
  }
  if (!settings.criteria.some((criterion) => criterion.criterionId === criterionId)) {
    return "공고에 연결된 평가 기준을 선택해주세요.";
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

function AiJobPreview({
  notice,
  settings,
  criteriaDrafts,
  questionSaving,
  questionSetConfirming,
  onApplyCriteria,
  onApplyQuestion,
  onConfirmQuestionSet,
}: {
  notice: AiJobNotice;
  settings: InterviewSettings;
  criteriaDrafts: CriteriaDraft[];
  questionSaving: boolean;
  questionSetConfirming: boolean;
  onApplyCriteria: (candidate: CriteriaSuggestionCandidate, selectedTagId?: number) => void | Promise<void>;
  onApplyQuestion: (candidate: GeneratedQuestionCandidate, selectedCriterionId?: number) => void;
  onConfirmQuestionSet: (groups: GeneratedQuestionSetCandidate[]) => void;
}) {
  const [criteriaTagSelections, setCriteriaTagSelections] = useState<Record<string, string>>({});
  const [questionCriterionSelections, setQuestionCriterionSelections] = useState<Record<string, string>>({});
  const [questionSetSelections, setQuestionSetSelections] = useState<Record<string, boolean>>({});
  const criteriaSuggestions = getCriteriaSuggestions(notice.output);
  const questionCandidates = getQuestionCandidates(notice.output);
  const questionSetPreview = getGeneratedQuestionSetPreview(notice.output);

  if (notice.kind === "criteria") {
    return (
      <div className="posting-list ai-result-list">
        {criteriaSuggestions.map((candidate, index) => {
          const key = `${candidate.title}-${index}`;
          const selectedTagId = toOptionalNumber(criteriaTagSelections[key]);
          const matchedTag = findSuggestionTag(settings, criteriaDrafts, candidate, selectedTagId);
          const availableTags = getAvailableSuggestionTags(settings, criteriaDrafts, candidate);
          const appliedCriterion = findAppliedSuggestionCriteria(criteriaDrafts, candidate);
          const projectedTotalWeight = getCriteriaTotalWeight(criteriaDrafts) + normalizeCriteriaSuggestionWeight(candidate.weight);
          const isWeightOverflow = !appliedCriterion && projectedTotalWeight > 100;
          const canApply = !appliedCriterion && !isWeightOverflow;
          return (
            <div className="posting ai-result-card" key={key}>
              <div className="ai-result-main">
                <h3>{candidate.title}</h3>
                <p>{candidate.description}</p>
                <p>{candidate.suggestionReason}</p>
                {appliedCriterion ? <p>{appliedCriterion.tagName} 태그로 이미 적용된 추천 기준입니다.</p> : null}
                {isWeightOverflow ? <p>적용 시 배점 합계가 100을 초과합니다. 기존 배점을 조정한 뒤 적용해주세요.</p> : null}
                {!matchedTag && !appliedCriterion ? <p>연결할 태그가 없으면 JD 기반 새 평가 태그로 생성됩니다.</p> : null}
                <select
                  className="field"
                  value={appliedCriterion?.tagId ?? matchedTag?.tagId ?? ""}
                  disabled={Boolean(appliedCriterion)}
                  onChange={(event) =>
                    setCriteriaTagSelections((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                >
                  <option value="">연결 태그 선택</option>
                  {availableTags.map((tag) => (
                    <option key={tag.tagId} value={tag.tagId}>
                      {tag.tagName} · {tag.category}
                    </option>
                  ))}
                </select>
              </div>
              <span className="badge info">배점 {candidate.weight}</span>
              <button className="btn secondary compact" type="button" disabled={!canApply} onClick={() => void onApplyCriteria(candidate, matchedTag?.tagId)}>
                {appliedCriterion ? "적용됨" : isWeightOverflow ? "배점 초과" : matchedTag ? "적용" : "새 태그 생성"}
              </button>
            </div>
          );
        })}
        {criteriaSuggestions.length === 0 ? <div className="empty">{getEmptyAiOutputMessage(notice)}</div> : null}
      </div>
    );
  }

  if (notice.kind === "questions") {
    return (
      <div className="posting-list ai-result-list">
        {questionCandidates.map((candidate, index) => {
          const key = `${candidate.content}-${index}`;
          const selectedCriterionId = toOptionalNumber(questionCriterionSelections[key]);
          const savedQuestion = findSavedQuestionCandidate(settings, candidate);
          const criterionId = selectedCriterionId ?? findCandidateCriterionId(settings, candidate) ?? savedQuestion?.criterionId ?? undefined;
          const isSaved = Boolean(savedQuestion);
          return (
            <div className="posting ai-result-card" key={key}>
              <div className="ai-result-main">
                <h3>{candidate.content}</h3>
                <p>
                  {isSaved
                    ? `이미 ${criterionId ? getCriterionLabel(settings, criterionId) : "질문 뱅크"}에 저장된 질문입니다.`
                    : criterionId
                      ? getCriterionLabel(settings, criterionId)
                      : "저장하려면 연결할 평가 기준을 선택해야 합니다."}
                </p>
                <p>
                  {candidate.category} · {candidate.difficulty} · {candidate.suggestionReason}
                </p>
                <select
                  className="field"
                  value={criterionId ?? ""}
                  disabled={isSaved}
                  onChange={(event) =>
                    setQuestionCriterionSelections((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                >
                  <option value="">평가 기준 선택</option>
                  {settings.criteria.map((criterion) => (
                    <option key={criterion.criterionId} value={criterion.criterionId}>
                      {criterion.tagName}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn secondary compact" type="button" disabled={!criterionId || questionSaving || isSaved} onClick={() => onApplyQuestion(candidate, criterionId)}>
                {isSaved ? "저장됨" : criterionId ? "질문 저장" : "기준 선택 필요"}
              </button>
            </div>
          );
        })}
        {questionCandidates.length === 0 ? <div className="empty">{getEmptyAiOutputMessage(notice)}</div> : null}
      </div>
    );
  }

  const selectedQuestionSetPreview = questionSetPreview
    .map((group, groupIndex) => ({
      ...group,
      questions: group.questions.filter((candidate, questionIndex) => {
        const key = getQuestionSetCandidateKey(group, groupIndex, candidate, questionIndex);
        const question = findQuestionForCandidate(settings, candidate, group);
        return Boolean(question) && questionSetSelections[key] !== false;
      }),
    }))
    .filter((group) => group.questions.length > 0);
  const selectedSummary = buildQuestionSetConfirmSummary(settings, selectedQuestionSetPreview);
  const selectedItems = buildQuestionSetConfirmItems(settings, selectedQuestionSetPreview);

  return (
    <div className="posting-list ai-result-list">
      {questionSetPreview.length > 0 ? (
        <QuestionSetConfirmNotice summary={selectedSummary} />
      ) : null}
      {questionSetPreview.map((group, groupIndex) => {
        const includedQuestions = group.questions.filter((candidate, questionIndex) => {
          const key = getQuestionSetCandidateKey(group, groupIndex, candidate, questionIndex);
          return questionSetSelections[key] !== false;
        });
        const groupSummary = buildQuestionSetConfirmSummary(settings, [{ ...group, questions: includedQuestions }]);
        const firstConfirmableQuestion = buildQuestionSetConfirmItems(settings, [{ ...group, questions: includedQuestions }]).length > 0;
        return (
          <div className="posting ai-result-card" key={`${group.criterionTitle}-${groupIndex}`}>
            <div className="ai-result-main">
              <h3>{group.criterionTitle}</h3>
              <div className="posting-list" style={{ marginTop: 8 }}>
                {group.questions.length > 0 ? (
                  group.questions.map((candidate, questionIndex) => {
                    const key = getQuestionSetCandidateKey(group, groupIndex, candidate, questionIndex);
                    const question = findQuestionForCandidate(settings, candidate, group);
                    const checked = Boolean(question) && questionSetSelections[key] !== false;
                    return (
                      <label className="check-row" key={key}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!question || questionSetConfirming}
                          onChange={(event) =>
                            setQuestionSetSelections((current) => ({
                              ...current,
                              [key]: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          {candidate.content}
                          <span>
                            {question
                              ? `${getQuestionTypeLabel(question.questionType)} · ${getCriterionLabel(settings, question.criterionId)}`
                              : "질문 뱅크에 저장된 활성 질문과 매칭되지 않아 확정할 수 없습니다."}
                          </span>
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p>AI가 제안한 질문이 없습니다.</p>
                )}
              </div>
              {groupSummary.confirmableCount > 0 ? (
                <p>선택된 활성 질문 {groupSummary.confirmableCount}개가 확정 대상입니다.</p>
              ) : (
                <p>선택된 확정 대상이 없습니다. 질문을 포함하거나 질문 뱅크에 먼저 저장해주세요.</p>
              )}
            </div>
            <span className={`badge ${firstConfirmableQuestion ? "success" : "warning"}`}>
              {firstConfirmableQuestion ? "확정 가능" : "질문 없음"}
            </span>
          </div>
        );
      })}
      {questionSetPreview.length > 0 ? (
        <button
          className="btn primary compact"
          type="button"
          disabled={questionSetConfirming || selectedItems.length === 0}
          onClick={() => onConfirmQuestionSet(selectedQuestionSetPreview)}
        >
          {questionSetConfirming ? "확정 중" : `선택 질문 ${selectedItems.length}개 확정`}
        </button>
      ) : null}
      {questionSetPreview.length === 0 ? <div className="empty">{getEmptyAiOutputMessage(notice)}</div> : null}
    </div>
  );
}

function QuestionSetConfirmNotice({ summary }: { summary: QuestionSetConfirmSummary }) {
  if (summary.confirmableCount === 0) {
    return (
      <div className="empty">
        질문 세트로 확정할 수 있는 활성 질문이 없습니다. 질문 뱅크에 평가 기준과 연결된 활성 질문을 먼저 추가해주세요.
      </div>
    );
  }

  return (
    <div className="empty">
      확정 시 활성 질문 {summary.confirmableCount}개가 저장됩니다.
      {summary.missingCriteriaCount > 0
        ? ` 연결된 질문이 없는 평가 기준 ${summary.missingCriteriaCount}개는 이번 질문 세트에서 제외됩니다.`
        : " 모든 평가 기준에 확정 가능한 질문이 연결되어 있습니다."}
    </div>
  );
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

function getAiJobStatusMessage(notice: AiJobNotice) {
  if (notice.status === "FAILED") {
    return notice.failure?.reason
      ? formatAiFailureReason(notice.failure.reason)
      : "AI 요청 처리에 실패했습니다. 다시 요청할 수 있습니다.";
  }
  if (notice.status === "COMPLETED") {
    const guardrailResult = notice.output?.guardrail?.result?.toUpperCase();
    if (guardrailResult === "BLOCKED") {
      return "생성 결과가 검수 정책을 통과하지 못했습니다. 조건을 수정한 뒤 다시 요청해주세요.";
    }
    if (!hasAiOutputForKind(notice)) {
      return getEmptyAiOutputMessage(notice);
    }
    return "AI 요청 처리가 완료되었습니다. 아래 결과를 검토한 뒤 적용해주세요.";
  }

  const elapsedMs = notice.lastCheckedAt - notice.requestedAt;
  if (elapsedMs >= AI_JOB_SLOW_THRESHOLD_MS) {
    return "처리가 예상보다 오래 걸리고 있습니다. 계속 대기 중이면 worker와 LocalStack queue 실행 상태를 확인해주세요.";
  }
  if (notice.status === "RUNNING") {
    return "AI가 요청을 처리하고 있습니다. 완료되면 결과가 자동으로 표시됩니다.";
  }
  return "요청이 접수되었습니다. worker가 작업을 가져가면 처리 상태로 변경됩니다.";
}

function hasAiOutputForKind(notice: AiJobNotice) {
  if (notice.kind === "criteria") return getCriteriaSuggestions(notice.output).length > 0;
  if (notice.kind === "questions") return getQuestionCandidates(notice.output).length > 0;
  return getGeneratedQuestionSetPreview(notice.output).length > 0;
}

function getEmptyAiOutputMessage(notice: AiJobNotice) {
  const guardrailReason = notice.output?.guardrail?.reason;
  if (guardrailReason) {
    return `AI 결과를 적용할 수 없습니다. 검수 사유: ${guardrailReason}`;
  }
  if (!notice.output) {
    return "AI 작업은 완료되었지만 결과 본문이 없습니다. worker 결과 저장 상태를 확인해주세요.";
  }
  if (notice.kind === "criteria") {
    return "저장 가능한 평가 기준 추천 결과가 없습니다. JD나 인재상 조건을 보강한 뒤 다시 요청해주세요.";
  }
  if (notice.kind === "questions") {
    return "저장 가능한 질문 후보가 없습니다. 평가 기준을 저장하거나 JD 내용을 보강한 뒤 다시 요청해주세요.";
  }
  return "확정 가능한 질문 세트 결과가 없습니다. 질문 후보를 질문 뱅크에 저장한 뒤 다시 구성해주세요.";
}

function normalizeAiJobOutput(output: unknown): AiJobOutput | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }
  return output as AiJobOutput;
}

function getCriteriaSuggestions(output?: AiJobOutput): CriteriaSuggestionCandidate[] {
  if (Array.isArray(output?.criteriaSuggestions)) {
    return output.criteriaSuggestions;
  }

  return (output?.items ?? []).map((item, index) => ({
    title: item,
    description: "AI가 추천한 평가 기준 후보입니다.",
    weight: 10,
    order: index + 1,
    suggestionReason: "AI 생성 결과 검토가 필요합니다.",
  }));
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

function getGeneratedQuestionSetPreview(output?: AiJobOutput): GeneratedQuestionSetCandidate[] {
  if (Array.isArray(output?.questionSetPreview)) {
    return output.questionSetPreview;
  }

  const questions = getQuestionCandidates(output);
  if (questions.length === 0) return [];

  return [
    {
      criterionTitle: "AI 질문 세트",
      questions,
    },
  ];
}

function getQuestionSetCandidateKey(
  group: GeneratedQuestionSetCandidate,
  groupIndex: number,
  candidate: GeneratedQuestionCandidate,
  questionIndex: number,
) {
  return [
    group.criterionId ?? group.criterionTitle,
    groupIndex,
    candidate.questionId ?? normalizeText(candidate.content),
    questionIndex,
  ].join(":");
}

function findSuggestionTag(
  settings: InterviewSettings,
  criteriaDrafts: CriteriaDraft[],
  candidate: CriteriaSuggestionCandidate,
  selectedTagId?: number,
) {
  const selectedTagIds = new Set(criteriaDrafts.map((criterion) => criterion.tagId));
  const availableTags = settings.availableTags.filter((tag) => !selectedTagIds.has(tag.tagId));
  if (selectedTagId) {
    const selected = availableTags.find((tag) => tag.tagId === selectedTagId);
    if (selected) return selected;
  }
  if (candidate.tagId) {
    const exact = availableTags.find((tag) => tag.tagId === candidate.tagId);
    if (exact) return exact;
  }

  const normalizedTitle = normalizeText(candidate.tagName ?? candidate.title);
  return (
    availableTags.find((tag) => normalizeText(tag.tagName) === normalizedTitle) ??
    availableTags.find((tag) => normalizedTitle.includes(normalizeText(tag.tagName)))
  );
}

function findAppliedSuggestionCriteria(criteriaDrafts: CriteriaDraft[], candidate: CriteriaSuggestionCandidate) {
  const normalizedTitle = normalizeText(candidate.tagName ?? candidate.title);

  return criteriaDrafts.find((criterion) => {
    if (candidate.tagId && criterion.tagId === candidate.tagId) return true;
    if (normalizeText(criterion.tagName) === normalizedTitle) return true;
    return normalizedTitle.includes(normalizeText(criterion.tagName));
  });
}

function normalizeCriteriaSuggestionWeight(weight: number | undefined) {
  return Number.isInteger(weight) && weight !== undefined && weight > 0 ? weight : 10;
}

function getCriteriaTotalWeight(criteriaDrafts: CriteriaDraft[]) {
  return criteriaDrafts.reduce((total, criterion) => total + (toNumber(criterion.weight) ?? 0), 0);
}

function getAvailableSuggestionTags(
  settings: InterviewSettings,
  criteriaDrafts: CriteriaDraft[],
  candidate: CriteriaSuggestionCandidate,
) {
  const selectedTagIds = new Set(criteriaDrafts.map((criterion) => criterion.tagId));
  return settings.availableTags
    .filter((tag) => !selectedTagIds.has(tag.tagId) || tag.tagId === candidate.tagId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.tagId - b.tagId);
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

function findSavedQuestionCandidate(settings: InterviewSettings, candidate: GeneratedQuestionCandidate) {
  const normalizedContent = normalizeText(candidate.content);

  return settings.questions.find((question) => {
    if (!question.isActive) return false;
    if (normalizeText(question.content) !== normalizedContent) return false;
    return true;
  });
}

function buildQuestionSetConfirmItems(settings: InterviewSettings, groups: GeneratedQuestionSetCandidate[]) {
  const usedQuestionIds = new Set<number>();
  const items: Array<{ questionId: number; criterionId?: number | null; sortOrder: number }> = [];

  for (const group of groups) {
    for (const candidate of group.questions) {
      const question = findQuestionForCandidate(settings, candidate, group);
      if (!question || usedQuestionIds.has(question.questionId)) continue;
      usedQuestionIds.add(question.questionId);
      items.push({
        questionId: question.questionId,
        criterionId: question.criterionId,
        sortOrder: items.length + 1,
      });
    }
  }

  return items;
}

function buildQuestionSetConfirmSummary(settings: InterviewSettings, groups: GeneratedQuestionSetCandidate[]): QuestionSetConfirmSummary {
  const items = buildQuestionSetConfirmItems(settings, groups);
  const matchedCriterionIds = new Set(items.map((item) => item.criterionId).filter((criterionId): criterionId is number => Number.isInteger(criterionId)));
  const groupCriterionIds = new Set(
    groups
      .map((group) => group.criterionId ?? findCriterionIdByTitle(settings, group.criterionTitle))
      .filter((criterionId): criterionId is number => Number.isInteger(criterionId)),
  );
  const totalCriteriaCount = groupCriterionIds.size || groups.length;

  return {
    confirmableCount: items.length,
    missingCriteriaCount: Math.max(totalCriteriaCount - matchedCriterionIds.size, 0),
    totalCriteriaCount,
  };
}

function findQuestionForCandidate(
  settings: InterviewSettings,
  candidate: GeneratedQuestionCandidate,
  group?: GeneratedQuestionSetCandidate,
) {
  if (candidate.questionId) {
    return settings.questions.find((question) => question.questionId === candidate.questionId && question.isActive);
  }

  const normalizedContent = normalizeText(candidate.content);
  const exact = settings.questions.find((question) => normalizeText(question.content) === normalizedContent && question.isActive);
  if (exact) return exact;

  const criterionId =
    candidate.criterionId ??
    group?.criterionId ??
    findCriterionIdByTitle(settings, candidate.criterionTitle ?? group?.criterionTitle);
  if (!criterionId) return undefined;

  return settings.questions.find((question) => question.criterionId === criterionId && question.isActive);
}

function findCriterionIdByTitle(settings: InterviewSettings, title: string | undefined) {
  const normalizedTitle = normalizeText(title ?? "");
  if (!normalizedTitle) return undefined;
  return (
    settings.criteria.find((criterion) => normalizeText(criterion.tagName) === normalizedTitle)?.criterionId ??
    settings.criteria.find((criterion) => normalizedTitle.includes(normalizeText(criterion.tagName)))?.criterionId ??
    settings.criteria.find((criterion) => normalizeText(criterion.category) === normalizedTitle)?.criterionId
  );
}

function getQuestionTypeLabel(type: QuestionType) {
  return QUESTION_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function toOptionalNumber(value: string | undefined) {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
}

function formatAiFailureReason(reason: string) {
  const normalized = reason.toLowerCase();
  if (reason.includes("AI queue publish failed")) {
    return "AI 작업 대기열에 연결하지 못했습니다. LocalStack과 worker 실행 상태를 확인해주세요.";
  }
  if (normalized.includes("dev auth headers are required") || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return "인증 정보가 만료되었거나 요청 권한이 없습니다. 다시 로그인한 뒤 요청해주세요.";
  }
  if (normalized.includes("timeout") || normalized.includes("network") || normalized.includes("fetch")) {
    return "AI 작업 상태를 확인하는 중 네트워크 문제가 발생했습니다. 잠시 후 다시 요청해주세요.";
  }
  if (normalized.includes("guardrail")) {
    return "생성 결과가 검수 정책을 통과하지 못했습니다. 조건을 수정한 뒤 다시 요청해주세요.";
  }
  return "AI 결과 생성 중 오류가 발생했습니다. 다시 요청할 수 있습니다.";
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

function toCriteriaDrafts(settings: InterviewSettings): CriteriaDraft[] {
  return settings.criteria.map((criterion) => ({
    draftId: String(criterion.criterionId),
    criterionId: criterion.criterionId,
    tagId: criterion.tagId,
    tagName: criterion.tagName,
    category: criterion.category,
    description: criterion.description,
    weight: String(criterion.weight),
    passScore: criterion.passScore === null ? "" : String(criterion.passScore),
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

function toDigitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function validateCriteriaDrafts(criteria: CriteriaDraft[]) {
  if (criteria.length === 0) return "";

  const sortOrders = new Set<number>();
  const tagIds = new Set<number>();
  const customTagKeys = new Set<string>();
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
    if (criterion.isCustomTag || criterion.tagId < 0) {
      if (criterion.tagName.trim() === "") {
        return "커스텀 평가 태그명을 입력해주세요.";
      }
      if (criterion.category.trim() === "") {
        return "커스텀 평가 분류를 입력해주세요.";
      }
      const customTagKey = `${normalizeText(criterion.tagName)}:${normalizeText(criterion.category)}`;
      if (customTagKeys.has(customTagKey)) {
        return "커스텀 평가 태그와 분류가 중복되었습니다.";
      }
      customTagKeys.add(customTagKey);
    } else if (tagIds.has(criterion.tagId)) {
      return "평가 태그가 중복되었습니다.";
    } else {
      tagIds.add(criterion.tagId);
    }

    if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
      return "배점은 1부터 100 사이의 정수로 입력해주세요.";
    }
    if (passScore !== null && (!Number.isInteger(passScore) || passScore < 0 || passScore > 100)) {
      return "합격점은 비워두거나 0부터 100 사이의 정수로 입력해주세요.";
    }

    totalWeight += weight;
  }

  if (totalWeight <= 0 || totalWeight > 100) {
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
