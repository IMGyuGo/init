"use client";

import "./CandidatePages.module.css";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DependencyList, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getApiBaseUrl } from "../../api/api-base-url";
import { getAccessToken } from "../../api/client";
import { GnbAvatar, GnbLogoutButton } from "../auth/GnbAccountControls";
import { createPaymentOrder, getCandidateMockInterviewPassSummary, grantCandidateMockInterviewDevPasses, listPaymentOrders } from "../payment/api";
import { PaymentOrderPagination, formatDateTime as formatPaymentDateTime, formatWon } from "../payment/CompanyBillingPage";
import { requestTossCardPayment } from "../payment/toss-sdk";
import {
  CANDIDATE_FREE_MOCK_INTERVIEW_POLICY,
  CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT,
  EMPTY_PAYMENT_ORDER_PAGE,
  PAYMENT_HISTORY_PAGE_LIMIT,
  type CandidateMockInterviewPassSummary,
  type PaymentOrder,
  type PaymentOrderPageMeta,
} from "../payment/types";
import {
  CandidateApiError,
  type AiInterviewHandoffResponse,
  type AiInterviewRequest,
  type AiJobStatusResponse,
  type CandidateApplicationStatusView,
  type CandidateApplicationSummary,
  type CandidateFileAsset,
  type CandidateFollowUpQuestionView,
  type CandidateInterviewRuntimeView,
  type CandidateJobQuery,
  type CandidateMockInterviewHistoryItem,
  type CandidateMockReportFeedback,
  type CandidateMockReportMedia,
  type CandidateMockReportSummary,
  type CandidateReportAnswerView,
  type CandidateReportEvidenceView,
  type CandidateReportScoreView,
  type CandidateRecruitingReportView,
  type InterviewRuntimeSessionView,
  type QuestionType,
  type RuntimeFileAssetRequest,
  type RuntimeQuestionListResponse,
  type RuntimeQuestionView,
  type SaveInterviewAnswerRequest,
  createCandidateApiClient,
  createPublicInterviewApiClient,
  type InterviewRuntimeApiClient,
} from "./api";
import { candidateApplicationInterviewRoutes } from "./routes";
import {
  type CameraPipPosition,
  type CandidateApplicationFormState,
  type CandidateDeviceCheckState,
  type CandidateInterviewConsentState,
  type CandidatePortfolioLinkFormState,
  type CandidateResumeUploadState,
  type InterviewAnswerFormState,
  type InterviewRuntimePrimaryScreen,
  type StartMockInterviewState,
  clampCameraPipPosition,
  defaultApplicationFormState,
  defaultCandidateJobQuery,
  defaultDeviceCheckState,
  defaultInterviewAnswerFormState,
  defaultInterviewConsentState,
  defaultPortfolioLinkFormState,
  defaultStartMockInterviewState,
  createCameralessInterviewTestDeviceCheckState,
  createResumeUploadStateFromFile,
  formatAiInterviewerQuestionPrompt,
  getAiInterviewerProfile,
  getDefaultCameraPipPosition,
  getInterviewMediaFileExtension,
  getInterviewRuntimeLayoutState,
  getInterviewRuntimeScreenSwapState,
  getInterviewRuntimeStatusChips,
  getCandidateApplicationReportHref,
  getMockInterviewDeviceCheckHref,
  getMockReportHref,
  inferPortfolioLinkType,
  normalizeInterviewMediaMimeType,
  requiredInterviewConsents,
  resolveRecordedMimeType,
  shouldShowInterviewDeviceSetup,
  toDeviceCheckRequest,
  toCreatePortfolioLinkRequest,
  toRuntimeQuestionSpeechText,
  toSaveInterviewAnswerRequest,
  toSaveInterviewConsentRequest,
  toStartMockInterviewRequest,
  toUploadResumeRequest,
} from "./view-model";
import { candidateAccountBillingNav, candidateNavLabels, isCandidateAccountBillingPath } from "./candidate-nav-config";
import { CandidateApplicationView, CandidateJobDetailView, CandidateJobsView } from "./views";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
const SHOW_PAYMENT_DEV_TOOLS = process.env.NODE_ENV !== "production";
// DEV-ONLY camera bypass: remove this flag, storage helpers, and matching buttons together when it is no longer needed.
const ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY = process.env.NODE_ENV !== "production";
const CAMERALESS_INTERVIEW_TEST_ENTRY_STORAGE_KEY_PREFIX = "init.cameralessInterviewTestEntry";
const DEMO_CANDIDATE_ID = 1;
export const PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY = "init.publicInterviewAccessToken";
const DEFAULT_INTERVIEW_QUESTION_TIME_LIMIT_SECONDS = 90;
const DEFAULT_MOCK_INTERVIEW_PREPARATION_TIME_LIMIT_SECONDS = 5;
const MIN_INTERVIEW_RECORDING_DURATION_SECONDS = 3;
const MIN_INTERVIEW_RECORDING_BLOB_SIZE_BYTES = 10 * 1024;
const MIN_STT_TRANSCRIPT_MEANINGFUL_LENGTH = 10;
const RUNTIME_PIP_RESERVED_TOP_HEIGHT = 96;
const questionTypeOptions: QuestionType[] = ["INTRO", "TECHNICAL", "EXPERIENCE", "SITUATION", "CLOSING"];

type CandidateNavSection = "jobs" | "applications" | "interview" | "reports" | "accountBilling";
type AsyncState<T> = {
  data?: T;
  loading: boolean;
  error?: string;
};
type RuntimeMode = "mock" | "recruiting";
type RuntimeTimerPhase = "PREPARING" | "ANSWERING";
type InterviewGuideStep = "guide" | "device";
type CandidateApplicationStatusFilter = "ALL" | "WAITING" | "IN_PROGRESS" | "COMPLETED" | "REPORTING";
type ApplicationBadgeTone = "green" | "yellow" | "purple" | "neutral";
type RuntimePageData = {
  runtime: RuntimePageSession;
  questions: RuntimeQuestionListResponse;
};
type RuntimePageSession = {
  sessionId: number;
  applicationId?: number;
  interviewType: InterviewRuntimeSessionView["interviewType"];
  status: InterviewRuntimeSessionView["status"];
  showQuestionText: boolean;
  canRecord: boolean;
  jobDescription?: string;
  timePolicy?: CandidateInterviewRuntimeView["timePolicy"];
  totalQuestions: number;
  answeredCount: number;
  currentQuestion?: RuntimeQuestionView;
  nextQuestionEndpoint: string;
  answerUploadEndpoint: string;
};
type MockReportDetailData = {
  feedback?: CandidateMockReportFeedback;
  feedbackError?: string;
  media?: CandidateMockReportMedia;
  mediaError?: string;
};
type ApplicationReportData = {
  status?: CandidateApplicationStatusView;
  statusError?: string;
  report?: CandidateRecruitingReportView;
  reportError?: string;
};
type LastSavedAnswer = {
  answerId: number;
  questionId: number;
  questionText: string;
  transcript: string;
  fileAssetId?: number;
  audioFileId?: number;
  audioS3Key?: string;
  videoFileId?: number;
  videoS3Key?: string;
};
type AutoAiStepStatus = "IDLE" | "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
type AutoAiPipelineState = {
  answerId: number;
  sttStatus: AutoAiStepStatus;
  followUpStatus: AutoAiStepStatus;
  followUpSkipped?: boolean;
  insertStatus?: AutoAiStepStatus;
  sttProcessLogId?: number;
  followUpProcessLogId?: number;
  insertedQuestionId?: number;
  transcript?: string;
  followUpQuestion?: string;
  failureCategory?: string;
  failureReason?: string;
  failureRetryable?: boolean;
  error?: string;
};
type CandidateRecordingCacheEntry = {
  url: string;
  blob: Blob;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  createdAt: number;
};
type CandidateRecordingCacheWindow = Window & {
  __candidateRecordingCache?: Map<string, CandidateRecordingCacheEntry>;
};
type CameraPreviewInfo = {
  width: number;
  height: number;
  trackLabel?: string;
  trackState?: MediaStreamTrackState;
};
type CameraStreamResult = {
  stream: MediaStream;
  audioEnabled: boolean;
  audioLabel?: string;
  audioState?: MediaStreamTrackState;
  audioError?: unknown;
  fallbackLabel?: string;
};
type MicrophoneProbeResult = {
  ok: boolean;
  label?: string;
  state?: MediaStreamTrackState;
  error?: unknown;
};
type CameraQualityResult = {
  ok: boolean;
  brightness?: number;
  message: string;
};
type MicrophoneQualityResult = {
  ok: boolean;
  peakLevel: number;
  message: string;
};
type NetworkQualityResult = {
  ok: boolean;
  message: string;
};
type CameraFramingState = "idle" | "ok" | "warn" | "unsupported";
type CameraFramingResult = {
  state: CameraFramingState;
  blocking: boolean;
  message: string;
};

type CameraPipDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

function getCameralessInterviewTestEntryStorageKey(mode: RuntimeMode, sessionId: number): string {
  return `${CAMERALESS_INTERVIEW_TEST_ENTRY_STORAGE_KEY_PREFIX}:${mode}:${sessionId}`;
}

function rememberCameralessInterviewTestEntry(mode: RuntimeMode, sessionId: number) {
  if (!ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY || typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(getCameralessInterviewTestEntryStorageKey(mode, sessionId), "1");
  } catch {
    // Session storage can be unavailable in private or locked-down browsers.
  }
}

function consumeCameralessInterviewTestEntry(mode: RuntimeMode, sessionId: number): boolean {
  if (!ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY || typeof window === "undefined") return false;

  try {
    const key = getCameralessInterviewTestEntryStorageKey(mode, sessionId);
    const enabled = window.sessionStorage.getItem(key) === "1";
    if (enabled) window.sessionStorage.removeItem(key);
    return enabled;
  } catch {
    return false;
  }
}

const DEVICE_TEST_SENTENCES = [
  "나는 차분하게 듣고, 나의 생각을 분명하게 답할 수 있다.",
  "나는 준비한 만큼 침착하게 말하고, 끝까지 답할 수 있다.",
  "긴장해도 괜찮다. 나는 천천히 생각하고 분명하게 말한다.",
  "나는 오늘의 경험을 믿고, 차분하게 나를 보여줄 수 있다.",
  "나는 질문을 끝까지 듣고, 내 언어로 또렷하게 답한다.",
  "완벽하지 않아도 괜찮다. 나는 침착하게 끝까지 말한다.",
  "나는 지금 이 순간에도 차분하게 호흡하고 또렷하게 말한다.",
  "나는 나의 경험을 믿고, 한 문장씩 분명하게 답할 수 있다.",
  "나는 서두르지 않고 질문을 이해한 뒤 차분하게 대답한다.",
  "나는 오늘 준비한 시간을 믿고 자신 있게 나를 표현한다.",
  "나는 긴장 속에서도 중심을 잡고, 끝까지 내 생각을 전한다.",
  "나는 천천히 숨을 고르고, 내가 가진 강점을 분명히 말한다.",
  "나는 질문을 잘 듣고, 나의 경험을 바탕으로 답할 수 있다.",
  "나는 침착한 목소리로 나의 생각과 태도를 또렷하게 전한다.",
  "나는 실수해도 다시 차분하게 이어가며 끝까지 답할 수 있다.",
  "나는 지금까지 해온 노력을 믿고, 자신 있게 면접에 임한다.",
  "나는 흔들리지 않고 나의 생각을 차근차근 설명할 수 있다.",
  "나는 오늘 나의 가능성과 경험을 분명한 목소리로 보여준다.",
  "나는 마음을 가다듬고, 질문마다 성실하게 답할 준비가 됐다.",
  "나는 천천히 말해도 괜찮다. 중요한 것은 끝까지 전하는 것이다.",
  "나는 나답게 생각하고, 나답게 말하며, 끝까지 집중할 수 있다.",
  "나는 차분한 태도로 듣고, 또렷한 목소리로 나를 설명한다.",
  "나는 준비된 사람이다. 지금 이 자리에서 침착하게 답할 수 있다.",
  "나는 나의 속도로 말하고, 나의 경험으로 충분히 답할 수 있다.",
  "나는 끝까지 집중하며, 오늘의 면접을 차분하게 마무리할 수 있다.",
] as const;

export function CandidateJobsPage() {
  const [query, setQuery] = useState<CandidateJobQuery>(defaultCandidateJobQuery);
  const load = useCallback(() => getCandidateApi().listJobs(query), [query]);
  const { data, loading, error } = useCandidateResource(load, [query]);

  return (
    <CandidatePageShell active="jobs">
      <section className="candidate-jobs-page glass-page" aria-labelledby="candidate-jobs-heading">
        <div className="page-head">
          <div>
            <h1 id="candidate-jobs-heading">채용공고</h1>
            <p className="page-sub">지원 가능한 채용공고를 기업 공고 목록과 같은 기준으로 확인합니다.</p>
          </div>
          <Link className="btn secondary" href={candidateApplicationInterviewRoutes.applications}>
            지원현황
          </Link>
        </div>
        <StatusNotice loading={loading} error={error} />
        <CandidateJobsView
          jobs={data?.data.items ?? []}
          query={query}
          totalItems={data?.meta.page.totalItems ?? 0}
          onQueryChange={setQuery}
        />
      </section>
    </CandidatePageShell>
  );
}

export function CandidateJobDetailPage({ jobId }: { jobId: number }) {
  const load = useCallback(() => getCandidateApi().getJobDetail(jobId), [jobId]);
  const { data, loading, error } = useCandidateResource(load, [jobId]);

  return (
    <CandidatePageShell active="jobs">
      <StatusNotice loading={loading} error={error} />
      {data ? <CandidateJobDetailView job={data.data} /> : null}
    </CandidatePageShell>
  );
}

export function CandidateJobApplyPage({ jobId }: { jobId: number }) {
  const router = useRouter();
  const candidateId = getCurrentCandidateId();
  const [form, setForm] = useState<CandidateApplicationFormState>({
    ...defaultApplicationFormState,
    candidateName: "김지원",
    email: "jiwon@example.com",
    phone: "010-0000-0000",
    portfolioUrl: "https://github.com/jiwon",
  });
  const [latestResumeFile, setLatestResumeFile] = useState<CandidateFileAsset>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getCandidateApi().getApplyView(jobId), [jobId]);
  const { data, loading, error } = useCandidateResource(load, [jobId]);

  async function handleResumeFileSelect(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const uploadState = createResumeUploadStateFromFile(candidateId, file);
      const request = toUploadResumeRequest(uploadState);
      const result = await getCandidateApi().uploadResume(request);
      setLatestResumeFile(result.data);
      setForm((current) => ({ ...current, resumeFileId: result.data.fileId }));
      setMessage("이력서 파일 메타데이터가 등록되었습니다.");
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleApplicationSubmit(request: Parameters<ReturnType<typeof getCandidateApi>["submitApplication"]>[1]) {
    setBusy(true);
    setMessage("");
    try {
      const api = getCandidateApi();
      if (request.portfolioUrl) {
        await api.createPortfolioLink(
          toCreatePortfolioLinkRequest({
            ...defaultPortfolioLinkFormState,
            url: request.portfolioUrl,
            linkType: inferPortfolioLinkType(request.portfolioUrl),
            description: request.coverLetter ?? "",
          }),
        );
      }
      const result = await api.submitApplication(jobId, request);
      setMessage(`지원서가 제출되었습니다. 접수 번호는 ${result.data.application.applicationId}번입니다.`);
      router.push(candidateApplicationInterviewRoutes.applications);
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="jobs">
      <section className="candidate-apply-shell glass-page">
        {data ? (
          <CandidatePageHead
            eyebrow=""
            title="지원서 제출"
            description={`${data.data.job.companyName} · ${data.data.job.title}`}
            actions={
              <Link className="btn secondary" href={candidateApplicationInterviewRoutes.jobDetail(jobId)}>
                채용공고
              </Link>
            }
          />
        ) : null}
        <StatusNotice loading={loading || busy} error={error} message={message} />
        {data ? (
          <CandidateApplicationView
            busy={busy}
            job={data.data.job}
            latestResumeFile={latestResumeFile}
            state={form}
            onResumeFileSelect={handleResumeFileSelect}
            onStateChange={setForm}
            onSubmit={handleApplicationSubmit}
          />
        ) : null}
      </section>
    </CandidatePageShell>
  );
}

export function CandidateApplicationsPage() {
  const load = useCallback(() => getCandidateApi().listApplications(), []);
  const { data, loading, error, refresh } = useCandidateResource(load, []);
  const applications = data?.data.items ?? [];
  const [statusFilter, setStatusFilter] = useState<CandidateApplicationStatusFilter>("ALL");
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | undefined>();
  const filteredApplications = applications.filter((application) =>
    matchesCandidateApplicationStatusFilter(application, statusFilter),
  );
  const selectedApplication =
    filteredApplications.find((application) => application.applicationId === selectedApplicationId) ??
    filteredApplications[0];
  const selectedApplicationAction = selectedApplication
    ? getSelectedApplicationAction(selectedApplication)
    : undefined;

  return (
    <CandidatePageShell active="applications">
      <section className="candidate-applications-page glass-page">
        <CandidatePageHead
          eyebrow=""
          title="지원현황"
          description="지원한 공고의 진행 상태를 확인합니다."
          actions={
            <label className="candidate-status-filter">
              <span className="sr-only">지원현황 상태 필터</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as CandidateApplicationStatusFilter);
                  setSelectedApplicationId(undefined);
                  refresh();
                }}
              >
                <option value="ALL">상태 필터</option>
                <option value="WAITING">응시 대기</option>
                <option value="IN_PROGRESS">진행 중</option>
                <option value="COMPLETED">응시 완료</option>
                <option value="REPORTING">리포트 진행</option>
              </select>
            </label>
          }
        />
        <StatusNotice loading={loading} error={error} />
        <section className="panel candidate-applications-panel">
          {filteredApplications.length ? (
            <ApplicationsTable
              applications={filteredApplications}
              selectedApplicationId={selectedApplication?.applicationId}
              onSelect={(applicationId) => setSelectedApplicationId(applicationId)}
            />
          ) : (
            <p className="empty">조건에 맞는 지원 건이 없습니다.</p>
          )}
        </section>
        {selectedApplication ? (
          <section className="panel candidate-selected-application">
            <div className="candidate-selected-application__head">
              <p className="panel-title">
                선택한 지원 건 · {selectedApplication.companyName} / {selectedApplication.jobTitle}
              </p>
              <ApplicationStatusBadge
                label={formatCandidateInterviewStatusLabel(selectedApplication.interviewStatus)}
                tone={getCandidateInterviewStatusTone(selectedApplication.interviewStatus)}
              />
            </div>
            <div className="candidate-selected-application__notice">
              AI 면접 방식, 유의사항, 답변 절차를 안내합니다.
            </div>
            {selectedApplicationAction?.href ? (
              <Link className="btn primary candidate-application-start-button" href={selectedApplicationAction.href}>
                {selectedApplicationAction.label}
              </Link>
            ) : (
              <span aria-disabled="true" className="btn primary candidate-application-start-button">
                {selectedApplicationAction?.label ?? "진행 불가"}
              </span>
            )}
          </section>
        ) : null}
      </section>
    </CandidatePageShell>
  );
}

