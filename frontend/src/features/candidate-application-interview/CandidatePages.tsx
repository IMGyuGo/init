"use client";

import "./CandidatePages.module.css";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DependencyList, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAccessToken } from "../../api/client";
import { GnbAvatar, GnbLogoutButton } from "../auth/GnbAccountControls";
import {
  CandidateApiError,
  type AiInterviewHandoffResponse,
  type AiInterviewRequest,
  type AiJobStatusResponse,
  type CandidateApplicationStatusView,
  type CandidateApplicationSummary,
  type CandidateFileAsset,
  type CandidateInterviewRuntimeView,
  type CandidateJobQuery,
  type CandidateMockInterviewHistoryItem,
  type CandidateReportGenerationHandoff,
  type CandidateAiProcessView,
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
  type CandidateApplicationFormState,
  type CandidateDeviceCheckState,
  type CandidateInterviewConsentState,
  type CandidatePortfolioLinkFormState,
  type CandidateResumeUploadState,
  type InterviewAnswerFormState,
  type StartMockInterviewState,
  defaultApplicationFormState,
  defaultCandidateJobQuery,
  defaultDeviceCheckState,
  defaultInterviewAnswerFormState,
  defaultInterviewConsentState,
  defaultPortfolioLinkFormState,
  defaultStartMockInterviewState,
  createResumeUploadStateFromFile,
  getCandidateApplicationReportHref,
  getMockReportHref,
  inferPortfolioLinkType,
  isAllowedInterviewMediaMimeType,
  requiredInterviewConsents,
  shouldShowInterviewDeviceSetup,
  toDeviceCheckRequest,
  toCreatePortfolioLinkRequest,
  toRuntimeQuestionSpeechText,
  toSaveInterviewAnswerRequest,
  toSaveInterviewConsentRequest,
  toStartMockInterviewRequest,
  toUploadResumeRequest,
} from "./view-model";
import { CandidateApplicationView, CandidateJobDetailView, CandidateJobsView } from "./views";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const DEMO_CANDIDATE_ID = 1;
export const PUBLIC_INTERVIEW_ACCESS_TOKEN_STORAGE_KEY = "init.publicInterviewAccessToken";
const INTERVIEW_QUESTION_TIME_LIMIT_SECONDS = 90;
const questionTypeOptions: QuestionType[] = ["INTRO", "TECHNICAL", "EXPERIENCE", "SITUATION", "CLOSING"];

type CandidateNavSection = "jobs" | "applications" | "interview" | "reports" | "mypage";
type AsyncState<T> = {
  data?: T;
  loading: boolean;
  error?: string;
};
type RuntimeMode = "mock" | "recruiting";
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
  insertStatus?: AutoAiStepStatus;
  sttProcessLogId?: number;
  followUpProcessLogId?: number;
  insertedQuestionId?: number;
  transcript?: string;
  followUpQuestion?: string;
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

export function CandidateJobsPage() {
  const [query, setQuery] = useState<CandidateJobQuery>(defaultCandidateJobQuery);
  const load = useCallback(() => getCandidateApi().listJobs(query), [query]);
  const { data, loading, error } = useCandidateResource(load, [query]);

  return (
    <CandidatePageShell active="jobs">
      <header className="candidate-jobs-head">
        <h1>채용공고</h1>
        <p>지원 가능한 채용공고를 둘러보세요.</p>
      </header>
      <StatusNotice loading={loading} error={error} />
      <CandidateJobsView
        jobs={data?.data.items ?? []}
        query={query}
        totalItems={data?.meta.page.totalItems ?? 0}
        onQueryChange={setQuery}
      />
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
      {data ? (
        <header className="candidate-apply-head">
          <h1>지원서 제출</h1>
          <p>{data.data.job.companyName} · {data.data.job.title}</p>
        </header>
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
            <Link className="btn primary lg candidate-application-start-button" href={selectedApplicationAction.href}>
              {selectedApplicationAction.label}
            </Link>
          ) : (
            <span aria-disabled="true" className="btn primary lg candidate-application-start-button">
              {selectedApplicationAction?.label ?? "진행 불가"}
            </span>
          )}
        </section>
      ) : null}
    </CandidatePageShell>
  );
}

