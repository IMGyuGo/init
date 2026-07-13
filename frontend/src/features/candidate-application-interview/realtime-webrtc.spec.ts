import { strict as assert } from "node:assert";

import type { RealtimeInterviewSessionResponse } from "./api";
import {
  createRealtimeInterviewSpeechResponseEvent,
  createRealtimeInterviewWebRtcConnection,
  getRealtimeAudioCompletedResponseId,
  getRealtimeResponseMetadata,
  sendRealtimeClientEvent,
  sendRealtimeSpeechClientEvent,
  setRealtimeInterviewMicrophoneEnabled,
  shouldRestoreRealtimeMicrophoneAfterSpeechResponse,
  type RealtimeDataChannelLike,
  type RealtimePeerConnectionLike,
} from "./realtime-webrtc";
import * as realtimeWebRtc from "./realtime-webrtc";

class FakeRealtimeDataChannel implements RealtimeDataChannelLike {
  readyState: RTCDataChannelState = "connecting";
  onopen: RTCDataChannel["onopen"] = null;
  onmessage: RTCDataChannel["onmessage"] = null;
  onclose: RTCDataChannel["onclose"] = null;
  onerror: RTCDataChannel["onerror"] = null;
  readonly sentData: string[] = [];

  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.call({} as RTCDataChannel, new Event("close"));
  }

  open() {
    this.readyState = "open";
    this.onopen?.call({} as RTCDataChannel, new Event("open"));
  }

  send(data: string) {
    this.sentData.push(data);
  }
}

class FakeRealtimePeerConnection implements RealtimePeerConnectionLike {
  connectionState: RTCPeerConnectionState = "new";
  onconnectionstatechange: RTCPeerConnection["onconnectionstatechange"] = null;
  ontrack: ((event: RTCTrackEvent) => unknown) | null = null;
  readonly dataChannel = new FakeRealtimeDataChannel();
  readonly addedTracks: MediaStreamTrack[] = [];
  localDescription?: RTCSessionDescriptionInit;
  remoteDescription?: RTCSessionDescriptionInit;

  addTrack(track: MediaStreamTrack) {
    this.addedTracks.push(track);
    return {} as RTCRtpSender;
  }

  createDataChannel(label: string) {
    assert.equal(label, "oai-events");
    return this.dataChannel;
  }

  createOffer() {
    return Promise.resolve({ type: "offer" as const, sdp: "local-offer-sdp" });
  }

  setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    return Promise.resolve();
  }

  connect() {
    this.connectionState = "connected";
    this.onconnectionstatechange?.call({} as RTCPeerConnection, new Event("connectionstatechange"));
  }

  close() {
    this.connectionState = "closed";
    this.onconnectionstatechange?.call({} as RTCPeerConnection, new Event("connectionstatechange"));
  }
}

const openAiRealtimeSession: RealtimeInterviewSessionResponse = {
  accepted: true,
  sessionId: 1,
  interviewType: "MOCK",
  mode: "realtime-voice",
  provider: "openai",
  model: "gpt-realtime-2",
  voice: "marin",
  transport: "webrtc",
  clientSecret: "ephemeral-client-secret",
  clientSecretType: "ephemeral",
  expiresAt: "2026-07-06T00:00:00.000Z",
  endpoint: "https://api.openai.com/v1/realtime/calls",
};

function createFakeAudioTrack(enabled = true): MediaStreamTrack {
  const track = {
    kind: "audio" as const,
    readyState: "live" as MediaStreamTrackState,
    enabled,
    stopped: false,
    clone() {
      return createFakeAudioTrack(track.enabled);
    },
    stop() {
      track.stopped = true;
      track.readyState = "ended";
    },
  };

  return {
    get kind() {
      return track.kind;
    },
    get readyState() {
      return track.readyState;
    },
    set readyState(value: MediaStreamTrackState) {
      track.readyState = value;
    },
    get enabled() {
      return track.enabled;
    },
    set enabled(value: boolean) {
      track.enabled = value;
    },
    get stopped() {
      return track.stopped;
    },
    clone: track.clone,
    stop: track.stop,
  } as MediaStreamTrack & { stopped: boolean };
}

