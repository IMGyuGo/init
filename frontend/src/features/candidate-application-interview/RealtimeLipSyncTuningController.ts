import type { RealtimePreviewSessionResponse } from "./api";
import {
  cancelRealtimeSpeechResponse,
  createRealtimeInterviewSpeechResponseEvent,
  createRealtimeInterviewWebRtcConnection,
  getRealtimeAudioCompletedResponseId,
  getRealtimeOutputAudioTranscript,
  getRealtimeResponseCreatedMetadata,
  getRealtimeResponseMetadata,
  getRealtimeSpeechTranscriptMatch,
  sendRealtimeClientEvent,
  type RealtimeInterviewWebRtcConnection,
} from "./realtime-webrtc";

const CREDENTIAL_EXPIRY_SAFETY_WINDOW_MS = 5_000;

export type RealtimeLipSyncTuningStatus =
  | "idle"
  | "connecting"
  | "playing"
  | "error";

export interface RealtimeLipSyncTuningSnapshot {
  status: RealtimeLipSyncTuningStatus;
  message: string;
  remoteStream: MediaStream | null;
  playbackId: number;
  activeResponseId?: string;
}

export interface RealtimeLipSyncTuningDependencies {
  createSession(): Promise<RealtimePreviewSessionResponse>;
  connect: typeof createRealtimeInterviewWebRtcConnection;
  remoteAudioElement: HTMLAudioElement;
  onSnapshot(snapshot: RealtimeLipSyncTuningSnapshot): void;
  now?: () => number;
}

export class RealtimeLipSyncTuningController {
  private connection: RealtimeInterviewWebRtcConnection | null = null;
  private session: RealtimePreviewSessionResponse | null = null;
  private remoteStream: MediaStream | null = null;
  private playbackId = 0;
  private playbackActive = false;
  private activeResponseId: string | undefined;
  private activeText = "";
  private status: RealtimeLipSyncTuningStatus = "idle";
  private message = "OpenAI Realtime 음성 테스트를 준비했습니다.";
  private connectionGeneration = 0;
  private connectionAttempt: Promise<void> | null = null;
  private failedConnectionGeneration: number | undefined;
  private disposed = false;

  constructor(private readonly dependencies: RealtimeLipSyncTuningDependencies) {}

  async play(text: string): Promise<void> {
    if (this.disposed) return;
    const trimmedText = text.trim();
    if (!trimmedText) {
      this.publish("error", "테스트 문장을 입력해주세요.");
      return;
    }
    if (!this.isConnectionHealthy() || this.credentialsExpireSoon()) {
      this.publish("connecting", "OpenAI Realtime 연결을 준비하고 있습니다.");
      const connectionAttempt = this.ensureConnection();
      try {
        await connectionAttempt;
      } catch {
        if (this.disposed) return;
        if (
          this.isConnectionHealthy()
          || (this.connectionAttempt && this.connectionAttempt !== connectionAttempt)
        ) return;
        this.publish("error", "OpenAI Realtime 연결에 실패했습니다.");
        return;
      }
    }

    this.cancelActiveResponse();
    const playbackId = ++this.playbackId;
    const event = createRealtimeInterviewSpeechResponseEvent({
      purpose: "lip_sync_tuning",
      text: trimmedText,
      playbackId,
    });
    if (!sendRealtimeClientEvent(this.connection, event)) {
      this.closeConnection();
      this.publish("error", "OpenAI Realtime 음성 요청을 보내지 못했습니다.");
      return;
    }

    this.activeText = trimmedText;
    this.playbackActive = true;
    this.publish("playing", "Realtime 음성과 입 모양을 재생하고 있습니다.");
  }

  handleEvent(event: unknown): void {
    if (this.disposed) return;

    const created = getRealtimeResponseCreatedMetadata(event);
    if (this.matchesActivePlayback(created?.purpose, created?.playbackId)) {
      this.activeResponseId = created?.responseId;
      this.publishCurrent();
      return;
    }

    const response = getRealtimeResponseMetadata(event);
    if (this.matchesActivePlayback(response?.purpose, response?.playbackId)) {
      if (this.activeResponseId && response?.responseId !== this.activeResponseId) return;
      if (!response?.completed) {
        this.clearActiveResponse();
        this.publish("error", "OpenAI Realtime 음성 생성에 실패했습니다.");
      }
      return;
    }

    const transcript = getRealtimeOutputAudioTranscript(event);
    if (
      transcript?.completed
      && transcript.responseId === this.activeResponseId
      && getRealtimeSpeechTranscriptMatch({
        expectedText: this.activeText,
        transcript: transcript.text,
        completed: true,
      }) === "mismatch"
    ) {
      cancelRealtimeSpeechResponse(this.connection, transcript.responseId);
      this.clearActiveResponse();
      this.publish(
        "error",
        "Realtime 음성이 입력 문장과 일치하지 않아 재생을 중단했습니다.",
      );
      return;
    }

    const completedResponseId = getRealtimeAudioCompletedResponseId(event);
    if (completedResponseId && completedResponseId === this.activeResponseId) {
      this.clearActiveResponse();
      this.publish("idle", "Realtime 음성 테스트가 끝났습니다.");
    }
  }

