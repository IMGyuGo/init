import { strict as assert } from "node:assert";
import type { RealtimePreviewSessionResponse } from "./api";
import {
  RealtimeLipSyncTuningController,
  type RealtimeLipSyncTuningSnapshot,
} from "./RealtimeLipSyncTuningController";
import type {
  CreateRealtimeInterviewWebRtcConnectionInput,
  RealtimeInterviewWebRtcConnection,
} from "./realtime-webrtc";

const NOW = Date.parse("2026-07-24T00:00:00.000Z");

function previewSession(expiresAt = NOW + 60_000): RealtimePreviewSessionResponse {
  return {
    accepted: true,
    mode: "realtime-voice",
    provider: "openai",
    model: "gpt-realtime",
    voice: "marin",
    transport: "webrtc",
    clientSecret: "ephemeral-secret",
    clientSecretType: "ephemeral",
    expiresAt: new Date(expiresAt).toISOString(),
    endpoint: "https://api.openai.com/v1/realtime/calls",
  };
}

function responseCreated(responseId: string, playbackId: string) {
  return {
    type: "response.created",
    response: {
      id: responseId,
      status: "in_progress",
      metadata: {
        response_purpose: "lip_sync_tuning",
        playback_id: playbackId,
      },
    },
  };
}

function responseDone(responseId: string, playbackId: string, status: string) {
  return {
    type: "response.done",
    response: {
      id: responseId,
      status,
      metadata: {
        response_purpose: "lip_sync_tuning",
        playback_id: playbackId,
      },
    },
  };
}

function audioStopped(responseId: string) {
  return {
    type: "output_audio_buffer.stopped",
    response_id: responseId,
  };
}

function transcriptDone(responseId: string, transcript: string) {
  return {
    type: "response.output_audio_transcript.done",
    response_id: responseId,
    transcript,
  };
}

function createFakeConnection() {
  const sentEvents: Array<Record<string, unknown>> = [];
  let closeCount = 0;
  const connection = {
    peerConnection: { connectionState: "connected" },
    dataChannel: {
      readyState: "open",
      send(data: string) {
        sentEvents.push(JSON.parse(data) as Record<string, unknown>);
      },
    },
    localAudioTracks: [],
    close() {
      closeCount += 1;
    },
  } as unknown as RealtimeInterviewWebRtcConnection;
  return {
    connection,
    sentEvents,
    get closeCount() {
      return closeCount;
    },
  };
}

function createFakeAudioElement() {
  return { srcObject: null } as unknown as HTMLAudioElement;
}

async function testReusesOneHealthyConnectionPerPage() {
  let sessionRequests = 0;
  const connectInputs: CreateRealtimeInterviewWebRtcConnectionInput[] = [];
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => {
      sessionRequests += 1;
      return previewSession();
    },
    connect: async (input) => {
      connectInputs.push(input);
      return fake.connection;
    },
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("  안녕하세요.  ");
  controller.handleEvent(responseCreated("response-1", "1"));
  controller.handleEvent(audioStopped("response-1"));
  await controller.play("지금부터 시작합니다.");

  assert.equal(sessionRequests, 1);
  assert.equal(connectInputs.length, 1);
  assert.equal(
    fake.sentEvents.filter((event) => event.type === "response.create").length,
    2,
  );
  assert.equal(connectInputs[0]?.localStream, undefined);
  assert.equal(snapshots.at(-1)?.playbackId, 2);
  assert.equal(snapshots.at(-1)?.status, "playing");
}

async function testEmptyTextDoesNotConnectOrSend() {
  let sessionRequests = 0;
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => {
      sessionRequests += 1;
      return previewSession();
    },
    connect: async () => fake.connection,
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("   ");

  assert.equal(sessionRequests, 0);
  assert.equal(fake.sentEvents.length, 0);
  assert.equal(snapshots.at(-1)?.status, "error");
  assert.equal(snapshots.at(-1)?.message, "테스트 문장을 입력해주세요.");
}

async function testStopCancelsResponseAndClearsAudioBuffer() {
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async () => fake.connection,
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("안녕하세요.");
  controller.handleEvent(responseCreated("response-stop", "1"));
  controller.stop();

  assert.deepEqual(
    fake.sentEvents.map((event) => event.type),
    ["response.create", "response.cancel", "output_audio_buffer.clear"],
  );
  assert.equal(snapshots.at(-1)?.status, "idle");
  assert.equal(snapshots.at(-1)?.activeResponseId, undefined);
  assert.equal(fake.closeCount, 0, "stop should keep a healthy connection reusable");
}

async function testStopIgnoresLateCancelledProviderEvents() {
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async () => fake.connection,
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("안녕하세요.");
  controller.handleEvent(responseCreated("response-stop-late", "1"));
  controller.stop();
  controller.handleEvent(responseDone("response-stop-late", "1", "cancelled"));

  assert.equal(snapshots.at(-1)?.status, "idle");
  assert.equal(snapshots.at(-1)?.message, "Realtime 음성 테스트를 중지했습니다.");
}

async function testFailedConnectionReportsErrorAndCanRetry() {
  let attempts = 0;
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offer failed");
      return fake.connection;
    },
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("첫 시도");
  assert.equal(snapshots.at(-1)?.status, "error");
  assert.match(snapshots.at(-1)?.message ?? "", /연결/);

  await controller.play("재시도");
  assert.equal(attempts, 2);
  assert.equal(snapshots.at(-1)?.status, "playing");
  assert.equal(fake.sentEvents.filter((event) => event.type === "response.create").length, 1);
}