function testRealtimeSessionRequestWaitsForLiveMicrophoneStream() {
  const shouldStartRealtimeSession = Reflect.get(
    realtimeWebRtc,
    "shouldStartRealtimeSession",
  ) as ((input: {
    setupCompleted: boolean;
    runtimeStatus: string;
    localStream: MediaStream | null;
  }) => boolean) | undefined;

  assert.equal(typeof shouldStartRealtimeSession, "function");
  assert.equal(
    shouldStartRealtimeSession?.({
      setupCompleted: true,
      runtimeStatus: "IN_PROGRESS",
      localStream: null,
    }),
    false,
  );
  assert.equal(
    shouldStartRealtimeSession?.({
      setupCompleted: true,
      runtimeStatus: "IN_PROGRESS",
      localStream: {
        getAudioTracks: () => [{ readyState: "ended" } as MediaStreamTrack],
      } as MediaStream,
    }),
    false,
  );
  assert.equal(
    shouldStartRealtimeSession?.({
      setupCompleted: true,
      runtimeStatus: "IN_PROGRESS",
      localStream: {
        getAudioTracks: () => [createFakeAudioTrack()],
      } as MediaStream,
    }),
    true,
  );
}

async function testConnectionWaitsForOpenDataChannel() {
  const peerConnection = new FakeRealtimePeerConnection();
  let resolved = false;
  const connectionPromise = createRealtimeInterviewWebRtcConnection({
    session: openAiRealtimeSession,
    localStream: {
      getAudioTracks: () => [createFakeAudioTrack()],
    } as MediaStream,
    fetcher: async (_input, init) => {
      assert.equal(init?.method, "POST");
      assert.equal(init?.body, "local-offer-sdp");
      return new Response("remote-answer-sdp", { status: 200 });
    },
    peerConnectionFactory: () => peerConnection,
    readyTimeoutMs: 200,
  }).then((connection) => {
    resolved = true;
    return connection;
  });

  await Promise.resolve();
  assert.equal(resolved, false);
  peerConnection.connect();
  peerConnection.dataChannel.open();

  const connection = await connectionPromise;
  assert.equal(resolved, true);
  assert.equal(connection.dataChannel.readyState, "open");
}

async function testConnectionFailureCallbackRunsAfterReady() {
  const peerConnection = new FakeRealtimePeerConnection();
  let failureMessage = "";
  const connectionPromise = createRealtimeInterviewWebRtcConnection({
    session: openAiRealtimeSession,
    localStream: {
      getAudioTracks: () => [createFakeAudioTrack()],
    } as MediaStream,
    fetcher: async () => new Response("remote-answer-sdp", { status: 200 }),
    peerConnectionFactory: () => peerConnection,
    readyTimeoutMs: 200,
    onConnectionFailure: (error: Error) => {
      failureMessage = error.message;
    },
  });

  peerConnection.connect();
  peerConnection.dataChannel.open();
  const connection = await connectionPromise;
  connection.dataChannel.close();

  assert.match(failureMessage, /data channel closed/i);
}

function testQuestionSpeechResponseEventUsesOpenAiResponseCreate() {
  const event = createRealtimeInterviewSpeechResponseEvent({
    purpose: "interview_question",
    text: "자기소개를 해주세요.",
    questionId: 101,
    playbackId: 7,
  });

  assert.equal(event.type, "response.create");
  assert.equal(event.response.conversation, "none");
  assert.deepEqual(event.response.output_modalities, ["audio"]);
  assert.equal(event.response.metadata.response_purpose, "interview_question");
  assert.equal(event.response.metadata.question_id, "101");
  assert.equal(event.response.metadata.playback_id, "7");
  assert.match(event.response.instructions, /read the provided Korean interview question exactly once/i);
  assert.deepEqual(event.response.input, [
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "자기소개를 해주세요." }],
    },
  ]);
}

function testFollowUpQuestionSpeechResponseEventUsesFollowUpPurpose() {
  const event = createRealtimeInterviewSpeechResponseEvent({
    purpose: "interview_follow_up_question",
    text: "방금 답변에서 말한 성능 개선 과정을 더 구체적으로 설명해주세요.",
    questionId: 202,
    playbackId: 10,
  });

  assert.equal(event.response.metadata.response_purpose, "interview_follow_up_question");
  assert.equal(event.response.metadata.question_id, "202");
  assert.match(event.response.instructions, /follow-up interview question/i);
  assert.match(event.response.instructions, /do not generate another follow-up/i);
  assert.deepEqual(event.response.input[0]?.content, [
    { type: "input_text", text: "방금 답변에서 말한 성능 개선 과정을 더 구체적으로 설명해주세요." },
  ]);
}