export function CandidateInterviewGuidePage({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneFrameRef = useRef<number | null>(null);
  const cameraQualityIntervalRef = useRef<number | null>(null);
  const [step, setStep] = useState<InterviewGuideStep>("guide");
  const [consentState, setConsentState] = useState<CandidateInterviewConsentState>(defaultInterviewConsentState);
  const [deviceState, setDeviceState] = useState<CandidateDeviceCheckState>(defaultDeviceCheckState);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [, setCameraPreviewStatus] = useState("카메라 대기");
  const [cameraFramingState, setCameraFramingState] = useState<CameraFramingState>("idle");
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState("마이크 대기");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [networkStatus, setNetworkStatus] = useState("네트워크 대기");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getCandidateApi().getInterviewGuide(applicationId), [applicationId]);
  const { data, loading, error } = useCandidateResource(load, [applicationId]);
  const guide = data?.data;
  const guideInterviewAlreadyInProgress = guide?.interviewSessionStatus === "IN_PROGRESS";
  const guidePrimaryActionLabel = guideInterviewAlreadyInProgress ? "면접 재개" : "면접 시작";
  const guideRequiredConsentCompleted = guide
    ? guide.requiredConsentTypes.every((consentType) => consentState.consentTypes.includes(consentType))
    : false;
  const deviceTestSentence = useMemo(() => pickDeviceTestSentence(), []);

  useEffect(() => {
    void refreshGuideCameraDevices();
    return () => {
      stopGuideCameraQualityMonitor();
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
    };
    // Device enumeration is intentionally run once when entering the guide flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (guide) {
      setConsentState({ ...defaultInterviewConsentState });
      setDeviceState({
        cameraGranted: guide.deviceCheckCompleted,
        microphoneGranted: guide.deviceCheckCompleted,
        networkStable: guide.deviceCheckCompleted,
      });
      if (guide.deviceCheckCompleted) {
        setCameraPreviewStatus("이전 장치 점검 완료 · 현재 장치를 다시 확인해주세요");
        setMicrophoneStatus("이전 마이크 점검 완료 · 현재 장치를 다시 확인해주세요");
      }
    }
  }, [guide]);

  async function refreshGuideCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    const audioDevices = devices.filter((device) => device.kind === "audioinput");
    setCameraDevices(videoDevices);
    setMicrophoneDevices(audioDevices);
    if (!selectedCameraId && videoDevices.length === 1) {
      setSelectedCameraId(videoDevices[0]?.deviceId ?? "");
    }
    if (!selectedMicrophoneId && audioDevices.length === 1) {
      setSelectedMicrophoneId(audioDevices[0]?.deviceId ?? "");
    }
  }

  function stopGuideMicrophoneMeter() {
    if (microphoneFrameRef.current !== null) {
      window.cancelAnimationFrame(microphoneFrameRef.current);
      microphoneFrameRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicrophoneLevel(0);
  }

  function stopGuideCameraQualityMonitor() {
    if (cameraQualityIntervalRef.current !== null) {
      window.clearInterval(cameraQualityIntervalRef.current);
      cameraQualityIntervalRef.current = null;
    }
  }

  function startGuideCameraQualityMonitor(previewInfo: CameraPreviewInfo, fallbackLabel?: string) {
    stopGuideCameraQualityMonitor();
    const video = videoRef.current;
    if (!video) return;

    cameraQualityIntervalRef.current = startCameraQualityMonitor(video, previewInfo, fallbackLabel, (quality, framing, status) => {
      const cameraOk = quality.ok && !framing.blocking;
      setCameraReady(cameraOk);
      setCameraFramingState(framing.state);
      setCameraPreviewStatus(status);
      setDeviceState((current) => ({ ...current, cameraGranted: cameraOk }));
    });
  }

  function startGuideMicrophoneMeter(stream: MediaStream) {
    stopGuideMicrophoneMeter();
    const [audioTrack] = stream.getAudioTracks();
    if (!audioTrack) return;

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = audioContext;
    const samples = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      samples.forEach((sample) => {
        peak = Math.max(peak, Math.abs(sample - 128));
      });
      setMicrophoneLevel(Math.min(100, Math.round((peak / 128) * 100)));
      microphoneFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }

  async function handleGuideNext() {
    if (!guide) return;
    const missingConsents = guide.requiredConsentTypes.filter(
      (consentType) => !consentState.consentTypes.includes(consentType),
    );
    if (missingConsents.length > 0) {
      setMessage("필수 동의 항목을 모두 체크한 뒤 다음으로 이동해주세요.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      if (!guide.consentCompleted) {
        await getCandidateApi().saveInterviewConsent(applicationId, toSaveInterviewConsentRequest(consentState));
      }
      setStep("device");
      setMessage("동의가 저장되었습니다. 카메라와 마이크를 점검해주세요.");
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDevicePreview() {
    warmUpInterviewAudioOutput();
    setMessage("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("현재 브라우저에서 카메라/마이크 점검을 사용할 수 없습니다.");
      }
      stopGuideMicrophoneMeter();
      stopGuideCameraQualityMonitor();
      stopMediaStream(mediaStreamRef.current);
      setCameraReady(false);
      setCameraFramingState("idle");
      setMicrophoneReady(false);
      setCameraPreviewStatus("카메라 연결 중");
      setMicrophoneStatus(`테스트 문장을 읽어주세요. 예: ${deviceTestSentence}`);
      setNetworkStatus("네트워크 확인 중");
      const streamResult = await getCameraMediaStream(selectedCameraId, selectedMicrophoneId);
      const { stream, audioEnabled, fallbackLabel } = streamResult;
      mediaStreamRef.current = stream;
      let previewInfo: CameraPreviewInfo | undefined;
      if (videoRef.current) {
        previewInfo = await attachMediaStreamToVideo(videoRef.current, stream);
      }
      assertCameraPreviewHasFrame(previewInfo);
      const cameraQuality = assessCameraQuality(videoRef.current);
      const cameraFraming = getCameraFramingNotice();
      const microphoneQuality = audioEnabled
        ? await measureMicrophoneQuality(stream, setMicrophoneLevel)
        : { ok: false, peakLevel: 0, message: formatMicrophoneStatus(streamResult) };
      const networkQuality = await checkInterviewNetworkQuality();
      const cameraOk = cameraQuality.ok && !cameraFraming.blocking;
      const microphoneOk = audioEnabled && microphoneQuality.ok;
      setCameraReady(cameraOk);
      setCameraFramingState(cameraFraming.state);
      setMicrophoneReady(microphoneOk);
      setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo, fallbackLabel, cameraQuality, cameraFraming));
      setMicrophoneStatus(audioEnabled ? formatMicrophoneQualityStatus(streamResult, microphoneQuality) : microphoneQuality.message);
      setNetworkStatus(networkQuality.message);
      setDeviceState({
        cameraGranted: cameraOk,
        microphoneGranted: microphoneOk,
        networkStable: networkQuality.ok,
      });
      startGuideCameraQualityMonitor(previewInfo, fallbackLabel);
      if (audioEnabled) {
        startGuideMicrophoneMeter(stream);
      } else {
        setMicrophoneLevel(0);
      }
      await refreshGuideCameraDevices();
      setMessage(
        fallbackLabel
          ? `카메라를 연결했습니다. ${fallbackLabel} 마이크 권한을 확인한 뒤 면접을 시작해주세요.`
          : cameraOk && microphoneOk && networkQuality.ok
            ? "카메라 밝기, 마이크 입력, 네트워크 상태가 적정합니다. 면접 시작을 눌러주세요."
            : "장치 점검 기준을 통과하지 못했습니다. 안내에 따라 카메라 위치, 조명, 마이크 입력을 조정해주세요.",
      );
    } catch (previewError) {
      setCameraReady(false);
      setCameraFramingState("idle");
      stopGuideCameraQualityMonitor();
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      const microphoneProbe = await probeMicrophone(selectedMicrophoneId);
      setMicrophoneReady(microphoneProbe.ok);
      setMicrophoneStatus(formatMicrophoneProbeStatus(microphoneProbe));
      setCameraPreviewStatus(`카메라 연결 실패: ${formatMediaError(previewError)}`);
      const networkQuality = await checkInterviewNetworkQuality();
      setNetworkStatus(networkQuality.message);
      setDeviceState((current) => ({ ...current, networkStable: networkQuality.ok }));
      setMessage(
        microphoneProbe.ok
          ? `${formatMediaError(previewError)} 마이크는 연결되지만 녹화를 위해 카메라 권한도 필요합니다.`
          : `${formatMediaError(previewError)} ${formatMicrophoneProbeStatus(microphoneProbe)}`,
      );
    }
  }

  async function handleStartInterview() {
    warmUpInterviewAudioOutput();
    if (!guide) return;
    if (!cameraReady || !microphoneReady || !deviceState.networkStable) {
      setMessage("카메라, 마이크, 네트워크 점검을 완료한 뒤 면접을 시작해주세요.");
      return;
    }
    const stream = mediaStreamRef.current;
    const hasLiveVideo = stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
    const hasLiveAudio = stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
    if (!hasLiveVideo || !hasLiveAudio) {
      setCameraReady(false);
      setMicrophoneReady(false);
      setMessage("현재 브라우저의 카메라와 마이크가 연결되어 있지 않습니다. 카메라/마이크 점검을 다시 눌러주세요.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      if (!guide.deviceCheckCompleted) {
        await getCandidateApi().saveDeviceCheck(guide.sessionId, toDeviceCheckRequest(deviceState));
      }
      await getCandidateApi().startInterview(applicationId);
      stopGuideCameraQualityMonitor();
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      router.push(candidateApplicationInterviewRoutes.interview(applicationId));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleCameralessGuideEntry() {
    if (!guide || !ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY) return;

    warmUpInterviewAudioOutput();
    const testDeviceState = createCameralessInterviewTestDeviceCheckState();
    setBusy(true);
    setMessage("");
    try {
      stopGuideCameraQualityMonitor();
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      setDeviceState(testDeviceState);
      setCameraReady(true);
      setCameraFramingState("unsupported");
      setMicrophoneReady(true);
      setMicrophoneLevel(0);
      setCameraPreviewStatus("개발 테스트 모드: 카메라 점검 우회");
      setMicrophoneStatus("개발 테스트 모드: 마이크 점검 우회");
      setNetworkStatus("개발 테스트 모드: 네트워크 점검 우회");

      const api = getCandidateApi();
      if (!guide.deviceCheckCompleted) {
        await api.saveDeviceCheck(guide.sessionId, toDeviceCheckRequest(testDeviceState));
      }
      if (!guideInterviewAlreadyInProgress) {
        await api.startInterview(applicationId);
      }
      rememberCameralessInterviewTestEntry("recruiting", guide.sessionId);
      router.push(candidateApplicationInterviewRoutes.interview(applicationId));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="applications">
      <StatusNotice loading={loading || busy} error={error} message={message} />
      {guide ? (
        <>
          {step === "guide" ? (
            <>
              <CandidatePageHead
                eyebrow="면접 안내"
                title="채용 AI 면접 안내"
                description="응시 안내와 필수 동의를 확인한 뒤 면접 화면으로 이동합니다."
                actions={<Link className="btn secondary" href={candidateApplicationInterviewRoutes.applications}>지원현황</Link>}
              />
              <section className="panel detail-stack">
                <div className="panel-head">
                  <div>
                    <h2>응시 안내</h2>
                    <p>세션 ID {guide.sessionId} · {formatInterviewTypeLabel(guide.interviewType)}</p>
                  </div>
                  <StatusPill
                    value={
                      guideInterviewAlreadyInProgress
                        ? "IN_PROGRESS"
                        : guide.canStart
                          ? "START_READY"
                          : "PREP_REQUIRED"
                    }
                  />
                </div>
                <div className="candidate-steps" aria-label="채용 AI 면접 준비 단계">
                  <span className="current"><b>STEP 1</b> 응시 안내</span>
                  <span><b>STEP 2</b> 장치 점검</span>
                  <span><b>STEP 3</b> {guidePrimaryActionLabel}</span>
                </div>
                <dl className="candidate-feature__summary">
                  <Definition label="응시 시작" value={formatDateTime(guide.interviewWindowStartsAt)} />
                  <Definition label="응시 마감" value={formatDateTime(guide.interviewWindowEndsAt)} />
                  <Definition label="동의 완료" value={guide.consentCompleted ? "완료" : "필요"} />
                  <Definition label="장치 점검" value={guide.deviceCheckCompleted ? "완료" : "필요"} />
                  <Definition label="면접 상태" value={<StatusPill value={guide.interviewSessionStatus} />} />
                </dl>
                <ListBlock title="진행 방식" items={guide.method} />
                <ListBlock title="필수 준비 사항" items={guide.requiredPreparations} />
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>필수 동의</h2>
                    <p>개인정보, AI 분석, 녹화/녹음 안내를 확인합니다.</p>
                  </div>
                </div>
                <div className="candidate-feature__checks">
                  {requiredInterviewConsents.map((consentType) => (
                    <label key={consentType}>
                      <input
                        type="checkbox"
                        checked={consentState.consentTypes.includes(consentType)}
                        onChange={() =>
                          setConsentState((current) => ({
                            consentTypes: toggleValue(current.consentTypes, consentType),
                          }))
                        }
                      />
                      {formatConsentTypeLabel(consentType)}
                    </label>
                  ))}
                </div>
                <div className="toolbar candidate-submit-toolbar">
                  <button
                    className="btn primary"
                    type="button"
                    disabled={busy || !guideRequiredConsentCompleted}
                    onClick={() => void handleGuideNext()}
                  >
                    다음
                  </button>
                </div>
              </section>
            </>
          ) : (
            <section className="candidate-device-setup">
              <div className="candidate-device-setup__head">
                <div>
                  <p className="candidate-feature__eyebrow">장치 점검</p>
                  <h1>카메라와 마이크를 확인해주세요</h1>
                  <p>점검이 끝나면 채용 AI 면접이 시작됩니다.</p>
                  <div className="candidate-steps" aria-label="채용 AI 면접 준비 단계">
                    <span><b>STEP 1</b> 응시 안내</span>
                    <span className="current"><b>STEP 2</b> 장치 점검</span>
                    <span><b>STEP 3</b> {guidePrimaryActionLabel}</span>
                  </div>
                </div>
                <div className="toolbar">
                  <button className="btn secondary" type="button" disabled={busy} onClick={() => setStep("guide")}>
                    이전
                  </button>
                  {ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY ? (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCameralessGuideEntry()}
                    >
                      카메라 없이 테스트 진입
                    </button>
                  ) : null}
                  <button
                    className="btn primary"
                    type="button"
                    disabled={busy || !cameraReady || !microphoneReady || !deviceState.networkStable}
                    onClick={() => void handleStartInterview()}
                  >
                    {guidePrimaryActionLabel}
                  </button>
                </div>
              </div>
              <div className="candidate-device-setup__grid">
                <div className="candidate-device-main">
                  <div className="video-box candidate-device-preview">
                    <video ref={videoRef} autoPlay muted playsInline />
                    <CameraFramingOverlay state={cameraFramingState} testSentence={deviceTestSentence} />
                  </div>
                </div>
                <aside className="panel candidate-runtime-status-panel">
                  <p className="panel-title">장치 상태</p>
                  <div className="status-list">
                    <div className="status-line"><span className={cameraReady ? "ok" : "wait"}>{cameraReady ? "✓" : "!"}</span> 카메라 {cameraReady ? "정상" : "연결 확인 필요"}</div>
                    <div className="status-line"><span className={microphoneReady ? "ok" : "wait"}>{microphoneReady ? "✓" : "!"}</span> {microphoneStatus}</div>
                    <div className="mic-meter" aria-label={`마이크 입력 ${microphoneLevel}%`}>
                      <span style={{ width: `${microphoneLevel}%` }} />
                    </div>
                    <div className="status-line"><span className={deviceState.networkStable ? "ok" : "wait"}>{deviceState.networkStable ? "✓" : "!"}</span> {networkStatus}</div>
                  </div>
                  <div className="candidate-device-controls">
                    <select
                      aria-label="카메라 선택"
                      className="camera-select"
                      value={selectedCameraId}
                      onChange={(event) => setSelectedCameraId(event.target.value)}
                    >
                      <option value="">기본 카메라</option>
                      {cameraDevices.map((device, index) => (
                        <option key={device.deviceId || index} value={device.deviceId}>
                          {device.label || `카메라 ${index + 1}`}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="마이크 선택"
                      className="camera-select"
                      value={selectedMicrophoneId}
                      onChange={(event) => setSelectedMicrophoneId(event.target.value)}
                    >
                      <option value="">기본 마이크</option>
                      {microphoneDevices.map((device, index) => (
                        <option key={device.deviceId || index} value={device.deviceId}>
                          {device.label || `마이크 ${index + 1}`}
                        </option>
                      ))}
                    </select>
                    <button className="btn" type="button" disabled={busy} onClick={() => void refreshGuideCameraDevices()}>
                      장치 새로고침
                    </button>
                    <button className="btn" type="button" disabled={busy} onClick={() => void handleDevicePreview()}>
                      카메라/마이크 점검
                    </button>
                  </div>
                </aside>
              </div>
            </section>
          )}
        </>
      ) : null}
    </CandidatePageShell>
  );
}

export function CandidateInterviewPage({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const load = useCallback(async (): Promise<RuntimePageData> => {
    const api = getCandidateApi();
    const runtimeResult = await api.getInterviewRuntime(applicationId);
    if (runtimeResult.data.status !== "IN_PROGRESS") {
      const emptyQuestions: RuntimeQuestionListResponse = {
        sessionId: runtimeResult.data.sessionId,
        interviewType: runtimeResult.data.interviewType,
        showQuestionText: runtimeResult.data.showQuestionText,
        questions: [],
      };

      return {
        runtime: toRecruitingRuntimeSession(runtimeResult.data, emptyQuestions),
        questions: emptyQuestions,
      };
    }

    const questionsResult = await api.listRecruitingQuestions(runtimeResult.data.sessionId);
    return {
      runtime: toRecruitingRuntimeSession(runtimeResult.data, questionsResult.data),
      questions: questionsResult.data,
    };
  }, [applicationId]);
  const resource = useCandidateResource(load, [applicationId]);
  const runtimeStatus = resource.data?.runtime.status;
  const shouldRedirectToReport = runtimeStatus === "COMPLETED";
  const shouldRedirectToGuide =
    (runtimeStatus !== undefined && runtimeStatus !== "IN_PROGRESS" && runtimeStatus !== "COMPLETED") ||
    resource.error === "Interview has not been started.";

  useEffect(() => {
    if (!shouldRedirectToReport) return;
    router.replace(candidateApplicationInterviewRoutes.applicationReport(applicationId));
  }, [applicationId, router, shouldRedirectToReport]);

  useEffect(() => {
    if (!shouldRedirectToGuide) return;
    router.replace(candidateApplicationInterviewRoutes.interviewGuide(applicationId));
  }, [applicationId, router, shouldRedirectToGuide]);

  if (shouldRedirectToReport) {
    return (
      <CandidatePageShell active="applications">
        <StatusNotice loading message="면접 결과 화면으로 이동합니다." />
      </CandidatePageShell>
    );
  }

  if (shouldRedirectToGuide) {
    return (
      <CandidatePageShell active="applications">
        <StatusNotice loading message="면접 안내 화면으로 이동합니다." />
      </CandidatePageShell>
    );
  }

  return <InterviewRuntimePanel mode="recruiting" resource={resource} />;
}

export function PublicCandidateInterviewPage({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const api = useMemo(() => getPublicInterviewApi(), []);
  const load = useCallback(async (): Promise<RuntimePageData> => {
    const runtimeResult = await api.getInterviewRuntime(applicationId);
    if (runtimeResult.data.status !== "IN_PROGRESS") {
      const emptyQuestions: RuntimeQuestionListResponse = {
        sessionId: runtimeResult.data.sessionId,
        interviewType: runtimeResult.data.interviewType,
        showQuestionText: runtimeResult.data.showQuestionText,
        questions: [],
      };

      return {
        runtime: toRecruitingRuntimeSession(runtimeResult.data, emptyQuestions),
        questions: emptyQuestions,
      };
    }

    const questionsResult = await api.listRecruitingQuestions(runtimeResult.data.sessionId);
    return {
      runtime: toRecruitingRuntimeSession(runtimeResult.data, questionsResult.data),
      questions: questionsResult.data,
    };
  }, [api, applicationId]);
  const resource = useCandidateResource(load, [applicationId]);

  return (
    <InterviewRuntimePanel
      mode="recruiting"
      resource={resource}
      apiClient={api}
      onRecruitingComplete={(completedApplicationId) => {
        router.push(candidateApplicationInterviewRoutes.publicInterviewComplete(completedApplicationId));
      }}
    />
  );
}

export function CandidateMockInterviewStartPage() {
  const router = useRouter();
  const [state, setState] = useState<StartMockInterviewState>(defaultStartMockInterviewState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const historyLoad = useCallback(() => getCandidateApi().listMockInterviewHistory(), []);
  const historyResource = useCandidateResource(historyLoad, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await getCandidateApi().startMockInterview(toStartMockInterviewRequest(state));
      router.push(getMockInterviewDeviceCheckHref(result.data));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="interview">
      <section className="candidate-mock-start-page glass-page">
        <CandidatePageHead
          eyebrow="모의면접"
          title="개인 연습용 AI 모의면접"
          description="합격/탈락 판단 없이 연습 피드백만 제공합니다."
          actions={
            <Link className="btn secondary" href={candidateApplicationInterviewRoutes.mockReports}>
              리포트 보기
            </Link>
          }
        />
        <StatusNotice loading={busy && !settingsOpen} message={message && !settingsOpen ? message : undefined} />
        <section className="panel candidate-mock-guide">
          <div>
            <p className="eyebrow">진행 방식</p>
            <h2>실제 면접처럼 장치 점검 후 답변을 녹화합니다.</h2>
            <p>
              질문 유형과 난이도를 고르면 카메라와 마이크를 먼저 확인한 뒤 AI 안내에 따라 답변을 진행합니다.
            </p>
          </div>
          <ol className="candidate-mock-flow" aria-label="모의면접 진행 순서">
            <li>
              <span>1</span>
              <strong>설정 선택</strong>
              <p>직무, 난이도, 질문 유형을 선택합니다.</p>
            </li>
            <li>
              <span>2</span>
              <strong>장치 점검</strong>
              <p>카메라와 마이크 입력을 확인합니다.</p>
            </li>
            <li>
              <span>3</span>
              <strong>답변 진행</strong>
              <p>질문을 듣고 정해진 시간 안에 답변합니다.</p>
            </li>
          </ol>
          <div className="candidate-mock-guide-actions">
            <button className="btn primary" type="button" onClick={() => setSettingsOpen(true)}>
              모의면접 설정하기
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>연습 이력</h2>
              <p>이전 모의면접 기록과 리포트를 확인합니다.</p>
            </div>
          </div>
          <StatusNotice loading={historyResource.loading} error={historyResource.error} />
          {historyResource.data?.data.items.length ? (
            <MockHistoryTable history={historyResource.data.data.items} />
          ) : (
            <p className="empty">모의면접 이력이 없습니다.</p>
          )}
        </section>
        {settingsOpen ? (
          <div className="modal-backdrop" role="presentation">
            <form
              className="modal wide-modal candidate-mock-settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="candidate-mock-settings-title"
              onSubmit={handleSubmit}
            >
              <div className="modal-head">
                <div>
                  <h2 id="candidate-mock-settings-title">모의면접 설정</h2>
                  <p>설정이 완료되면 카메라와 마이크 점검 화면으로 이동합니다.</p>
                </div>
                <button className="btn secondary compact" type="button" disabled={busy} onClick={() => setSettingsOpen(false)}>
                  닫기
                </button>
              </div>
              <StatusNotice loading={busy} message={message} />
              <div className="candidate-mock-filters">
                <label className="candidate-filter-field">
                  <span>직무</span>
                  <select
                    value={state.jobRole}
                    onChange={(event) => setState((current) => ({ ...current, jobRole: event.target.value }))}
                  >
                    <option value="Backend">백엔드</option>
                    <option value="Frontend">프론트엔드</option>
                    <option value="Android">안드로이드</option>
                    <option value="iOS">iOS</option>
                    <option value="Full Stack">풀스택</option>
                    <option value="AI">AI/ML</option>
                  </select>
                </label>
                <label className="candidate-filter-field">
                  <span>난이도</span>
                  <select
                    value={state.difficulty}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        difficulty: event.target.value as StartMockInterviewState["difficulty"],
                      }))
                    }
                  >
                    <option value="EASY">초급</option>
                    <option value="NORMAL">중급</option>
                    <option value="HARD">고급</option>
                  </select>
                </label>
                <fieldset className="candidate-filter-field candidate-question-type-filter">
                  <legend>질문 유형</legend>
                  <div className="candidate-filter-chips">
                    {questionTypeOptions.map((questionType) => (
                      <label key={questionType}>
                        <input
                          type="checkbox"
                          checked={state.questionTypes?.includes(questionType) ?? false}
                          onChange={() =>
                            setState((current) => ({
                              ...current,
                              questionTypes: toggleValue(current.questionTypes ?? [], questionType),
                            }))
                          }
                        />
                        <span>{formatQuestionTypeLabel(questionType)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="modal-actions split-actions">
                <button className="btn secondary" type="button" disabled={busy} onClick={() => setSettingsOpen(false)}>
                  취소
                </button>
                <button className="btn primary" type="submit" disabled={busy}>
                  모의면접 시작
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </CandidatePageShell>
  );
}

export function CandidateMockInterviewRuntimePage({ sessionId }: { sessionId: number }) {
  const load = useCallback(async (): Promise<RuntimePageData> => {
    const api = getCandidateApi();
    const [runtimeResult, questionsResult] = await Promise.all([
      api.getMockRuntime(sessionId),
      api.listMockQuestions(sessionId),
    ]);
    return {
      runtime: runtimeResult.data,
      questions: questionsResult.data,
    };
  }, [sessionId]);
  const resource = useCandidateResource(load, [sessionId]);

  return <InterviewRuntimePanel mode="mock" resource={resource} />;
}

export function CandidateMockReportsPage() {
  const load = useCallback(async () => {
    const api = getCandidateApi();
    const [reports, history] = await Promise.all([api.listMockReports(), api.listMockInterviewHistory()]);
    return {
      reports: reports.data.items,
      history: history.data.items,
    };
  }, []);
  const { data, loading, error, refresh } = useCandidateResource(load, []);

  return (
    <CandidatePageShell active="reports">
      <CandidatePageHead
        eyebrow="모의면접 리포트"
        title="모의면접 리포트"
        description="연습 이력과 생성된 피드백 리포트를 확인합니다."
        actions={
          <>
            <button className="btn secondary" type="button" onClick={refresh}>새로고침</button>
            <Link className="btn primary" href={candidateApplicationInterviewRoutes.mockInterviewStart}>모의면접 시작</Link>
          </>
        }
      />
      <StatusNotice loading={loading} error={error} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>리포트 목록</h2>
            <p>지원자에게 허용된 모의면접 피드백만 표시합니다.</p>
          </div>
        </div>
        {data?.reports.length ? <MockReportsTable reports={data.reports} /> : <p className="empty">아직 생성된 모의면접 리포트가 없습니다.</p>}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>연습 이력</h2>
            <p>모의면접 세션 진행 상태를 확인합니다.</p>
          </div>
        </div>
        {data?.history.length ? <MockHistoryTable history={data.history} /> : <p className="empty">모의면접 이력이 없습니다.</p>}
      </section>
    </CandidatePageShell>
  );
}

export function CandidateMockReportDetailPage({ reportId }: { reportId: number }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generationRequested, setGenerationRequested] = useState(false);
  const load = useCallback(async (): Promise<MockReportDetailData> => {
    const api = getCandidateApi();
    const [feedbackResult, mediaResult] = await Promise.allSettled([
      api.getMockReportFeedback(reportId),
      api.getMockReportMedia(reportId),
    ]);
    return {
      feedback: feedbackResult.status === "fulfilled" ? feedbackResult.value.data : undefined,
      feedbackError: feedbackResult.status === "rejected" ? toErrorMessage(feedbackResult.reason) : undefined,
      media: mediaResult.status === "fulfilled" ? mediaResult.value.data : undefined,
      mediaError: mediaResult.status === "rejected" ? toErrorMessage(mediaResult.reason) : undefined,
    };
  }, [reportId]);
  const { data, loading, error, refresh } = useCandidateResource(load, [reportId]);
  const reportStatus = data?.feedback?.status ?? data?.media?.status ?? (generationRequested ? "GENERATING" : undefined);
  const reportStatusView = getMockReportStatusView(reportStatus, data?.feedbackError);
  const canRequestReport = !busy && reportStatus !== "GENERATING" && reportStatus !== "COMPLETED";
  const showReportRequestButton = reportStatus !== "COMPLETED";

  useEffect(() => {
    if (reportStatus !== "GENERATING") return;
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh, reportStatus]);

  async function handleGenerate() {
    setBusy(true);
    setMessage("");
    try {
      await getCandidateApi().requestMockReportGeneration(reportId);
      setGenerationRequested(true);
      setMessage("AI 분석 요청이 접수되었습니다. 분석이 완료되면 리포트가 자동으로 갱신됩니다.");
      refresh();
    } catch (generateError) {
      setMessage(toErrorMessage(generateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="reports">
      <CandidatePageHead
        eyebrow="리포트 상세"
        title="모의면접 리포트"
        description="분석 결과를 지원자 연습용 피드백으로 확인합니다."
        actions={<Link className="btn secondary" href={candidateApplicationInterviewRoutes.mockReports}>목록</Link>}
      />
      <StatusNotice loading={loading || busy} error={error} message={message} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>종합 피드백</h2>
            <p>합격/탈락 판단이나 내부 점수는 노출하지 않습니다.</p>
          </div>
          {showReportRequestButton ? (
            <button className="btn secondary" type="button" disabled={!canRequestReport} onClick={() => void handleGenerate()}>
              {reportStatus === "FAILED" ? "분석 다시 요청" : "AI 분석 시작"}
            </button>
          ) : null}
        </div>
        {data?.feedback && data.feedback.status === "COMPLETED"
          ? <MockFeedbackView feedback={data.feedback} />
          : <MockReportStatusPanel view={reportStatusView} />}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>답변 스크립트</h2>
            <p>녹음 답변에서 변환된 텍스트와 생성된 꼬리질문을 확인합니다.</p>
          </div>
        </div>
        {data?.media ? <MockMediaView media={data.media} /> : <p className="notice danger">{data?.mediaError ?? "미디어를 불러오지 못했습니다."}</p>}
      </section>
    </CandidatePageShell>
  );
}

export function CandidateApplicationReportPage({ applicationId }: { applicationId: number }) {
  const load = useCallback(async (): Promise<ApplicationReportData> => {
    const api = getCandidateApi();
    const [statusResult, reportResult] = await Promise.allSettled([
      api.getApplicationStatus(applicationId),
      api.getApplicationReport(applicationId),
    ]);
    return {
      status: statusResult.status === "fulfilled" ? statusResult.value.data : undefined,
      statusError: statusResult.status === "rejected" ? toErrorMessage(statusResult.reason) : undefined,
      report: reportResult.status === "fulfilled" ? reportResult.value.data : undefined,
      reportError: reportResult.status === "rejected" ? toErrorMessage(reportResult.reason) : undefined,
    };
  }, [applicationId]);
  const { data, loading, error, refresh } = useCandidateResource(load, [applicationId]);

  return (
    <CandidatePageShell active="applications">
      <CandidatePageHead
        eyebrow="채용 결과"
        title="채용 AI 면접 결과"
        description={data?.status ? `${data.status.companyName} · ${data.status.jobTitle}` : "면접 제출 여부와 전형 진행 상태를 확인합니다."}
        actions={
          <div className="toolbar">
            <StatusPill value="채용면접" />
            <StatusPill value="기업 검토" />
            <button className="btn secondary" type="button" onClick={refresh}>새로고침</button>
          </div>
        }
      />
      <StatusNotice loading={loading} error={error} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>전형 상태</h2>
            <p>지원서와 면접 세션 진행 상태를 확인합니다.</p>
          </div>
        </div>
        {data?.status ? <ApplicationStatusView status={data.status} /> : <p className="notice danger">{data?.statusError ?? "전형 상태를 불러오지 못했습니다."}</p>}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>지원자용 결과</h2>
            <p>면접 제출과 분석 진행 상태를 안내합니다.</p>
          </div>
        </div>
        {data?.report ? (
          <RecruitingReportView report={data.report} />
        ) : (
          <RecruitingReportFallbackView status={data?.status} reportError={data?.reportError} />
        )}
      </section>
      <Link className="btn primary" href={candidateApplicationInterviewRoutes.applications}>지원현황으로 돌아가기</Link>
    </CandidatePageShell>
  );
}

export function CandidateMyPage() {
  const candidateId = getCurrentCandidateId();
  const [resumeState, setResumeState] = useState<CandidateResumeUploadState>({
    candidateId,
    storageKey: "",
    originalName: "",
    mimeType: "",
    sizeBytes: 0,
  });
  const [portfolioFileState, setPortfolioFileState] = useState<CandidateResumeUploadState>({
    candidateId,
    storageKey: "",
    originalName: "",
    mimeType: "",
    sizeBytes: 0,
  });
  const [portfolioState, setPortfolioState] = useState<CandidatePortfolioLinkFormState>(defaultPortfolioLinkFormState);
  const [latestResumeFile, setLatestResumeFile] = useState<CandidateFileAsset>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const portfolioInputRef = useRef<HTMLInputElement | null>(null);

  async function handleResumeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const request = toUploadResumeRequest(resumeState);
      const result = await getCandidateApi().uploadResume(request);
      setLatestResumeFile(result.data);
      setMessage("이력서가 업로드되었습니다.");
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handlePortfolioSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const api = getCandidateApi();
      let fileId = portfolioState.fileId;
      if (portfolioFileState.storageKey) {
        const fileResult = await api.uploadResume(toUploadResumeRequest(portfolioFileState));
        fileId = fileResult.data.fileId;
      }
      await api.createPortfolioLink(toCreatePortfolioLinkRequest({ ...portfolioState, fileId }));
      setPortfolioState(defaultPortfolioLinkFormState);
      setPortfolioFileState({ candidateId, storageKey: "", originalName: "", mimeType: "", sizeBytes: 0 });
      setMessage("포트폴리오/깃허브가 등록되었습니다.");
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="accountBilling">
      <section className="candidate-mypage">
        <header className="candidate-mypage__head">
          <h1>지원자 마이페이지</h1>
          <p>이력서와 포트폴리오를 관리합니다.</p>
        </header>
      <StatusNotice loading={busy} message={message} />
        <div className="candidate-mypage__cards">
          <form className="candidate-mypage-card candidate-resume-card" onSubmit={handleResumeSubmit}>
            <h2>이력서 업로드</h2>
            <button
              className="candidate-upload-drop"
              type="button"
              onClick={() => resumeInputRef.current?.click()}
            >
              <span className="candidate-upload-icon" aria-hidden="true">
                <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
                  <path d="M12 16V4m0 0-5 5m5-5 5 5M5 20h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                </svg>
              </span>
              <span>{resumeState.originalName || "PDF, DOCX 파일을 선택하세요"}</span>
            </button>
            <input
              ref={resumeInputRef}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="candidate-hidden-file"
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setResumeState(createResumeUploadStateFromFile(candidateId, file));
              }}
            />
            <button className="btn primary candidate-mypage-action" type="submit" disabled={busy}>
              업로드
            </button>
            <p className="candidate-mypage-note">
              {latestResumeFile
                ? `${latestResumeFile.originalName} 업로드 완료`
                : "업로드 후 서류 텍스트 추출 및 분석 대기 상태로 전환됩니다."}
            </p>
          </form>

          <form className="candidate-mypage-card candidate-portfolio-card" onSubmit={handlePortfolioSubmit}>
            <h2>포트폴리오 / 깃허브 등록</h2>
            <label>
              주소
              <input
                placeholder="https://github.com/..."
                type="url"
                value={portfolioState.url}
                onChange={(event) =>
                  setPortfolioState({
                    ...portfolioState,
                    url: event.currentTarget.value,
                    linkType: inferPortfolioLinkType(event.currentTarget.value),
                  })
                }
              />
            </label>
            <label>
              설명
              <input
                placeholder="프로젝트 설명"
                value={portfolioState.description}
                onChange={(event) => setPortfolioState({ ...portfolioState, description: event.currentTarget.value })}
              />
            </label>
            <label>
              파일 첨부
              <button
                className="candidate-file-picker"
                type="button"
                onClick={() => portfolioInputRef.current?.click()}
              >
                {portfolioFileState.originalName || "파일 선택"}
              </button>
              <input
                ref={portfolioInputRef}
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="candidate-hidden-file"
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) setPortfolioFileState(createResumeUploadStateFromFile(candidateId, file));
                }}
              />
            </label>
            <button className="btn primary candidate-mypage-action" type="submit" disabled={busy}>
              등록
            </button>
          </form>
        </div>

        <section className="candidate-alert-card">
          <div className="candidate-alert-card__head">
            <h2>응시 안내 알림</h2>
            <span>v2.0</span>
          </div>
          <div className="candidate-alert-table" role="table" aria-label="응시 안내 알림">
            <div className="candidate-alert-row candidate-alert-row--head" role="row">
              <span role="columnheader">회사</span>
              <span role="columnheader">응시 링크</span>
              <span role="columnheader">마감일</span>
              <span role="columnheader">상태</span>
            </div>
            <div className="candidate-alert-row" role="row">
              <span role="cell">A사</span>
              <span role="cell">
                <Link className="candidate-alert-link" href={candidateApplicationInterviewRoutes.applications}>
                  면접 응시
                </Link>
              </span>
              <span role="cell">07.01</span>
              <span role="cell">
                <span className="candidate-alert-status">발송 완료</span>
              </span>
            </div>
          </div>
        </section>
      </section>
    </CandidatePageShell>
  );
}

export function CandidateBillingPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [orderPage, setOrderPage] = useState<PaymentOrderPageMeta>(EMPTY_PAYMENT_ORDER_PAGE);
  const [passSummary, setPassSummary] = useState<CandidateMockInterviewPassSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"danger" | "success">("danger");

  const loadBillingData = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    setMessageTone("danger");
    try {
      const [orderData, passData] = await Promise.all([
        listPaymentOrders({ page, limit: PAYMENT_HISTORY_PAGE_LIMIT }),
        getCandidateMockInterviewPassSummary(),
      ]);
      setOrders(orderData.items);
      setOrderPage(orderData.page);
      setPassSummary(passData);
    } catch (error) {
      setMessageTone("danger");
      setMessage(error instanceof Error ? error.message : "결제 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBillingData();
  }, [loadBillingData]);

  async function handlePayment() {
    setPaying(true);
    setMessage("");
    setMessageTone("danger");
    try {
      const order = await createPaymentOrder({
        productCode: CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.productCode,
        quantity: 1,
      });
      await requestTossCardPayment(TOSS_CLIENT_KEY, order);
    } catch (error) {
      setMessageTone("danger");
      setMessage(error instanceof Error ? error.message : "결제창을 열지 못했습니다.");
      setPaying(false);
    }
  }

  async function handleDevelopmentPassGrant() {
    setLoading(true);
    setMessage("");
    setMessageTone("danger");
    try {
      const summary = await grantCandidateMockInterviewDevPasses({ passAmount: 5 });
      setPassSummary(summary);
      setMessageTone("success");
      setMessage(`테스트용 모의면접 이용권 5회를 추가했습니다. 현재 사용 가능 ${summary.availablePasses}회`);
    } catch (error) {
      setMessageTone("danger");
      setMessage(error instanceof Error ? error.message : "테스트 이용권을 추가하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <CandidatePageShell active="accountBilling">
      <CandidatePageHead
        eyebrow=""
        title="결제 정보"
        description="모의면접 이용권과 결제 내역을 확인합니다."
      />
      {message ? <p className={`notice ${messageTone}`}>{message}</p> : null}
      <section className="panel">
        <div className="grid-2">
          <div className="candidate-mypage-card">
            <div className="panel-head">
              <div>
                <h2>신규 지원자 무료 이용권</h2>
                <p>처음 시작하는 사용자는 모의면접을 먼저 경험할 수 있습니다.</p>
              </div>
              <span className="badge success">보유 {passSummary?.availablePasses ?? CANDIDATE_FREE_MOCK_INTERVIEW_POLICY.freePasses}회</span>
            </div>
            <div className="candidate-selected-application__notice">
              가입 또는 첫 로그인 시 AI 모의면접 {CANDIDATE_FREE_MOCK_INTERVIEW_POLICY.freePasses}회를 무료로 제공합니다. 무료 이용권은 지급일로부터 {CANDIDATE_FREE_MOCK_INTERVIEW_POLICY.expiresInDays}일 동안 사용할 수 있습니다.
              {passSummary ? (
                <>
                  <br />
                  현재 사용 가능 {passSummary.availablePasses}회 · 사용 {passSummary.usedPasses}회
                  {passSummary.freeExpiresAt ? ` · 무료권 만료 ${formatPaymentDateTime(passSummary.freeExpiresAt)}` : ""}
                </>
              ) : null}
            </div>
            {SHOW_PAYMENT_DEV_TOOLS ? (
              <button
                className="btn secondary candidate-mypage-action"
                type="button"
                onClick={() => void handleDevelopmentPassGrant()}
                disabled={loading || paying}
              >
                테스트 이용권 5회 추가
              </button>
            ) : null}
          </div>
          <div className="candidate-mypage-card">
            <div className="panel-head">
              <div>
                <h2>{CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.orderName}</h2>
                <p>무료 이용권 소진 후 추가 연습이 필요할 때 구매합니다.</p>
              </div>
              <span className="badge info">{CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.label}</span>
            </div>
            <div className="candidate-selected-application__notice">
              <strong>{formatWon(CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.amount)}</strong>
              <br />
              모의면접 1회 응시와 AI 피드백 리포트를 포함합니다.
            </div>
            <button className="btn primary candidate-mypage-action" type="button" onClick={() => void handlePayment()} disabled={paying}>
              {paying ? "결제창 여는 중" : "토스페이먼츠로 결제"}
            </button>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>최근 결제 내역</h2>
            <p>모의면접 이용권 결제 상태를 확인합니다.</p>
          </div>
          <button className="btn secondary" type="button" onClick={() => void loadBillingData(orderPage.page)} disabled={loading || paying}>
            새로고침
          </button>
        </div>
        {loading ? <p className="empty">결제 내역을 불러오는 중입니다.</p> : <CandidatePaymentOrderList orders={orders} />}
        {!loading ? (
          <PaymentOrderPagination page={orderPage} disabled={paying} onPageChange={(nextPage) => void loadBillingData(nextPage)} />
        ) : null}
      </section>
    </CandidatePageShell>
  );
}

function CandidatePaymentOrderList({ orders }: { orders: PaymentOrder[] }) {
  if (orders.length === 0) {
    return <p className="empty">아직 결제 내역이 없습니다.</p>;
  }

  return (
    <div className="candidate-alert-table" role="table" aria-label="지원자 결제 내역">
      <div className="candidate-alert-row candidate-alert-row--head" role="row">
        <span role="columnheader">상품</span>
        <span role="columnheader">금액</span>
        <span role="columnheader">상태</span>
        <span role="columnheader">일시</span>
      </div>
      {orders.map((order) => (
        <div className="candidate-alert-row" role="row" key={order.orderId}>
          <span role="cell">{order.orderName}</span>
          <span role="cell">{formatWon(order.amount)}</span>
          <span role="cell">
            <span className={`badge ${paymentStatusTone(order.status)}`}>{paymentStatusLabel(order.status)}</span>
          </span>
          <span role="cell">{formatPaymentDateTime(order.approvedAt ?? order.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function InterviewRuntimePanel({
  mode,
  resource,
  apiClient,
  onRecruitingComplete,
}: {
  mode: RuntimeMode;
  resource: ReturnType<typeof useCandidateResource<RuntimePageData>>;
  apiClient?: InterviewRuntimeApiClient;
  onRecruitingComplete?: (applicationId: number, sessionId: number) => void;
}) {
  const { data, loading, error, refresh } = resource;
  const router = useRouter();
  const runtimeApi = apiClient ?? getCandidateApi();
  const currentQuestion = data?.runtime.currentQuestion;
  const runtimeInterviewType = data?.runtime.interviewType;
  const runtimePreparationTimeSec = data?.runtime.timePolicy?.preparationTimeSec;
  const runtimeAnswerTimeSec = data?.runtime.timePolicy?.answerTimeSec;
  const runtimeRetryAllowed = data?.runtime.timePolicy?.retryAllowed ?? false;
  const [answer, setAnswer] = useState<InterviewAnswerFormState>(defaultInterviewAnswerFormState);
  const [retryAnswerId, setRetryAnswerId] = useState<number>();
  const [retryingQuestionId, setRetryingQuestionId] = useState<number>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<LastSavedAnswer>();
  const [autoAiPipeline, setAutoAiPipeline] = useState<AutoAiPipelineState>();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [, setCameraPreviewStatus] = useState("카메라 대기");
  const [cameraFramingState, setCameraFramingState] = useState<CameraFramingState>("idle");
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState("마이크 대기");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [networkReady, setNetworkReady] = useState(false);
  const [networkStatus, setNetworkStatus] = useState("네트워크 대기");
  const [recording, setRecording] = useState(false);
  const [recordedFileName, setRecordedFileName] = useState("");
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [cameralessTestEntry, setCameralessTestEntry] = useState(false);
  const [cameraPreviewVisible, setCameraPreviewVisible] = useState(true);
  const [cameraPipPosition, setCameraPipPosition] = useState<CameraPipPosition>();
  const [runtimePrimaryScreen, setRuntimePrimaryScreen] = useState<InterviewRuntimePrimaryScreen>("interviewer");
  const [interviewerPipVisible, setInterviewerPipVisible] = useState(true);
  const [interviewerPipPosition, setInterviewerPipPosition] = useState<CameraPipPosition>();
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [interviewerInfoOpen, setInterviewerInfoOpen] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_INTERVIEW_QUESTION_TIME_LIMIT_SECONDS);
  const [timerPhase, setTimerPhase] = useState<RuntimeTimerPhase>("ANSWERING");
  const [introCompleted, setIntroCompleted] = useState(false);
  const [questionSpeechCompleted, setQuestionSpeechCompleted] = useState(false);
  const [questionSpeechPlaying, setQuestionSpeechPlaying] = useState(false);
  const [questionSpeechStatus, setQuestionSpeechStatus] = useState("AI 안내 대기");
  const [questionSpeechSupported, setQuestionSpeechSupported] = useState(true);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<number>>(() => new Set());
  const [replayedQuestionIds, setReplayedQuestionIds] = useState<Set<number>>(() => new Set());
  const [reansweringQuestionId, setReansweringQuestionId] = useState<number | null>(null);
  const [reansweredQuestionIds, setReansweredQuestionIds] = useState<Set<number>>(() => new Set());
  const answeredQuestionIdsRef = useRef<Set<number>>(new Set());
  const savingQuestionIdsRef = useRef<Set<number>>(new Set());
  const interviewerStageRef = useRef<HTMLDivElement | null>(null);
  const cameraPipRef = useRef<HTMLDivElement | null>(null);
  const cameraPipDragRef = useRef<CameraPipDragState | null>(null);
  const interviewerPipRef = useRef<HTMLDivElement | null>(null);
  const interviewerPipDragRef = useRef<CameraPipDragState | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneFrameRef = useRef<number | null>(null);
  const cameraQualityIntervalRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef(0);
  const submitAfterRecordingStopRef = useRef(false);
  const autoAdvanceAfterAnswerSubmitRef = useRef(false);
  const answerCompleteShortcutRef = useRef<() => void>(() => undefined);
  const nextQuestionShortcutRef = useRef<() => void>(() => undefined);
  const startRuntimeAfterRefreshRef = useRef(false);
  const autoRecordingQuestionRef = useRef<number | null>(null);
  const autoSpokenQuestionRef = useRef<number | null>(null);
  const introSpokenSessionRef = useRef<number | null>(null);
  const timeExpiredQuestionRef = useRef<number | null>(null);
  const answerStartCueQuestionRef = useRef<number | null>(null);
  const invalidRecordingRetryCountsRef = useRef<Map<number, number>>(new Map());
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const videoAttachRunRef = useRef(0);
  const hasAnswerFile = Boolean(answer.videoFile || answer.audioFile || answer.videoFileId || answer.audioFileId);
  const canSubmitAnswer = Boolean(currentQuestion && hasAnswerFile && answer.durationSeconds > 0 && !recording);
  const retryingCurrentQuestion = Boolean(currentQuestion && retryingQuestionId === currentQuestion.questionId);
  const currentQuestionAnswered = Boolean(
    currentQuestion &&
      !retryingCurrentQuestion &&
      (answeredQuestionIds.has(currentQuestion.questionId) ||
        data?.questions.questions.some((question) => question.questionId === currentQuestion.questionId && question.answered)),
  );
  const isReansweringCurrentQuestion = Boolean(currentQuestion && reansweringQuestionId === currentQuestion.questionId);
  const currentQuestionLocked = currentQuestionAnswered && !isReansweringCurrentQuestion;
  const currentQuestionReplayUsed = Boolean(currentQuestion && replayedQuestionIds.has(currentQuestion.questionId));
  const deviceTestSentence = useMemo(() => pickDeviceTestSentence(), []);

  function isQuestionAlreadyAnswered(questionId: number): boolean {
    return (
      answeredQuestionIdsRef.current.has(questionId) ||
      Boolean(data?.questions.questions.some((question) => question.questionId === questionId && question.answered))
    );
  }

  function markQuestionAnswered(questionId: number) {
    setAnsweredQuestionIds((current) => {
      const next = new Set(current);
      next.add(questionId);
      answeredQuestionIdsRef.current = next;
      return next;
    });
  }

  function isQuestionStateConflict(error: unknown): boolean {
    if (!(error instanceof CandidateApiError)) return false;
    if (error.status !== 409 || error.body?.error.code !== "COMMON_CONFLICT") return false;
    return error.body.error.details.some((detail) =>
      ["current question", "question already answered"].some((reason) => detail.reason.includes(reason)),
    );
  }

  const stopQuestionSpeech = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    setQuestionSpeechPlaying(false);
  }, []);

  const speakInterviewIntro = useCallback(() => {
    if (!data) return;
    if (introSpokenSessionRef.current === data.runtime.sessionId) {
      setIntroCompleted(true);
      return;
    }

    if (!isQuestionSpeechSupported()) {
      setQuestionSpeechSupported(false);
      setIntroCompleted(true);
      setQuestionSpeechStatus("이 브라우저에서는 AI 음성 안내를 지원하지 않아 질문으로 바로 이동합니다.");
      return;
    }

    stopQuestionSpeech();
    const preparationTimeSec = getRuntimePreparationTimeLimitSeconds(data.runtime);
    const timingGuide =
      preparationTimeSec > 0
        ? `질문 안내가 끝나면 먼저 ${preparationTimeSec}초의 준비 시간이 흐르고, 준비 시간이 끝나면 알림음과 함께 답변 시간이 시작됩니다.`
        : "질문 안내가 끝나면 바로 답변 시간이 시작됩니다.";
    const text =
      mode === "recruiting"
        ? `안녕하세요. 지금부터 채용 AI 면접을 시작하겠습니다. ${timingGuide}`
        : `안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다. ${timingGuide}`;
    const utterance = new SpeechSynthesisUtterance(text);
    const koreanVoice = findKoreanSpeechVoice(window.speechSynthesis.getVoices());
    utterance.lang = "ko-KR";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    if (koreanVoice) utterance.voice = koreanVoice;
    utterance.onstart = () => {
      setQuestionSpeechPlaying(true);
      setQuestionSpeechStatus("AI 안내를 재생 중입니다.");
    };
    utterance.onend = () => {
      if (speechUtteranceRef.current !== utterance) return;
      speechUtteranceRef.current = null;
      introSpokenSessionRef.current = data.runtime.sessionId;
      setQuestionSpeechPlaying(false);
      setIntroCompleted(true);
      setQuestionSpeechStatus("AI 안내 완료. 질문 음성을 준비합니다.");
    };
    utterance.onerror = () => {
      if (speechUtteranceRef.current !== utterance) return;
      speechUtteranceRef.current = null;
      introSpokenSessionRef.current = data.runtime.sessionId;
      setQuestionSpeechPlaying(false);
      setIntroCompleted(true);
      setQuestionSpeechStatus("AI 안내를 재생할 수 없어 질문 음성으로 이동합니다.");
    };

    speechUtteranceRef.current = utterance;
    setQuestionSpeechSupported(true);
    setQuestionSpeechStatus("AI 안내 재생 준비 중입니다.");
    window.speechSynthesis.speak(utterance);
  }, [data, mode, stopQuestionSpeech]);

  const speakCurrentQuestion = useCallback(
    (source: "auto" | "manual") => {
      if (!currentQuestion) {
        setQuestionSpeechStatus("현재 질문을 불러올 수 없습니다.");
        setQuestionSpeechCompleted(true);
        return;
      }

      if (!isQuestionSpeechSupported()) {
        setQuestionSpeechSupported(false);
        setQuestionSpeechStatus("이 브라우저에서는 질문 음성 안내를 지원하지 않습니다.");
        setQuestionSpeechCompleted(true);
        if (source === "manual") {
          setMessage("이 브라우저에서는 질문 음성 안내를 지원하지 않습니다.");
        }
        return;
      }

      const text = toRuntimeQuestionSpeechText(currentQuestion);
      if (!text.trim()) {
        setQuestionSpeechStatus("재생할 질문 음성이 없습니다.");
        setQuestionSpeechCompleted(true);
        return;
      }

      stopQuestionSpeech();
      setQuestionSpeechCompleted(false);
      const utterance = new SpeechSynthesisUtterance(text);
      const koreanVoice = findKoreanSpeechVoice(window.speechSynthesis.getVoices());
      utterance.lang = "ko-KR";
      utterance.rate = 0.95;
      utterance.pitch = 1;
      if (koreanVoice) utterance.voice = koreanVoice;
      utterance.onstart = () => {
        setQuestionSpeechPlaying(true);
        setQuestionSpeechStatus(source === "manual" ? "질문 음성을 다시 재생 중입니다." : "질문 음성을 재생 중입니다.");
      };
      utterance.onend = () => {
        if (speechUtteranceRef.current !== utterance) return;
        speechUtteranceRef.current = null;
        setQuestionSpeechPlaying(false);
        setQuestionSpeechCompleted(true);
        setQuestionSpeechStatus("질문 음성 재생 완료");
      };
      utterance.onerror = () => {
        if (speechUtteranceRef.current !== utterance) return;
        speechUtteranceRef.current = null;
        setQuestionSpeechPlaying(false);
        setQuestionSpeechCompleted(true);
        setQuestionSpeechStatus("질문 음성을 재생할 수 없습니다.");
      };

      speechUtteranceRef.current = utterance;
      setQuestionSpeechSupported(true);
      setQuestionSpeechStatus("질문 음성 재생 준비 중입니다.");
      window.speechSynthesis.speak(utterance);
    },
    [currentQuestion, stopQuestionSpeech],
  );

  const attachRuntimeVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (!node || !streamRef.current) {
      stopRuntimeCameraQualityMonitor();
      return;
    }

    const attachRun = ++videoAttachRunRef.current;
    stopRuntimeCameraQualityMonitor();
    setCameraPreviewStatus("카메라 화면 연결 중");
    void (async () => {
      try {
        const stream = streamRef.current;
        if (!stream) return;
        const previewInfo = await attachMediaStreamToVideo(node, stream);
        assertCameraPreviewHasFrame(previewInfo);
        if (videoRef.current !== node || videoAttachRunRef.current !== attachRun) return;
        const cameraQuality = assessCameraQuality(node);
        const cameraFraming = getCameraFramingNotice();
        const cameraOk = cameraQuality.ok && !cameraFraming.blocking;
        setCameraReady(cameraOk);
        setCameraFramingState(cameraFraming.state);
        setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo, undefined, cameraQuality, cameraFraming));
        cameraQualityIntervalRef.current = startCameraQualityMonitor(node, previewInfo, undefined, (quality, framing, status) => {
          if (videoRef.current !== node || videoAttachRunRef.current !== attachRun) return;
          setCameraReady(quality.ok);
          setCameraFramingState(framing.state);
          setCameraPreviewStatus(status);
        });
      } catch (previewError) {
        if (videoRef.current !== node || videoAttachRunRef.current !== attachRun) return;
        setCameraReady(false);
        setCameraFramingState("idle");
        if (mode !== "recruiting") {
          setSetupCompleted(false);
        }
        setCameraPreviewStatus(`카메라 연결 실패: ${formatMediaError(previewError)}`);
        setMessage(formatMediaError(previewError));
      }
    })();
  }, [mode]);

  useEffect(() => {
    if (currentQuestion) {
      setAnswer((current) => ({ ...current, questionId: currentQuestion.questionId }));
      setReansweringQuestionId((current) => (current === currentQuestion.questionId ? current : null));
      setRecordedFileName("");
      submitAfterRecordingStopRef.current = false;
      autoAdvanceAfterAnswerSubmitRef.current = false;
      timeExpiredQuestionRef.current = null;
      answerStartCueQuestionRef.current = null;
      invalidRecordingRetryCountsRef.current.delete(currentQuestion.questionId);
      setRetryAnswerId(undefined);
      setRetryingQuestionId(undefined);
      setQuestionSpeechCompleted(false);
      setQuestionSpeechPlaying(false);
      resetRuntimeQuestionTimer(
        runtimeInterviewType
          ? {
              interviewType: runtimeInterviewType,
              timePolicy:
                typeof runtimePreparationTimeSec === "number" && typeof runtimeAnswerTimeSec === "number"
                  ? {
                      preparationTimeSec: runtimePreparationTimeSec,
                      answerTimeSec: runtimeAnswerTimeSec,
                      retryAllowed: runtimeRetryAllowed,
                    }
                  : undefined,
            }
          : undefined,
        setTimerPhase,
        setRemainingSeconds,
      );
    }
  }, [currentQuestion, runtimeAnswerTimeSec, runtimeInterviewType, runtimePreparationTimeSec, runtimeRetryAllowed]);

  useEffect(() => {
    void refreshCameraDevices();
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      stopQuestionSpeech();
      stopRuntimeCameraQualityMonitor();
      stopMicrophoneMeter();
      stopMediaStream(streamRef.current);
    };
    // Camera/device probing is intentionally run once when the runtime panel mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopQuestionSpeech]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleFullscreenChange = () => {
      setFullscreenActive(document.fullscreenElement === interviewerStageRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !setupCompleted || !cameraPreviewVisible || runtimePrimaryScreen !== "interviewer") return;

    const syncCameraPipPosition = () => {
      const stage = interviewerStageRef.current;
      const pip = cameraPipRef.current;
      if (!stage || !pip) return;

      const stageRect = stage.getBoundingClientRect();
      const pipRect = pip.getBoundingClientRect();
      const padding = fullscreenActive ? 32 : 20;
      const bounds = {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      };

      setCameraPipPosition((current) => (
        current
          ? clampCameraPipPosition(current, bounds)
          : getDefaultCameraPipPosition(bounds)
      ));
    };

    const animationFrameId = window.requestAnimationFrame(syncCameraPipPosition);
    window.addEventListener("resize", syncCameraPipPosition);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", syncCameraPipPosition);
    };
  }, [cameraPreviewVisible, fullscreenActive, runtimePrimaryScreen, setupCompleted]);

  useEffect(() => {
    if (typeof window === "undefined" || !setupCompleted || !interviewerPipVisible || runtimePrimaryScreen !== "candidate") return;

    const syncInterviewerPipPosition = () => {
      const stage = interviewerStageRef.current;
      const pip = interviewerPipRef.current;
      if (!stage || !pip) return;

      const stageRect = stage.getBoundingClientRect();
      const pipRect = pip.getBoundingClientRect();
      const padding = fullscreenActive ? 32 : 20;
      const bounds = {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      };

      setInterviewerPipPosition((current) => (
        current
          ? clampCameraPipPosition(current, bounds)
          : getDefaultCameraPipPosition(bounds)
      ));
    };

    const animationFrameId = window.requestAnimationFrame(syncInterviewerPipPosition);
    window.addEventListener("resize", syncInterviewerPipPosition);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", syncInterviewerPipPosition);
    };
  }, [fullscreenActive, interviewerPipVisible, runtimePrimaryScreen, setupCompleted]);

  useEffect(() => {
    if (!data) return;
    setAnsweredQuestionIds((current) => {
      const next = new Set(current);
      data.questions.questions.forEach((question) => {
        if (question.answered) next.add(question.questionId);
      });
      answeredQuestionIdsRef.current = next;
      return next.size === current.size ? current : next;
    });
  }, [data]);

  useEffect(() => {
    if (!data || !consumeCameralessInterviewTestEntry(mode, data.runtime.sessionId)) return;
    completeCameralessRuntimeSetup(
      "카메라 없이 테스트 모드로 면접 화면에 진입했습니다. 녹화와 답변 제출은 장치 연결 후 가능합니다.",
    );
    // Camera-less test entry intentionally consumes a one-shot session flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.runtime.sessionId, mode]);

  useEffect(() => {
    if (!data || data.runtime.status !== "IN_PROGRESS" || !startRuntimeAfterRefreshRef.current) return;
    startRuntimeAfterRefreshRef.current = false;
    setSetupCompleted(true);
    setIntroCompleted(false);
    setQuestionSpeechCompleted(false);
    setMessage("면접을 시작했습니다. AI 안내 후 답변 녹화가 자동으로 진행됩니다.");
    autoRecordingQuestionRef.current = null;
  }, [data]);

  useEffect(() => {
    if (!setupCompleted || !streamRef.current || !videoRef.current) return;
    attachRuntimeVideoRef(videoRef.current);
  }, [attachRuntimeVideoRef, setupCompleted]);

  useEffect(() => {
    if (!data || mode !== "recruiting" || data.runtime.status !== "IN_PROGRESS" || setupCompleted) return;
    setSetupCompleted(true);
    setIntroCompleted(false);
    setQuestionSpeechCompleted(false);
    setMessage("채용 AI 면접 화면으로 이동했습니다. 카메라와 마이크를 연결하는 중입니다.");
    autoRecordingQuestionRef.current = null;
  }, [data, mode, setupCompleted]);

  useEffect(() => {
    const supported = isQuestionSpeechSupported();
    setQuestionSpeechSupported(supported);
    setQuestionSpeechStatus(supported ? "AI 안내 대기" : "이 브라우저에서는 질문 음성 안내를 지원하지 않습니다.");
  }, [mode]);

  useEffect(() => {
    if (
      !data ||
      !setupCompleted ||
      data.runtime.status !== "IN_PROGRESS" ||
      !cameraReady ||
      !microphoneReady ||
      !currentQuestion ||
      currentQuestionLocked
    ) {
      return;
    }
    if (introCompleted) return;
    const timer = window.setTimeout(() => speakInterviewIntro(), 250);
    return () => window.clearTimeout(timer);
  }, [
    cameraReady,
    currentQuestion,
    currentQuestionLocked,
    data,
    introCompleted,
    microphoneReady,
    setupCompleted,
    speakInterviewIntro,
  ]);

  useEffect(() => {
    if (!setupCompleted || !currentQuestion || currentQuestionLocked) {
      stopQuestionSpeech();
      return;
    }
    if (!introCompleted) return;
    if (autoSpokenQuestionRef.current === currentQuestion.questionId) return;
    stopQuestionSpeech();
    autoSpokenQuestionRef.current = currentQuestion.questionId;
    const timer = window.setTimeout(() => speakCurrentQuestion("auto"), 250);
    return () => window.clearTimeout(timer);
  }, [currentQuestion, currentQuestionLocked, introCompleted, setupCompleted, speakCurrentQuestion, stopQuestionSpeech]);

  useEffect(() => {
    if (
      !setupCompleted ||
      !introCompleted ||
      !questionSpeechCompleted ||
      questionSpeechPlaying ||
      !currentQuestion ||
      currentQuestionLocked ||
      busy
    ) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [
    busy,
    currentQuestion,
    currentQuestionLocked,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    setupCompleted,
  ]);

  useEffect(() => {
    if (
      remainingSeconds > 0 ||
      timerPhase !== "PREPARING" ||
      !setupCompleted ||
      !introCompleted ||
      !questionSpeechCompleted ||
      questionSpeechPlaying ||
      !currentQuestion ||
      currentQuestionAnswered ||
      busy
    ) {
      return;
    }

    if (answerStartCueQuestionRef.current !== currentQuestion.questionId) {
      answerStartCueQuestionRef.current = currentQuestion.questionId;
      playAnswerStartCue();
      setQuestionSpeechStatus("준비 시간이 끝났습니다. 답변을 시작해주세요.");
    }
    setTimerPhase("ANSWERING");
    setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(data?.runtime));
  }, [
    busy,
    currentQuestion,
    currentQuestionAnswered,
    data?.runtime,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    remainingSeconds,
    setupCompleted,
    timerPhase,
  ]);

  useEffect(() => {
    if (
      remainingSeconds > 0 ||
      timerPhase !== "ANSWERING" ||
      !setupCompleted ||
      !introCompleted ||
      !questionSpeechCompleted ||
      questionSpeechPlaying ||
      !currentQuestion ||
      currentQuestionLocked ||
      busy
    ) {
      return;
    }
    if (timeExpiredQuestionRef.current === currentQuestion.questionId) return;
    timeExpiredQuestionRef.current = currentQuestion.questionId;
    void handleQuestionTimeExpired();
    // The timeout action intentionally reads the latest runtime state when the counter reaches zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    busy,
    currentQuestion,
    currentQuestionLocked,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    remainingSeconds,
    setupCompleted,
    timerPhase,
  ]);

  useEffect(() => {
    if (
      !data ||
      !setupCompleted ||
      !introCompleted ||
      !questionSpeechCompleted ||
      questionSpeechPlaying ||
      cameralessTestEntry ||
      !cameraReady ||
      !microphoneReady ||
      !currentQuestion ||
      currentQuestionLocked ||
      timerPhase !== "ANSWERING"
    ) {
      return;
    }
    if (recording || answer.videoFile || answer.audioFile) return;
    if (autoRecordingQuestionRef.current === currentQuestion.questionId) return;
    autoRecordingQuestionRef.current = currentQuestion.questionId;
    void handleStartRecording();
    // Auto-recording is guarded by refs and should not restart on every function identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data?.runtime.sessionId,
    setupCompleted,
    cameralessTestEntry,
    cameraReady,
    microphoneReady,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    currentQuestion?.questionId,
    currentQuestionLocked,
    timerPhase,
    recording,
    answer.videoFile,
    answer.audioFile,
  ]);

  async function refreshCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    const audioDevices = devices.filter((device) => device.kind === "audioinput");
    setCameraDevices(videoDevices);
    setMicrophoneDevices(audioDevices);
    if (!selectedCameraId && videoDevices.length === 1) {
      setSelectedCameraId(videoDevices[0]?.deviceId ?? "");
    }
    if (!selectedMicrophoneId && audioDevices.length === 1) {
      setSelectedMicrophoneId(audioDevices[0]?.deviceId ?? "");
    }
  }

  function stopMicrophoneMeter() {
    if (microphoneFrameRef.current !== null) {
      window.cancelAnimationFrame(microphoneFrameRef.current);
      microphoneFrameRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicrophoneLevel(0);
  }

  function stopRuntimeCameraQualityMonitor() {
    if (cameraQualityIntervalRef.current !== null) {
      window.clearInterval(cameraQualityIntervalRef.current);
      cameraQualityIntervalRef.current = null;
    }
  }

  function startRuntimeCameraQualityMonitor(previewInfo: CameraPreviewInfo, fallbackLabel?: string) {
    stopRuntimeCameraQualityMonitor();
    const video = videoRef.current;
    if (!video) return;

    cameraQualityIntervalRef.current = startCameraQualityMonitor(video, previewInfo, fallbackLabel, (quality, framing, status) => {
      setCameraReady(quality.ok && !framing.blocking);
      setCameraFramingState(framing.state);
      setCameraPreviewStatus(status);
    });
  }

  function startMicrophoneMeter(stream: MediaStream) {
    stopMicrophoneMeter();
    const [audioTrack] = stream.getAudioTracks();
    if (!audioTrack) return;

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = audioContext;
    const samples = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      samples.forEach((sample) => {
        peak = Math.max(peak, Math.abs(sample - 128));
      });
      setMicrophoneLevel(Math.min(100, Math.round((peak / 128) * 100)));
      microphoneFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }

  function completeCameralessRuntimeSetup(nextMessage: string) {
    warmUpInterviewAudioOutput();
    stopQuestionSpeech();
    stopRuntimeCameraQualityMonitor();
    stopMicrophoneMeter();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setCameraReady(true);
    setCameraFramingState("unsupported");
    setMicrophoneReady(true);
    setMicrophoneLevel(0);
    setNetworkReady(true);
    setCameraPreviewStatus("개발 테스트 모드: 카메라 점검 우회");
    setMicrophoneStatus("개발 테스트 모드: 마이크 점검 우회");
    setNetworkStatus("개발 테스트 모드: 네트워크 점검 우회");
    setCameralessTestEntry(true);
    setSetupCompleted(true);
    setIntroCompleted(false);
    setQuestionSpeechCompleted(false);
    setQuestionSpeechPlaying(false);
    setQuestionSpeechStatus("AI 안내 대기");
    setMessage(nextMessage);
    autoRecordingQuestionRef.current = null;
  }

  function moveCameraPip(clientX: number, clientY: number, dragState: CameraPipDragState) {
    const stage = interviewerStageRef.current;
    const pip = cameraPipRef.current;
    if (!stage || !pip) return;

    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const padding = fullscreenActive ? 32 : 20;
    setCameraPipPosition(clampCameraPipPosition(
      {
        x: clientX - stageRect.left - dragState.offsetX,
        y: clientY - stageRect.top - dragState.offsetY,
      },
      {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      },
    ));
  }

  function handleCameraPipPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (runtimePrimaryScreen !== "interviewer") return;
    if (event.button !== 0) return;

    const stage = interviewerStageRef.current;
    const pip = cameraPipRef.current;
    if (!stage || !pip) return;

    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const padding = fullscreenActive ? 32 : 20;
    const dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - pipRect.left,
      offsetY: event.clientY - pipRect.top,
    };

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cameraPipDragRef.current = dragState;
    setCameraPipPosition(clampCameraPipPosition(
      {
        x: pipRect.left - stageRect.left,
        y: pipRect.top - stageRect.top,
      },
      {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      },
    ));
  }

  function handleCameraPipPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = cameraPipDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    moveCameraPip(event.clientX, event.clientY, dragState);
  }

  function handleCameraPipPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = cameraPipDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already release capture after pointer cancellation.
    }
    cameraPipDragRef.current = null;
  }

  function moveInterviewerPip(clientX: number, clientY: number, dragState: CameraPipDragState) {
    const stage = interviewerStageRef.current;
    const pip = interviewerPipRef.current;
    if (!stage || !pip) return;

    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const padding = fullscreenActive ? 32 : 20;
    setInterviewerPipPosition(clampCameraPipPosition(
      {
        x: clientX - stageRect.left - dragState.offsetX,
        y: clientY - stageRect.top - dragState.offsetY,
      },
      {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      },
    ));
  }

  function handleInterviewerPipPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (runtimePrimaryScreen !== "candidate") return;
    if (event.button !== 0) return;

    const stage = interviewerStageRef.current;
    const pip = interviewerPipRef.current;
    if (!stage || !pip) return;

    const stageRect = stage.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const padding = fullscreenActive ? 32 : 20;
    const dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - pipRect.left,
      offsetY: event.clientY - pipRect.top,
    };

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    interviewerPipDragRef.current = dragState;
    setInterviewerPipPosition(clampCameraPipPosition(
      {
        x: pipRect.left - stageRect.left,
        y: pipRect.top - stageRect.top,
      },
      {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        pipWidth: pipRect.width,
        pipHeight: pipRect.height,
        padding,
        reservedTopHeight: RUNTIME_PIP_RESERVED_TOP_HEIGHT,
      },
    ));
  }

  function handleInterviewerPipPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = interviewerPipDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    moveInterviewerPip(event.clientX, event.clientY, dragState);
  }

  function handleInterviewerPipPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = interviewerPipDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already release capture after pointer cancellation.
    }
    interviewerPipDragRef.current = null;
  }

  async function handleCameralessRuntimeEntry() {
    if (!data || !ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY) return;

    const testDeviceState = createCameralessInterviewTestDeviceCheckState();
    if (mode === "recruiting" && data.runtime.status !== "IN_PROGRESS") {
      if (!data.runtime.applicationId) {
        setMessage("지원서 정보를 확인할 수 없습니다.");
        return;
      }

      setBusy(true);
      setMessage("");
      try {
        await runtimeApi.saveDeviceCheck(data.runtime.sessionId, toDeviceCheckRequest(testDeviceState));
        await runtimeApi.startInterview(data.runtime.applicationId);
        rememberCameralessInterviewTestEntry("recruiting", data.runtime.sessionId);
        startRuntimeAfterRefreshRef.current = true;
        setMessage("카메라 없이 테스트 모드로 면접 화면으로 이동합니다.");
        refresh();
      } catch (submitError) {
        startRuntimeAfterRefreshRef.current = false;
        setMessage(toErrorMessage(submitError));
      } finally {
        setBusy(false);
      }
      return;
    }

    completeCameralessRuntimeSetup(
      "카메라 없이 테스트 모드로 면접 화면에 진입했습니다. 녹화와 답변 제출은 장치 연결 후 가능합니다.",
    );
  }

  async function handleEnableCamera() {
    warmUpInterviewAudioOutput();
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("이 브라우저에서는 카메라/마이크를 사용할 수 없습니다.");
      return;
    }

    try {
      stopMicrophoneMeter();
      stopRuntimeCameraQualityMonitor();
      stopMediaStream(streamRef.current);
      setCameraReady(false);
      setCameraFramingState("idle");
      setMicrophoneReady(false);
      setCameraPreviewStatus("카메라 연결 중");
      setMicrophoneStatus(`테스트 문장을 읽어주세요. 예: ${deviceTestSentence}`);
      setNetworkStatus("네트워크 확인 중");
      const streamResult = await getCameraMediaStream(selectedCameraId, selectedMicrophoneId);
      const { stream, fallbackLabel } = streamResult;
      streamRef.current = stream;
      setCameralessTestEntry(false);

      let previewInfo: CameraPreviewInfo | undefined;
      if (videoRef.current) {
        previewInfo = await attachMediaStreamToVideo(videoRef.current, stream);
      }
      assertCameraPreviewHasFrame(previewInfo);

      const cameraQuality = assessCameraQuality(videoRef.current);
      const cameraFraming = getCameraFramingNotice();
      const microphoneQuality = streamResult.audioEnabled
        ? await measureMicrophoneQuality(stream, setMicrophoneLevel)
        : { ok: false, peakLevel: 0, message: formatMicrophoneStatus(streamResult) };
      const networkQuality = await checkInterviewNetworkQuality();
      const cameraOk = cameraQuality.ok && !cameraFraming.blocking;
      const microphoneOk = streamResult.audioEnabled && microphoneQuality.ok;
      setCameraReady(cameraOk);
      setCameraFramingState(cameraFraming.state);
      setMicrophoneReady(microphoneOk);
      setNetworkReady(networkQuality.ok);
      setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo, fallbackLabel, cameraQuality, cameraFraming));
      setMicrophoneStatus(
        streamResult.audioEnabled ? formatMicrophoneQualityStatus(streamResult, microphoneQuality) : microphoneQuality.message,
      );
      setNetworkStatus(networkQuality.message);
      startRuntimeCameraQualityMonitor(previewInfo, fallbackLabel);
      if (streamResult.audioEnabled) {
        startMicrophoneMeter(stream);
      } else {
        setMicrophoneLevel(0);
      }
      await refreshCameraDevices();
      setMessage(
        fallbackLabel
          ? `카메라가 연결되었습니다. ${fallbackLabel}`
          : cameraOk && microphoneOk && networkQuality.ok
            ? "카메라 밝기, 마이크 입력, 네트워크 상태가 적정합니다."
            : "장치 점검 기준을 통과하지 못했습니다. 안내에 따라 카메라 위치, 조명, 마이크 입력을 조정해주세요.",
      );
    } catch (cameraError) {
      setCameraReady(false);
      setCameraFramingState("idle");
      setNetworkReady(false);
      stopRuntimeCameraQualityMonitor();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      stopMicrophoneMeter();
      const errorMessage = formatMediaError(cameraError);
      const microphoneProbe = await probeMicrophone(selectedMicrophoneId);
      setCameraPreviewStatus(`카메라 연결 실패: ${errorMessage}`);
      setMicrophoneReady(microphoneProbe.ok);
      setMicrophoneStatus(formatMicrophoneProbeStatus(microphoneProbe));
      const networkQuality = await checkInterviewNetworkQuality();
      setNetworkReady(networkQuality.ok);
      setNetworkStatus(networkQuality.message);
      setMessage(
        microphoneProbe.ok
          ? `${errorMessage} 마이크는 연결되지만 녹화를 위해 카메라 권한도 필요합니다.`
          : `${errorMessage} ${formatMicrophoneProbeStatus(microphoneProbe)}`,
      );
    }
  }

  useEffect(() => {
    if (!data || data.runtime.status !== "IN_PROGRESS" || !setupCompleted || streamRef.current || cameraReady || microphoneReady) {
      return;
    }

    void handleEnableCamera();
    // Runtime camera binding should run once after the interview screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.runtime.sessionId, setupCompleted]);

  async function handleEnterInterview() {
    warmUpInterviewAudioOutput();
    if (!data) return;
    if (!streamRef.current || !cameraReady || !microphoneReady || !networkReady) {
      await handleEnableCamera();
    }

    const stream = streamRef.current;
    const hasLiveVideo = stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
    const hasLiveAudio = stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
    if (!hasLiveVideo || !hasLiveAudio || !networkReady) {
      setMessage("카메라, 마이크, 네트워크 점검을 완료한 뒤 면접을 시작해주세요.");
      return;
    }

    if (mode === "recruiting" && data.runtime.status !== "IN_PROGRESS") {
      if (!data.runtime.applicationId) {
        setMessage("지원서 정보를 확인할 수 없습니다.");
        return;
      }

      setBusy(true);
      setMessage("");
      try {
        const api = runtimeApi;
        await api.saveDeviceCheck(
          data.runtime.sessionId,
          toDeviceCheckRequest({
            cameraGranted: true,
            microphoneGranted: true,
            networkStable: networkReady,
          }),
        );
        await api.startInterview(data.runtime.applicationId);
        startRuntimeAfterRefreshRef.current = true;
        setMessage("장치 점검이 완료되었습니다. 면접 화면으로 이동합니다.");
        refresh();
      } catch (submitError) {
        startRuntimeAfterRefreshRef.current = false;
        setMessage(toErrorMessage(submitError));
      } finally {
        setBusy(false);
      }
      return;
    }

    setSetupCompleted(true);
    setIntroCompleted(false);
    setQuestionSpeechCompleted(false);
    setMessage("면접이 시작되었습니다. AI 안내 후 답변 녹화가 자동으로 진행됩니다.");
    autoRecordingQuestionRef.current = null;
  }

  async function handleStartRecording() {
    if (!data || !currentQuestion) return;
    if (!data.runtime.canRecord) {
      setMessage("이 세션은 녹화를 시작할 수 없는 상태입니다.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setMessage("이 브라우저에서는 녹화를 사용할 수 없습니다.");
      return;
    }
    if (cameralessTestEntry && !streamRef.current) {
      setMessage("카메라 없이 테스트 모드에서는 면접 화면 확인만 가능합니다. 녹화와 제출은 장치 연결 후 진행해주세요.");
      return;
    }

    if (!streamRef.current) {
      await handleEnableCamera();
    }

    const stream = streamRef.current;
    if (!stream) return;
    if (!stream.getAudioTracks().some((track) => track.readyState === "live")) {
      setMessage("마이크가 연결되지 않았습니다. 마이크 장치를 선택한 뒤 카메라 점검을 다시 눌러주세요.");
      setMicrophoneReady(false);
      return;
    }

    try {
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const recordedMimeType = resolveRecordedMimeType({
          chunkMimeTypes: recordingChunksRef.current.map((chunk) => chunk instanceof Blob ? chunk.type : ""),
          recorderMimeType: recorder.mimeType,
          requestedMimeType: mimeType,
        });
        const blob = new Blob(recordingChunksRef.current, { type: recordedMimeType });
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const fileName = `${mode}-answer-${data.runtime.sessionId}-${currentQuestion.questionId}.${getInterviewMediaFileExtension(recordedMimeType)}`;

        if (durationSeconds < MIN_INTERVIEW_RECORDING_DURATION_SECONDS) {
          clearInvalidRecordingDraft(
            currentQuestion.questionId,
            `답변 녹음이 너무 짧습니다. 최소 ${MIN_INTERVIEW_RECORDING_DURATION_SECONDS}초 이상 답변한 뒤 다시 제출해주세요.`,
          );
          return;
        }

        if (blob.size < MIN_INTERVIEW_RECORDING_BLOB_SIZE_BYTES) {
          clearInvalidRecordingDraft(
            currentQuestion.questionId,
            "녹음 파일이 너무 작아 저장되지 않았습니다. 마이크 입력을 확인한 뒤 다시 답변해주세요.",
          );
          return;
        }

        const videoFile = createRuntimeFileAssetFromMetadata(fileName, recordedMimeType, blob.size);

        if (!videoFile) {
          setMessage("지원하지 않는 녹화 파일 형식입니다.");
          setRecording(false);
          return;
        }

        cacheRecordedInterviewBlob(videoFile, blob);

        setAnswer((current) => ({
          ...current,
          questionId: currentQuestion.questionId,
          durationSeconds,
          videoFile,
          videoFileId: undefined,
          audioFile: undefined,
          audioFileId: undefined,
        }));
        setRecordedFileName(fileName);
        setRecording(false);
        if (submitAfterRecordingStopRef.current) {
          submitAfterRecordingStopRef.current = false;
          void submitAnswerRequest(
            withReanswerFlag(toSaveInterviewAnswerRequest({
              questionId: currentQuestion.questionId,
              durationSeconds,
              videoFile,
            })),
            currentQuestion,
          );
          return;
        }
        setMessage("녹화가 준비되었습니다. 답변 제출을 눌러 저장하세요.");
      };

      recorder.start();
      setRecordedFileName("");
      setRecording(true);
      setMessage("녹화 중입니다. 답변을 마치면 녹화 종료를 눌러주세요.");
    } catch (recordError) {
      setRecording(false);
      setMessage(toErrorMessage(recordError));
    }
  }

  function handleStopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }
    setRecording(false);
  }

  function clearInvalidRecordingDraft(questionId: number, message: string) {
    const retryCount = invalidRecordingRetryCountsRef.current.get(questionId) ?? 0;
    const nextRetryCount = retryCount + 1;
    invalidRecordingRetryCountsRef.current.set(questionId, nextRetryCount);

    submitAfterRecordingStopRef.current = false;
    autoAdvanceAfterAnswerSubmitRef.current = false;
    setRecordedFileName("");
    setAnswer((current) => ({
      ...current,
      questionId,
      durationSeconds: 0,
      videoFile: undefined,
      videoFileId: undefined,
      audioFile: undefined,
      audioFileId: undefined,
    }));
    setRecording(false);

    if (nextRetryCount <= 1) {
      autoRecordingQuestionRef.current = null;
      timeExpiredQuestionRef.current = null;
      setTimerPhase("ANSWERING");
      setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(data?.runtime));
      setMessage(`${message} 한 번 더 녹음 기회를 드릴게요. 잠시 후 다시 녹음이 시작됩니다.`);
      return;
    }

    void submitSkippedAnswerAndMoveNext(questionId, message);
  }

  async function submitSkippedAnswerAndMoveNext(questionId: number, reasonMessage: string) {
    if (!data) return;

    setBusy(true);
    setMessage("녹음 품질 문제로 현재 질문을 미답변 처리하고 다음 질문으로 이동합니다.");
    try {
      const api = runtimeApi;
      const skipRequest: SaveInterviewAnswerRequest = {
        questionId,
        durationSeconds: 0,
        skipReason: "RECORDING_VALIDATION_FAILED",
        ...(retryAnswerId ? { retryAnswerId } : {}),
      };
      const result = await (mode === "mock"
        ? api.saveMockAnswer(data.runtime.sessionId, skipRequest)
        : api.saveRecruitingAnswer(data.runtime.sessionId, skipRequest));
      const skippedQuestion =
        data.questions.questions.find((candidateQuestion) => candidateQuestion.questionId === questionId) ?? currentQuestion;

      setAnsweredQuestionIds((current) => {
        const next = new Set(current);
        next.add(questionId);
        return next;
      });
      setLastAnswer({
        answerId: result.data.answer.answerId,
        questionId,
        questionText: skippedQuestion?.content ?? skippedQuestion?.audioPrompt ?? "이전 질문",
        transcript: "녹음 품질 문제로 미답변 처리되었습니다.",
      });
      setAutoAiPipeline({
        answerId: result.data.answer.answerId,
        sttStatus: "IDLE",
        followUpStatus: "IDLE",
        followUpSkipped: true,
      });
      setRetryAnswerId(undefined);
      setRetryingQuestionId(undefined);

      const questionIndex = data.questions.questions.findIndex((candidateQuestion) => candidateQuestion.questionId === questionId);
      const isLastQuestion = questionIndex >= 0
        ? questionIndex >= data.runtime.totalQuestions - 1
        : false;
      if (isLastQuestion) {
        setMessage(`${reasonMessage} 현재 질문은 미답변 처리되었습니다. 면접 완료 버튼을 눌러 제출을 마무리해주세요.`);
        return;
      }

      await (mode === "mock"
        ? api.moveMockNextQuestion(data.runtime.sessionId)
        : api.moveRecruitingNextQuestion(data.runtime.sessionId));
      stopQuestionSpeech();
      setAnswer(defaultInterviewAnswerFormState);
      setRecordedFileName("");
      setQuestionSpeechStatus("다음 질문 음성 대기");
      setQuestionSpeechCompleted(false);
      setQuestionSpeechPlaying(false);
      resetRuntimeQuestionTimer(data.runtime, setTimerPhase, setRemainingSeconds);
      timeExpiredQuestionRef.current = null;
      autoRecordingQuestionRef.current = null;
      refresh();
      setMessage(`${reasonMessage} 현재 질문은 미답변 처리하고 다음 질문으로 이동했습니다.`);
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  function handleReplayPrompt() {
    if (!currentQuestion || currentQuestionReplayUsed || !questionSpeechSupported) return;
    warmUpInterviewAudioOutput();
    setReplayedQuestionIds((current) => {
      const next = new Set(current);
      next.add(currentQuestion.questionId);
      return next;
    });
    speakCurrentQuestion("manual");
  }

  async function submitAnswerRequest(request: SaveInterviewAnswerRequest, question = currentQuestion) {
    if (!data) return;
    if (savingQuestionIdsRef.current.has(request.questionId)) {
      setMessage("답변 저장이 이미 진행 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!request.allowReanswer && !retryAnswerId && isQuestionAlreadyAnswered(request.questionId)) {
      setMessage("이미 저장된 답변입니다. 질문 상태를 새로고침합니다.");
      refresh();
      return;
    }
    savingQuestionIdsRef.current.add(request.questionId);
    setBusy(true);
    setMessage("");
    try {
      const api = runtimeApi;
      const requestWithRetry =
        retryAnswerId && question?.questionId === request.questionId
          ? { ...request, retryAnswerId }
          : request;
      const preparedRequest = await prepareAnswerRequestWithUploadedMedia(api, data.runtime.sessionId, requestWithRetry);
      const result =
        mode === "mock"
          ? await api.saveMockAnswer(data.runtime.sessionId, preparedRequest)
          : await api.saveRecruitingAnswer(data.runtime.sessionId, preparedRequest);
      const audioFileId = result.data.audioFile?.fileId ?? result.data.answer.audioFileId;
      const videoFileId = result.data.videoFile?.fileId ?? result.data.answer.videoFileId;
      const answerFileAssetId = audioFileId ?? videoFileId;
      const savedAnswer: LastSavedAnswer = {
        answerId: result.data.answer.answerId,
        questionId: result.data.answer.questionId,
        questionText: question?.content ?? question?.audioPrompt ?? "이전 질문",
        transcript: `${formatQuestionTypeLabel(question?.questionType)} 답변 파일이 저장되었습니다.`,
        fileAssetId: answerFileAssetId,
        audioFileId,
        audioS3Key: result.data.audioFile?.storageKey,
        videoFileId,
        videoS3Key: result.data.videoFile?.storageKey,
      };
      setLastAnswer(savedAnswer);
      setAutoAiPipeline({
        answerId: savedAnswer.answerId,
        sttStatus: "PENDING",
        followUpStatus: "IDLE",
      });
      if (preparedRequest.allowReanswer) {
        setReansweringQuestionId(null);
        setReansweredQuestionIds((current) => {
          const next = new Set(current);
          next.add(preparedRequest.questionId);
          return next;
        });
      }
      markQuestionAnswered(preparedRequest.questionId);
      setRetryAnswerId(undefined);
      setRetryingQuestionId(undefined);
      const shouldAutoAdvance = autoAdvanceAfterAnswerSubmitRef.current;
      autoAdvanceAfterAnswerSubmitRef.current = false;
      const questionIndex = question
        ? data.questions.questions.findIndex((candidateQuestion) => candidateQuestion.questionId === question.questionId)
        : -1;
      const isLastSavedQuestion = questionIndex >= 0
        ? questionIndex >= data.runtime.totalQuestions - 1
        : result.data.nextQuestionAvailable === false;
      const shouldPrepareFollowUp = question?.questionType !== "FOLLOW_UP";
      setMessage(
        isLastSavedQuestion && !shouldPrepareFollowUp
          ? "답변이 저장되었습니다. 면접 완료 버튼을 눌러 제출을 마무리해주세요."
          : "답변이 저장되었습니다. 다음 질문을 준비하고 있습니다.",
      );
      await runAutomaticAiPipeline(savedAnswer, question);
      if (shouldAutoAdvance) {
        await advanceAfterTimedAnswer(question);
      }
    } catch (submitError) {
      autoAdvanceAfterAnswerSubmitRef.current = false;
      if (isQuestionStateConflict(submitError)) {
        setMessage("답변은 이미 반영된 상태입니다. 질문 상태를 새로고침합니다.");
        refresh();
        return;
      }
      setMessage(toErrorMessage(submitError));
    } finally {
      savingQuestionIdsRef.current.delete(request.questionId);
      setBusy(false);
    }
  }

  async function handleSaveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitAnswer) {
      setMessage("녹화 종료 후 답변 제출을 눌러주세요.");
      return;
    }
    await submitAnswerRequest(withReanswerFlag(toSaveInterviewAnswerRequest(answer)));
  }

  function handleAnswerComplete() {
    if (currentQuestionLocked) {
      setMessage("이미 저장된 답변입니다. 다음 질문으로 이동해주세요.");
      return;
    }

    if (recording) {
      submitAfterRecordingStopRef.current = true;
      handleStopRecording();
      return;
    }

    if (canSubmitAnswer) {
      void submitAnswerRequest(withReanswerFlag(toSaveInterviewAnswerRequest(answer)));
      return;
    }

    setMessage("답변 녹화가 아직 준비되지 않았습니다.");
  }

  function withReanswerFlag(request: SaveInterviewAnswerRequest): SaveInterviewAnswerRequest {
    return isReansweringCurrentQuestion ? { ...request, allowReanswer: true } : request;
  }

  function handleStartReanswer() {
    if (!currentQuestion) return;
    stopQuestionSpeech();
    setReansweringQuestionId(currentQuestion.questionId);
    setAnswer({ ...defaultInterviewAnswerFormState, questionId: currentQuestion.questionId });
    setRecordedFileName("");
    setQuestionSpeechCompleted(true);
    setQuestionSpeechPlaying(false);
    setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(data?.runtime));
    timeExpiredQuestionRef.current = null;
    autoRecordingQuestionRef.current = null;
    submitAfterRecordingStopRef.current = false;
    autoAdvanceAfterAnswerSubmitRef.current = false;
    setMessage("STT 결과가 비어 있어 같은 질문에 한 번 더 답변할 수 있습니다.");
  }

  function handleRetryAnswer() {
    if (!currentQuestion || !lastAnswer || lastAnswer.questionId !== currentQuestion.questionId) return;

    stopQuestionSpeech();
    setRetryAnswerId(lastAnswer.answerId);
    setRetryingQuestionId(currentQuestion.questionId);
    setAnsweredQuestionIds((current) => {
      const next = new Set(current);
      next.delete(currentQuestion.questionId);
      return next;
    });
    setLastAnswer(undefined);
    setAutoAiPipeline(undefined);
    setAnswer({
      ...defaultInterviewAnswerFormState,
      questionId: currentQuestion.questionId,
    });
    setRecordedFileName("");
    invalidRecordingRetryCountsRef.current.delete(currentQuestion.questionId);
    submitAfterRecordingStopRef.current = false;
    autoAdvanceAfterAnswerSubmitRef.current = false;
    autoRecordingQuestionRef.current = null;
    timeExpiredQuestionRef.current = null;
    setQuestionSpeechCompleted(true);
    setQuestionSpeechPlaying(false);
    setTimerPhase("ANSWERING");
    setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(data?.runtime));
    setMessage("현재 질문을 다시 답변합니다. 잠시 후 녹음이 다시 시작됩니다.");
  }

  async function runAutomaticAiPipeline(savedAnswer: LastSavedAnswer, question = currentQuestion) {
    if (!data) return;

    try {
      const sttHandoff = await requestAiPipeline("STT", savedAnswer);
      const sttProcessLogId = sttHandoff.processLogId;
      if (!sttProcessLogId) {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "FAILED",
          followUpStatus: "IDLE",
          failureCategory: undefined,
          failureReason: undefined,
          failureRetryable: undefined,
          error: "STT 작업 ID를 받지 못했습니다.",
        }));
        return;
      }

      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: "RUNNING",
        followUpStatus: "IDLE",
        sttProcessLogId,
        failureCategory: undefined,
        failureReason: undefined,
        failureRetryable: undefined,
        error: undefined,
      }));

      const sttStatus = await pollAiJobUntilSettled(sttProcessLogId);
      if (sttStatus.status !== "COMPLETED") {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: sttStatus.status === "FAILED" ? "FAILED" : "RUNNING",
          followUpStatus: "IDLE",
          failureCategory: sttStatus.failure?.category,
          failureReason: sttStatus.failure?.reason,
          failureRetryable: sttStatus.failure?.retryable,
          error: sttStatus.status === "FAILED"
            ? sttStatus.failure?.reason ?? "STT 처리에 실패했습니다."
            : "STT 처리가 아직 진행 중입니다. 잠시 후 상태를 다시 확인해주세요.",
        }));
        return;
      }

      const transcript =
        extractAiJobText(sttStatus.output, ["transcript"]) ??
        extractAiJobText(sttStatus.outputRef, ["transcript"]);
      if (!transcript?.trim()) {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "COMPLETED",
          followUpStatus: "FAILED",
          sttProcessLogId,
          error: "STT 결과에서 transcript를 찾지 못했습니다.",
        }));
        return;
      }

      const normalizedTranscript = transcript.trim();
      const transcriptRetryReason = getInterviewTranscriptRetryReason(normalizedTranscript);
      if (transcriptRetryReason) {
        const answerWithTranscript = { ...savedAnswer, transcript: normalizedTranscript };
        setLastAnswer(answerWithTranscript);
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: "COMPLETED",
          followUpStatus: "FAILED",
          sttProcessLogId,
          transcript: normalizedTranscript,
          error: transcriptRetryReason,
        }));
        setMessage(`${transcriptRetryReason} 다시 답변하기를 눌러 현재 질문을 다시 녹음해주세요.`);
        return;
      }

      const answerWithTranscript = { ...savedAnswer, transcript: normalizedTranscript };
      const isFollowUpAnswer = question?.questionType === "FOLLOW_UP";
      setLastAnswer(answerWithTranscript);

      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: "COMPLETED",
        followUpStatus: isFollowUpAnswer ? "IDLE" : "PENDING",
        sttProcessLogId,
        transcript: normalizedTranscript,
        failureCategory: undefined,
        failureReason: undefined,
        failureRetryable: undefined,
        error: undefined,
      }));

      if (isFollowUpAnswer) {
        const questionIndex = question
          ? data.questions.questions.findIndex((candidateQuestion) => candidateQuestion.questionId === question.questionId)
          : -1;
        const isLastFollowUpQuestion = questionIndex >= 0
          ? questionIndex >= data.runtime.totalQuestions - 1
          : false;
        setMessage(
          isLastFollowUpQuestion
            ? "마지막 답변 처리가 완료되었습니다. 면접 완료 버튼을 눌러 제출을 마무리해주세요."
            : "답변 처리가 완료되었습니다. 다음 질문으로 이동해주세요.",
        );
        return;
      }

      const followUpHandoff = await requestAiPipeline("FOLLOW_UP", answerWithTranscript);
      const followUpProcessLogId = followUpHandoff.processLogId;
      if (!followUpProcessLogId) {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: current?.sttStatus ?? "COMPLETED",
          followUpStatus: "FAILED",
          error: "꼬리질문 작업 ID를 받지 못했습니다.",
        }));
        return;
      }

      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: current?.sttStatus ?? "COMPLETED",
        followUpStatus: "RUNNING",
        followUpProcessLogId,
        error: undefined,
      }));

      const followUpStatus = await pollAiJobUntilSettled(followUpProcessLogId);
      if (followUpStatus.status !== "COMPLETED") {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: current?.sttStatus ?? "COMPLETED",
          followUpStatus: followUpStatus.status === "FAILED" ? "FAILED" : "RUNNING",
          error: followUpStatus.status === "FAILED"
            ? followUpStatus.failure?.reason ?? "꼬리질문 생성에 실패했습니다."
            : "꼬리질문 생성이 아직 진행 중입니다. 잠시 후 상태를 다시 확인해주세요.",
        }));
        return;
      }

      const followUpQuestion =
        extractAiJobText(followUpStatus.output, ["content", "followUpQuestion", "question"]) ??
        extractAiJobText(followUpStatus.outputRef, ["content", "followUpQuestion", "question"]);

      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: current?.sttStatus ?? "COMPLETED",
        followUpStatus: "COMPLETED",
        followUpProcessLogId,
        followUpQuestion,
        error: followUpQuestion ? undefined : "꼬리질문 결과에서 content를 찾지 못했습니다.",
      }));

      setMessage(
        followUpQuestion
          ? "다음 질문이 준비되었습니다."
          : "답변 처리가 완료되었습니다.",
      );
    } catch (pipelineError) {
      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: current?.sttStatus ?? "FAILED",
        followUpStatus: current?.followUpStatus ?? "IDLE",
        error: toErrorMessage(pipelineError),
      }));
      setMessage(toErrorMessage(pipelineError));
    }
  }

  async function requestAiPipeline(
    processType: "STT" | "FOLLOW_UP",
    targetAnswer: LastSavedAnswer,
  ): Promise<AiInterviewHandoffResponse> {
    if (!data) {
      throw new Error("면접 런타임 정보를 찾지 못했습니다.");
    }

    const api = runtimeApi;
    const request = buildAiInterviewRequest(processType, targetAnswer, data.runtime.jobDescription, mode);
    const result =
      processType === "STT"
        ? mode === "mock"
          ? await api.requestMockStt(data.runtime.sessionId, request)
          : await api.requestRecruitingStt(data.runtime.sessionId, request)
        : mode === "mock"
          ? await api.requestMockFollowUpQuestion(data.runtime.sessionId, request)
          : await api.requestRecruitingFollowUpQuestion(data.runtime.sessionId, request);

    return result.data;
  }

  async function requestFollowUpQuestionInsert() {
    if (!data || !autoAiPipeline?.followUpProcessLogId) {
      throw new Error("질문으로 추가할 꼬리질문 작업이 없습니다.");
    }

    const api = getCandidateApi();
    return mode === "mock"
      ? api.insertMockFollowUpQuestion(data.runtime.sessionId, {
          processLogId: autoAiPipeline.followUpProcessLogId,
        })
      : api.insertRecruitingFollowUpQuestion(data.runtime.sessionId, {
          processLogId: autoAiPipeline.followUpProcessLogId,
        });
  }

  async function handleAnswerFollowUpQuestion() {
    if (!data) return;

    setBusy(true);
    setMessage("");
    setAutoAiPipeline((current) =>
      current
        ? {
            ...current,
            insertStatus: "RUNNING",
            error: undefined,
          }
        : current,
    );
    try {
      const result = await requestFollowUpQuestionInsert();

      setAutoAiPipeline((current) =>
        current
          ? {
              ...current,
              insertStatus: "COMPLETED",
              insertedQuestionId: result.data.question.questionId,
              error: undefined,
            }
          : current,
      );
      stopQuestionSpeech();
      setAnswer(defaultInterviewAnswerFormState);
      setRecordedFileName("");
      setQuestionSpeechStatus("꼬리질문 음성 대기");
      setQuestionSpeechCompleted(false);
      setQuestionSpeechPlaying(false);
      resetRuntimeQuestionTimer(data.runtime, setTimerPhase, setRemainingSeconds);
      timeExpiredQuestionRef.current = null;
      autoRecordingQuestionRef.current = null;
      setMessage(
        result.data.inserted
          ? "생성된 꼬리질문으로 이동했습니다. 답변을 시작해주세요."
          : "이미 추가된 꼬리질문으로 이동했습니다. 답변을 시작해주세요.",
      );
      refresh();
    } catch (submitError) {
      setAutoAiPipeline((current) =>
        current
          ? {
              ...current,
              insertStatus: "FAILED",
              error: toErrorMessage(submitError),
            }
          : current,
      );
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuestionTimeExpired() {
    if (!data || !currentQuestion || currentQuestionLocked) return;
    setMessage("답변 시간이 종료되어 현재 답변을 자동 제출합니다.");
    autoAdvanceAfterAnswerSubmitRef.current = true;

    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      submitAfterRecordingStopRef.current = true;
      handleStopRecording();
      return;
    }

    if (canSubmitAnswer) {
      await submitAnswerRequest(withReanswerFlag(toSaveInterviewAnswerRequest(answer)));
      return;
    }

    autoAdvanceAfterAnswerSubmitRef.current = false;
    setMessage("답변 시간이 종료됐지만 제출할 녹화 파일이 아직 준비되지 않았습니다. 답변 완료를 눌러 제출해주세요.");
  }

  async function advanceAfterTimedAnswer(question = currentQuestion) {
    if (!data) return;
    const questionIndex = question
      ? data.questions.questions.findIndex((candidateQuestion) => candidateQuestion.questionId === question.questionId)
      : -1;
    const isLastQuestion = questionIndex >= 0
      ? questionIndex >= data.runtime.totalQuestions - 1
      : answeredQuestionCount + 1 >= data.runtime.totalQuestions;

    if (isLastQuestion) {
      setMessage("마지막 답변이 저장되었습니다. 면접 완료 버튼을 눌러 제출을 마무리해주세요.");
      return;
    }

    await handleNextQuestion();
  }

  async function handleNextQuestion() {
    if (!data) return;
    if (generatedFollowUpReady) {
      await handleAnswerFollowUpQuestion();
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const api = runtimeApi;
      await (mode === "mock"
        ? api.moveMockNextQuestion(data.runtime.sessionId)
        : api.moveRecruitingNextQuestion(data.runtime.sessionId));
      stopQuestionSpeech();
      setAnswer(defaultInterviewAnswerFormState);
      setRecordedFileName("");
      setQuestionSpeechStatus("다음 질문 음성 대기");
      setQuestionSpeechCompleted(false);
      setQuestionSpeechPlaying(false);
      resetRuntimeQuestionTimer(data.runtime, setTimerPhase, setRemainingSeconds);
      timeExpiredQuestionRef.current = null;
      autoRecordingQuestionRef.current = null;
      refresh();
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!data) return;
    setBusy(true);
    setMessage("");
    try {
      const api = runtimeApi;
      const result = await (mode === "mock"
        ? api.completeMockInterview(data.runtime.sessionId)
        : api.completeRecruitingInterview(data.runtime.sessionId));
      stopQuestionSpeech();
      setMessage(`면접이 완료되었습니다. ${result.data.answeredCount}/${result.data.totalQuestions} 답변 제출`);
      if (mode === "recruiting" && data.runtime.applicationId) {
        if (onRecruitingComplete) {
          onRecruitingComplete(data.runtime.applicationId, result.data.sessionId);
          return;
        }
        router.push(candidateApplicationInterviewRoutes.applicationReport(data.runtime.applicationId));
        return;
      }
      await requestMockReportGenerationAfterComplete(result.data.sessionId);
      router.push(candidateApplicationInterviewRoutes.mockReportDetail(result.data.sessionId));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  const runtimeTitle = mode === "recruiting" ? "채용 AI 면접 진행" : "AI 모의면접 진행";
  const answeredQuestionCount = data
    ? data.questions.questions.filter((question) => question.answered || answeredQuestionIds.has(question.questionId)).length
    : 0;
  const currentQuestionIndex = data && currentQuestion
    ? data.questions.questions.findIndex((question) => question.questionId === currentQuestion.questionId)
    : -1;
  const questionNumber = data
    ? currentQuestionIndex >= 0
      ? currentQuestionIndex + 1
      : Math.min(answeredQuestionCount + 1, data.runtime.totalQuestions || 1)
    : 0;
  const isCurrentQuestionLast = Boolean(
    data && currentQuestionIndex >= 0 && currentQuestionIndex >= data.runtime.totalQuestions - 1,
  );
  const runtimeFollowUpQuestionCount =
    data?.questions.questions.filter((question) => question.questionType === "FOLLOW_UP").length ?? 0;
  const runtimeBaseQuestionCount =
    data?.questions.questions.filter((question) => question.questionType !== "FOLLOW_UP").length ?? 0;
  const canAddRuntimeFollowUpQuestion = runtimeFollowUpQuestionCount < runtimeBaseQuestionCount;
  const generatedFollowUpReady = Boolean(
    data &&
      canAddRuntimeFollowUpQuestion &&
      currentQuestionAnswered &&
      currentQuestion?.questionType !== "FOLLOW_UP" &&
      autoAiPipeline?.answerId === lastAnswer?.answerId &&
      autoAiPipeline?.followUpStatus === "COMPLETED" &&
      autoAiPipeline?.followUpQuestion,
  );
  const followUpSkippedForCurrentAnswer = Boolean(
    autoAiPipeline?.answerId === lastAnswer?.answerId &&
      autoAiPipeline?.followUpSkipped,
  );
  const answerProcessingBusy = Boolean(
    autoAiPipeline?.sttStatus === "PENDING" ||
      autoAiPipeline?.sttStatus === "RUNNING" ||
      autoAiPipeline?.followUpStatus === "PENDING" ||
      autoAiPipeline?.followUpStatus === "RUNNING",
  );
  const answerProcessingFailed = Boolean(
    autoAiPipeline?.error ||
      autoAiPipeline?.sttStatus === "FAILED" ||
      autoAiPipeline?.followUpStatus === "FAILED",
  );
  const answerProcessingLabel = answerProcessingFailed
    ? "답변 처리 확인 필요"
    : generatedFollowUpReady
      ? "다음 질문 준비 완료"
      : answerProcessingBusy
        ? "다음 질문 준비 중"
        : lastAnswer
          ? "답변 저장 완료"
          : "답변 대기";
  const answerProcessingReady = Boolean(lastAnswer && !answerProcessingBusy && !answerProcessingFailed);
  const currentQuestionNeedsReanswer = Boolean(
    currentQuestion &&
      currentQuestionAnswered &&
      lastAnswer?.questionId === currentQuestion.questionId &&
      autoAiPipeline?.answerId === lastAnswer.answerId &&
      autoAiPipeline?.sttStatus === "FAILED" &&
      autoAiPipeline?.failureCategory === "REANSWER_REQUIRED" &&
      !reansweredQuestionIds.has(currentQuestion.questionId),
  );
  const canStartCurrentQuestionReanswer = Boolean(
    currentQuestionNeedsReanswer && !isReansweringCurrentQuestion && !busy && !recording,
  );
  const canRetryCurrentAnswer = Boolean(
    answerProcessingFailed &&
      currentQuestion &&
      lastAnswer?.questionId === currentQuestion.questionId &&
      lastAnswer.answerId &&
      !currentQuestionNeedsReanswer &&
      !retryingCurrentQuestion &&
      !recording,
  );
  const currentBaseQuestionWaitingForFollowUp = Boolean(
    currentQuestionAnswered &&
      currentQuestion?.questionType !== "FOLLOW_UP" &&
      !isReansweringCurrentQuestion &&
      canAddRuntimeFollowUpQuestion &&
      lastAnswer?.questionId === currentQuestion?.questionId &&
      !answerProcessingFailed &&
      !generatedFollowUpReady &&
      !followUpSkippedForCurrentAnswer,
  );
  const canMoveNextQuestion = Boolean(
    data &&
      currentQuestionAnswered &&
      !answerProcessingBusy &&
      !currentBaseQuestionWaitingForFollowUp &&
      (!isCurrentQuestionLast || generatedFollowUpReady) &&
      !isReansweringCurrentQuestion &&
      !recording,
  );
  const canCompleteInterview = Boolean(
    data &&
      currentQuestionAnswered &&
      isCurrentQuestionLast &&
      !generatedFollowUpReady &&
      answeredQuestionCount >= data.runtime.totalQuestions &&
      !isReansweringCurrentQuestion &&
      !recording,
  );
  const showDeviceSetup = data
    ? shouldShowInterviewDeviceSetup({
        mode,
        setupCompleted,
        runtimeStatus: data.runtime.status,
      })
    : false;
  const formattedRemainingTime = formatInterviewCountdown(remainingSeconds);
  const timerLabel = timerPhase === "PREPARING" ? "준비 시간" : "남은 시간";
  const timerDanger = timerPhase === "ANSWERING" && remainingSeconds <= 10;
  const interviewerProfile = getAiInterviewerProfile(mode);
  const interviewerQuestionPrompt = formatAiInterviewerQuestionPrompt({
    question: currentQuestion,
    questionVisible: subtitlesEnabled,
  });
  const cameraPipStyle = cameraPipPosition && runtimePrimaryScreen === "interviewer"
    ? {
        left: `${cameraPipPosition.x}px`,
        top: `${cameraPipPosition.y}px`,
      }
    : undefined;
  const interviewerPipStyle = interviewerPipPosition && runtimePrimaryScreen === "candidate"
    ? {
        left: `${interviewerPipPosition.x}px`,
        top: `${interviewerPipPosition.y}px`,
        right: "auto",
      }
    : undefined;
  const answerFileStatus = recordedFileName || answer.videoFile ? "답변 파일 준비 완료" : "답변 파일 대기";
  const runtimeAssistiveStatus = `${answerProcessingLabel}. ${answerProcessingReady ? "답변 처리 완료." : "답변 처리 대기."} ${answerFileStatus}`;
  const runtimeStatusChips = getInterviewRuntimeStatusChips({
    microphoneReady,
    microphoneLevel,
    cameraReady,
    networkReady,
    networkStatus,
  });
  const runtimeLayoutState = getInterviewRuntimeLayoutState({ fullscreenActive });
  const runtimeScreenSwapState = getInterviewRuntimeScreenSwapState({ primaryScreen: runtimePrimaryScreen });
  const runtimeStageClassName = [
    runtimeLayoutState.stageClassName,
    runtimeLayoutState.viewportLockClassName,
    runtimeLayoutState.infoGapClassName,
    runtimeScreenSwapState.stageClassName,
  ].filter(Boolean).join(" ");
  const interviewerFigureClassName = [
    "ai-interviewer-figure",
    runtimeScreenSwapState.interviewerPanelClassName,
  ].filter(Boolean).join(" ");
  const showInterviewerPanel = runtimePrimaryScreen === "interviewer" || interviewerPipVisible;
  const candidateCameraPanelClassName = [
    "candidate-camera-pip",
    cameraPipPosition && runtimePrimaryScreen === "interviewer" ? "positioned" : "",
    runtimeScreenSwapState.cameraPanelClassName,
  ].filter(Boolean).join(" ");
  const interviewerInfoPanelId = "ai-interviewer-info-panel";

  const handleToggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const stage = interviewerStageRef.current;
    if (!stage) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await stage.requestFullscreen();
    } catch {
      setMessage("이 브라우저에서는 전체화면 전환을 사용할 수 없습니다.");
    }
  }, []);

  const handleHideCameraPreview = useCallback(() => {
    setRuntimePrimaryScreen("interviewer");
    setCameraPreviewVisible(false);
  }, []);

  const handleToggleCameraPreview = useCallback(() => {
    if (cameraPreviewVisible) {
      handleHideCameraPreview();
      return;
    }
    setCameraPreviewVisible(true);
  }, [cameraPreviewVisible, handleHideCameraPreview]);

  const handleToggleRuntimePrimaryScreen = useCallback(() => {
    setCameraPreviewVisible(true);
    setInterviewerPipVisible(true);
    setRuntimePrimaryScreen((current) => (current === "candidate" ? "interviewer" : "candidate"));
  }, []);

  useEffect(() => {
    answerCompleteShortcutRef.current = handleAnswerComplete;
    nextQuestionShortcutRef.current = () => {
      void handleNextQuestion();
    };
  });

  useEffect(() => {
    if (!setupCompleted) return;

    const handleRuntimeShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isRuntimeShortcutIgnoredTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        handleToggleCameraPreview();
        return;
      }
      if (key === "q") {
        event.preventDefault();
        setSubtitlesEnabled((current) => !current);
        return;
      }
      if (key === "f") {
        event.preventDefault();
        void handleToggleFullscreen();
        return;
      }
      if (key === "s") {
        event.preventDefault();
        handleToggleRuntimePrimaryScreen();
        return;
      }
      if (key === "m") {
        event.preventDefault();
        setInterviewerInfoOpen((current) => !current);
        return;
      }
      if (event.key === "Enter") {
        if (busy || !currentQuestion || currentQuestionAnswered || (!recording && !canSubmitAnswer)) return;
        event.preventDefault();
        answerCompleteShortcutRef.current();
        return;
      }
      if (key === "n") {
        if (busy || recording || !canMoveNextQuestion) return;
        event.preventDefault();
        nextQuestionShortcutRef.current();
      }
    };

    window.addEventListener("keydown", handleRuntimeShortcut);
    return () => window.removeEventListener("keydown", handleRuntimeShortcut);
  }, [
    busy,
    canMoveNextQuestion,
    canSubmitAnswer,
    currentQuestion,
    currentQuestionAnswered,
    handleToggleFullscreen,
    handleToggleCameraPreview,
    handleToggleRuntimePrimaryScreen,
    recording,
    setupCompleted,
  ]);

  return (
    <main className="candidate-interview-app">
      <header className="iv-top">
        <Link className="brand" href={candidateApplicationInterviewRoutes.mockInterviewStart}>
          <Image src="/logo-init.png" alt="init" width={1010} height={375} priority />
        </Link>
        <span className="center">{runtimeTitle}</span>
      </header>

      <section className="iv-body">
        <StatusNotice loading={loading || busy} error={error} message={message} />
        {showDeviceSetup ? (
          <section className="candidate-device-setup">
            <div className="candidate-device-setup__head">
              <div>
                <p className="candidate-feature__eyebrow">장치 점검</p>
                <h1>카메라와 마이크를 확인해주세요</h1>
                <p>
                  {mode === "mock"
                    ? "모의면접을 시작하면 답변 녹화가 자동으로 진행됩니다."
                    : "채용 AI 면접을 시작하거나 재개하기 전에 카메라와 마이크를 다시 점검합니다."}
                </p>
              </div>
              <div className="toolbar">
                {ENABLE_CAMERALESS_INTERVIEW_TEST_ENTRY ? (
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busy || recording}
                    onClick={() => void handleCameralessRuntimeEntry()}
                  >
                    카메라 없이 테스트 진입
                  </button>
                ) : null}
                <button className="btn primary" type="button" disabled={busy || !cameraReady || !microphoneReady || !networkReady} onClick={() => void handleEnterInterview()}>
                  면접 시작
                </button>
              </div>
            </div>
            <div className="candidate-device-setup__grid">
              <div className="candidate-device-main">
                <div className="video-box candidate-device-preview">
                  <video ref={attachRuntimeVideoRef} autoPlay muted playsInline />
                  <CameraFramingOverlay state={cameraFramingState} testSentence={deviceTestSentence} />
                </div>
              </div>
              <aside className="panel candidate-runtime-status-panel">
                <p className="panel-title">장치 상태</p>
                <div className="status-list">
                  <div className="status-line"><span className={cameraReady ? "ok" : "wait"}>{cameraReady ? "✓" : "!"}</span> 카메라 {cameraReady ? "정상" : "연결 확인 필요"}</div>
                  <div className="status-line"><span className={microphoneReady ? "ok" : "wait"}>{microphoneReady ? "✓" : "!"}</span> {microphoneStatus}</div>
                  <div className="mic-meter" aria-label={`마이크 입력 ${microphoneLevel}%`}>
                    <span style={{ width: `${microphoneLevel}%` }} />
                  </div>
                  <div className="status-line"><span className={networkReady ? "ok" : "wait"}>{networkReady ? "✓" : "!"}</span> {networkStatus}</div>
                </div>
                <div className="candidate-device-controls">
                  <select
                    aria-label="카메라 선택"
                    className="camera-select"
                    value={selectedCameraId}
                    onChange={(event) => setSelectedCameraId(event.target.value)}
                  >
                    <option value="">기본 카메라</option>
                    {cameraDevices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>
                        {device.label || `카메라 ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="마이크 선택"
                    className="camera-select"
                    value={selectedMicrophoneId}
                    onChange={(event) => setSelectedMicrophoneId(event.target.value)}
                  >
                    <option value="">기본 마이크</option>
                    {microphoneDevices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>
                        {device.label || `마이크 ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <button className="btn" type="button" disabled={busy || recording} onClick={() => void refreshCameraDevices()}>
                    장치 새로고침
                  </button>
                  <button className="btn" type="button" disabled={busy || recording} onClick={() => void handleEnableCamera()}>
                    카메라/마이크 점검
                  </button>
                </div>
              </aside>
            </div>
          </section>
        ) : null}
        {data && setupCompleted ? (
          <>
            <section className={runtimeStageClassName} ref={interviewerStageRef} aria-label="AI 면접관 진행 화면">
              <div className="ai-interviewer-stage__top">
                <div className="ai-interviewer-stage__meta">
                  <strong>질문 {questionNumber} / {data.runtime.totalQuestions}</strong>
                </div>
                <div className={`question-timer ${timerDanger ? "danger" : ""}`} aria-label={`${timerLabel} ${formattedRemainingTime}`}>
                  <span>{timerLabel}</span>
                  <strong>{formattedRemainingTime}</strong>
                </div>
                <div className="ai-interviewer-stage__actions">
                  <button className="stage-shortcut-button" type="button" onClick={() => void handleToggleFullscreen()}>
                    <span>{runtimeLayoutState.fullscreenButtonLabel}</span>
                    <kbd>F</kbd>
                  </button>
                </div>
              </div>

              <div className="runtime-status-hud" aria-label="실시간 면접 상태">
                {runtimeStatusChips.map((chip) => (
                  <span key={chip.id} className={`runtime-status-chip runtime-status-chip--${chip.id} runtime-status-chip--${chip.tone}`}>
                    {chip.label}
                  </span>
                ))}
              </div>

              {showInterviewerPanel ? (
                <div
                  className={interviewerFigureClassName}
                  ref={runtimePrimaryScreen === "candidate" ? interviewerPipRef : undefined}
                  style={interviewerPipStyle}
                  aria-label={`${interviewerProfile.displayName} ${interviewerProfile.toneLabel}`}
                >
                  {runtimePrimaryScreen === "candidate" ? (
                    <div
                      className="ai-interviewer-pip__bar"
                      onPointerDown={handleInterviewerPipPointerDown}
                      onPointerMove={handleInterviewerPipPointerMove}
                      onPointerUp={handleInterviewerPipPointerEnd}
                      onPointerCancel={handleInterviewerPipPointerEnd}
                    >
                      <span>AI 면접관</span>
                      <button
                        type="button"
                        aria-label={runtimeScreenSwapState.swapButtonAriaLabel}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={handleToggleRuntimePrimaryScreen}
                      >
                        <span>{runtimeScreenSwapState.swapButtonLabel}</span>
                        <kbd>{runtimeScreenSwapState.swapShortcutKey}</kbd>
                      </button>
                      <button
                        type="button"
                        aria-label="AI 면접관 PIP 숨기기"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setInterviewerPipVisible(false)}
                      >
                        <span>숨김</span>
                      </button>
                    </div>
                  ) : null}
                  <div className={`ai-interviewer-avatar ${questionSpeechPlaying ? "speaking" : ""}`} aria-hidden="true">
                    <span className="ai-interviewer-avatar__ring" />
                    <span className="ai-interviewer-avatar__face">
                      <span />
                      <span />
                    </span>
                  </div>
                  <div className="ai-interviewer-copy">
                    <div className="ai-interviewer-title-row">
                      <h1>{interviewerProfile.displayName}</h1>
                      <button
                        className={`ai-interviewer-info-button ${interviewerInfoOpen ? "open" : ""}`}
                        type="button"
                        aria-label={`${interviewerProfile.infoButtonLabel} ${interviewerInfoOpen ? "닫기" : "열기"}`}
                        aria-expanded={interviewerInfoOpen}
                        aria-controls={interviewerInfoPanelId}
                        onClick={() => setInterviewerInfoOpen((current) => !current)}
                      >
                        <kbd>{interviewerProfile.infoShortcutKey}</kbd>
                      </button>
                    </div>
                    {interviewerInfoOpen ? (
                      <div className="ai-interviewer-info-panel" id={interviewerInfoPanelId} role="note">
                        <strong>{interviewerProfile.toneLabel}</strong>
                        <span>{interviewerProfile.voiceGuide}</span>
                        <p>{interviewerProfile.disclosure}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <button
                  className="ai-interviewer-pip-toggle"
                  type="button"
                  onClick={() => setInterviewerPipVisible(true)}
                >
                  AI 면접관 열기
                </button>
              )}

              <div className={`ai-interviewer-question ${subtitlesEnabled ? "" : "muted"}`}>
                <span>{subtitlesEnabled ? "질문 보기" : "질문 음성 안내"}</span>
                <strong>{interviewerQuestionPrompt}</strong>
              </div>

              <div className={`question-voice-status ${questionSpeechSupported ? "" : "unsupported"}`} aria-live="polite">
                {questionSpeechStatus}
              </div>

              {cameraPreviewVisible ? (
                <div
                  className={candidateCameraPanelClassName}
                  ref={cameraPipRef}
                  style={cameraPipStyle}
                >
                  <div
                    className="candidate-camera-pip__bar"
                    onPointerDown={handleCameraPipPointerDown}
                    onPointerMove={handleCameraPipPointerMove}
                    onPointerUp={handleCameraPipPointerEnd}
                    onPointerCancel={handleCameraPipPointerEnd}
                  >
                    <span>내 화면</span>
                    <button
                      type="button"
                      aria-label={runtimeScreenSwapState.swapButtonAriaLabel}
                      aria-pressed={runtimePrimaryScreen === "candidate"}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={handleToggleRuntimePrimaryScreen}
                    >
                      <span>{runtimeScreenSwapState.swapButtonLabel}</span>
                      <kbd>{runtimeScreenSwapState.swapShortcutKey}</kbd>
                    </button>
                    <button
                      type="button"
                      aria-label="내 화면 preview 숨기기"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={handleHideCameraPreview}
                    >
                      <span>숨김</span>
                      <kbd>P</kbd>
                    </button>
                  </div>
                  <div className="candidate-camera-pip__video">
                    <video ref={attachRuntimeVideoRef} autoPlay muted playsInline />
                    {recording ? (
                      <div className="recbadge"><span className="pulse" /> 녹화 중</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <button
                  className={`candidate-camera-pip-toggle ${recording ? "recording" : ""}`}
                  type="button"
                  onClick={() => setCameraPreviewVisible(true)}
                >
                  <span>내 화면 열기</span>
                  <kbd>P</kbd>
                  {recording ? <strong>녹화 중</strong> : null}
                </button>
              )}
            </section>

            <form className="candidate-runtime-form" onSubmit={handleSaveAnswer}>
              <p className="sr-only" aria-live="polite">{runtimeAssistiveStatus}</p>
              <div className="toolbar candidate-interview-controls">
                <button className="btn" type="button" disabled={busy || !currentQuestion || !questionSpeechSupported || currentQuestionReplayUsed} onClick={handleReplayPrompt}>
                  {currentQuestionReplayUsed ? "다시 듣기 완료" : "질문 음성 다시 듣기"}
                </button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy || !currentQuestion || currentQuestionLocked || (!recording && !canSubmitAnswer)}
                  onClick={handleAnswerComplete}
                >
                  <span>답변 완료</span>
                  <kbd>Enter</kbd>
                </button>
                {canRetryCurrentAnswer ? (
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || recording}
                    onClick={handleRetryAnswer}
                  >
                    다시 답변하기
                  </button>
                ) : null}
                <button
                  className="btn"
                  type="button"
                  disabled={!canStartCurrentQuestionReanswer}
                  onClick={handleStartReanswer}
                  hidden={!currentQuestionNeedsReanswer}
                >
                  다시 답변
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy || recording || !canMoveNextQuestion}
                  onClick={() => void handleNextQuestion()}
                >
                  <span>다음 질문</span>
                  <kbd>N</kbd>
                </button>
                <button
                  className={`subtitle-toggle ${subtitlesEnabled ? "on" : ""}`}
                  type="button"
                  aria-pressed={subtitlesEnabled}
                  onClick={() => setSubtitlesEnabled((current) => !current)}
                >
                  <span>{subtitlesEnabled ? "질문 숨기기" : "질문 보기"}</span>
                  <kbd>Q</kbd>
                </button>
              </div>
              <p className="field-hint">STT 실패 시 재답변은 문항당 1회만 가능합니다.</p>
              <div className="candidate-interview-complete-action">
                <button
                  className="btn primary lg"
                  type="button"
                  disabled={busy || recording || !canCompleteInterview}
                  onClick={() => void handleComplete()}
                >
                  면접 완료
                </button>
              </div>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}

function CandidatePageShell({ active, children }: { active: CandidateNavSection; children: ReactNode }) {
  return (
    <main className="app-shell candidate-app">
      <CandidateNav active={active} />
      <section className="app-page">{children}</section>
    </main>
  );
}

function CandidateNav({ active }: { active: CandidateNavSection }) {
  const pathname = usePathname();
  const mockActive = active === "interview" || active === "reports";
  const recruitingActive = active === "jobs" || active === "applications";
  const accountBillingActive = active === "accountBilling" || isCandidateAccountBillingPath(pathname);

  return (
    <header className="gnb">
      <div className="gnb-inner">
        <Link className="brand" href={candidateApplicationInterviewRoutes.jobs}>
          <Image src="/logo-init.png" alt="init" width={1010} height={375} priority />
        </Link>
        <nav className="gnb-menu" aria-label="지원자 메뉴">
          <div className={`gnb-item ${mockActive ? "active" : ""}`}>
            <Link className="gnb-link" href={candidateApplicationInterviewRoutes.mockInterviewStart} aria-current={mockActive ? "page" : undefined}>
              AI 모의면접
              <span className="gnb-caret" aria-hidden="true">⌄</span>
            </Link>
            <div className="gnb-panel">
              <Link className={active === "interview" ? "active" : ""} href={candidateApplicationInterviewRoutes.mockInterviewStart}>
                면접시작
              </Link>
              <Link className={active === "reports" ? "active" : ""} href={candidateApplicationInterviewRoutes.mockReports}>
                평가 리포트
              </Link>
            </div>
          </div>
          <div className={`gnb-item ${recruitingActive ? "active" : ""}`}>
            <Link className="gnb-link" href={candidateApplicationInterviewRoutes.jobs} aria-current={recruitingActive ? "page" : undefined}>
              채용정보
              <span className="gnb-caret" aria-hidden="true">⌄</span>
            </Link>
            <div className="gnb-panel">
              <Link className={active === "jobs" ? "active" : ""} href={candidateApplicationInterviewRoutes.jobs}>
                채용공고
              </Link>
              <Link className={active === "applications" ? "active" : ""} href={candidateApplicationInterviewRoutes.applications}>
                지원현황
              </Link>
            </div>
          </div>
          <div className={`gnb-item ${accountBillingActive ? "active" : ""}`}>
            <Link className="gnb-link" href={candidateApplicationInterviewRoutes.mypage} aria-current={accountBillingActive ? "page" : undefined}>
              {candidateNavLabels.accountBilling}
              <span className="gnb-caret" aria-hidden="true">⌄</span>
            </Link>
            <div className="gnb-panel">
              {candidateAccountBillingNav.map((item) => (
                <Link className={pathname?.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <div className="gnb-right">
          <GnbLogoutButton />
          <button className="icon-btn" aria-label="알림" type="button">
            <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
          <GnbAvatar accountLabel="지원자 계정" />
        </div>
      </div>
    </header>
  );
}

function CandidatePageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="toolbar">{actions}</div> : null}
    </div>
  );
}

function StatusNotice({ loading, error, message }: { loading?: boolean; error?: string; message?: string }) {
  if (error) {
    const loginRequired = error.includes("로그인");
    return (
      <div className="notice danger">
        <span>{error}</span>
        {loginRequired ? <Link className="btn secondary compact" href="/login">로그인으로 이동</Link> : null}
      </div>
    );
  }
  if (message) return <p className="notice">{message}</p>;
  if (loading) return <p className="notice">불러오는 중입니다.</p>;
  return null;
}

function ApplicationsTable({
  applications,
  selectedApplicationId,
  onSelect,
}: {
  applications: CandidateApplicationSummary[];
  selectedApplicationId?: number;
  onSelect?: (applicationId: number) => void;
}) {
  return (
    <div className="candidate-applications-table">
      <div className="candidate-applications-table__row candidate-applications-table__head">
        <span>회사</span>
        <span>채용공고</span>
        <span>지원</span>
        <span>면접</span>
        <span>리포트</span>
      </div>
      {applications.map((application) => (
        <button
          key={application.applicationId}
          type="button"
          className={`candidate-applications-table__row ${
            application.applicationId === selectedApplicationId ? "selected" : ""
          }`}
          onClick={() => onSelect?.(application.applicationId)}
        >
          <span>{application.companyName}</span>
          <span>{application.jobTitle}</span>
          <span>
            <ApplicationStatusBadge
              label={formatCandidateApplicationStatusLabel(application.applicationStatus)}
              tone={getCandidateApplicationStatusTone(application.applicationStatus)}
            />
          </span>
          <span>
            <ApplicationStatusBadge
              label={formatCandidateInterviewStatusLabel(application.interviewStatus)}
              tone={getCandidateInterviewStatusTone(application.interviewStatus)}
            />
          </span>
          <span>{renderCandidateReportStatus(application.reportStatus)}</span>
        </button>
      ))}
    </div>
  );
}

function ApplicationStatusBadge({ label, tone }: { label: string; tone: ApplicationBadgeTone }) {
  return <span className={`candidate-application-badge ${tone}`}>{label}</span>;
}

function renderCandidateReportStatus(status: CandidateApplicationSummary["reportStatus"]): ReactNode {
  if (status === "PENDING") return <span className="candidate-report-empty">-</span>;
  return (
    <ApplicationStatusBadge
      label={formatCandidateReportStatusLabel(status)}
      tone={getCandidateReportStatusTone(status)}
    />
  );
}

function formatCandidateApplicationStatusLabel(status: CandidateApplicationSummary["applicationStatus"]): string {
  const labels: Record<string, string> = {
    DRAFT: "작성중",
    SUBMITTED: "지원완료",
    IN_REVIEW: "검토중",
    INTERVIEW_WAITING: "면접대기",
    INTERVIEW_DONE: "면접완료",
    COMPLETED: "최종완료",
    CANCELED: "지원취소",
  };
  return labels[status] ?? status;
}

function getCandidateApplicationStatusTone(status: CandidateApplicationSummary["applicationStatus"]): ApplicationBadgeTone {
  if (status === "SUBMITTED" || status === "COMPLETED" || status === "INTERVIEW_DONE") return "green";
  if (status === "CANCELED") return "neutral";
  return "yellow";
}

function formatCandidateInterviewStatusLabel(status: CandidateApplicationSummary["interviewStatus"]): string {
  const labels: Record<string, string> = {
    NOT_READY: "응시대기",
    READY: "응시대기",
    IN_PROGRESS: "진행중",
    COMPLETED: "응시완료",
    FAILED: "확인필요",
  };
  return labels[status] ?? status;
}

function getCandidateInterviewStatusTone(status: CandidateApplicationSummary["interviewStatus"]): ApplicationBadgeTone {
  if (status === "COMPLETED") return "green";
  if (status === "FAILED") return "neutral";
  return "yellow";
}

function formatCandidateReportStatusLabel(status: CandidateApplicationSummary["reportStatus"]): string {
  const labels: Record<string, string> = {
    GENERATING: "분석중",
    PENDING: "-",
    COMPLETED: "완료",
    FAILED: "확인필요",
  };
  return labels[status] ?? status;
}

function getCandidateReportStatusTone(status: CandidateApplicationSummary["reportStatus"]): ApplicationBadgeTone {
  if (status === "GENERATING") return "purple";
  if (status === "COMPLETED") return "green";
  return "neutral";
}

function matchesCandidateApplicationStatusFilter(
  application: CandidateApplicationSummary,
  filter: CandidateApplicationStatusFilter,
): boolean {
  if (filter === "ALL") return true;
  if (filter === "WAITING") return application.interviewStatus === "NOT_READY" || application.interviewStatus === "READY";
  if (filter === "IN_PROGRESS") return application.interviewStatus === "IN_PROGRESS";
  if (filter === "COMPLETED") return application.interviewStatus === "COMPLETED";
  return application.reportStatus === "GENERATING" || application.reportStatus === "COMPLETED";
}

function getSelectedApplicationAction(application: CandidateApplicationSummary): { href?: string; label: string } {
  if (application.applicationStatus === "CANCELED") {
    return { label: "지원 취소됨" };
  }
  if (application.interviewStatus === "FAILED") {
    return { label: "면접 확인 필요" };
  }
  if (application.interviewStatus === "COMPLETED") {
    return {
      href: getCandidateApplicationReportHref(application),
      label: application.reportStatus === "COMPLETED" ? "결과 확인" : "분석 상태 확인",
    };
  }
  if (application.interviewStatus === "IN_PROGRESS") {
    return {
      href: candidateApplicationInterviewRoutes.interviewGuide(application.applicationId),
      label: "채용 AI 면접 재개",
    };
  }
  if (application.canStartInterview || application.interviewStatus === "READY") {
    return {
      href: candidateApplicationInterviewRoutes.interviewGuide(application.applicationId),
      label: "채용 AI 면접 시작",
    };
  }
  return {
    href: candidateApplicationInterviewRoutes.interviewGuide(application.applicationId),
    label: "면접 준비하기",
  };
}

function MockReportsTable({ reports }: { reports: CandidateMockReportSummary[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>리포트</th>
            <th>세션</th>
            <th>면접 상태</th>
            <th>리포트 상태</th>
            <th>답변</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.reportId}>
              <td>#{report.reportId}<span>{formatDateTime(report.updatedAt)}</span></td>
              <td>세션 #{report.sessionId}</td>
              <td><StatusPill value={report.status} /></td>
              <td><StatusPill value={report.reportStatus} /></td>
              <td>{report.answeredCount}/{report.totalQuestions}</td>
              <td>
                <Link className="btn secondary compact" href={getMockReportHref(report)}>상세</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MockHistoryTable({ history }: { history: CandidateMockInterviewHistoryItem[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>세션</th>
            <th>면접 상태</th>
            <th>리포트 상태</th>
            <th>답변</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => (
            <tr key={item.sessionId}>
              <td>#{item.sessionId}<span>{formatDateTime(item.updatedAt)}</span></td>
              <td><StatusPill value={item.status} /></td>
              <td><StatusPill value={item.reportStatus} /></td>
              <td>{item.answeredCount}/{item.totalQuestions}</td>
              <td>
                {item.status === "IN_PROGRESS" ? (
                  <Link className="btn secondary compact" href={candidateApplicationInterviewRoutes.mockInterview(item.sessionId)}>이어하기</Link>
                ) : (
                  <Link className="btn secondary compact" href={candidateApplicationInterviewRoutes.mockReportDetail(item.reportId)}>리포트</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type MockReportStatusView = {
  badge: string;
  title: string;
  description: string;
  helper?: string;
  tone: "neutral" | "progress" | "blocked";
};

function MockReportStatusPanel({ view }: { view: MockReportStatusView }) {
  return (
    <div className={`candidate-pipeline-card ${view.tone === "progress" ? "muted" : ""}`}>
      <div className="candidate-pipeline-card__head">
        <div>
          <strong>{view.title}</strong>
          <p>{view.description}</p>
        </div>
        <StatusPill value={view.badge} />
      </div>
      {view.helper ? <p>{view.helper}</p> : null}
    </div>
  );
}

function getMockReportStatusView(
  status: CandidateMockReportFeedback["status"] | CandidateMockReportMedia["status"] | undefined,
  feedbackError?: string,
): MockReportStatusView {
  if (status === "COMPLETED") {
    return {
      badge: "완료",
      title: "리포트 결과를 불러오는 중입니다.",
      description: "AI 분석은 완료되었고 화면에 표시할 결과를 다시 확인하고 있습니다.",
      tone: "neutral",
    };
  }

  if (status === "GENERATING") {
    return {
      badge: "분석 중",
      title: "AI가 면접 답변을 분석하고 있습니다.",
      description: "STT 텍스트와 답변 근거를 바탕으로 종합 피드백과 역량별 점수를 생성 중입니다.",
      helper: "잠시 후 결과가 자동으로 갱신됩니다.",
      tone: "progress",
    };
  }

  if (status === "FAILED") {
    return {
      badge: "실패",
      title: "리포트 분석을 완료하지 못했습니다.",
      description: "일시적인 AI 처리 오류이거나 분석에 필요한 답변 데이터가 부족할 수 있습니다.",
      helper: feedbackError && !isReportNotReadyMessage(feedbackError) ? feedbackError : "분석 다시 요청을 눌러 재시도해 주세요.",
      tone: "blocked",
    };
  }

  return {
    badge: "대기",
    title: "리포트 분석을 시작할 수 있습니다.",
    description: "면접 답변과 STT 결과가 준비되면 AI 분석을 요청해 종합 피드백을 확인할 수 있습니다.",
    helper: feedbackError && !isReportNotReadyMessage(feedbackError) ? feedbackError : "AI 분석 시작을 눌러 리포트를 생성해 주세요.",
    tone: "neutral",
  };
}

function isReportNotReadyMessage(message: string): boolean {
  return message.includes("Report is not ready") || message.includes("REPORT_NOT_READY");
}

function MockFeedbackView({ feedback }: { feedback: CandidateMockReportFeedback }) {
  const scores = feedback.scores ?? [];
  const improvementItems = feedback.improvements.length > 0
    ? feedback.improvements
    : buildMockReportImprovementItems(scores);
  const nextPracticeItems = feedback.nextPractice.length > 0
    ? feedback.nextPractice
    : buildMockReportPracticeItems(scores);

  return (
    <div className="detail-stack">
      <dl className="candidate-feature__summary">
        <Definition label="상태" value={<StatusPill value={feedback.status} />} />
        {feedback.totalScore !== undefined ? <Definition label="총점" value={`${feedback.totalScore}점`} /> : null}
        <Definition label="생성 시각" value={feedback.generatedAt ? formatDateTime(feedback.generatedAt) : "-"} />
        <Definition label="공개 범위" value={feedback.visibilityPolicy.candidateFacingOnly ? "지원자용" : "확인 필요"} />
      </dl>
      <p className="description-box">{feedback.summary ?? "리포트 생성 중입니다."}</p>
      {scores.length ? null : <ListBlock title="강점" items={feedback.strengths} />}
      <ListBlock title="개선점" items={improvementItems} />
      <ListBlock title="다음 연습" items={nextPracticeItems} />
      <ReportScoreList scores={scores} />
    </div>
  );
}

function buildMockReportImprovementItems(scores: CandidateReportScoreView[]): string[] {
  if (!scores.length) {
    return ["답변별 상황, 본인 행동, 결과를 구분해서 말하면 피드백 정확도가 높아집니다."];
  }

  return [...scores]
    .sort((left, right) => left.score - right.score)
    .slice(0, 3)
    .map((score) => `${score.criterionName} 답변은 사례의 배경, 본인 행동, 결과를 조금 더 분리해서 말하면 좋아집니다.`);
}

function buildMockReportPracticeItems(scores: CandidateReportScoreView[]): string[] {
  if (!scores.length) {
    return ["다음 연습에서는 한 답변 안에 문제 상황, 내가 한 일, 확인한 결과를 차례로 담아 보세요."];
  }

  const lowestScore = [...scores].sort((left, right) => left.score - right.score)[0];
  return [
    `${lowestScore.criterionName} 항목을 중심으로 STAR 방식으로 30초 답변을 다시 연습해 보세요.`,
  ];
}

function MockMediaView({ media }: { media: CandidateMockReportMedia }) {
  if (!media.media.length) return <p className="empty">연결된 답변 파일이 없습니다.</p>;
  const mediaItems = orderReportAnswersByInterviewFlow(media.media);
  return (
    <div className="detail-stack">
      <div className="report-media-list">
        {mediaItems.map((item, index) => (
          <MockMediaAnswerCard key={item.answerId} item={item} questionNumber={index + 1} />
        ))}
      </div>
    </div>
  );
}

function MockMediaAnswerCard({ item, questionNumber }: { item: CandidateMockReportMedia["media"][number]; questionNumber: number }) {
  const videoUrl = getCachedRecordingObjectUrl(item.videoFile?.storageKey);
  const audioUrl = getCachedRecordingObjectUrl(item.audioFile?.storageKey);
  const practiceGuide = buildMockAnswerPracticeGuide(item);

  return (
    <article className="report-answer-card">
      <div className="report-answer-card__head">
        <div>
          <span>질문 {questionNumber}</span>
          <strong>{item.questionContent ?? `질문 #${item.questionId}`}</strong>
        </div>
        <StatusPill value={formatQuestionTypeLabel(item.questionType)} />
      </div>
      <div className="report-answer-card__content">
        <div className="report-answer-card__video">
          {videoUrl ? (
            <video controls preload="metadata" src={videoUrl}>
              녹화 영상을 재생할 수 없습니다.
            </video>
          ) : (
            <div className="report-media-placeholder">
              <strong>답변 영상</strong>
              <span>현재 브라우저 세션에 녹화 원본이 없습니다.</span>
            </div>
          )}
        </div>
        <div className="script-box report-answer-card__script">
          <strong>스크립트</strong>
          <TranscriptText
            transcript={item.transcript}
            transcriptStatus={item.transcriptStatus}
            evaluationStatus={item.evaluationStatus}
            transcriptUnavailableReason={item.transcriptUnavailableReason}
          />
          <FollowUpQuestionList questions={item.followUpQuestions} />
          <AnswerPracticeGuideView guide={practiceGuide} />
          <dl className="report-answer-meta">
            <Definition label="답변 시간" value={`${item.durationSeconds}s`} />
          </dl>
          {audioUrl ? (
            <audio className="report-audio-player" controls preload="metadata" src={audioUrl}>
              음성 파일을 재생할 수 없습니다.
            </audio>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type AnswerPracticeGuide = {
  example: string;
  gaps: string[];
};

function AnswerPracticeGuideView({ guide }: { guide: AnswerPracticeGuide }) {
  return (
    <section className="report-practice-guide">
      <h4>고득점 답변 예시 템플릿</h4>
      <div className="report-practice-guide__block">
        <strong>STAR 답변 예시</strong>
        <p>{guide.example}</p>
      </div>
      <div className="report-practice-guide__block">
        <strong>내 답변 보완점</strong>
        <ul>
          {guide.gaps.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function buildMockAnswerPracticeGuide(item: CandidateMockReportMedia["media"][number]): AnswerPracticeGuide {
  const transcript = item.transcript ?? "";
  return {
    example: buildMockAnswerExample(item),
    gaps: buildMockAnswerGaps(item.questionType, item.questionContent, transcript),
  };
}

function buildMockAnswerExample(item: CandidateMockReportMedia["media"][number]): string {
  const question = item.questionContent ?? "";

  if (item.questionType === "INTRO" || question.includes("자기소개")) {
    return "저는 지원 직무와 연결되는 프로젝트 경험을 통해 문제를 구조적으로 해결해 온 지원자입니다. 최근에는 사용자 흐름이 끊기는 문제를 맡아 원인을 단계별로 나누고, 제가 담당한 기능의 입력값, 처리 과정, 결과 화면을 끝까지 확인했습니다. 그 결과 반복되던 오류를 줄이고 사용자가 더 안정적으로 기능을 사용할 수 있도록 개선했습니다.";
  }

  if (item.questionType === "TECHNICAL" || question.includes("어려웠던") || question.includes("기술")) {
    return "가장 어려웠던 문제는 기능 일부가 정상처럼 보이지만 최종 결과가 사용자에게 전달되지 않는 상황이었습니다. 저는 문제를 화면 입력, 서버 처리, 데이터 저장, 결과 표시 단계로 나누어 확인했고, 중간 단계에서 필요한 값이 누락되는 지점을 찾았습니다. 이후 누락 조건을 보완하고 같은 시나리오로 다시 검증해 정상 동작을 확인했습니다.";
  }

  if (item.questionType === "EXPERIENCE" || question.includes("학습") || question.includes("적용")) {
    return "새로운 기술을 적용해야 했을 때 먼저 작은 예제로 동작 원리를 확인했습니다. 이후 실제 프로젝트 흐름에 맞춰 입력, 처리, 저장, 조회 기준을 정리했고, 실패했을 때 어느 단계에서 문제가 생겼는지 추적할 수 있게 했습니다. 덕분에 낯선 기술도 짧은 시간 안에 실제 기능으로 연결할 수 있었습니다.";
  }

  if (item.questionType === "CLOSING" || question.includes("강점") || question.includes("기억")) {
    return "제 강점은 문제를 감으로 추측하지 않고 확인 가능한 근거를 기준으로 좁혀가는 점입니다. 문제가 생기면 사용자 동작, 요청 결과, 저장 상태, 화면 반영 순서로 확인하고, 원인이 확인되면 같은 경로로 다시 검증합니다. 이 방식으로 팀원이 보기에도 재현 가능하고 설명 가능한 해결 과정을 만들 수 있습니다.";
  }

  if (item.questionType === "FOLLOW_UP") {
    if (question.includes("어려웠던 점")) {
      return "가장 어려웠던 점은 겉으로는 일부 단계가 성공했지만 최종 결과가 나오지 않는 원인을 구분하는 것이었습니다. 저는 각 단계에서 반드시 남아야 하는 값과 상태를 정리하고, 어느 지점에서 흐름이 끊기는지 비교했습니다. 그 결과 문제 원인을 특정하고 사용자 화면까지 정상적으로 이어지도록 수정했습니다.";
    }
    if (question.includes("구체적인 조치")) {
      return "먼저 문제를 입력, 요청, 처리, 저장, 화면 반영 단계로 나눴습니다. 각 단계에서 기대값과 실제 값을 비교해 값이 끊기는 지점을 찾았고, 수정 후 같은 시나리오를 다시 수행해 결과가 끝까지 이어지는지 확인했습니다. 이 방식 덕분에 원인을 재현 가능하게 설명할 수 있었습니다.";
    }
    if (question.includes("비동기") || question.includes("상태")) {
      return "비동기 처리에서는 요청 직후 결과가 바로 보이지 않기 때문에 상태 변화와 저장 지점을 기준으로 확인했습니다. 작업이 접수됐는지, 처리 중인지, 완료 또는 실패했는지를 구분하고 각 단계의 결과가 다음 단계로 전달되는지 검증했습니다. 이 기준을 세운 뒤 문제 상황도 단계별로 재현할 수 있었습니다.";
    }
    return "질문에 바로 답한 뒤 당시 상황, 본인이 맡은 역할, 직접 한 행동, 확인한 결과를 차례로 설명하는 것이 좋습니다. 특히 문제를 어떤 기준으로 나눴는지, 수정 후 어떤 변화가 있었는지를 함께 말하면 답변의 신뢰도가 높아집니다.";
  }

  return "좋은 답변은 상황을 간단히 설명한 뒤 본인이 맡은 역할, 직접 한 행동, 확인한 결과를 차례로 말합니다. 마지막에는 수치, 전후 비교, 재검증 결과 중 하나를 덧붙이면 답변의 신뢰도가 높아집니다.";
}

function buildMockAnswerGaps(questionType: QuestionType, questionContent: string | undefined, transcript: string): string[] {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.startsWith("[NO_ANSWER]")) {
    return ["답변 내용이 없어 평가 근거가 부족합니다. 다음 연습에서는 상황, 행동, 결과를 각각 한 문장씩이라도 남겨 주세요."];
  }

  const gaps: string[] = [];
  const hasMetric = /\d|%|ms|초|분|시간|건|배|회|명|개|KB|MB/i.test(normalized);
  const hasRole = /(제가|저는|맡|담당|구현|수정|연결|확인|검증|분석|해결|비교|나눴|적용)/.test(normalized);
  const hasResult = /(결과|완료|성공|통과|개선|해결|안정화|줄였|확인|검증|저장|갱신|연결|반영)/.test(normalized);
  const hasProcess = /(먼저|이후|그 결과|순서|단계|기준|비교|추적|확인)/.test(normalized);

  if (!hasRole) {
    gaps.push("본인이 직접 맡은 역할과 행동을 더 분명히 말하면 점수가 올라갑니다.");
  }
  if (!hasProcess && questionType !== "CLOSING") {
    gaps.push("문제를 어떤 순서와 기준으로 확인했는지 단계가 더 드러나면 좋습니다.");
  }
  if (!hasResult) {
    gaps.push("수정 후 어떤 결과가 나왔는지, 어떻게 재검증했는지를 덧붙이면 좋습니다.");
  }
  if (!hasMetric) {
    gaps.push("가능하면 처리 시간, 실패 조건, 전후 비교, 개선 수치처럼 확인 가능한 근거 한 가지를 추가해 보세요.");
  }
  if (hasLikelyNoisyTranscript(normalized)) {
    gaps.push("STT에서 어색하게 인식된 기술 용어가 보입니다. 핵심 용어는 천천히 또렷하게 말하면 평가 근거가 더 선명해집니다.");
  }

  if (questionType === "FOLLOW_UP" && gaps.length < 3) {
    gaps.push("꼬리질문은 질문에 바로 답한 뒤, 구체적인 행동과 결과를 짧게 붙이면 더 좋습니다.");
  }

  if ((questionContent?.includes("강점") || questionType === "CLOSING") && !normalized.includes("예를 들어")) {
    gaps.push("강점 답변에는 짧은 사례를 하나 붙이면 기억에 더 남습니다.");
  }

  if (!gaps.length) {
    return ["전체 흐름은 좋습니다. 더 높은 점수를 위해 성과를 수치나 전후 비교로 한 번 더 압축해 말해 보세요."];
  }

  return gaps.slice(0, 3);
}

function hasLikelyNoisyTranscript(value: string): boolean {
  return /(인적 답변|오퍼 처리|파일 레스셋|프로시스|인풋 레프|블랍|마인 타입|동신|인털|소사례)/.test(value);
}

function ApplicationStatusView({ status }: { status: CandidateApplicationStatusView }) {
  return (
    <dl className="candidate-feature__summary">
      <Definition label="회사" value={status.companyName} />
      <Definition label="공고" value={status.jobTitle} />
      <Definition label="지원 상태" value={<StatusPill value={status.applicationStatus} />} />
      <Definition label="서류 상태" value={<StatusPill value={status.documentStatus} />} />
      <Definition label="면접 상태" value={<StatusPill value={status.interviewStatus} />} />
      <Definition label="리포트 상태" value={<StatusPill value={status.reportStatus} />} />
      <Definition label="세션 ID" value={status.sessionId} />
      <Definition label="제출일" value={formatDateTime(status.submittedAt)} />
    </dl>
  );
}

function RecruitingReportView({ report }: { report: CandidateRecruitingReportView }) {
  const isCompleted = report.status === "COMPLETED";
  const isFailed = report.status === "FAILED";
  const statusMessage = isCompleted
    ? "AI 분석이 완료되어 기업 검토 단계로 전달되었습니다."
    : isFailed
      ? "면접은 제출되었지만 AI 분석 상태 확인이 필요합니다. 기업 담당자가 확인 후 안내할 예정입니다."
      : "면접이 정상적으로 제출되었습니다. AI 분석이 완료되면 기업 검토 단계로 전달됩니다.";

  return (
    <div className="detail-stack">
      <dl className="candidate-feature__summary">
        <Definition label="상태" value={<StatusPill value={report.status} />} />
        <Definition label="회사" value={report.companyName} />
        <Definition label="공고" value={report.jobTitle} />
        <Definition label="다음 단계" value={report.nextStepLabel} />
      </dl>
      <div className="description-box">
        <strong>면접이 정상적으로 제출되었습니다.</strong>
        <p>{statusMessage}</p>
        <p>최종 결과는 기업 검토 후 안내됩니다.</p>
      </div>
    </div>
  );
}

function ReportScoreList({ scores }: { scores: CandidateReportScoreView[] }) {
  if (!scores.length) {
    return <p className="empty">표시할 평가 점수가 아직 없습니다.</p>;
  }

  return (
    <div>
      <h3 className="candidate-section-title">AI 평가 결과</h3>
      <div className="report-score-list">
        {scores.map((score) => {
          const band = getReportScoreBand(score.score);
          return (
            <article className="report-score-card" key={score.scoreId}>
              <div className="report-score-card__head">
                <strong>{score.criterionName ?? `평가 항목 #${score.criterionId ?? score.scoreId}`}</strong>
                <span>{score.score}점 · {band.label}</span>
              </div>
              <p className="report-score-card__band">{band.range} 구간 · {band.description}</p>
              {score.rationale ? <p>{score.rationale}</p> : null}
              <EvidenceList evidences={score.evidences} criterionName={score.criterionName} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function orderReportAnswersByInterviewFlow<T extends {
  answerId: number;
  questionContent?: string;
  questionType?: QuestionType;
  sortOrder?: number;
  followUpQuestions: CandidateFollowUpQuestionView[];
}>(answers: T[]): T[] {
  const normalizedContentToAnswer = new Map<string, T>();
  for (const answer of answers) {
    const key = normalizeReportQuestionContent(answer.questionContent);
    if (key) normalizedContentToAnswer.set(key, answer);
  }

  const baseAnswers = answers
    .filter((answer) => answer.questionType !== "FOLLOW_UP")
    .sort(compareReportAnswers);
  const ordered: T[] = [];
  const usedAnswerIds = new Set<number>();

  for (const answer of baseAnswers) {
    ordered.push(answer);
    usedAnswerIds.add(answer.answerId);

    for (const followUp of answer.followUpQuestions) {
      const followUpAnswer = normalizedContentToAnswer.get(normalizeReportQuestionContent(followUp.content));
      if (!followUpAnswer || usedAnswerIds.has(followUpAnswer.answerId)) continue;
      ordered.push(followUpAnswer);
      usedAnswerIds.add(followUpAnswer.answerId);
    }
  }

  const remainingAnswers = answers
    .filter((answer) => !usedAnswerIds.has(answer.answerId))
    .sort(compareReportAnswers);
  return [...ordered, ...remainingAnswers];
}

function normalizeReportQuestionContent(value?: string): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function compareReportAnswers(
  left: { sortOrder?: number; answerId: number },
  right: { sortOrder?: number; answerId: number },
): number {
  return (left.sortOrder ?? left.answerId) - (right.sortOrder ?? right.answerId);
}

function TranscriptText({
  transcript,
  transcriptStatus,
  evaluationStatus,
  transcriptUnavailableReason,
}: {
  transcript?: string;
  transcriptStatus: "PENDING" | "AVAILABLE" | "UNAVAILABLE";
  evaluationStatus?: "EVALUATED" | "STT_UNAVAILABLE";
  transcriptUnavailableReason?: string;
}) {
  if (evaluationStatus === "STT_UNAVAILABLE" || transcriptStatus === "UNAVAILABLE") {
    return (
      <>
        <span className="badge warning">STT 미가용</span>
        <p>{transcriptUnavailableReason ?? "음성 인식 실패로 실제 답변 텍스트를 확보하지 못했습니다."}</p>
      </>
    );
  }

  return <p>{transcript ?? (transcriptStatus === "AVAILABLE" ? "스크립트를 불러오는 중입니다." : "STT 처리 대기 중입니다.")}</p>;
}

function FollowUpQuestionList({ questions }: { questions: CandidateReportAnswerView["followUpQuestions"] }) {
  if (!questions.length) {
    return null;
  }

  return (
    <div className="report-follow-up-list">
      <strong>꼬리질문</strong>
      <ul>
        {questions.map((question) => (
          <li key={question.followUpId}>
            <span>{question.content}</span>
            <small>{question.policy} · {formatStatusLabel(question.generationStatus)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceList({ evidences, criterionName }: { evidences: CandidateReportEvidenceView[]; criterionName?: string }) {
  if (!evidences.length) {
    return null;
  }

  return (
    <div className="report-evidence-list">
      <strong>평가 근거</strong>
      <ul>
        {evidences.map((evidence) => (
          <li key={evidence.evidenceId}>
            <span>{formatEvidenceSummary(evidence, criterionName)}</span>
            {evidence.evidenceText ? (
              <p className="report-evidence-list__answer">{formatEvidenceReference(evidence)}</p>
            ) : null}
            <small>{formatEvidenceSourceLabel(evidence)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatEvidenceSummary(evidence: CandidateReportEvidenceView, criterionName?: string): string {
  const focus = formatCriterionEvidenceFocus(criterionName);
  const source = formatEvidenceSourceNoun(evidence.sourceType);
  return `${focus} ${source}를 참고했습니다.`;
}

function formatCriterionEvidenceFocus(criterionName?: string): string {
  const labels: Record<string, string> = {
    "직무 적합성": "JD와 답변 경험의 연결성을 판단하는 데",
    "직무/기술 역량": "JD와 답변 경험의 연결성을 판단하는 데",
    "문제 해결력": "문제를 나누어 확인한 과정을 판단하는 데",
    "실행력과 성과": "직접 수행한 작업과 결과를 판단하는 데",
    "학습 민첩성": "학습한 내용을 실제 문제에 적용한 흐름을 판단하는 데",
    "협업/커뮤니케이션": "상황 설명과 협업 방식을 판단하는 데",
    "커뮤니케이션": "상황 설명과 협업 방식을 판단하는 데",
    "학습/성장성": "학습한 내용을 실제 문제에 적용한 흐름을 판단하는 데",
    "책임감/신뢰성": "회고와 개선 가능성을 판단하는 데",
    "성장 가능성": "회고와 개선 가능성을 판단하는 데",
  };

  return criterionName ? labels[criterionName] ?? `${criterionName} 항목을 판단하는 데` : "답변 흐름을 확인하는 데";
}

function formatEvidenceReference(evidence: CandidateReportEvidenceView): string {
  const answerLabel = evidence.answerId ? "관련 답변" : "참고 자료";
  return `${answerLabel}: "${shortenReportEvidence(evidence.evidenceText)}"`;
}

function getReportScoreBand(score: number): { label: string; range: string; description: string } {
  if (score >= 90) {
    return { label: "매우 우수", range: "90~100", description: "근거가 풍부하고 결과와 재발 방지까지 명확합니다." };
  }
  if (score >= 80) {
    return { label: "우수", range: "80~89", description: "상황, 행동, 결과가 비교적 구체적으로 연결됩니다." };
  }
  if (score >= 70) {
    return { label: "보통 이상", range: "70~79", description: "핵심 경험은 확인되지만 일부 근거 보강이 필요합니다." };
  }
  if (score >= 60) {
    return { label: "보완 필요", range: "60~69", description: "상황은 있으나 본인 역할, 과정, 결과가 부족합니다." };
  }
  return { label: "부족", range: "0~59", description: "질문과 직접 연결되는 평가 근거가 부족합니다." };
}

function formatEvidenceSourceNoun(sourceType: string): string {
  const labels: Record<string, string> = {
    INTERVIEW_ANSWER: "면접 답변",
    APPLICATION_DOCUMENT: "제출 자료",
    DOCUMENT: "제출 자료",
    FOLLOW_UP: "꼬리질문 답변",
  };

  return labels[sourceType] ?? "평가 자료";
}

function shortenReportEvidence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function formatEvidenceSourceLabel(evidence: CandidateReportEvidenceView): string {
  const labels: Record<string, string> = {
    INTERVIEW_ANSWER: "면접 답변 기반",
    APPLICATION_DOCUMENT: "제출 자료 기반",
    DOCUMENT: "제출 자료 기반",
    FOLLOW_UP: "꼬리질문 답변 기반",
  };

  return labels[evidence.sourceType] ?? "평가 자료 기반";
}

async function requestMockReportGenerationAfterComplete(reportId: number): Promise<void> {
  try {
    await getCandidateApi().requestMockReportGeneration(reportId);
  } catch {
    return;
  }
}

async function prepareAnswerRequestWithUploadedMedia(
  api: InterviewRuntimeApiClient,
  sessionId: number,
  request: SaveInterviewAnswerRequest,
): Promise<SaveInterviewAnswerRequest> {
  const videoFileId =
    request.videoFileId ??
    (request.videoFile ? (await uploadCachedRuntimeMedia(api, sessionId, request.videoFile)).fileId : undefined);
  const audioFileId =
    request.audioFileId ??
    (request.audioFile ? (await uploadCachedRuntimeMedia(api, sessionId, request.audioFile)).fileId : undefined);

  return {
    questionId: request.questionId,
    videoFileId,
    audioFileId,
    durationSeconds: request.durationSeconds,
    allowReanswer: request.allowReanswer,
    skipReason: request.skipReason,
    retryAnswerId: request.retryAnswerId,
  };
}

async function uploadCachedRuntimeMedia(
  api: InterviewRuntimeApiClient,
  sessionId: number,
  file: RuntimeFileAssetRequest,
): Promise<CandidateFileAsset> {
  const cached = getCachedRecordingEntry(file.storageKey);
  if (!cached) {
    throw new Error("녹음 파일 Blob을 찾지 못했습니다. 답변을 다시 녹음한 뒤 제출해주세요.");
  }

  const uploadFile = new File([cached.blob], file.originalName, { type: file.mimeType });
  const uploaded = (await api.uploadInterviewMedia(sessionId, uploadFile)).data;
  cacheUploadedInterviewBlob(uploaded, cached.blob);
  return uploaded;
}

function buildAiInterviewRequest(
  processType: AiInterviewHandoffResponse["processType"],
  answer: LastSavedAnswer,
  jobDescription: string | undefined,
  mode: RuntimeMode,
): AiInterviewRequest {
  if (processType === "STT") {
    const audioFileId = answer.audioFileId ?? answer.fileAssetId ?? answer.videoFileId;
    const audioS3Key = answer.audioS3Key ?? answer.videoS3Key;

    if (!audioFileId || !audioS3Key) {
      throw new Error("STT 요청에 필요한 녹음 파일 정보가 없습니다. 답변 녹음을 다시 완료해 주세요.");
    }

    return compactPayload({
      answerId: answer.answerId,
      audioFileId,
      audioS3Key,
    }) as AiInterviewRequest;
  }

  return compactPayload({
    answerId: answer.answerId,
    previousQuestion: answer.questionText,
    transcript: answer.transcript,
    jobDescription: mode === "recruiting" ? jobDescription : undefined,
  }) as AiInterviewRequest;
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
}

async function pollAiJobUntilSettled(processLogId: number): Promise<AiJobStatusResponse> {
  const api = getCandidateApi();
  let latest = (await api.getAiJobStatus(processLogId)).data;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (latest.status === "COMPLETED" || latest.status === "FAILED") {
      return latest;
    }
    await sleep(700);
    latest = (await api.getAiJobStatus(processLogId)).data;
  }

  return latest;
}

function extractAiJobText(output: unknown, keys: string[]): string | undefined {
  const parsed = parseAiJobOutput(output);
  if (!isRecord(parsed)) {
    return undefined;
  }

  for (const key of keys) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function parseAiJobOutput(output: unknown): unknown {
  if (typeof output !== "string") {
    return output;
  }

  try {
    return JSON.parse(output) as unknown;
  } catch {
    return output;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function RecruitingReportFallbackView({
  status,
  reportError,
}: {
  status?: CandidateApplicationStatusView;
  reportError?: string;
}) {
  const view = getRecruitingReportFallbackView(status, reportError);

  return (
    <div className="candidate-report-state">
      <div className={`candidate-report-state__badge ${view.tone}`}>{view.badge}</div>
      <div>
        <h3>{view.title}</h3>
        <p>{view.description}</p>
      </div>
      {status ? (
        <dl className="candidate-report-state__meta">
          <Definition label="면접 상태" value={<StatusPill value={status.interviewStatus} />} />
          <Definition label="리포트 상태" value={<StatusPill value={status.reportStatus} />} />
          <Definition label="세션 ID" value={status.sessionId} />
          <Definition label="지원서 ID" value={status.applicationId} />
        </dl>
      ) : null}
      {view.helper ? <p className="candidate-report-state__helper">{view.helper}</p> : null}
    </div>
  );
}

function getRecruitingReportFallbackView(
  status?: CandidateApplicationStatusView,
  reportError?: string,
): {
  badge: string;
  title: string;
  description: string;
  helper?: string;
  tone: "waiting" | "progress" | "blocked";
} {
  if (!status) {
    return {
      badge: "확인 필요",
      title: "결과 상태를 불러오지 못했습니다.",
      description: reportError ?? "지원서 상태를 다시 불러온 뒤 결과를 확인해주세요.",
      tone: "blocked",
    };
  }

  if (status.interviewStatus !== "COMPLETED") {
    return {
      badge: "면접 진행 전",
      title: "면접 완료 후 결과가 생성됩니다.",
      description: "채용 AI 면접을 끝까지 제출하면 분석 요청 상태로 전환됩니다.",
      helper: reportError,
      tone: "waiting",
    };
  }

  if (status.reportStatus === "PENDING") {
    return {
      badge: "분석 대기",
      title: "면접 답변은 제출됐고 분석 대기 중입니다.",
      description: "E AI 리포트 파이프라인이 연결되면 이 지원서의 답변 파일을 기준으로 리포트 생성이 시작됩니다.",
      helper: reportError,
      tone: "waiting",
    };
  }

  if (status.reportStatus === "GENERATING") {
    return {
      badge: "생성 중",
      title: "면접 분석이 진행 중입니다.",
      description: "지원자 화면에는 공개 가능한 제한 결과만 표시됩니다. 기업용 상세 점수와 내부 메모는 노출하지 않습니다.",
      helper: "잠시 후 새로고침하면 생성 상태를 다시 확인할 수 있습니다.",
      tone: "progress",
    };
  }

  if (status.reportStatus === "FAILED") {
    return {
      badge: "조회 불가",
      title: "리포트를 준비하지 못했습니다.",
      description: "분석 처리에 실패했거나 결과를 표시할 수 없는 상태입니다.",
      helper: reportError ?? "팀 통합 후 AI 리포트 처리 상태를 다시 확인해주세요.",
      tone: "blocked",
    };
  }

  return {
    badge: "확인 필요",
    title: "결과를 불러오는 중 문제가 발생했습니다.",
    description: "리포트 상태는 완료로 보이지만 결과 응답을 받지 못했습니다.",
    helper: reportError,
    tone: "blocked",
  };
}

function formatInterviewCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function isQuestionSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function findKoreanSpeechVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "ko-kr") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("ko")) ??
    voices.find((voice) => voice.default)
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="candidate-section-title">{title}</h3>
      {items.length ? (
        <ul className="candidate-feature__tags">
          {items.map((item, index) => <li key={`${title}-${index}-${item}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="empty">표시할 항목이 없습니다.</p>
      )}
    </div>
  );
}

function Definition({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatusPill({ value }: { value: ReactNode }) {
  const text = String(value);
  const tone = getStatusTone(text);
  return <span className={`badge ${tone}`}>{formatStatusLabel(text)}</span>;
}

function getStatusTone(value: string): "success" | "warning" | "neutral" {
  const successValues = new Set([
    "ANSWERED",
    "COMPLETED",
    "EXTRACTED",
    "INTERVIEW_DONE",
    "OPEN",
    "PASSED",
    "READY",
    "START_READY",
    "SUBMITTED",
    "응시 가능",
  ]);
  const warningValues = new Set([
    "CURRENT",
    "EXTRACTING",
    "GENERATING",
    "IN_PROGRESS",
    "IN_REVIEW",
    "INTERVIEW_WAITING",
    "NOT_READY",
    "NOT_SUBMITTED",
    "PENDING",
    "PREP_REQUIRED",
    "WAITING",
    "응시 대기",
  ]);

  if (successValues.has(value)) return "success";
  if (warningValues.has(value)) return "warning";
  return "neutral";
}

function formatStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    ACTIVE: "활성",
    ANSWERED: "답변 완료",
    APPLIED: "지원 완료",
    ARCHIVED: "보관",
    CLOSED: "마감",
    COMPLETED: "완료",
    CURRENT: "현재 질문",
    DRAFT: "임시저장",
    EXTRACTED: "추출 완료",
    EXTRACTING: "추출 중",
    FAILED: "실패",
    GENERATING: "생성 중",
    IN_PROGRESS: "진행 중",
    IN_REVIEW: "검토 중",
    INTERVIEW_DONE: "면접 완료",
    INTERVIEW_WAITING: "면접 대기",
    INVITED: "초대됨",
    NOT_READY: "준비 전",
    NOT_SUBMITTED: "미제출",
    OPEN: "공개",
    PASSED: "통과",
    PENDING: "대기",
    PREP_REQUIRED: "준비 필요",
    READY: "준비 완료",
    REJECTED: "반려",
    START_READY: "응시 가능",
    SUBMITTED: "제출 완료",
    CANCELED: "취소",
    WAITING: "대기",
    "채용 리포트": "채용 리포트",
    "지원자 제한 조회": "지원자 제한 조회",
    "응시 가능": "응시 가능",
    "응시 대기": "응시 대기",
  };

  return labels[value] ?? value;
}

function formatQuestionTypeLabel(questionType?: string): string {
  const labels: Record<string, string> = {
    INTRO: "자기소개",
    TECHNICAL: "기술 질문",
    EXPERIENCE: "경험 질문",
    SITUATION: "상황 질문",
    CLOSING: "마무리",
    INTERVIEW: "면접",
  };

  return questionType ? labels[questionType] ?? questionType : "면접";
}

function formatConsentTypeLabel(consentType: string): string {
  const labels: Record<string, string> = {
    PRIVACY_COLLECTION: "개인정보 수집·이용 동의",
    AI_DOCUMENT_ANALYSIS: "이력서/포트폴리오 AI 분석 동의",
    AI_INTERVIEW_RECORDING: "AI 면접 녹화·녹음 안내 확인",
  };

  return labels[consentType] ?? consentType;
}

function formatInterviewTypeLabel(interviewType: string): string {
  const labels: Record<string, string> = {
    MOCK: "모의면접",
    RECRUITING: "채용 면접",
  };

  return labels[interviewType] ?? interviewType;
}

function paymentStatusLabel(status: PaymentOrder["status"]) {
  const labels: Record<PaymentOrder["status"], string> = {
    READY: "대기",
    IN_PROGRESS: "승인 중",
    DONE: "승인 완료",
    FAILED: "실패",
    CANCELED: "취소",
    PARTIAL_CANCELED: "부분 취소",
  };
  return labels[status];
}

function paymentStatusTone(status: PaymentOrder["status"]) {
  if (status === "DONE") return "success";
  if (status === "FAILED" || status === "CANCELED") return "danger";
  if (status === "READY" || status === "IN_PROGRESS") return "warning";
  return "neutral";
}

function pickDeviceTestSentence(): string {
  return DEVICE_TEST_SENTENCES[Math.floor(Math.random() * DEVICE_TEST_SENTENCES.length)] ?? DEVICE_TEST_SENTENCES[0];
}

function CameraFramingOverlay({ state, testSentence }: { state: CameraFramingState; testSentence: string }) {
  return (
    <div className={`camera-framing-overlay ${state === "warn" ? "warn" : ""}`}>
      <span className="camera-framing-overlay__face" />
      <span className="camera-framing-overlay__shoulders" />
      <span className="camera-framing-overlay__center" />
      <span className="camera-framing-overlay__label">
        {state === "warn" ? "얼굴을 가이드 안으로 맞춰주세요" : "얼굴과 상반신을 선 안에 맞춰주세요"}
      </span>
      <span className="camera-framing-overlay__prompt" aria-label="마이크 테스트 문장">
        <span>마이크 테스트 문장</span>
        <strong>{testSentence}</strong>
      </span>
    </div>
  );
}

function isRuntimeShortcutIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function useCandidateResource<T>(load: () => Promise<T>, dependencies: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    load()
      .then((data) => {
        if (alive) setState({ data, loading: false });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error: toErrorMessage(error) });
      });
    return () => {
      alive = false;
    };
    // The dependency list is supplied by each caller, mirroring React's hook API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey, ...dependencies]);

  return { ...state, refresh };
}

function getCandidateApi() {
  return createCandidateApiClient({
    baseUrl: getApiBaseUrl(),
    headers: getCandidateHeaders(),
  });
}

export function setPublicInterviewAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.sessionStorage.setItem(PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY, token);
    return;
  }
  window.sessionStorage.removeItem(PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY);
}

function getPublicInterviewApi() {
  return createPublicInterviewApiClient({
    baseUrl: getApiBaseUrl(),
    publicAccessToken: readPublicInterviewAccessToken(),
  });
}

function readPublicInterviewAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY);
}

function getCandidateHeaders(): HeadersInit {
  const token = readAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

function readAccessToken(): string | null {
  return getAccessToken();
}

function getCurrentCandidateId(): number {
  const token = readAccessToken();
  if (!token) return DEMO_CANDIDATE_ID;

  try {
    const [, payload] = token.split(".");
    if (!payload) return DEMO_CANDIDATE_ID;
    const decoded = JSON.parse(window.atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { candidateId?: number };
    return decoded.candidateId ?? DEMO_CANDIDATE_ID;
  } catch {
    return DEMO_CANDIDATE_ID;
  }
}

function toRecruitingRuntimeSession(
  runtime: CandidateInterviewRuntimeView,
  questions: RuntimeQuestionListResponse,
): RuntimePageSession {
  const currentQuestion =
    questions.questions.find((question) => question.current) ??
    questions.questions.find((question) => question.questionId === questions.currentQuestionId) ??
    questions.questions.find((question) => !question.answered);

  return {
    sessionId: runtime.sessionId,
    applicationId: runtime.applicationId,
    interviewType: runtime.interviewType,
    status: runtime.status,
    showQuestionText: runtime.showQuestionText,
    canRecord: runtime.canRecord,
    ...(runtime.jobDescription ? { jobDescription: runtime.jobDescription } : {}),
    ...(runtime.timePolicy ? { timePolicy: runtime.timePolicy } : {}),
    totalQuestions: questions.questions.length,
    answeredCount: questions.questions.filter((question) => question.answered).length,
    currentQuestion,
    nextQuestionEndpoint: runtime.nextQuestionEndpoint,
    answerUploadEndpoint: runtime.answerUploadEndpoint,
  };
}

function getRuntimeAnswerTimeLimitSeconds(runtime?: Pick<RuntimePageSession, "timePolicy">) {
  const answerTimeSec = runtime?.timePolicy?.answerTimeSec;
  return typeof answerTimeSec === "number" && Number.isFinite(answerTimeSec) && answerTimeSec > 0
    ? answerTimeSec
    : DEFAULT_INTERVIEW_QUESTION_TIME_LIMIT_SECONDS;
}

function getRuntimePreparationTimeLimitSeconds(runtime?: Pick<RuntimePageSession, "interviewType" | "timePolicy">) {
  const preparationTimeSec = runtime?.timePolicy?.preparationTimeSec;
  if (typeof preparationTimeSec === "number" && Number.isFinite(preparationTimeSec) && preparationTimeSec > 0) {
    return preparationTimeSec;
  }

  return runtime?.interviewType === "MOCK" ? DEFAULT_MOCK_INTERVIEW_PREPARATION_TIME_LIMIT_SECONDS : 0;
}

function resetRuntimeQuestionTimer(
  runtime: Pick<RuntimePageSession, "interviewType" | "timePolicy"> | undefined,
  setTimerPhase: (phase: RuntimeTimerPhase) => void,
  setRemainingSeconds: (seconds: number) => void,
) {
  const preparationTimeSec = getRuntimePreparationTimeLimitSeconds(runtime);
  if (preparationTimeSec > 0) {
    setTimerPhase("PREPARING");
    setRemainingSeconds(preparationTimeSec);
    return;
  }

  setTimerPhase("ANSWERING");
  setRemainingSeconds(getRuntimeAnswerTimeLimitSeconds(runtime));
}

function getMeaningfulTranscriptLength(transcript: string) {
  return transcript.replace(/\s/g, "").length;
}

function getInterviewTranscriptRetryReason(transcript: string): string | undefined {
  const normalized = transcript.trim();
  const meaningfulLength = getMeaningfulTranscriptLength(normalized);
  if (!normalized || normalized.includes("[NO_ANSWER]")) {
    return "답변 녹음이 정상적으로 저장되지 않았습니다.";
  }

  if (meaningfulLength < MIN_STT_TRANSCRIPT_MEANINGFUL_LENGTH) {
    return `STT 텍스트가 ${MIN_STT_TRANSCRIPT_MEANINGFUL_LENGTH}자 미만이라 답변 내용이 충분하지 않습니다.`;
  }

  return undefined;
}

type WindowWithWebkitAudioContext = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function warmUpInterviewAudioOutput() {
  if (typeof window === "undefined") return;

  if (isQuestionSpeechSupported() && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.lang = "ko-KR";
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }

  const AudioContextConstructor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const audioContext = new AudioContextConstructor();
    const gain = audioContext.createGain();
    const oscillator = audioContext.createOscillator();
    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.01);
    void audioContext.resume().finally(() => {
      window.setTimeout(() => {
        void audioContext.close().catch(() => undefined);
      }, 50);
    });
  } catch {
    // Some browsers reject AudioContext creation until a later user gesture.
  }
}

function playAnswerStartCue() {
  if (typeof window === "undefined") return;

  const AudioContextConstructor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
  if (!AudioContextConstructor) return;

  const audioContext = new AudioContextConstructor();
  const now = audioContext.currentTime;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
  gain.connect(audioContext.destination);

  const first = audioContext.createOscillator();
  first.type = "sine";
  first.frequency.setValueAtTime(880, now);
  first.connect(gain);
  first.start(now);
  first.stop(now + 0.16);

  const second = audioContext.createOscillator();
  second.type = "sine";
  second.frequency.setValueAtTime(1174.66, now + 0.16);
  second.connect(gain);
  second.start(now + 0.16);
  second.stop(now + 0.42);

  void audioContext.resume().catch(() => undefined);
  window.setTimeout(() => {
    void audioContext.close().catch(() => undefined);
  }, 650);
}

function createRuntimeFileAssetFromMetadata(
  originalName: string,
  mimeType: string,
  sizeBytes: number,
): RuntimeFileAssetRequest | undefined {
  const normalizedMimeType = normalizeInterviewMediaMimeType(mimeType);
  if (!normalizedMimeType) return undefined;
  return {
    storageKey: `candidate/${getCurrentCandidateId()}/interviews/${Date.now()}-${safeFileName(originalName)}`,
    originalName,
    mimeType: normalizedMimeType,
    sizeBytes,
  };
}

function cacheRecordedInterviewBlob(file: RuntimeFileAssetRequest | undefined, blob: Blob) {
  if (!file || typeof window === "undefined") return;

  const cache = getCandidateRecordingCache();
  const existing = cache.get(file.storageKey);
  if (existing) {
    URL.revokeObjectURL(existing.url);
  }

  cache.set(file.storageKey, {
    url: URL.createObjectURL(blob),
    blob,
    mimeType: file.mimeType,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    createdAt: Date.now(),
  });
}

function cacheUploadedInterviewBlob(file: CandidateFileAsset, blob: Blob) {
  if (typeof window === "undefined") return;

  const cache = getCandidateRecordingCache();
  const existing = cache.get(file.storageKey);
  if (existing) {
    URL.revokeObjectURL(existing.url);
  }

  cache.set(file.storageKey, {
    url: URL.createObjectURL(blob),
    blob,
    mimeType: file.mimeType,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    createdAt: Date.now(),
  });
}

function getCachedRecordingEntry(storageKey?: string): CandidateRecordingCacheEntry | undefined {
  if (!storageKey || typeof window === "undefined") return undefined;
  return getCandidateRecordingCache().get(storageKey);
}

function getCachedRecordingObjectUrl(storageKey?: string): string | undefined {
  if (!storageKey || typeof window === "undefined") return undefined;
  return getCandidateRecordingCache().get(storageKey)?.url;
}

function getCandidateRecordingCache(): Map<string, CandidateRecordingCacheEntry> {
  const cacheWindow = window as CandidateRecordingCacheWindow;
  cacheWindow.__candidateRecordingCache ??= new Map<string, CandidateRecordingCacheEntry>();
  return cacheWindow.__candidateRecordingCache;
}

function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
    "audio/mp4",
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function safeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "answer";
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function startCameraQualityMonitor(
  video: HTMLVideoElement,
  previewInfo: CameraPreviewInfo,
  fallbackLabel: string | undefined,
  onQualityChange: (quality: CameraQualityResult, framing: CameraFramingResult, status: string) => void,
): number {
  const update = async () => {
    const quality = assessCameraQuality(video);
    const framing = getCameraFramingNotice();
    onQualityChange(quality, framing, formatCameraPreviewStatus(previewInfo, fallbackLabel, quality, framing));
  };

  void update();
  return window.setInterval(update, 600);
}

async function getCameraMediaStream(cameraDeviceId = "", microphoneDeviceId = ""): Promise<CameraStreamResult> {
  const videoAttempts: Array<MediaTrackConstraints | boolean> = cameraDeviceId
    ? [{ deviceId: { ideal: cameraDeviceId } }, true]
    : [{ facingMode: "user" }, true];
  const audioAttempts: Array<MediaTrackConstraints | boolean> = microphoneDeviceId
    ? [
        {
          deviceId: { ideal: microphoneDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        true,
      ]
    : [{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }, true];
  let lastError: unknown;
  let lastAudioError: unknown;

  for (const video of videoAttempts) {
    for (const audio of audioAttempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
        const [audioTrack] = stream.getAudioTracks();
        return {
          stream,
          audioEnabled: Boolean(audioTrack),
          audioLabel: audioTrack?.label,
          audioState: audioTrack?.readyState,
        };
      } catch (errorWithAudio) {
        lastAudioError = errorWithAudio;
        lastError = errorWithAudio;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      return {
        stream,
        audioEnabled: false,
        audioError: lastAudioError,
        fallbackLabel: `마이크 연결 실패: ${formatMediaError(lastAudioError, "microphone")} 카메라만 연결했습니다.`,
      };
    } catch (errorWithoutAudio) {
      lastError = errorWithoutAudio;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("카메라 연결에 실패했습니다.");
}

async function probeMicrophone(microphoneDeviceId = ""): Promise<MicrophoneProbeResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: new Error("이 브라우저에서는 마이크를 사용할 수 없습니다.") };
  }

  try {
    const audio = microphoneDeviceId ? { deviceId: { ideal: microphoneDeviceId } } : true;
    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio });
    const [track] = stream.getAudioTracks();
    const result: MicrophoneProbeResult = {
      ok: Boolean(track),
      label: track?.label,
      state: track?.readyState,
    };
    stopMediaStream(stream);
    return result;
  } catch (error) {
    return { ok: false, error };
  }
}

async function attachMediaStreamToVideo(video: HTMLVideoElement, stream: MediaStream): Promise<CameraPreviewInfo> {
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = null;
  video.srcObject = stream;

  await waitForVideoMetadata(video);
  await playVideoWithTimeout(video);
  await waitForVideoFrame(video);

  const [track] = stream.getVideoTracks();
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    trackLabel: track?.label,
    trackState: track?.readyState,
  };
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("canplay", done);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const timeoutId = window.setTimeout(done, 1500);
    video.addEventListener("loadedmetadata", done, { once: true });
    video.addEventListener("canplay", done, { once: true });
  });
}

async function playVideoWithTimeout(video: HTMLVideoElement): Promise<void> {
  await Promise.race([
    video.play(),
    new Promise<void>((_, reject) =>
      window.setTimeout(() => reject(new Error("카메라 화면 재생 시간이 초과되었습니다. 카메라/마이크 점검을 다시 눌러주세요.")), 2000),
    ),
  ]);
}

async function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
  }
}

function assertCameraPreviewHasFrame(info?: CameraPreviewInfo): asserts info is CameraPreviewInfo {
  if (!info || info.width <= 0 || info.height <= 0) {
    throw new Error("카메라가 연결됐지만 영상 화면이 표시되지 않습니다. 브라우저 권한을 허용한 뒤 카메라/마이크 점검을 다시 눌러주세요.");
  }
}

function assessCameraQuality(video: HTMLVideoElement | null): CameraQualityResult {
  if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return { ok: false, message: "카메라 화면을 확인할 수 없습니다." };
  }

  const canvas = document.createElement("canvas");
  const width = 32;
  const height = 18;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { ok: true, message: "카메라 화면이 표시됩니다." };
  }

  context.drawImage(video, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += (data[index] + data[index + 1] + data[index + 2]) / 3;
  }

  const brightness = Math.round(total / (data.length / 4));
  if (brightness < 40) {
    return { ok: false, brightness, message: "카메라 화면이 어둡습니다. 조명을 켜거나 밝은 곳으로 이동해주세요." };
  }
  if (brightness > 225) {
    return { ok: false, brightness, message: "카메라 화면이 너무 밝습니다. 강한 역광이나 조명을 조정해주세요." };
  }

  return { ok: true, brightness, message: "카메라 밝기가 적정합니다." };
}

function getCameraFramingNotice(): CameraFramingResult {
  return {
    state: "unsupported",
    blocking: false,
    message: "구도 자동 판정 없이 화면 가이드만 표시합니다.",
  };
}

async function measureMicrophoneQuality(
  stream: MediaStream,
  onLevel?: (level: number) => void,
): Promise<MicrophoneQualityResult> {
  const [audioTrack] = stream.getAudioTracks();
  if (!audioTrack || audioTrack.readyState !== "live") {
    return { ok: false, peakLevel: 0, message: "마이크 입력을 확인할 수 없습니다." };
  }

  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) {
    return { ok: false, peakLevel: 0, message: "이 브라우저에서는 마이크 입력 품질을 측정할 수 없습니다." };
  }

  const audioContext = new AudioContextConstructor();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.frequencyBinCount);
  let peakLevel = 0;
  const startedAt = Date.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      samples.forEach((sample) => {
        peak = Math.max(peak, Math.abs(sample - 128));
      });
      const level = Math.min(100, Math.round((peak / 128) * 100));
      peakLevel = Math.max(peakLevel, level);
      onLevel?.(level);

      if (Date.now() - startedAt >= 1800) {
        resolve();
        return;
      }

      window.requestAnimationFrame(tick);
    };

    tick();
  });

  await audioContext.close();

  if (peakLevel <= 5) {
    return { ok: false, peakLevel, message: "마이크 입력이 감지되지 않습니다. 테스트 문장을 소리 내어 읽어주세요." };
  }
  if (peakLevel < 20) {
    return { ok: false, peakLevel, message: "마이크 입력이 너무 작습니다. 마이크를 가까이 두거나 입력 장치를 확인해주세요." };
  }
  if (peakLevel > 85) {
    return { ok: false, peakLevel, message: "마이크 입력이 너무 큽니다. 마이크를 조금 멀리 두거나 입력 볼륨을 낮춰주세요." };
  }

  return { ok: true, peakLevel, message: "마이크 입력이 적정합니다." };
}

async function checkInterviewNetworkQuality(): Promise<NetworkQualityResult> {
  if (!navigator.onLine) {
    return { ok: false, message: "네트워크 연결이 끊겨 있습니다." };
  }

  const healthUrl = `${getApiBaseUrl()}/api/v1/health`;
  let successCount = 0;
  let totalDurationMs = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 1500);
    const startedAt = performance.now();
    try {
      const response = await fetch(healthUrl, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        successCount += 1;
        totalDurationMs += performance.now() - startedAt;
      }
    } catch {
      // Failed attempts are reflected in successCount.
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  if (successCount < 2) {
    return { ok: false, message: "네트워크 확인이 불안정합니다. 연결 상태를 확인해주세요." };
  }

  const averageMs = Math.round(totalDurationMs / successCount);
  if (averageMs > 1000) {
    return { ok: false, message: `네트워크 응답이 느립니다. 평균 ${averageMs}ms` };
  }

  return { ok: true, message: `네트워크 정상 · 평균 ${averageMs}ms` };
}

function formatCameraPreviewStatus(
  info?: CameraPreviewInfo,
  fallbackLabel?: string,
  quality?: CameraQualityResult,
  framing?: CameraFramingResult,
): string {
  if (!info) return "카메라 연결됨";
  const size = info.width > 0 && info.height > 0 ? `${info.width}x${info.height}` : "프레임 없음";
  const label = info.trackLabel || "선택된 카메라";
  const brightness = quality?.brightness === undefined ? undefined : `밝기 ${quality.brightness}`;
  return [label, size, info.trackState ?? "live", brightness, quality?.message, framing?.message, fallbackLabel]
    .filter(Boolean)
    .join(" · ");
}

function formatMicrophoneStatus(result: CameraStreamResult): string {
  if (result.audioEnabled) {
    return `${result.audioLabel || "선택된 마이크"} · ${result.audioState ?? "live"}`;
  }
  return `마이크 실패: ${formatMediaError(result.audioError, "microphone")}`;
}

function formatMicrophoneQualityStatus(result: CameraStreamResult, quality: MicrophoneQualityResult): string {
  const label = result.audioLabel || "선택된 마이크";
  const state = result.audioState ?? "live";
  return `${label} · ${state} · 입력 ${quality.peakLevel}% · ${quality.message}`;
}

function formatMicrophoneProbeStatus(result: MicrophoneProbeResult): string {
  if (result.ok) {
    return `${result.label || "선택된 마이크"} · ${result.state ?? "live"} · 카메라 권한 대기`;
  }
  return `마이크 연결 실패: ${formatMediaError(result.error, "microphone")}`;
}

function formatMediaError(error: unknown, device: "camera" | "microphone" = "camera"): string {
  const label = device === "microphone" ? "마이크" : "카메라";
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return `브라우저 ${label} 권한이 차단되어 있습니다. 주소창 권한 설정에서 허용한 뒤 다시 시도해주세요.`;
    if (error.name === "NotFoundError") return `사용 가능한 ${label} 장치를 찾지 못했습니다.`;
    if (error.name === "NotReadableError") return `다른 앱이 ${label}를 사용 중이거나 장치를 읽을 수 없습니다.`;
    if (error.name === "OverconstrainedError") return `선택한 ${label} 조건을 만족하는 장치를 찾지 못했습니다.`;
    return `${error.name}: ${error.message}`;
  }
  return error instanceof Error ? error.message : `${label} 연결에 실패했습니다.`;
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((current) => current !== value) : [...values, value];
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof CandidateApiError) {
    if (error.status === 401) return "로그인 후 이용해주세요. 지원자 계정으로 로그인하면 본인 지원현황과 면접 세션만 표시됩니다.";
    if (error.body?.error.code === "REPORT_NOT_READY") return "면접 분석이 아직 준비 중입니다. 잠시 후 다시 확인해주세요.";
    return error.body?.error.message ?? error.message;
  }
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
}