  stop(): void {
    if (this.disposed) return;
    this.cancelActiveResponse();
    this.publish("idle", "Realtime 음성 테스트를 중지했습니다.");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closeConnection();
    this.dependencies.remoteAudioElement.srcObject = null;
  }

  private ensureConnection(): Promise<void> {
    if (this.isConnectionHealthy() && !this.credentialsExpireSoon()) {
      return Promise.resolve();
    }
    if (this.connectionAttempt) return this.connectionAttempt;

    this.closeConnection();
    const generation = ++this.connectionGeneration;
    const attempt = this.openConnection(generation).finally(() => {
      if (this.connectionAttempt === attempt) {
        this.connectionAttempt = null;
      }
    });
    this.connectionAttempt = attempt;
    return attempt;
  }

  private async openConnection(generation: number): Promise<void> {
    const session = await this.dependencies.createSession();
    if (this.disposed || generation !== this.connectionGeneration) {
      throw new Error("Realtime preview session request became stale.");
    }
    if (this.credentialsExpireSoon(session)) {
      throw new Error("Realtime preview credentials expire too soon.");
    }

    this.failedConnectionGeneration = undefined;
    const connection = await this.dependencies.connect({
      session,
      remoteAudioElement: this.dependencies.remoteAudioElement,
      onRemoteStream: (stream) => {
        if (!this.isCurrentConnectionGeneration(generation)) return;
        this.remoteStream = stream;
        this.publishCurrent();
      },
      onEvent: (event) => {
        if (!this.isCurrentConnectionGeneration(generation)) return;
        this.handleEvent(event);
      },
      onConnectionStateChange: (state) => {
        if (state === "failed" || state === "disconnected" || state === "closed") {
          this.handleConnectionFailure(generation);
        }
      },
      onDataChannelStateChange: (state) => {
        if (state === "closing" || state === "closed") {
          this.handleConnectionFailure(generation);
        }
      },
      onConnectionFailure: () => this.handleConnectionFailure(generation),
    });

    if (
      this.disposed
      || this.failedConnectionGeneration === generation
      || generation !== this.connectionGeneration
    ) {
      connection.close();
      throw new Error("Realtime preview connection closed while opening.");
    }

    this.session = session;
    this.connection = connection;
    if (!this.isConnectionHealthy()) {
      this.closeConnection();
      throw new Error("Realtime preview connection was not healthy.");
    }
  }

  private handleConnectionFailure(generation: number): void {
    if (!this.isCurrentConnectionGeneration(generation)) return;
    this.failedConnectionGeneration = generation;
    this.closeConnection();
    if (!this.disposed) {
      this.publish("error", "OpenAI Realtime 연결이 끊어졌습니다.");
    }
  }

  private isCurrentConnectionGeneration(generation: number): boolean {
    return !this.disposed && generation === this.connectionGeneration;
  }

  private isConnectionHealthy(): boolean {
    if (!this.connection) return false;
    const connectionState = this.connection.peerConnection.connectionState;
    return this.connection.dataChannel.readyState === "open"
      && connectionState !== "failed"
      && connectionState !== "disconnected"
      && connectionState !== "closed";
  }

  private credentialsExpireSoon(session = this.session): boolean {
    if (!session) return true;
    const expiresAt = Date.parse(session.expiresAt);
    return !Number.isFinite(expiresAt)
      || expiresAt <= (this.dependencies.now?.() ?? Date.now()) + CREDENTIAL_EXPIRY_SAFETY_WINDOW_MS;
  }

  private matchesActivePlayback(
    purpose: string | undefined,
    playbackId: number | undefined,
  ): boolean {
    return this.playbackActive
      && purpose === "lip_sync_tuning"
      && playbackId === this.playbackId;
  }

  private cancelActiveResponse(): void {
    if (this.playbackActive && this.activeResponseId) {
      cancelRealtimeSpeechResponse(this.connection, this.activeResponseId);
    } else if (this.playbackActive && this.connection?.dataChannel.readyState === "open") {
      this.connection.dataChannel.send(JSON.stringify({
        type: "response.cancel",
        event_id: `lip_sync_tuning_response_cancel_active_${this.playbackId}`,
      }));
      sendRealtimeClientEvent(this.connection, {
        type: "output_audio_buffer.clear",
        event_id: `lip_sync_tuning_output_audio_clear_active_${this.playbackId}`,
      });
    }
    this.clearActiveResponse();
  }

  private clearActiveResponse(): void {
    this.playbackActive = false;
    this.activeResponseId = undefined;
    this.activeText = "";
  }

  private closeConnection(): void {
    const connection = this.connection;
    this.connection = null;
    this.session = null;
    this.remoteStream = null;
    this.clearActiveResponse();
    this.connectionGeneration += 1;
    connection?.close();
    this.dependencies.remoteAudioElement.srcObject = null;
  }

  private publish(status: RealtimeLipSyncTuningStatus, message: string): void {
    this.status = status;
    this.message = message;
    this.publishCurrent();
  }

  private publishCurrent(): void {
    this.dependencies.onSnapshot({
      status: this.status,
      message: this.message,
      remoteStream: this.remoteStream,
      playbackId: this.playbackId,
      ...(this.activeResponseId ? { activeResponseId: this.activeResponseId } : {}),
    });
  }
}