function testEncouragementSpeechResponseEventUsesExactText() {
  const event = createRealtimeInterviewSpeechResponseEvent({
    purpose: "interview_encouragement",
    text: "괜찮습니다. 긴장하지 말고 말해보세요.",
    questionId: 101,
    playbackId: 8,
  });

  assert.equal(event.response.metadata.response_purpose, "interview_encouragement");
  assert.match(event.response.instructions, /say only the provided encouragement line/i);
  assert.deepEqual(event.response.input[0]?.content, [
    { type: "input_text", text: "괜찮습니다. 긴장하지 말고 말해보세요." },
  ]);
}

function testSendRealtimeClientEventOnlySendsWhenDataChannelIsOpen() {
  const dataChannel = new FakeRealtimeDataChannel();
  const connection = {
    peerConnection: new FakeRealtimePeerConnection(),
    dataChannel,
    localAudioTracks: [],
    close() {
      dataChannel.close();
    },
  };
  const event = createRealtimeInterviewSpeechResponseEvent({
    purpose: "interview_question",
    text: "지원 동기를 말씀해주세요.",
    questionId: 102,
    playbackId: 9,
  });

  assert.equal(sendRealtimeClientEvent(connection, event), false);
  assert.equal(dataChannel.sentData.length, 0);

  dataChannel.open();
  assert.equal(sendRealtimeClientEvent(connection, event), true);
  assert.equal(dataChannel.sentData.length, 1);
  assert.equal(JSON.parse(dataChannel.sentData[0] ?? "{}").type, "response.create");
}

function testRealtimeResponseMetadataParsesDoneEvents() {
  assert.deepEqual(
    getRealtimeResponseMetadata({
      type: "response.done",
      response: {
        id: "resp_101",
        status: "completed",
        metadata: {
          response_purpose: "interview_question",
          question_id: "101",
          playback_id: "7",
        },
      },
    }),
    {
      responseId: "resp_101",
      purpose: "interview_question",
      questionId: 101,
      playbackId: 7,
      status: "completed",
      completed: true,
    },
  );
}

function testCancelledRealtimeResponseIsNotCompleted() {
  assert.deepEqual(
    getRealtimeResponseMetadata({
      type: "response.done",
      response: {
        id: "resp_101",
        status: "cancelled",
        metadata: {
          response_purpose: "interview_question",
          question_id: "101",
          playback_id: "7",
        },
      },
    }),
    {
      responseId: "resp_101",
      purpose: "interview_question",
      questionId: 101,
      playbackId: 7,
      status: "cancelled",
      completed: false,
    },
  );
}

function testRealtimeAudioCompletionParsesResponseAudioDoneEvents() {
  assert.equal(
    getRealtimeAudioCompletedResponseId({
      type: "response.audio.done",
      response_id: "resp_101",
      item_id: "item_101",
      output_index: 0,
      content_index: 0,
    }),
    undefined,
  );
  assert.equal(
    getRealtimeAudioCompletedResponseId({
      type: "output_audio_buffer.stopped",
      response_id: "resp_102",
    }),
    "resp_102",
  );
  assert.equal(
    getRealtimeAudioCompletedResponseId({
      type: "response.done",
      response: { id: "resp_101", status: "completed" },
    }),
    undefined,
  );
}

function testRealtimeMicrophoneStaysMutedWhenQuestionSpeechIsInterrupted() {
  assert.equal(
    shouldRestoreRealtimeMicrophoneAfterSpeechResponse({
      purpose: "interview_question",
      playbackId: 7,
      questionId: 101,
      status: "cancelled",
      completed: false,
    }),
    false,
  );
  assert.equal(
    shouldRestoreRealtimeMicrophoneAfterSpeechResponse({
      purpose: "interview_intro",
      playbackId: 7,
      status: "failed",
      completed: false,
    }),
    false,
  );
}

function testRealtimeMicrophoneStaysMutedAfterCompletedQuestionUntilRecordingStarts() {
  assert.equal(
    shouldRestoreRealtimeMicrophoneAfterSpeechResponse({
      purpose: "interview_question",
      playbackId: 7,
      questionId: 101,
      status: "completed",
      completed: true,
    }),
    false,
  );
}

function testRealtimeMicrophoneRestoresAfterCompletedEncouragement() {
  assert.equal(
    shouldRestoreRealtimeMicrophoneAfterSpeechResponse({
      purpose: "interview_encouragement",
      playbackId: 8,
      questionId: 101,
      status: "completed",
      completed: true,
    }),
    true,
  );
}