export function CandidateInterviewGuidePage({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneFrameRef = useRef<number | null>(null);
  const [step, setStep] = useState<InterviewGuideStep>("guide");
  const [consentState, setConsentState] = useState<CandidateInterviewConsentState>(defaultInterviewConsentState);
  const [deviceState, setDeviceState] = useState<CandidateDeviceCheckState>(defaultDeviceCheckState);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [cameraPreviewStatus, setCameraPreviewStatus] = useState("카메라 대기");
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState("마이크 대기");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
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

  useEffect(() => {
    void refreshGuideCameraDevices();
    return () => {
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
    setMessage("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("현재 브라우저에서 카메라/마이크 점검을 사용할 수 없습니다.");
      }
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
      setCameraReady(false);
      setMicrophoneReady(false);
      setCameraPreviewStatus("카메라 연결 중");
      setMicrophoneStatus("마이크 연결 중");
      const streamResult = await getCameraMediaStream(selectedCameraId, selectedMicrophoneId);
      const { stream, audioEnabled, fallbackLabel } = streamResult;
      mediaStreamRef.current = stream;
      let previewInfo: CameraPreviewInfo | undefined;
      if (videoRef.current) {
        previewInfo = await attachMediaStreamToVideo(videoRef.current, stream);
      }
      assertCameraPreviewHasFrame(previewInfo);
      setCameraReady(true);
      setMicrophoneReady(audioEnabled);
      setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo, fallbackLabel));
      setMicrophoneStatus(formatMicrophoneStatus(streamResult));
      setDeviceState({ cameraGranted: true, microphoneGranted: audioEnabled, networkStable: navigator.onLine });
      if (audioEnabled) {
        startGuideMicrophoneMeter(stream);
      } else {
        setMicrophoneLevel(0);
      }
      await refreshGuideCameraDevices();
      setMessage(
        fallbackLabel
          ? `카메라를 연결했습니다. ${fallbackLabel} 마이크 권한을 확인한 뒤 면접을 시작해주세요.`
          : "카메라와 마이크 권한을 확인했습니다. 면접 시작을 눌러주세요.",
      );
    } catch (previewError) {
      setCameraReady(false);
      stopGuideMicrophoneMeter();
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      const microphoneProbe = await probeMicrophone(selectedMicrophoneId);
      setMicrophoneReady(microphoneProbe.ok);
      setMicrophoneStatus(formatMicrophoneProbeStatus(microphoneProbe));
      setCameraPreviewStatus(`카메라 연결 실패: ${formatMediaError(previewError)}`);
      setDeviceState((current) => ({ ...current, networkStable: navigator.onLine }));
      setMessage(
        microphoneProbe.ok
          ? `${formatMediaError(previewError)} 마이크는 연결되지만 녹화를 위해 카메라 권한도 필요합니다.`
          : `${formatMediaError(previewError)} ${formatMicrophoneProbeStatus(microphoneProbe)}`,
      );
    }
  }

  async function handleStartInterview() {
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
                <div className="video-box candidate-device-preview">
                  <video ref={videoRef} autoPlay muted playsInline />
                  <div className="camera-debug">{cameraPreviewStatus}</div>
                  {!cameraReady ? (
                    <div className="vlabel">
                      <div className="vcam">⌾</div>
                      카메라 미리보기
                    </div>
                  ) : null}
                </div>
                <aside className="panel candidate-runtime-status-panel">
                  <p className="panel-title">장치 상태</p>
                  <div className="status-list">
                    <div className="status-line"><span className={cameraReady ? "ok" : "wait"}>{cameraReady ? "✓" : "!"}</span> 카메라 {cameraReady ? "정상" : "대기"}</div>
                    <div className="status-line"><span className={microphoneReady ? "ok" : "wait"}>{microphoneReady ? "✓" : "!"}</span> {microphoneStatus}</div>
                    <div className="mic-meter" aria-label={`마이크 입력 ${microphoneLevel}%`}>
                      <span style={{ width: `${microphoneLevel}%` }} />
                    </div>
                    <div className="status-line"><span className={deviceState.networkStable ? "ok" : "wait"}>{deviceState.networkStable ? "✓" : "!"}</span> 네트워크 {deviceState.networkStable ? "정상" : "확인 필요"}</div>
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
      router.push(candidateApplicationInterviewRoutes.mockInterview(result.data.sessionId));
    } catch (submitError) {
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="interview">
      <CandidatePageHead
        eyebrow="모의면접"
        title="개인 연습용 AI 모의면접"
        description="합격/탈락 판단 없이 연습 피드백만 제공합니다."
        actions={<Link className="btn secondary" href={candidateApplicationInterviewRoutes.mockReports}>리포트 보기</Link>}
      />
      <StatusNotice loading={busy} message={message} />
      <form className="panel detail-stack candidate-mock-start-form" onSubmit={handleSubmit}>
        <p className="panel-title">모의면접 설정</p>
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
        <div className="toolbar candidate-mock-start-actions">
          <button className="btn primary" type="submit" disabled={busy}>모의면접 시작</button>
        </div>
      </form>
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
  const [reportHandoff, setReportHandoff] = useState<CandidateReportGenerationHandoff>();
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

  async function handleGenerate() {
    setBusy(true);
    setMessage("");
    try {
      const result = await getCandidateApi().requestMockReportGeneration(reportId);
      setReportHandoff(result.data);
      setMessage(
        `리포트 생성 요청 준비 완료: reportId=${result.data.reportId}, sessionId=${result.data.sessionId}, answerIds=${result.data.answerIds.join(",") || "-"}, fileIds=${result.data.fileIds.join(",") || "-"}`,
      );
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
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void handleGenerate()}>
            리포트 생성 요청
          </button>
        </div>
        {data?.feedback ? <MockFeedbackView feedback={data.feedback} /> : <p className="notice danger">{data?.feedbackError ?? "피드백을 불러오지 못했습니다."}</p>}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>E 리포트 생성 연결값</h2>
            <p>리포트 생성 요청을 누르면 E 담당 AI 파이프라인에 전달할 참조값을 확인합니다.</p>
          </div>
        </div>
        {reportHandoff ? (
          <ReportGenerationHandoffView handoff={reportHandoff} />
        ) : (
          <div className="candidate-pipeline-card muted">
            <strong>리포트 생성 요청 대기</strong>
            <p>버튼을 누르면 reportId, sessionId, answerIds, fileIds가 포함된 공유용 payload가 표시됩니다.</p>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>역량별 점수</h2>
            <p>AI 리포트 점수 데이터가 연결되면 항목별 시각화를 표시합니다.</p>
          </div>
        </div>
        <div className="ph-box">현재 D 후보자 조회 API에는 역량 점수 필드가 없어, 피드백 텍스트 중심으로 표시합니다.</div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>영상 / 스크립트 동시 조회</h2>
            <p>본인 세션의 file_assets 참조만 표시합니다.</p>
          </div>
        </div>
        {data?.media ? <MockMediaView media={data.media} /> : <p className="notice danger">{data?.mediaError ?? "미디어를 불러오지 못했습니다."}</p>}
      </section>
    </CandidatePageShell>
  );
}

export function CandidateApplicationReportPage({ applicationId }: { applicationId: number }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportHandoff, setReportHandoff] = useState<CandidateReportGenerationHandoff>();
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

  async function handleGenerateApplicationReport() {
    setBusy(true);
    setMessage("");
    try {
      const result = await getCandidateApi().requestApplicationReportGeneration(applicationId);
      setReportHandoff(result.data);
      setMessage(
        `REPORT_GENERATE queued=${String(result.data.queued)} processLogId=${result.data.processLogId} reportId=${result.data.reportId}`,
      );
      refresh();
    } catch (generateError) {
      setMessage(toErrorMessage(generateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CandidatePageShell active="applications">
      <CandidatePageHead
        eyebrow="채용 결과"
        title="채용 AI 면접 결과"
        description={data?.status ? `${data.status.companyName} · ${data.status.jobTitle}` : "지원자에게 공개 가능한 제한 결과와 전형 상태만 표시합니다."}
        actions={
          <div className="toolbar">
            <StatusPill value="채용 리포트" />
            <StatusPill value="지원자 제한 조회" />
            <button
              className="btn secondary"
              type="button"
              disabled={busy || data?.status?.interviewStatus !== "COMPLETED"}
              onClick={() => void handleGenerateApplicationReport()}
            >
              AI 분석 요청
            </button>
            <button className="btn secondary" type="button" onClick={refresh}>새로고침</button>
          </div>
        }
      />
      <StatusNotice loading={loading || busy} error={error} message={message} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>전형 상태</h2>
            <p>지원서와 면접 세션 진행 상태를 확인합니다.</p>
          </div>
        </div>
        {data?.status ? <ApplicationStatusView status={data.status} /> : <p className="notice danger">{data?.statusError ?? "전형 상태를 불러오지 못했습니다."}</p>}
      </section>
      {reportHandoff ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>E 리포트 생성 연결</h2>
              <p>REPORT_GENERATE 큐 발행 결과와 worker가 참조할 ID를 확인합니다.</p>
            </div>
          </div>
          <ReportGenerationHandoffView handoff={reportHandoff} />
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>지원자용 결과</h2>
            <p>기업용 상세 점수, 평가 근거, 내부 메모는 노출하지 않습니다.</p>
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
    <CandidatePageShell active="mypage">
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
  const [answer, setAnswer] = useState<InterviewAnswerFormState>(defaultInterviewAnswerFormState);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<LastSavedAnswer>();
  const [autoAiPipeline, setAutoAiPipeline] = useState<AutoAiPipelineState>();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [cameraPreviewStatus, setCameraPreviewStatus] = useState("카메라 대기");
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState("마이크 대기");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordedFileName, setRecordedFileName] = useState("");
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [remainingSeconds, setRemainingSeconds] = useState(INTERVIEW_QUESTION_TIME_LIMIT_SECONDS);
  const [introCompleted, setIntroCompleted] = useState(false);
  const [questionSpeechCompleted, setQuestionSpeechCompleted] = useState(false);
  const [questionSpeechPlaying, setQuestionSpeechPlaying] = useState(false);
  const [questionSpeechStatus, setQuestionSpeechStatus] = useState("AI 안내 대기");
  const [questionSpeechSupported, setQuestionSpeechSupported] = useState(true);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<number>>(() => new Set());
  const [replayedQuestionIds, setReplayedQuestionIds] = useState<Set<number>>(() => new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneFrameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef(0);
  const submitAfterRecordingStopRef = useRef(false);
  const autoAdvanceAfterAnswerSubmitRef = useRef(false);
  const startRuntimeAfterRefreshRef = useRef(false);
  const autoRecordingQuestionRef = useRef<number | null>(null);
  const autoSpokenQuestionRef = useRef<number | null>(null);
  const introSpokenSessionRef = useRef<number | null>(null);
  const timeExpiredQuestionRef = useRef<number | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const videoAttachRunRef = useRef(0);
  const hasAnswerFile = Boolean(answer.videoFile || answer.audioFile || answer.videoFileId || answer.audioFileId);
  const canSubmitAnswer = Boolean(currentQuestion && hasAnswerFile && answer.durationSeconds > 0 && !recording);
  const currentQuestionAnswered = Boolean(
    currentQuestion &&
      (answeredQuestionIds.has(currentQuestion.questionId) ||
        data?.questions.questions.some((question) => question.questionId === currentQuestion.questionId && question.answered)),
  );
  const currentQuestionReplayUsed = Boolean(currentQuestion && replayedQuestionIds.has(currentQuestion.questionId));

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
    const text =
      mode === "recruiting"
        ? "안녕하세요. 지금부터 채용 AI 면접을 시작하겠습니다. 질문 안내가 끝난 뒤 답변 시간이 시작됩니다."
        : "안녕하세요. 지금부터 AI 모의면접을 시작하겠습니다. 질문 안내가 끝난 뒤 답변 시간이 시작됩니다.";
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
    if (!node || !streamRef.current) return;

    const attachRun = ++videoAttachRunRef.current;
    setCameraPreviewStatus("카메라 화면 연결 중");
    void (async () => {
      try {
        const stream = streamRef.current;
        if (!stream) return;
        const previewInfo = await attachMediaStreamToVideo(node, stream);
        assertCameraPreviewHasFrame(previewInfo);
        if (videoRef.current !== node || videoAttachRunRef.current !== attachRun) return;
        setCameraReady(true);
        setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo));
      } catch (previewError) {
        if (videoRef.current !== node || videoAttachRunRef.current !== attachRun) return;
        setCameraReady(false);
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
      setRecordedFileName("");
      submitAfterRecordingStopRef.current = false;
      autoAdvanceAfterAnswerSubmitRef.current = false;
      timeExpiredQuestionRef.current = null;
      setQuestionSpeechCompleted(false);
      setQuestionSpeechPlaying(false);
      setRemainingSeconds(INTERVIEW_QUESTION_TIME_LIMIT_SECONDS);
    }
  }, [currentQuestion]);

  useEffect(() => {
    void refreshCameraDevices();
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      stopQuestionSpeech();
      stopMicrophoneMeter();
      stopMediaStream(streamRef.current);
    };
    // Camera/device probing is intentionally run once when the runtime panel mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopQuestionSpeech]);

  useEffect(() => {
    if (!data) return;
    setAnsweredQuestionIds((current) => {
      const next = new Set(current);
      data.questions.questions.forEach((question) => {
        if (question.answered) next.add(question.questionId);
      });
      return next.size === current.size ? current : next;
    });
  }, [data]);

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
      currentQuestionAnswered
    ) {
      return;
    }
    if (introCompleted) return;
    const timer = window.setTimeout(() => speakInterviewIntro(), 250);
    return () => window.clearTimeout(timer);
  }, [
    cameraReady,
    currentQuestion,
    currentQuestionAnswered,
    data,
    introCompleted,
    microphoneReady,
    setupCompleted,
    speakInterviewIntro,
  ]);

  useEffect(() => {
    if (!setupCompleted || !currentQuestion || currentQuestionAnswered) {
      stopQuestionSpeech();
      return;
    }
    if (!introCompleted) return;
    if (autoSpokenQuestionRef.current === currentQuestion.questionId) return;
    stopQuestionSpeech();
    autoSpokenQuestionRef.current = currentQuestion.questionId;
    const timer = window.setTimeout(() => speakCurrentQuestion("auto"), 250);
    return () => window.clearTimeout(timer);
  }, [currentQuestion, currentQuestionAnswered, introCompleted, setupCompleted, speakCurrentQuestion, stopQuestionSpeech]);

  useEffect(() => {
    if (
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
    const intervalId = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [
    busy,
    currentQuestion,
    currentQuestionAnswered,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    setupCompleted,
  ]);

  useEffect(() => {
    if (
      remainingSeconds > 0 ||
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
    if (timeExpiredQuestionRef.current === currentQuestion.questionId) return;
    timeExpiredQuestionRef.current = currentQuestion.questionId;
    void handleQuestionTimeExpired();
    // The timeout action intentionally reads the latest runtime state when the counter reaches zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    busy,
    currentQuestion,
    currentQuestionAnswered,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    remainingSeconds,
    setupCompleted,
  ]);

  useEffect(() => {
    if (
      !data ||
      !setupCompleted ||
      !introCompleted ||
      !questionSpeechCompleted ||
      questionSpeechPlaying ||
      !cameraReady ||
      !microphoneReady ||
      !currentQuestion ||
      currentQuestionAnswered
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
    cameraReady,
    microphoneReady,
    introCompleted,
    questionSpeechCompleted,
    questionSpeechPlaying,
    currentQuestion?.questionId,
    currentQuestionAnswered,
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

  async function handleEnableCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("이 브라우저에서는 카메라/마이크를 사용할 수 없습니다.");
      return;
    }

    try {
      stopMicrophoneMeter();
      stopMediaStream(streamRef.current);
      setCameraReady(false);
      setMicrophoneReady(false);
      setCameraPreviewStatus("카메라 연결 중");
      setMicrophoneStatus("마이크 연결 중");
      const streamResult = await getCameraMediaStream(selectedCameraId, selectedMicrophoneId);
      const { stream, fallbackLabel } = streamResult;
      streamRef.current = stream;

      let previewInfo: CameraPreviewInfo | undefined;
      if (videoRef.current) {
        previewInfo = await attachMediaStreamToVideo(videoRef.current, stream);
      }
      assertCameraPreviewHasFrame(previewInfo);

      setCameraReady(true);
      setMicrophoneReady(streamResult.audioEnabled);
      setCameraPreviewStatus(formatCameraPreviewStatus(previewInfo, fallbackLabel));
      setMicrophoneStatus(formatMicrophoneStatus(streamResult));
      if (streamResult.audioEnabled) {
        startMicrophoneMeter(stream);
      } else {
        setMicrophoneLevel(0);
      }
      await refreshCameraDevices();
      setMessage(fallbackLabel ? `카메라가 연결되었습니다. ${fallbackLabel}` : "카메라와 마이크가 연결되었습니다.");
    } catch (cameraError) {
      setCameraReady(false);
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      stopMicrophoneMeter();
      const errorMessage = formatMediaError(cameraError);
      const microphoneProbe = await probeMicrophone(selectedMicrophoneId);
      setCameraPreviewStatus(`카메라 연결 실패: ${errorMessage}`);
      setMicrophoneReady(microphoneProbe.ok);
      setMicrophoneStatus(formatMicrophoneProbeStatus(microphoneProbe));
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
    if (!data) return;
    if (!streamRef.current || !cameraReady || !microphoneReady) {
      await handleEnableCamera();
    }

    const stream = streamRef.current;
    const hasLiveVideo = stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
    const hasLiveAudio = stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
    if (!hasLiveVideo || !hasLiveAudio) {
      setMessage("카메라와 마이크 점검을 완료한 뒤 면접을 시작해주세요.");
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
            networkStable: navigator.onLine,
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
        const recordedMimeType = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(recordingChunksRef.current, { type: recordedMimeType });
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const fileName = `${mode}-answer-${data.runtime.sessionId}-${currentQuestion.questionId}.${mediaFileExtension(recordedMimeType)}`;
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
            toSaveInterviewAnswerRequest({
              questionId: currentQuestion.questionId,
              durationSeconds,
              videoFile,
            }),
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

  function handleReplayPrompt() {
    if (!currentQuestion || currentQuestionReplayUsed || !questionSpeechSupported) return;
    setReplayedQuestionIds((current) => {
      const next = new Set(current);
      next.add(currentQuestion.questionId);
      return next;
    });
    speakCurrentQuestion("manual");
  }

  async function submitAnswerRequest(request: SaveInterviewAnswerRequest, question = currentQuestion) {
    if (!data) return;
    setBusy(true);
    setMessage("");
    try {
      const api = runtimeApi;
      const preparedRequest = await prepareAnswerRequestWithUploadedMedia(api, data.runtime.sessionId, request);
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
      setAnsweredQuestionIds((current) => {
        const next = new Set(current);
        next.add(preparedRequest.questionId);
        return next;
      });
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
      setMessage(toErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitAnswer) {
      setMessage("녹화 종료 후 답변 제출을 눌러주세요.");
      return;
    }
    await submitAnswerRequest(toSaveInterviewAnswerRequest(answer));
  }

  function handleAnswerComplete() {
    if (currentQuestionAnswered) {
      setMessage("이미 저장된 답변입니다. 다음 질문으로 이동해주세요.");
      return;
    }

    if (recording) {
      submitAfterRecordingStopRef.current = true;
      handleStopRecording();
      return;
    }

    if (canSubmitAnswer) {
      void submitAnswerRequest(toSaveInterviewAnswerRequest(answer));
      return;
    }

    setMessage("답변 녹화가 아직 준비되지 않았습니다.");
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
        error: undefined,
      }));

      const sttStatus = await pollAiJobUntilSettled(sttProcessLogId);
      if (sttStatus.status !== "COMPLETED") {
        setAutoAiPipeline((current) => ({
          answerId: savedAnswer.answerId,
          ...current,
          sttStatus: sttStatus.status === "FAILED" ? "FAILED" : "RUNNING",
          followUpStatus: "IDLE",
          error: sttStatus.status === "FAILED"
            ? sttStatus.failure?.reason ?? "STT 처리에 실패했습니다."
            : "STT 처리가 아직 진행 중입니다. 잠시 후 상태를 다시 확인해주세요.",
        }));
        return;
      }

      const transcript =
        extractAiJobText(sttStatus.output, ["transcript"]) ??
        extractAiJobText(sttStatus.outputRef, ["transcript"]);
      if (!transcript) {
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

      const answerWithTranscript = { ...savedAnswer, transcript };
      const isFollowUpAnswer = question?.questionType === "FOLLOW_UP";
      setLastAnswer(answerWithTranscript);
      setAutoAiPipeline((current) => ({
        answerId: savedAnswer.answerId,
        ...current,
        sttStatus: "COMPLETED",
        followUpStatus: isFollowUpAnswer ? "IDLE" : "PENDING",
        sttProcessLogId,
        transcript,
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
      setRemainingSeconds(INTERVIEW_QUESTION_TIME_LIMIT_SECONDS);
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
    if (!data || !currentQuestion || currentQuestionAnswered) return;
    setMessage("답변 시간이 종료되어 현재 답변을 자동 제출합니다.");
    autoAdvanceAfterAnswerSubmitRef.current = true;

    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      submitAfterRecordingStopRef.current = true;
      handleStopRecording();
      return;
    }

    if (canSubmitAnswer) {
      await submitAnswerRequest(toSaveInterviewAnswerRequest(answer));
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
      setRemainingSeconds(INTERVIEW_QUESTION_TIME_LIMIT_SECONDS);
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
  const generatedFollowUpReady = Boolean(
    data &&
      currentQuestionAnswered &&
      currentQuestion?.questionType !== "FOLLOW_UP" &&
      autoAiPipeline?.answerId === lastAnswer?.answerId &&
      autoAiPipeline?.followUpStatus === "COMPLETED" &&
      autoAiPipeline?.followUpQuestion,
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
  const currentBaseQuestionWaitingForFollowUp = Boolean(
    currentQuestionAnswered &&
      currentQuestion?.questionType !== "FOLLOW_UP" &&
      lastAnswer?.questionId === currentQuestion?.questionId &&
      !generatedFollowUpReady,
  );
  const canMoveNextQuestion = Boolean(
    data &&
      currentQuestionAnswered &&
      !answerProcessingBusy &&
      !currentBaseQuestionWaitingForFollowUp &&
      (!isCurrentQuestionLast || generatedFollowUpReady) &&
      !recording,
  );
  const canCompleteInterview = Boolean(
    data &&
      currentQuestionAnswered &&
      isCurrentQuestionLast &&
      !generatedFollowUpReady &&
      answeredQuestionCount >= data.runtime.totalQuestions &&
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
  const timerDanger = remainingSeconds <= 10;

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
              <button className="btn primary" type="button" disabled={busy || !cameraReady || !microphoneReady} onClick={() => void handleEnterInterview()}>
                면접 시작
              </button>
            </div>
            <div className="candidate-device-setup__grid">
              <div className="video-box candidate-device-preview">
                <video ref={attachRuntimeVideoRef} autoPlay muted playsInline />
                <div className="camera-debug">{cameraPreviewStatus}</div>
                {!cameraReady ? (
                  <div className="vlabel">
                    <div className="vcam">⌾</div>
                    카메라 미리보기
                  </div>
                ) : null}
              </div>
              <aside className="panel candidate-runtime-status-panel">
                <p className="panel-title">장치 상태</p>
                <div className="status-list">
                  <div className="status-line"><span className={cameraReady ? "ok" : "wait"}>{cameraReady ? "✓" : "!"}</span> 카메라 {cameraReady ? "정상" : "대기"}</div>
                  <div className="status-line"><span className={microphoneReady ? "ok" : "wait"}>{microphoneReady ? "✓" : "!"}</span> {microphoneStatus}</div>
                  <div className="mic-meter" aria-label={`마이크 입력 ${microphoneLevel}%`}>
                    <span style={{ width: `${microphoneLevel}%` }} />
                  </div>
                  <div className="status-line"><span className="ok">✓</span> 네트워크 정상</div>
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
            <section className="q-card">
              <div className="q-card-head">
                <div>
                  {mode === "recruiting" ? <div className="qm">채용 AI 면접</div> : null}
                  <div className="qn">질문 {questionNumber} / {data.runtime.totalQuestions}</div>
                </div>
                <div className={`question-timer ${timerDanger ? "danger" : ""}`} aria-label={`남은 시간 ${formattedRemainingTime}`}>
                  <span>남은 시간</span>
                  <strong>{formattedRemainingTime}</strong>
                </div>
              </div>
              <div className="qt">
                {currentQuestion
                  ? subtitlesEnabled
                    ? formatRuntimeQuestionPrompt(currentQuestion, true)
                    : "자막이 꺼져 있습니다. 질문 음성을 듣고 답변해주세요."
                  : "현재 질문을 불러올 수 없습니다."}
              </div>
              <div className={`question-voice-status ${questionSpeechSupported ? "" : "unsupported"}`} aria-live="polite">
                {questionSpeechStatus}
              </div>
              {generatedFollowUpReady ? (
                <div className="candidate-follow-up-prompt">
                  <div className="candidate-follow-up-prompt__head">
                    <span>생성된 꼬리질문</span>
                    <button
                      className="btn primary compact"
                      type="button"
                      disabled={
                        busy ||
                        autoAiPipeline?.followUpStatus !== "COMPLETED" ||
                        !autoAiPipeline?.followUpProcessLogId ||
                        autoAiPipeline?.insertStatus === "COMPLETED"
                      }
                      onClick={() => void handleAnswerFollowUpQuestion()}
                    >
                      꼬리질문 답변하기
                    </button>
                  </div>
                  <p>{autoAiPipeline?.followUpQuestion}</p>
                </div>
              ) : null}
            </section>

            <section className="iv-grid">
              <div className="video-box">
                <video ref={attachRuntimeVideoRef} autoPlay muted playsInline />
                <div className="camera-debug">{cameraPreviewStatus}</div>
                {recording ? (
                  <div className="recbadge"><span className="pulse" /> 녹화 중</div>
                ) : null}
                {!cameraReady ? (
                  <div className="vlabel">
                    <div className="vcam">⌾</div>
                    카메라 미리보기
                  </div>
                ) : null}
              </div>

              <aside className="panel candidate-runtime-status-panel">
                <p className="panel-title">답변 상태</p>
                <div className="status-list">
                  <div className="status-line"><span className={cameraReady ? "ok" : "wait"}>{cameraReady ? "✓" : "!"}</span> 카메라 {cameraReady ? "정상" : "대기"}</div>
                  <div className="status-line"><span className={microphoneReady ? "ok" : "wait"}>{microphoneReady ? "✓" : "!"}</span> {microphoneStatus}</div>
                  <div className="mic-meter" aria-label={`마이크 입력 ${microphoneLevel}%`}>
                    <span style={{ width: `${microphoneLevel}%` }} />
                  </div>
                  <div className="status-line"><span className="ok">✓</span> 네트워크 정상</div>
                  <div className="status-line"><span className={answerProcessingReady ? "ok" : "wait"}>{answerProcessingReady ? "✓" : "!"}</span> {answerProcessingLabel}</div>
                  <div className="status-line"><span className={recordedFileName || answer.videoFile ? "ok" : "wait"}>{recordedFileName || answer.videoFile ? "✓" : "!"}</span> 답변 파일 {recordedFileName || answer.videoFile ? "준비 완료" : "대기"}</div>
                </div>
                <dl className="candidate-runtime-meta">
                  <Definition label="진행" value={`${answeredQuestionCount}/${data.runtime.totalQuestions}`} />
                  <Definition label="상태" value={<StatusPill value={data.runtime.status} />} />
                </dl>
              </aside>
            </section>

            <form className="candidate-runtime-form" onSubmit={handleSaveAnswer}>
              <div className="toolbar candidate-interview-controls">
                <button className="btn" type="button" disabled={busy || !currentQuestion || !questionSpeechSupported || currentQuestionReplayUsed} onClick={handleReplayPrompt}>
                  {currentQuestionReplayUsed ? "다시 듣기 완료" : "질문 음성 다시 듣기"}
                </button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy || !currentQuestion || currentQuestionAnswered || (!recording && !canSubmitAnswer)}
                  onClick={handleAnswerComplete}
                >
                  답변 완료
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy || recording || !canMoveNextQuestion}
                  onClick={() => void handleNextQuestion()}
                >
                  다음 질문
                </button>
                <button
                  className={`subtitle-toggle ${subtitlesEnabled ? "on" : ""}`}
                  type="button"
                  aria-pressed={subtitlesEnabled}
                  onClick={() => setSubtitlesEnabled((current) => !current)}
                >
                  {subtitlesEnabled ? "자막 ON" : "자막 OFF"}
                </button>
              </div>
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
  const mockActive = active === "interview" || active === "reports";
  const recruitingActive = active === "jobs" || active === "applications";

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
          <div className={`gnb-item ${active === "mypage" ? "active" : ""}`}>
            <Link className="gnb-link" href={candidateApplicationInterviewRoutes.mypage} aria-current={active === "mypage" ? "page" : undefined}>
              마이페이지
            </Link>
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

function MockFeedbackView({ feedback }: { feedback: CandidateMockReportFeedback }) {
  return (
    <div className="detail-stack">
      <dl className="candidate-feature__summary">
        <Definition label="상태" value={<StatusPill value={feedback.status} />} />
        {feedback.totalScore !== undefined ? <Definition label="총점" value={`${feedback.totalScore}점`} /> : null}
        <Definition label="생성 시각" value={feedback.generatedAt ? formatDateTime(feedback.generatedAt) : "-"} />
        <Definition label="공개 범위" value={feedback.visibilityPolicy.candidateFacingOnly ? "지원자용" : "확인 필요"} />
      </dl>
      {feedback.aiProcess ? <AiProcessSummaryView process={feedback.aiProcess} /> : null}
      <p className="description-box">{feedback.summary ?? "리포트 생성 중입니다."}</p>
      <ListBlock title="강점" items={feedback.strengths} />
      <ListBlock title="개선점" items={feedback.improvements} />
      <ListBlock title="다음 연습" items={feedback.nextPractice} />
      <ReportScoreList scores={feedback.scores ?? []} />
    </div>
  );
}

function MockMediaView({ media }: { media: CandidateMockReportMedia }) {
  if (!media.media.length) return <p className="empty">연결된 답변 파일이 없습니다.</p>;
  const mediaItems = [...media.media].sort((left, right) => left.sortOrder - right.sortOrder);
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
              <strong>{item.videoFile?.originalName ?? "답변 영상"}</strong>
              <span>현재 브라우저 세션에 녹화 원본이 없습니다.</span>
            </div>
          )}
        </div>
        <div className="script-box report-answer-card__script">
          <strong>스크립트</strong>
          <p>{item.transcript ?? (item.transcriptStatus === "AVAILABLE" ? "스크립트를 불러오는 중입니다." : "STT 처리 대기 중입니다.")}</p>
          <FollowUpQuestionList questions={item.followUpQuestions} />
          <dl className="report-answer-meta">
            <Definition label="답변 시간" value={`${item.durationSeconds}s`} />
            <Definition label="영상 파일" value={item.videoFile?.originalName ?? "-"} />
            <Definition label="음성 파일" value={item.audioFile?.originalName ?? "-"} />
            <Definition label="제출 시각" value={formatDateTime(item.submittedAt)} />
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
  return (
    <div className="detail-stack">
      <dl className="candidate-feature__summary">
        <Definition label="상태" value={<StatusPill value={report.status} />} />
        <Definition label="회사" value={report.companyName} />
        <Definition label="공고" value={report.jobTitle} />
        {report.reportId ? <Definition label="리포트 ID" value={`#${report.reportId}`} /> : null}
        {report.totalScore !== undefined ? <Definition label="총점" value={`${report.totalScore}점`} /> : null}
        <Definition label="생성 시각" value={report.generatedAt ? formatDateTime(report.generatedAt) : "-"} />
        <Definition label="다음 단계" value={report.nextStepLabel} />
      </dl>
      {report.aiProcess ? <AiProcessSummaryView process={report.aiProcess} /> : null}
      <p className="description-box">{report.candidateMessage}</p>
      {report.summary ? <p className="description-box">{report.summary}</p> : null}
      <ReportScoreList scores={report.scores} />
      <ReportAnswerInsightList answers={report.answers} />
    </div>
  );
}

function AiProcessSummaryView({ process }: { process: CandidateAiProcessView }) {
  return (
    <dl className="candidate-feature__summary compact report-ai-process">
      <Definition label="AI 작업" value={formatProcessTypeLabel(process.processType)} />
      <Definition label="작업 상태" value={<StatusPill value={process.status} />} />
      <Definition label="processLogId" value={`#${process.processLogId}`} />
      <Definition label="요청 시각" value={formatDateTime(process.createdAt)} />
      {process.failureReason ? <Definition label="실패 사유" value={process.failureReason} /> : null}
    </dl>
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
        {scores.map((score) => (
          <article className="report-score-card" key={score.scoreId}>
            <div className="report-score-card__head">
              <strong>{score.criterionName ?? `평가 항목 #${score.criterionId ?? score.scoreId}`}</strong>
              <span>{score.score}점</span>
            </div>
            {score.rationale ? <p>{score.rationale}</p> : null}
            <EvidenceList evidences={score.evidences} />
          </article>
        ))}
      </div>
    </div>
  );
}

function ReportAnswerInsightList({ answers }: { answers: CandidateReportAnswerView[] }) {
  if (!answers.length) {
    return <p className="empty">표시할 면접 답변이 아직 없습니다.</p>;
  }

  const sortedAnswers = [...answers].sort((left, right) => (left.sortOrder ?? left.answerId) - (right.sortOrder ?? right.answerId));
  return (
    <div>
      <h3 className="candidate-section-title">답변별 STT / 꼬리질문</h3>
      <div className="report-answer-insight-list">
        {sortedAnswers.map((answer, index) => (
          <article className="report-answer-insight-card" key={answer.answerId}>
            <div className="report-answer-card__head">
              <div>
                <span>질문 {index + 1}</span>
                <strong>{answer.questionContent ?? `질문 #${answer.questionId}`}</strong>
              </div>
              {answer.questionType ? <StatusPill value={formatQuestionTypeLabel(answer.questionType)} /> : null}
            </div>
            <div className="script-box">
              <strong>STT 텍스트</strong>
              <p>{answer.transcript ?? (answer.transcriptStatus === "AVAILABLE" ? "스크립트를 불러오는 중입니다." : "STT 처리 대기 중입니다.")}</p>
            </div>
            <FollowUpQuestionList questions={answer.followUpQuestions} />
            <EvidenceList evidences={answer.evidences} />
          </article>
        ))}
      </div>
    </div>
  );
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

function EvidenceList({ evidences }: { evidences: CandidateReportEvidenceView[] }) {
  if (!evidences.length) {
    return null;
  }

  return (
    <div className="report-evidence-list">
      <strong>근거</strong>
      <ul>
        {evidences.map((evidence) => (
          <li key={evidence.evidenceId}>
            <span>{evidence.evidenceText}</span>
            <small>{evidence.sourceType}{evidence.answerId ? ` · 답변 #${evidence.answerId}` : ""}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportGenerationHandoffView({ handoff }: { handoff: CandidateReportGenerationHandoff }) {
  const payload = buildReportGenerationSharePayload(handoff);

  return (
    <div className="candidate-pipeline-card">
      <div className="candidate-pipeline-card__head">
        <div>
          <strong>REPORT_GENERATE 요청 준비 완료</strong>
          <p>{handoff.callbackTopic}</p>
        </div>
        <StatusPill value={handoff.status} />
      </div>
      <dl className="candidate-feature__summary">
        <Definition label="queued" value={String(handoff.queued)} />
        <Definition label="processLogId" value={handoff.processLogId} />
        <Definition label="reportStatus" value={handoff.reportStatus} />
        <Definition label="reportId" value={handoff.reportId} />
        <Definition label="sessionId" value={handoff.sessionId} />
        {handoff.applicationId ? <Definition label="applicationId" value={handoff.applicationId} /> : null}
        <Definition label="reportType" value={handoff.reportType} />
        <Definition label="answerIds" value={formatIdList(handoff.answerIds)} />
        <Definition label="fileIds" value={formatIdList(handoff.fileIds)} />
      </dl>
      <PipelinePayloadPreview title="E 리포트 생성 공유 payload" payload={payload} />
    </div>
  );
}

function PipelinePayloadPreview({ title, payload }: { title: string; payload: Record<string, unknown> }) {
  return (
    <div className="candidate-pipeline-payload">
      <div className="candidate-pipeline-payload__title">{title}</div>
      <pre>{formatJsonPayload(payload)}</pre>
    </div>
  );
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

function buildReportGenerationSharePayload(handoff: CandidateReportGenerationHandoff): Record<string, unknown> {
  return {
    accepted: handoff.accepted,
    queued: handoff.queued,
    processType: handoff.processType,
    status: handoff.status,
    reportStatus: handoff.reportStatus,
    callbackTopic: handoff.callbackTopic,
    processLogId: handoff.processLogId,
    reportId: handoff.reportId,
    sessionId: handoff.sessionId,
    applicationId: handoff.applicationId,
    reportType: handoff.reportType,
    answerIds: handoff.answerIds,
    fileIds: handoff.fileIds,
    inputRef: handoff.inputRef,
  };
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
}

function formatJsonPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
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

function formatIdList(ids: number[]): string {
  return ids.length ? ids.join(", ") : "-";
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

function formatRuntimeQuestionPrompt(question: RuntimeQuestionView, showText: boolean): string {
  if (showText && question.content) return question.content;
  return formatAudioPrompt(question.audioPrompt);
}

function formatAudioPrompt(audioPrompt?: string): string {
  if (!audioPrompt) return "질문을 준비 중입니다.";
  if (audioPrompt.startsWith("audio://")) return "음성 질문을 듣고 답변해주세요.";
  return audioPrompt;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="candidate-section-title">{title}</h3>
      {items.length ? (
        <ul className="candidate-feature__tags">
          {items.map((item) => <li key={item}>{item}</li>)}
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

function formatProcessTypeLabel(processType: string): string {
  const labels: Record<string, string> = {
    STT: "음성 텍스트 변환",
    FOLLOW_UP: "꼬리질문 생성",
    REPORT_GENERATE: "리포트 생성",
  };

  return labels[processType] ?? processType;
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
    baseUrl: API_BASE_URL,
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
    baseUrl: API_BASE_URL,
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
    totalQuestions: questions.questions.length,
    answeredCount: questions.questions.filter((question) => question.answered).length,
    currentQuestion,
    nextQuestionEndpoint: runtime.nextQuestionEndpoint,
    answerUploadEndpoint: runtime.answerUploadEndpoint,
  };
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

function normalizeInterviewMediaMimeType(mimeType: string): RuntimeFileAssetRequest["mimeType"] | undefined {
  const baseMimeType = mimeType.split(";")[0]?.trim().toLowerCase();
  return isAllowedInterviewMediaMimeType(baseMimeType) ? baseMimeType : undefined;
}

function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

function mediaFileExtension(mimeType: string): "mp4" | "webm" {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

function safeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "answer";
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function getCameraMediaStream(cameraDeviceId = "", microphoneDeviceId = ""): Promise<CameraStreamResult> {
  const videoAttempts: Array<MediaTrackConstraints | boolean> = cameraDeviceId
    ? [{ deviceId: { ideal: cameraDeviceId } }, true]
    : [{ facingMode: "user" }, true];
  const audioAttempts: Array<MediaTrackConstraints | boolean> = microphoneDeviceId
    ? [{ deviceId: { ideal: microphoneDeviceId } }, true]
    : [true];
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

function formatCameraPreviewStatus(info?: CameraPreviewInfo, fallbackLabel?: string): string {
  if (!info) return "카메라 연결됨";
  const size = info.width > 0 && info.height > 0 ? `${info.width}x${info.height}` : "프레임 없음";
  const label = info.trackLabel || "선택된 카메라";
  return [label, size, info.trackState ?? "live", fallbackLabel].filter(Boolean).join(" · ");
}

function formatMicrophoneStatus(result: CameraStreamResult): string {
  if (result.audioEnabled) {
    return `${result.audioLabel || "선택된 마이크"} · ${result.audioState ?? "live"}`;
  }
  return `마이크 실패: ${formatMediaError(result.audioError, "microphone")}`;
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
