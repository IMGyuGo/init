import type { RealtimeInterviewSessionResponse } from "./api";

const DEFAULT_REALTIME_CONNECTION_READY_TIMEOUT_MS = 10000;

export interface RealtimeDataChannelLike {
  readyState: RTCDataChannelState;
  close(): void;
  send(data: string): void;
  onopen: RTCDataChannel["onopen"];
  onmessage: RTCDataChannel["onmessage"];
  onclose: RTCDataChannel["onclose"];
  onerror: RTCDataChannel["onerror"];
}

export interface RealtimePeerConnectionLike {
  connectionState: RTCPeerConnectionState;
  onconnectionstatechange: RTCPeerConnection["onconnectionstatechange"];
  ontrack: ((event: RTCTrackEvent) => unknown) | null;
  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender;
  createDataChannel(label: string): RealtimeDataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  close(): void;
}

export interface CreateRealtimeInterviewWebRtcConnectionInput {
  session: RealtimeInterviewSessionResponse;
  localStream: MediaStream;
  fetcher?: typeof fetch;
  peerConnectionFactory?: () => RealtimePeerConnectionLike;
  remoteAudioElement?: HTMLAudioElement | null;
  onRemoteStream?: (stream: MediaStream) => void;
  onEvent?: (event: unknown) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannelStateChange?: (state: RTCDataChannelState) => void;
  onConnectionFailure?: (error: Error) => void;
  readyTimeoutMs?: number;
}

export interface RealtimeInterviewWebRtcConnection {
  peerConnection: RealtimePeerConnectionLike;
  dataChannel: RealtimeDataChannelLike;
  /**
   * Outbound microphone tracks used only by the realtime provider.
   * They are cloned from the recording stream so UI recording and metering stay active
   * while provider input is gated during assistant speech playback.
   */
  localAudioTracks: MediaStreamTrack[];
  close(): void;
}

export interface ShouldStartRealtimeSessionInput {
  setupCompleted: boolean;
  runtimeStatus: string;
  localStream: MediaStream | null | undefined;
}

export type RealtimeInterviewSpeechPurpose =
  | "interview_intro"
  | "interview_question"
  | "interview_follow_up_question"
  | "interview_encouragement";

export interface RealtimeInterviewSpeechResponseEvent {
  type: "response.create";
  event_id: string;
  response: {
    conversation: "none";
    output_modalities: ["audio"];
    metadata: {
      response_purpose: RealtimeInterviewSpeechPurpose;
      playback_id: string;
      question_id?: string;
    };
    instructions: string;
    input: [];
  };
}

export interface RealtimeResponseCancelEvent {
  type: "response.cancel";
  event_id: string;
  response_id: string;
}

export interface RealtimeOutputAudioBufferClearEvent {
  type: "output_audio_buffer.clear";
  event_id: string;
}

export type RealtimeInterviewClientEvent =
  | RealtimeInterviewSpeechResponseEvent
  | RealtimeResponseCancelEvent
  | RealtimeOutputAudioBufferClearEvent;

export interface CreateRealtimeInterviewSpeechResponseEventInput {
  purpose: RealtimeInterviewSpeechPurpose;
  text: string;
  playbackId: number;
  questionId?: number;
}

export interface RealtimeResponseMetadata {
  responseId?: string;
  purpose: RealtimeInterviewSpeechPurpose;
  playbackId: number;
  questionId?: number;
  status: string;
  completed: boolean;
}

export interface RealtimeOutputAudioTranscript {
  responseId: string;
  text: string;
  completed: boolean;
}

export type RealtimeSpeechTranscriptMatch = "partial" | "complete" | "mismatch";

export function shouldStartRealtimeSession({
  setupCompleted,
  runtimeStatus,
  localStream,
}: ShouldStartRealtimeSessionInput): boolean {
  if (!setupCompleted || runtimeStatus !== "IN_PROGRESS" || !localStream) {
    return false;
  }

  return localStream.getAudioTracks().some((track) => track.readyState === "live");
}

export function createRealtimeInterviewSpeechResponseEvent({
  purpose,
  text,
  playbackId,
  questionId,
}: CreateRealtimeInterviewSpeechResponseEventInput): RealtimeInterviewSpeechResponseEvent {
  const trimmedText = text.trim();
  const metadata: RealtimeInterviewSpeechResponseEvent["response"]["metadata"] = {
    response_purpose: purpose,
    playback_id: String(playbackId),
  };
  if (typeof questionId === "number") {
    metadata.question_id = String(questionId);
  }

  return {
    type: "response.create",
    event_id: `interview_${purpose}_${questionId ?? "session"}_${playbackId}`,
    response: {
      conversation: "none",
      output_modalities: ["audio"],
      metadata,
      instructions: getRealtimeInterviewSpeechInstructions(trimmedText),
      input: [],
    },
  };
}