async function testRealtimeMicrophoneCanBeMutedDuringAssistantSpeech() {
  const peerConnection = new FakeRealtimePeerConnection();
  const sourceAudioTrack = createFakeAudioTrack(true);
  const connectionPromise = createRealtimeInterviewWebRtcConnection({
    session: openAiRealtimeSession,
    localStream: {
      getAudioTracks: () => [sourceAudioTrack],
    } as MediaStream,
    fetcher: async () => new Response("remote-answer-sdp", { status: 200 }),
    peerConnectionFactory: () => peerConnection,
    readyTimeoutMs: 200,
  });

  peerConnection.connect();
  peerConnection.dataChannel.open();
  const connection = await connectionPromise;
  const realtimeAudioTrack = connection.localAudioTracks[0];

  assert.notEqual(realtimeAudioTrack, sourceAudioTrack);
  assert.equal(peerConnection.addedTracks[0], realtimeAudioTrack);
  assert.equal(realtimeAudioTrack?.enabled, false);
  assert.equal(sourceAudioTrack.enabled, true);
  assert.equal(setRealtimeInterviewMicrophoneEnabled(connection, false), 1);
  assert.equal(realtimeAudioTrack?.enabled, false);
  assert.equal(sourceAudioTrack.enabled, true);
  assert.equal(setRealtimeInterviewMicrophoneEnabled(connection, true), 1);
  assert.equal(realtimeAudioTrack?.enabled, true);
  assert.equal(sourceAudioTrack.enabled, true);
  connection.close();
  assert.equal((realtimeAudioTrack as MediaStreamTrack & { stopped?: boolean })?.stopped, true);
  assert.equal((sourceAudioTrack as MediaStreamTrack & { stopped?: boolean }).stopped, false);
}

function testSpeechClientEventMutesRealtimeMicrophoneUntilResponseCompletes() {
  const dataChannel = new FakeRealtimeDataChannel();
  dataChannel.open();
  const realtimeAudioTrack = createFakeAudioTrack(true);
  const connection = {
    peerConnection: new FakeRealtimePeerConnection(),
    dataChannel,
    localAudioTracks: [realtimeAudioTrack],
    close() {
      dataChannel.close();
    },
  };
  const event = createRealtimeInterviewSpeechResponseEvent({
    purpose: "interview_question",
    text: "Read this once.",
    questionId: 102,
    playbackId: 9,
  });

  assert.equal(sendRealtimeSpeechClientEvent(connection, event), true);
  assert.equal(realtimeAudioTrack.enabled, false);
  assert.equal(dataChannel.sentData.length, 1);
}

function testSpeechClientEventRestoresRealtimeMicrophoneWhenSendFails() {
  const dataChannel = new FakeRealtimeDataChannel();
  const realtimeAudioTrack = createFakeAudioTrack(true);
  const connection = {
    peerConnection: new FakeRealtimePeerConnection(),
    dataChannel,
    localAudioTracks: [realtimeAudioTrack],
    close() {
      dataChannel.close();
    },
  };
  const event = createRealtimeInterviewSpeechResponseEvent({
    purpose: "interview_question",
    text: "Read this once.",
    questionId: 102,
    playbackId: 9,
  });

  assert.equal(sendRealtimeSpeechClientEvent(connection, event), false);
  assert.equal(realtimeAudioTrack.enabled, true);
  assert.equal(dataChannel.sentData.length, 0);
}

async function main() {
  testRealtimeSessionRequestWaitsForLiveMicrophoneStream();
  testQuestionSpeechResponseEventUsesOpenAiResponseCreate();
  testFollowUpQuestionSpeechResponseEventUsesFollowUpPurpose();
  testEncouragementSpeechResponseEventUsesExactText();
  testSendRealtimeClientEventOnlySendsWhenDataChannelIsOpen();
  testSpeechClientEventMutesRealtimeMicrophoneUntilResponseCompletes();
  testSpeechClientEventRestoresRealtimeMicrophoneWhenSendFails();
  testRealtimeResponseMetadataParsesDoneEvents();
  testCancelledRealtimeResponseIsNotCompleted();
  testRealtimeAudioCompletionParsesResponseAudioDoneEvents();
  testRealtimeMicrophoneStaysMutedWhenQuestionSpeechIsInterrupted();
  testRealtimeMicrophoneStaysMutedAfterCompletedQuestionUntilRecordingStarts();
  testRealtimeMicrophoneRestoresAfterCompletedEncouragement();
  await testConnectionWaitsForOpenDataChannel();
  await testConnectionFailureCallbackRunsAfterReady();
  await testRealtimeMicrophoneCanBeMutedDuringAssistantSpeech();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