async function testConnectionCallbacksPublishRemoteStreamAndCloseBrokenConnection() {
  let connectInput: CreateRealtimeInterviewWebRtcConnectionInput | undefined;
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async (input) => {
      connectInput = input;
      return fake.connection;
    },
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("안녕하세요.");
  const remoteStream = {} as MediaStream;
  connectInput?.onRemoteStream?.(remoteStream);
  assert.equal(snapshots.at(-1)?.remoteStream, remoteStream);

  connectInput?.onConnectionFailure?.(new Error("peer failed"));
  assert.equal(fake.closeCount, 1);
  assert.equal(snapshots.at(-1)?.status, "error");
  assert.equal(snapshots.at(-1)?.remoteStream, null);
}

async function testRefreshesCredentialsWithinFiveSecondsOfExpiry() {
  let currentNow = NOW;
  let sessionRequests = 0;
  const fakes = [createFakeConnection(), createFakeConnection()];
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => {
      sessionRequests += 1;
      return previewSession(NOW + (sessionRequests === 1 ? 6_000 : 60_000));
    },
    connect: async () => fakes[sessionRequests - 1]!.connection,
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: () => undefined,
    now: () => currentNow,
  });

  await controller.play("첫 문장");
  controller.handleEvent(responseCreated("response-expiring", "1"));
  controller.handleEvent(audioStopped("response-expiring"));
  currentNow += 1_001;
  await controller.play("두 번째 문장");

  assert.equal(sessionRequests, 2);
  assert.equal(fakes[0]!.closeCount, 1);
  assert.equal(fakes[1]!.sentEvents.filter((event) => event.type === "response.create").length, 1);
}

async function testProviderFailureDoesNotReportSuccessfulPlayback() {
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async () => fake.connection,
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("안녕하세요.");
  controller.handleEvent(responseCreated("response-failed", "1"));
  controller.handleEvent(responseDone("response-failed", "1", "failed"));

  assert.equal(snapshots.at(-1)?.status, "error");
  assert.match(snapshots.at(-1)?.message ?? "", /생성/);
}

async function testOnlyMatchingAudioStoppedEventCompletesPlayback() {
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async () => fake.connection,
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("안녕하세요.");
  controller.handleEvent(responseCreated("response-active", "1"));
  controller.handleEvent(responseDone("response-active", "1", "completed"));
  controller.handleEvent(audioStopped("response-stale"));
  assert.equal(snapshots.at(-1)?.status, "playing");

  controller.handleEvent(audioStopped("response-active"));
  assert.equal(snapshots.at(-1)?.status, "idle");
  assert.equal(snapshots.at(-1)?.message, "Realtime 음성 테스트가 끝났습니다.");
}

async function testCompletedTranscriptMismatchStopsWithExactScriptError() {
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async () => fake.connection,
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  await controller.play("안녕하세요.");
  controller.handleEvent(responseCreated("response-mismatch", "1"));
  controller.handleEvent(transcriptDone("response-mismatch", "좋습니다. 안녕하세요."));
  controller.handleEvent(audioStopped("response-mismatch"));

  assert.equal(snapshots.at(-1)?.status, "error");
  assert.equal(
    snapshots.at(-1)?.message,
    "Realtime 음성이 입력 문장과 일치하지 않아 재생을 중단했습니다.",
  );
  assert.deepEqual(
    fake.sentEvents.slice(-2).map((event) => event.type),
    ["response.cancel", "output_audio_buffer.clear"],
  );
}

async function testDisposeClosesConnectionAndDetachesAudio() {
  const fake = createFakeConnection();
  const remoteStream = {} as MediaStream;
  const audioElement = createFakeAudioElement();
  audioElement.srcObject = remoteStream;
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async () => fake.connection,
    remoteAudioElement: audioElement,
    onSnapshot: () => undefined,
    now: () => NOW,
  });

  await controller.play("안녕하세요.");
  controller.dispose();

  assert.equal(fake.closeCount, 1);
  assert.equal(audioElement.srcObject, null);
}

async function testDisposeDuringConnectionDoesNotPublishAfterCleanup() {
  const snapshots: RealtimeLipSyncTuningSnapshot[] = [];
  const fake = createFakeConnection();
  let resolveConnection: ((connection: RealtimeInterviewWebRtcConnection) => void) | undefined;
  const pendingConnection = new Promise<RealtimeInterviewWebRtcConnection>((resolve) => {
    resolveConnection = resolve;
  });
  const controller = new RealtimeLipSyncTuningController({
    createSession: async () => previewSession(),
    connect: async () => pendingConnection,
    remoteAudioElement: createFakeAudioElement(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => NOW,
  });

  const playPromise = controller.play("안녕하세요.");
  await Promise.resolve();
  controller.dispose();
  const snapshotCountAfterDispose = snapshots.length;
  resolveConnection?.(fake.connection);
  await playPromise;

  assert.equal(fake.closeCount, 1);
  assert.equal(snapshots.length, snapshotCountAfterDispose);
}

async function main() {
  await testReusesOneHealthyConnectionPerPage();
  await testEmptyTextDoesNotConnectOrSend();
  await testStopCancelsResponseAndClearsAudioBuffer();
  await testStopIgnoresLateCancelledProviderEvents();
  await testFailedConnectionReportsErrorAndCanRetry();
  await testConnectionCallbacksPublishRemoteStreamAndCloseBrokenConnection();
  await testRefreshesCredentialsWithinFiveSecondsOfExpiry();
  await testProviderFailureDoesNotReportSuccessfulPlayback();
  await testOnlyMatchingAudioStoppedEventCompletesPlayback();
  await testCompletedTranscriptMismatchStopsWithExactScriptError();
  await testDisposeClosesConnectionAndDetachesAudio();
  await testDisposeDuringConnectionDoesNotPublishAfterCleanup();
  console.log("RealtimeLipSyncTuningController.spec.ts: all assertions passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
