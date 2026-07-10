import { getApiBaseUrl } from "@/api/api-base-url";
import { getAccessToken } from "@/api/client";

export type RealtimeSttRelayMode = "mock" | "recruiting";

export type RealtimeSttRelayMetric = {
  eventName:
    | "REALTIME_STT_CONNECT"
    | "REALTIME_STT_UPSTREAM_READY"
    | "REALTIME_STT_FIRST_DELTA"
    | "REALTIME_STT_FINALIZE"
    | "REALTIME_STT_ERROR"
    | "REALTIME_STT_CLOSED"
    | "REALTIME_STT_FINAL_TIMEOUT";
  durationMs: number;
  metadata?: Record<string, unknown>;
};

export type RealtimeSttRelaySession = {
  stopAndGetTranscript(timeoutMs?: number): Promise<string | undefined>;
  discard(): void;
  getTranscript(): string;
};

export type CreateRealtimeSttRelaySessionOptions = {
  mode: RealtimeSttRelayMode;
  sessionId: number;
  stream: MediaStream;
  publicAccessToken?: string | null;
  onMetric?: (metric: RealtimeSttRelayMetric) => void;
};

type RelayServerEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  code?: string | number;
  message?: string;
  reason?: string;
  stage?: string;
  model?: string;
  transcriptLength?: number;
};

const TARGET_SAMPLE_RATE = 24000;
const AUDIO_PROCESSOR_BUFFER_SIZE = 4096;
const MAX_PENDING_CHUNKS = 240;

export function createRealtimeSttRelaySession(
  options: CreateRealtimeSttRelaySessionOptions,
): RealtimeSttRelaySession {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    throw new Error("Realtime STT relay is not available in this browser.");
  }

  const startedAt = performance.now();
  const socket = new WebSocket(buildRealtimeSttRelayUrl(options));
  socket.binaryType = "arraybuffer";

  let transcript = "";
  let finalizedTranscript: string | undefined;
  let firstDeltaRecorded = false;
  let finalized = false;
  let finalizeStartedAt = 0;
  let stopped = false;
  let commitRequested = false;
  const pendingChunks: ArrayBuffer[] = [];
  const cleanupCallbacks: Array<() => void> = [];
  const finalWaiters: Array<(value: string | undefined) => void> = [];

  const audioContext = createAudioContext();
  void audioContext.resume().catch(() => undefined);
  const source = audioContext.createMediaStreamSource(options.stream);
  const processor = audioContext.createScriptProcessor(AUDIO_PROCESSOR_BUFFER_SIZE, 1, 1);

  processor.onaudioprocess = (event) => {
    const output = event.outputBuffer.getChannelData(0);
    output.fill(0);
    if (stopped) return;

    const input = event.inputBuffer.getChannelData(0);
    const resampled = resampleFloat32(input, audioContext.sampleRate, TARGET_SAMPLE_RATE);
    const pcm16 = float32ToPcm16(resampled);
    sendOrQueueChunk(socket, pendingChunks, pcm16);
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  cleanupCallbacks.push(() => {
    processor.disconnect();
    source.disconnect();
    void audioContext.close().catch(() => undefined);
  });

  socket.addEventListener("open", () => {
    const pendingChunkCount = pendingChunks.length;
    flushPendingChunks(socket, pendingChunks);
    if (commitRequested) socket.send(JSON.stringify({ type: "commit" }));
    options.onMetric?.({
      eventName: "REALTIME_STT_CONNECT",
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      metadata: { pendingChunkCount },
    });
  });

  socket.addEventListener("message", (event) => {
    const relayEvent = parseRelayServerEvent(event.data);
    if (!relayEvent?.type) return;

    if (relayEvent.type === "relay.ready") {
      options.onMetric?.({
        eventName: "REALTIME_STT_UPSTREAM_READY",
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        metadata: {
          model: relayEvent.model,
        },
      });
      return;
    }

    if (relayEvent.type === "transcript.delta") {
      if (relayEvent.transcript) transcript = relayEvent.transcript;
      if (!firstDeltaRecorded) {
        firstDeltaRecorded = true;
        options.onMetric?.({
          eventName: "REALTIME_STT_FIRST_DELTA",
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          metadata: {
            transcriptLength: transcript.length,
          },
        });
      }
      return;
    }

    if (relayEvent.type === "transcript.final") {
      finalizedTranscript = relayEvent.transcript?.trim() || transcript.trim() || undefined;
      finalized = true;
      resolveFinalWaiters(finalWaiters, finalizedTranscript);
      if (finalizeStartedAt > 0) {
        options.onMetric?.({
          eventName: "REALTIME_STT_FINALIZE",
          durationMs: Math.max(0, Math.round(performance.now() - finalizeStartedAt)),
          metadata: {
            transcriptLength: finalizedTranscript?.length ?? 0,
          },
        });
      }
      closeSocket(socket);
    }

    if (relayEvent.type === "error") {
      options.onMetric?.({
        eventName: "REALTIME_STT_ERROR",
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        metadata: {
          stage: relayEvent.stage,
          code: relayEvent.code,
          message: relayEvent.message,
          model: relayEvent.model,
          transcriptLength: transcript.length,
        },
      });
      finalized = true;
      resolveFinalWaiters(finalWaiters, transcript.trim() || undefined);
      closeSocket(socket);
      return;
    }

    if (relayEvent.type === "relay.closed") {
      options.onMetric?.({
        eventName: "REALTIME_STT_CLOSED",
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        metadata: {
          code: relayEvent.code,
          reason: relayEvent.reason,
          model: relayEvent.model,
          transcriptLength: relayEvent.transcriptLength ?? transcript.length,
        },
      });
      finalized = true;
      resolveFinalWaiters(finalWaiters, (finalizedTranscript ?? transcript.trim()) || undefined);
    }
  });

  socket.addEventListener("close", () => {
    finalized = true;
    resolveFinalWaiters(finalWaiters, (finalizedTranscript ?? transcript.trim()) || undefined);
  });

  socket.addEventListener("error", () => {
    finalized = true;
    resolveFinalWaiters(finalWaiters, transcript.trim() || undefined);
  });

  return {
    async stopAndGetTranscript(timeoutMs = 10000) {
      if (!stopped) {
        stopped = true;
        cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
      }

      finalizeStartedAt = performance.now();
      commitRequested = true;
      if (socket.readyState === WebSocket.OPEN) {
        flushPendingChunks(socket, pendingChunks);
        socket.send(JSON.stringify({ type: "commit" }));
      }

      if (finalized) return (finalizedTranscript ?? transcript.trim()) || undefined;

      return new Promise<string | undefined>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          options.onMetric?.({
            eventName: "REALTIME_STT_FINAL_TIMEOUT",
            durationMs: Math.max(0, Math.round(performance.now() - finalizeStartedAt)),
            metadata: {
              transcriptLength: (finalizedTranscript ?? transcript).length,
              timeoutMs,
            },
          });
          resolveFinalWaiters(finalWaiters, (finalizedTranscript ?? transcript.trim()) || undefined);
          closeSocket(socket);
        }, timeoutMs);

        finalWaiters.push((value) => {
          window.clearTimeout(timeoutId);
          resolve(value);
        });
      });
    },
    discard() {
      stopped = true;
      cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
      resolveFinalWaiters(finalWaiters, undefined);
      closeSocket(socket);
    },
    getTranscript() {
      return finalizedTranscript ?? transcript;
    },
  };
}