export function sendRealtimeClientEvent(
  connection: RealtimeInterviewWebRtcConnection | null | undefined,
  event: RealtimeInterviewClientEvent,
): boolean {
  if (!connection || connection.dataChannel.readyState !== "open") {
    return false;
  }

  connection.dataChannel.send(JSON.stringify(event));
  return true;
}

export function sendRealtimeSpeechClientEvent(
  connection: RealtimeInterviewWebRtcConnection | null | undefined,
  event: RealtimeInterviewSpeechResponseEvent,
): boolean {
  setRealtimeInterviewMicrophoneEnabled(connection, false);
  const sent = sendRealtimeClientEvent(connection, event);
  if (!sent) {
    setRealtimeInterviewMicrophoneEnabled(connection, true);
  }
  return sent;
}

export function cancelRealtimeSpeechResponse(
  connection: RealtimeInterviewWebRtcConnection | null | undefined,
  responseId: string,
): boolean {
  const normalizedResponseId = responseId.trim();
  if (!normalizedResponseId) return false;

  const cancelSent = sendRealtimeClientEvent(connection, {
    type: "response.cancel",
    event_id: `interview_response_cancel_${normalizedResponseId}`,
    response_id: normalizedResponseId,
  });
  const clearSent = sendRealtimeClientEvent(connection, {
    type: "output_audio_buffer.clear",
    event_id: `interview_output_audio_clear_${normalizedResponseId}`,
  });
  return cancelSent && clearSent;
}

export function setRealtimeInterviewMicrophoneEnabled(
  connection: RealtimeInterviewWebRtcConnection | null | undefined,
  enabled: boolean,
): number {
  if (!connection) return 0;
  let updatedTrackCount = 0;
  connection.localAudioTracks.forEach((track) => {
    if (track.readyState !== "live") return;
    track.enabled = enabled;
    updatedTrackCount += 1;
  });
  return updatedTrackCount;
}

export function getRealtimeResponseMetadata(event: unknown): RealtimeResponseMetadata | undefined {
  return getRealtimeResponseEventMetadata(event, "response.done");
}

export function getRealtimeResponseCreatedMetadata(event: unknown): RealtimeResponseMetadata | undefined {
  return getRealtimeResponseEventMetadata(event, "response.created");
}

function getRealtimeResponseEventMetadata(
  event: unknown,
  eventType: "response.created" | "response.done",
): RealtimeResponseMetadata | undefined {
  if (!isRealtimeResponseEvent(event, eventType)) return undefined;

  const rawMetadata = event.response.metadata;
  if (!rawMetadata) {
    return undefined;
  }
  const purpose = rawMetadata.response_purpose;
  if (!isRealtimeInterviewSpeechPurpose(purpose)) {
    return undefined;
  }

  const playbackId = toFinitePositiveInteger(rawMetadata.playback_id);
  if (playbackId === undefined) {
    return undefined;
  }

  return {
    responseId: typeof event.response.id === "string" && event.response.id.trim() ? event.response.id : undefined,
    purpose,
    playbackId,
    questionId: toFinitePositiveInteger(rawMetadata.question_id),
    status: event.response.status,
    completed: event.response.status === "completed",
  };
}

export function getRealtimeOutputAudioTranscript(event: unknown): RealtimeOutputAudioTranscript | undefined {
  if (!event || typeof event !== "object") return undefined;
  const record = event as Record<string, unknown>;
  const completed = record.type === "response.output_audio_transcript.done";
  if (!completed && record.type !== "response.output_audio_transcript.delta") return undefined;

  const responseId = record.response_id;
  const text = completed ? record.transcript : record.delta;
  if (typeof responseId !== "string" || !responseId.trim() || typeof text !== "string") {
    return undefined;
  }

  return {
    responseId,
    text,
    completed,
  };
}