function buildRealtimeSttRelayUrl(options: CreateRealtimeSttRelaySessionOptions): string {
  const baseUrl = new URL(getApiBaseUrl());
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";

  const accessToken = getAccessToken();
  if (options.mode === "recruiting" && options.publicAccessToken && !accessToken) {
    baseUrl.pathname = `/api/v1/public/interviews/${options.sessionId}/realtime-stt-relay`;
    baseUrl.searchParams.set("publicAccessToken", options.publicAccessToken);
    return baseUrl.toString();
  }

  baseUrl.pathname =
    options.mode === "mock"
      ? `/api/v1/candidate/mock-interviews/${options.sessionId}/realtime-stt-relay`
      : `/api/v1/candidate/interviews/${options.sessionId}/realtime-stt-relay`;
  if (accessToken) baseUrl.searchParams.set("accessToken", accessToken);
  return baseUrl.toString();
}

function createAudioContext(): AudioContext {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available in this browser.");
  }
  return new AudioContextCtor({ sampleRate: TARGET_SAMPLE_RATE });
}

function sendOrQueueChunk(socket: WebSocket, pendingChunks: ArrayBuffer[], chunk: ArrayBuffer) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(chunk);
    return;
  }

  pendingChunks.push(chunk);
  if (pendingChunks.length > MAX_PENDING_CHUNKS) {
    pendingChunks.shift();
  }
}

function flushPendingChunks(socket: WebSocket, pendingChunks: ArrayBuffer[]) {
  if (socket.readyState !== WebSocket.OPEN) return;
  while (pendingChunks.length > 0) {
    const chunk = pendingChunks.shift();
    if (chunk) socket.send(chunk);
  }
}

function closeSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close();
  }
}

function resolveFinalWaiters(waiters: Array<(value: string | undefined) => void>, value: string | undefined) {
  while (waiters.length > 0) {
    const waiter = waiters.shift();
    waiter?.(value);
  }
}

function parseRelayServerEvent(data: unknown): RelayServerEvent | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as RelayServerEvent;
  } catch {
    return null;
  }
}

function resampleFloat32(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (inputSampleRate === outputSampleRate) return input;
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, input.length - 1);
    const interpolation = sourceIndex - leftIndex;
    output[index] = input[leftIndex] * (1 - interpolation) + input[rightIndex] * interpolation;
  }

  return output;
}

function float32ToPcm16(input: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return output;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