export function getRealtimeSpeechTranscriptMatch({
  expectedText,
  transcript,
  completed,
}: {
  expectedText: string;
  transcript: string;
  completed: boolean;
}): RealtimeSpeechTranscriptMatch {
  const expected = normalizeRealtimeSpokenText(expectedText);
  const actual = normalizeRealtimeSpokenText(transcript);

  if (!expected || !actual) {
    return completed ? "mismatch" : "partial";
  }
  if (completed) {
    return actual === expected ? "complete" : "mismatch";
  }
  return expected.startsWith(actual) ? "partial" : "mismatch";
}

export function getRealtimeAudioCompletedResponseId(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const record = event as Record<string, unknown>;
  if (record.type !== "output_audio_buffer.stopped") {
    return undefined;
  }

  const responseId = record.response_id;
  if (typeof responseId !== "string" || !responseId.trim()) {
    return undefined;
  }
  return responseId;
}

export function shouldRestoreRealtimeMicrophoneAfterSpeechResponse({
  purpose,
  completed,
}: RealtimeResponseMetadata): boolean {
  return completed && purpose === "interview_encouragement";
}

export async function createRealtimeInterviewWebRtcConnection({
  session,
  localStream,
  fetcher = fetch,
  peerConnectionFactory = () => new RTCPeerConnection(),
  remoteAudioElement,
  onRemoteStream,
  onEvent,
  onConnectionStateChange,
  onDataChannelStateChange,
  onConnectionFailure,
  readyTimeoutMs = DEFAULT_REALTIME_CONNECTION_READY_TIMEOUT_MS,
}: CreateRealtimeInterviewWebRtcConnectionInput): Promise<RealtimeInterviewWebRtcConnection> {
  if (session.provider !== "openai") {
    throw new Error("Realtime WebRTC connection requires an OpenAI realtime session.");
  }
  if (session.transport !== "webrtc") {
    throw new Error("Realtime WebRTC connection requires WebRTC transport.");
  }

  const sourceAudioTracks = localStream.getAudioTracks().filter((track) => track.readyState === "live");
  if (sourceAudioTracks.length === 0) {
    throw new Error("Realtime WebRTC connection requires a live microphone track.");
  }
  const realtimeAudioTracks = sourceAudioTracks.map((track) => track.clone());
  realtimeAudioTracks.forEach((track) => {
    track.enabled = false;
  });
  const realtimeAudioStream = createRealtimeAudioStream(localStream, realtimeAudioTracks);

  const peerConnection = peerConnectionFactory();
  const dataChannel = peerConnection.createDataChannel("oai-events");
  let attachedRemoteStream: MediaStream | null = null;
  let fallbackRemoteStream: MediaStream | null = null;
  let manuallyClosing = false;
  let readySettled = false;
  let failureReported = false;
  let resolveReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  let readyTimeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void readyPromise.catch(() => undefined);

  const notifyConnectionState = () => onConnectionStateChange?.(peerConnection.connectionState);
  const notifyDataChannelState = () => onDataChannelStateChange?.(dataChannel.readyState);
  const startReadyTimeout = () => {
    if (readyTimeoutId !== undefined) return;
    readyTimeoutId = globalThis.setTimeout(() => {
      failConnection(new Error(`Realtime WebRTC data channel did not open within ${readyTimeoutMs}ms.`));
    }, readyTimeoutMs);
  };
  const clearReadyTimeout = () => {
    if (readyTimeoutId === undefined) return;
    globalThis.clearTimeout(readyTimeoutId);
    readyTimeoutId = undefined;
  };
  const markReady = () => {
    if (readySettled) return;
    readySettled = true;
    clearReadyTimeout();
    resolveReady?.();
  };
  function failConnection(error: Error) {
    if (!readySettled) {
      readySettled = true;
      clearReadyTimeout();
      rejectReady?.(error);
    }
    if (!manuallyClosing && !failureReported) {
      failureReported = true;
      onConnectionFailure?.(error);
    }
  }
  const closeConnection = () => {
    manuallyClosing = true;
    clearReadyTimeout();
    if (!readySettled) {
      readySettled = true;
      resolveReady?.();
    }
    realtimeAudioTracks.forEach((track) => {
      if (track.readyState !== "ended") {
        track.stop();
      }
    });
    dataChannel.close();
    peerConnection.close();
  };

  notifyConnectionState();
  notifyDataChannelState();

  peerConnection.onconnectionstatechange = () => {
    notifyConnectionState();
    if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "closed") {
      failConnection(new Error(`Realtime WebRTC peer connection ${peerConnection.connectionState}.`));
    }
  };
  dataChannel.onopen = () => {
    notifyDataChannelState();
    markReady();
  };
  dataChannel.onclose = () => {
    notifyDataChannelState();
    failConnection(new Error("Realtime WebRTC data channel closed before the interview connection was finished."));
  };
  dataChannel.onerror = () => {
    notifyDataChannelState();
    failConnection(new Error("Realtime WebRTC data channel error occurred."));
  };
  if (dataChannel.readyState === "open") {
    markReady();
  } else if (dataChannel.readyState === "closing" || dataChannel.readyState === "closed") {
    failConnection(new Error("Realtime WebRTC data channel closed before the interview connection was finished."));
  }
  dataChannel.onmessage = (event) => {
    if (!onEvent) return;
    onEvent(parseRealtimeDataChannelMessage(event.data));
  };

  peerConnection.ontrack = (event) => {
    const remoteStream = event.streams[0] ?? (fallbackRemoteStream ??= new MediaStream());
    if (!event.streams[0]) {
      remoteStream.addTrack(event.track);
    }
    attachedRemoteStream = remoteStream;
    if (remoteAudioElement) {
      remoteAudioElement.srcObject = remoteStream;
      void remoteAudioElement.play().catch(() => undefined);
    }
    onRemoteStream?.(remoteStream);
  };

  try {
    realtimeAudioTracks.forEach((track) => {
      peerConnection.addTrack(track, realtimeAudioStream);
    });

    const offer = await peerConnection.createOffer();
    if (!offer.sdp) {
      throw new Error("Realtime WebRTC local offer SDP was not created.");
    }

    await peerConnection.setLocalDescription(offer);
    const response = await fetcher(session.endpoint, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${session.clientSecret}`,
        "Content-Type": "application/sdp",
      },
    });

    const answerSdp = await response.text();
    if (!response.ok) {
      throw new Error(`Realtime WebRTC answer request failed with status ${response.status}.`);
    }
    if (!answerSdp.trim()) {
      throw new Error("Realtime WebRTC answer SDP was empty.");
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answerSdp,
    });
    startReadyTimeout();
    if (dataChannel.readyState === "open") {
      markReady();
    } else if (dataChannel.readyState === "closing" || dataChannel.readyState === "closed") {
      failConnection(new Error("Realtime WebRTC data channel closed before the interview connection was finished."));
    }
    await readyPromise;

    return {
      peerConnection,
      dataChannel,
      localAudioTracks: realtimeAudioTracks,
      close() {
        closeConnection();
        if (remoteAudioElement && attachedRemoteStream && remoteAudioElement.srcObject === attachedRemoteStream) {
          remoteAudioElement.srcObject = null;
        }
      },
    };
  } catch (error) {
    closeConnection();
    throw error;
  }
}

function createRealtimeAudioStream(sourceStream: MediaStream, realtimeAudioTracks: MediaStreamTrack[]): MediaStream {
  if (typeof MediaStream === "undefined") {
    return sourceStream;
  }
  return new MediaStream(realtimeAudioTracks);
}

function parseRealtimeDataChannelMessage(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function getRealtimeInterviewSpeechInstructions(exactScript: string): string {
  return [
    "Speak the exact script between the markers once and say nothing else.",
    "Do not speak the markers. Do not acknowledge, add, omit, paraphrase, explain, or repeat any words.",
    "--- BEGIN EXACT SCRIPT ---",
    exactScript,
    "--- END EXACT SCRIPT ---",
  ].join("\n");
}

function normalizeRealtimeSpokenText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function isRealtimeInterviewSpeechPurpose(value: unknown): value is RealtimeInterviewSpeechPurpose {
  return (
    value === "interview_intro" ||
    value === "interview_question" ||
    value === "interview_follow_up_question" ||
    value === "interview_encouragement"
  );
}

function isRealtimeResponseEvent(
  event: unknown,
  eventType: "response.created" | "response.done",
): event is {
  type: "response.created" | "response.done";
  response: {
    id?: string;
    status: string;
    metadata?: Record<string, unknown>;
  };
} {
  if (!event || typeof event !== "object") return false;
  const record = event as Record<string, unknown>;
  const response = record.response;
  if (record.type !== eventType || !response || typeof response !== "object") return false;
  if (typeof (response as Record<string, unknown>).status !== "string") return false;
  const metadata = (response as Record<string, unknown>).metadata;
  return Boolean(metadata && typeof metadata === "object");
}

function toFinitePositiveInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return undefined;
  return Math.floor(numericValue);
}
